// 喚醒詞偵測模組
class WakeWordDetector {
    constructor() {
        // 初始化時不設定模型路徑，等待 Config 載入
        this.modelPath = null;
        this.session = null;
        this.isRunning = false;
        this.detectionCallback = null;
        this.scoreCallback = null;
        
        // 可用模型列表將在初始化時從 Config 載入
        this.availableModels = {};
        this.currentModelKey = 'hey-jarvis'; // 注意：使用連字號而非底線
        this.loadedModels = {}; // 快取已載入的模型
        
        // ONNX Runtime 設定
        this.ortConfig = {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        };
        
        // 音訊處理參數
        this.sampleRate = 16000;
        this.frameSize = 1280; // 80ms chunks
        
        // 模型推論緩衝區
        this.melBuffer = [];
        this.embeddingBuffer = [];
        
        // 推論相關模型
        this.melspecModel = null;
        this.embeddingModel = null;
        this.wakewordSession = null;
        
        // 模型參數（會根據載入的模型動態調整）
        this.embeddingBufferSize = 16; // 預設值，會自動檢測
        this.embeddingDimension = 96; // 預設值
        
        // 從 Config 獲取設定
        this.scoreHistory = new Array(Config.wakeword.historySize || 50).fill(0);
        this.detectionThreshold = Config.wakeword.threshold;
    }
    
    async initialize() {
        try {
            console.log('初始化喚醒詞偵測器...');
            
            // 從 Config 獲取模型設定
            console.log('Config.models.wakeword:', window.Config?.models?.wakeword);
            
            if (window.Config && window.Config.models.wakeword.available) {
                this.availableModels = {};
                for (const [key, modelInfo] of Object.entries(Config.models.wakeword.available)) {
                    this.availableModels[key] = modelInfo.path;
                    console.log(`載入模型設定: ${key} -> ${modelInfo.path}`);
                }
                
                // 設定預設模型路徑
                if (this.availableModels[this.currentModelKey]) {
                    this.modelPath = this.availableModels[this.currentModelKey];
                    console.log(`使用預設模型: ${this.currentModelKey} -> ${this.modelPath}`);
                } else {
                    // 如果預設模型不存在，使用第一個可用的模型
                    const firstKey = Object.keys(this.availableModels)[0];
                    if (firstKey) {
                        this.currentModelKey = firstKey;
                        this.modelPath = this.availableModels[firstKey];
                        console.log(`使用第一個可用模型: ${firstKey} -> ${this.modelPath}`);
                    }
                }
            } else {
                console.warn('Config.models.wakeword.available 不存在');
            }
            
            if (!this.modelPath) {
                console.error('所有可用模型:', this.availableModels);
                console.error('當前模型鍵:', this.currentModelKey);
                throw new Error('無法從 Config 取得模型路徑');
            }
            
            // 載入輔助模型
            await this.loadAuxiliaryModels();
            
            // 載入喚醒詞模型
            await this.loadModel(this.modelPath);
            
            console.log('喚醒詞偵測器初始化完成');
            return true;
        } catch (error) {
            console.error('初始化喚醒詞偵測器失敗:', error);
            return false;
        }
    }
    
    async loadAuxiliaryModels() {
        try {
            // 從 Config 載入 melspectrogram 模型
            const melspecPath = Config.getModelPath('melspectrogram');
            const melspecResponse = await fetch(melspecPath);
            if (melspecResponse.ok) {
                const modelData = await melspecResponse.arrayBuffer();
                this.melspecModel = await ort.InferenceSession.create(modelData, this.ortConfig);
            } else {
                throw new Error('找不到 melspectrogram 模型');
            }
            
            // 從 Config 載入 embedding 模型
            const embeddingPath = Config.getModelPath('embedding');
            const embeddingResponse = await fetch(embeddingPath);
            if (embeddingResponse.ok) {
                const modelData = await embeddingResponse.arrayBuffer();
                this.embeddingModel = await ort.InferenceSession.create(modelData, this.ortConfig);
            } else {
                throw new Error('找不到 embedding 模型');
            }
            
            // 初始化緩衝區（空陣列開始，動態增長）
            this.melBuffer = [];
            this.embeddingBuffer = [];
            
        } catch (error) {
            console.error('載入輔助模型失敗:', error);
            throw error;
        }
    }
    
    async loadModel(modelPath) {
        try {
            const response = await fetch(modelPath);
            if (!response.ok) {
                throw new Error(`無法載入模型: ${modelPath}`);
            }
            
            const modelData = await response.arrayBuffer();
            this.wakewordSession = await ort.InferenceSession.create(modelData, this.ortConfig);
            this.modelPath = modelPath;
            
            // 檢測模型的輸入維度
            await this.detectModelDimensions();
            
            console.log(`已載入喚醒詞模型: ${modelPath}`);
            console.log(`模型參數 - Embedding Buffer Size: ${this.embeddingBufferSize}, Embedding Dimension: ${this.embeddingDimension}`);
        } catch (error) {
            console.error('載入喚醒詞模型失敗:', error);
            throw error;
        }
    }
    
