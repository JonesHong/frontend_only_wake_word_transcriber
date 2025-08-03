// 喚醒詞偵測模組
class WakeWordDetector {
    constructor() {
        // 預設使用範例中的喚醒詞模型
        this.modelPath = 'models/hey_jarvis_v0.1.onnx';
        this.session = null;
        this.isRunning = false;
        this.detectionCallback = null;
        this.scoreCallback = null;
        
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
        
        // 分數歷史記錄
        this.scoreHistory = new Array(50).fill(0);
        this.detectionThreshold = 0.5;
    }
    
    async initialize() {
        try {
            console.log('初始化喚醒詞偵測器...');
            
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
            // 載入 melspectrogram 模型（直接從已複製的模型資料夾載入）
            const melspecPath = 'models/melspectrogram.onnx';
            const melspecResponse = await fetch(melspecPath);
            if (melspecResponse.ok) {
                const modelData = await melspecResponse.arrayBuffer();
                this.melspecModel = await ort.InferenceSession.create(modelData, this.ortConfig);
            } else {
                throw new Error('找不到 melspectrogram 模型');
            }
            
            // 載入 embedding 模型
            const embeddingPath = 'models/embedding_model.onnx';
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
            // 預填充 embedding buffer 為 16 個零向量
            for (let i = 0; i < 16; i++) {
                this.embeddingBuffer.push(new Float32Array(96).fill(0));
            }
            
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
            
            console.log(`已載入喚醒詞模型: ${modelPath}`);
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
            
            // 重置分數歷史
            this.scoreHistory.fill(0);
            
            console.log(`已替換喚醒詞模型: ${file.name}`);
            return true;
        } catch (error) {
            console.error('替換模型失敗:', error);
            return false;
        }
    }
    
    async processAudioChunk(audioData) {
        if (!this.isRunning || !this.melspecModel || !this.embeddingModel || !this.wakewordSession) {
            return;
        }
        
        try {
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
                
                const flattenedEmbeddings = new Float32Array(16 * 96);
                for (let i = 0; i < this.embeddingBuffer.length; i++) {
                    flattenedEmbeddings.set(this.embeddingBuffer[i], i * 96);
                }
                
                const finalTensor = new ort.Tensor('float32', flattenedEmbeddings, [1, 16, 96]);
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
                
                // 檢查是否超過閾值
                if (score > this.detectionThreshold && this.detectionCallback) {
                    this.detectionCallback(score);
                }
                
                // 清理舊的 mel buffer（根據範例，每次處理後移除 8 個）
                this.melBuffer.splice(0, 8);
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
    
    setThreshold(threshold) {
        this.detectionThreshold = threshold;
    }
    
    getScoreHistory() {
        return this.scoreHistory;
    }
}

// 建立全域實例
window.wakewordDetector = new WakeWordDetector();