    async replaceModel(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const newSession = await ort.InferenceSession.create(arrayBuffer, this.ortConfig);
            
            // 成功載入後才替換
            this.wakewordSession = newSession;
            this.modelPath = file.name;
            
            // 檢測新模型的輸入維度
            await this.detectModelDimensions();
            
            // 重置分數歷史和緩衝區
            this.scoreHistory.fill(0);
            this.resetBuffers();
            
            console.log(`已替換喚醒詞模型: ${file.name}`);
            console.log(`模型參數 - Embedding Buffer Size: ${this.embeddingBufferSize}, Embedding Dimension: ${this.embeddingDimension}`);
            return true;
        } catch (error) {
            console.error('替換模型失敗:', error);
            return false;
        }
    }
    
    // 自動檢測模型維度
    async detectModelDimensions() {
        if (!this.wakewordSession) return;
        
        try {
            // 獲取模型的輸入資訊
            const inputNames = this.wakewordSession.inputNames;
            const inputInfo = await this.wakewordSession.inputMetadata;
            
            if (inputInfo && inputNames.length > 0) {
                const inputShape = inputInfo[inputNames[0]].dims;
                console.log('偵測到模型輸入維度:', inputShape);
                
                // 預期格式: [batch_size, embedding_buffer_size, embedding_dimension]
                if (inputShape.length >= 3) {
                    this.embeddingBufferSize = inputShape[1]; // 時間步數 (16 或 28)
                    this.embeddingDimension = inputShape[2];  // 特徵維度 (96)
                    
                    // 重新初始化 embedding buffer
                    this.initializeEmbeddingBuffer();
                }
            }
        } catch (error) {
            console.warn('無法自動檢測模型維度，使用預設值:', error);
            // 使用預設值並初始化
            this.initializeEmbeddingBuffer();
        }
    }
    
    // 初始化 embedding buffer
    initializeEmbeddingBuffer() {
        this.embeddingBuffer = [];
        for (let i = 0; i < this.embeddingBufferSize; i++) {
            this.embeddingBuffer.push(new Float32Array(this.embeddingDimension).fill(0));
        }
    }
    
    async processAudioChunk(audioData) {
        if (!this.melspecModel || !this.embeddingModel || !this.wakewordSession) {
            return;
        }
        
        try {
            // 如果沒有正在進行推論，加入一個預設的低分數來讓圖表持續更新
            let hasProcessed = false;
            // Stage 1: 音訊轉換為 mel-spectrogram
            const audioTensor = new ort.Tensor('float32', audioData, [1, audioData.length]);
            const melResults = await this.melspecModel.run({ 
                [this.melspecModel.inputNames[0]]: audioTensor 
            });
            const melFeatures = melResults[this.melspecModel.outputNames[0]].data;
            
            // 對 mel 特徵進行變換（根據範例程式碼）
            for (let j = 0; j < melFeatures.length; j++) {
                melFeatures[j] = (melFeatures[j] / 10.0) + 2.0;
            }
            
            // 將 5 個 mel frames 加入緩衝區
            for (let j = 0; j < 5; j++) {
                this.melBuffer.push(new Float32Array(melFeatures.subarray(j * 32, (j + 1) * 32)));
            }
            
            // 需要至少 76 幀才能進行推論（根據範例）
            if (this.melBuffer.length < 76) {
                return;
            }
            
            // Stage 2: mel-spectrogram 歷史轉換為 embedding
            while (this.melBuffer.length >= 76) {
                const windowFrames = this.melBuffer.slice(0, 76);
                const flattenedMel = new Float32Array(76 * 32);
                for (let j = 0; j < windowFrames.length; j++) {
                    flattenedMel.set(windowFrames[j], j * 32);
                }
            
                const melTensor = new ort.Tensor('float32', flattenedMel, [1, 76, 32, 1]);
                const embeddingResults = await this.embeddingModel.run({
                    [this.embeddingModel.inputNames[0]]: melTensor
                });
                const newEmbedding = embeddingResults[this.embeddingModel.outputNames[0]].data;
            
                // Stage 3: embedding 歷史轉換為最終預測
                this.embeddingBuffer.shift();
                this.embeddingBuffer.push(new Float32Array(newEmbedding));
                
                // 使用動態維度
                const flattenedEmbeddings = new Float32Array(this.embeddingBufferSize * this.embeddingDimension);
                for (let i = 0; i < this.embeddingBuffer.length; i++) {
                    flattenedEmbeddings.set(this.embeddingBuffer[i], i * this.embeddingDimension);
                }
                
                const finalTensor = new ort.Tensor('float32', flattenedEmbeddings, [1, this.embeddingBufferSize, this.embeddingDimension]);
                
                try {
                    const finalResults = await this.wakewordSession.run({
                        [this.wakewordSession.inputNames[0]]: finalTensor
                    });
                    
                    const score = finalResults[this.wakewordSession.outputNames[0]].data[0];
                    
                    // 更新分數歷史
                    this.scoreHistory.shift();
                    this.scoreHistory.push(score);
                    
                    // 觸發分數回調
                    if (this.scoreCallback) {
                        this.scoreCallback(score, this.scoreHistory);
                    }
                    
                    // 只在運行狀態下檢查是否超過閾值
                    if (this.isRunning && score > this.detectionThreshold && this.detectionCallback) {
                        this.detectionCallback(score);
                    }
                    
                    hasProcessed = true;
                    
                } catch (modelError) {
                    // 如果模型推論失敗，嘗試從錯誤訊息中提取預期的維度
                    if (modelError.message && modelError.message.includes('Expected:')) {
                        const match = modelError.message.match(/index: \d+ Got: (\d+) Expected: (\d+)/);;
                        if (match) {
                            const got = parseInt(match[1]);
                            const expected = parseInt(match[2]);
                            console.warn(`模型維度不匹配 - 當前: ${got}, 預期: ${expected}`);
                            
                            // 自動調整維度並重試
                            if (got === 16 && expected === 28) {
                                console.log('偵測到需要 28 個時間步的模型，自動調整...');
                                this.embeddingBufferSize = 28;
                                this.initializeEmbeddingBuffer();
                                // 跳過這次處理，下次會使用新的維度
                                return;
                            }
                        }
                    }
                    throw modelError;
                }
                
                // 清理舊的 mel buffer（根據範例，每次處理後移除 8 個）
                this.melBuffer.splice(0, 8);
            }
            
            // 如果沒有進行推論，加入一個低分數以保持圖表更新
            if (!hasProcessed) {
                this.scoreHistory.shift();
                this.scoreHistory.push(0.0);
                
                if (this.scoreCallback) {
                    this.scoreCallback(0.0, this.scoreHistory);
                }
            }
            
        } catch (error) {
            console.error('處理音訊失敗:', error);
        }
    }
    
    setDetectionCallback(callback) {
        this.detectionCallback = callback;
    }
    
    setScoreCallback(callback) {
        this.scoreCallback = callback;
    }
    
    start() {
        this.isRunning = true;
        console.log('喚醒詞偵測已啟動');
    }
    
    stop() {
        this.isRunning = false;
        console.log('喚醒詞偵測已停止');
    }
    
    resetBuffers() {
        // 重置所有緩衝區和分數歷史
        this.melBuffer = [];
        // 使用當前的維度設定重新初始化
        this.initializeEmbeddingBuffer();
        // 立即將分數設為 0
        this.scoreHistory.fill(0);
        if (this.scoreCallback) {
            this.scoreCallback(0, this.scoreHistory);
        }
    }
    
    setThreshold(threshold) {
        this.detectionThreshold = threshold;
        // 同步更新 Config
        if (window.Config) {
            Config.set('wakeword.threshold', threshold);
        }
    }
    
    getScoreHistory() {
        return this.scoreHistory;
    }
    
    // 切換模型
    async switchModel(modelKey) {
        if (!this.availableModels[modelKey]) {
            console.error(`未知的模型: ${modelKey}`);
            return false;
        }
        
        try {
            console.log(`切換到模型: ${modelKey}`);
            
            // 如果已經載入過，直接使用快取
            if (this.loadedModels[modelKey]) {
                this.wakewordSession = this.loadedModels[modelKey];
                this.currentModelKey = modelKey;
                this.modelPath = this.availableModels[modelKey];
                
                // 檢測模型維度並重置緩衝區
                await this.detectModelDimensions();
                this.resetBuffers();
                
                console.log(`已切換到快取的模型: ${modelKey}`);
                return true;
            }
            
            // 載入新模型
            await this.loadModel(this.availableModels[modelKey]);
            
            // 快取模型
            this.loadedModels[modelKey] = this.wakewordSession;
            this.currentModelKey = modelKey;
            
            // 重置分數歷史和緩衝區
            this.resetBuffers();
            
            console.log(`已成功切換到模型: ${modelKey}`);
            return true;
        } catch (error) {
            console.error(`切換模型失敗: ${modelKey}`, error);
            return false;
        }
    }
    
    // 預載入所有模型（可選）
    async preloadAllModels() {
        console.log('開始預載入所有模型...');
        
        for (const [key, path] of Object.entries(this.availableModels)) {
            if (!this.loadedModels[key]) {
                try {
                    const response = await fetch(path);
                    if (response.ok) {
                        const modelData = await response.arrayBuffer();
                        const session = await ort.InferenceSession.create(modelData, this.ortConfig);
                        this.loadedModels[key] = session;
                        console.log(`已預載入模型: ${key}`);
                    }
                } catch (error) {
                    console.warn(`預載入模型失敗: ${key}`, error);
                }
            }
        }
        
        console.log('模型預載入完成');
    }
}

// 建立全域實例
window.wakewordDetector = new WakeWordDetector();

// 初始化時監聽設定變更
if (window.settingsManager) {
    window.settingsManager.onSettingChange((key, value) => {
        if (key === 'wakewordModel') {
            // 使用 Config 中定義的模型
            if (Config.models.wakeword.available[value]) {
                window.wakewordDetector.switchModel(value);
            }
        }
    });
}