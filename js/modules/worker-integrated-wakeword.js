/**
 * WorkerIntegratedWakeword - 整合 Worker 的喚醒詞偵測器
 * 將原本的喚醒詞偵測邏輯遷移到 Worker 執行
 */
import { WorkerManager } from './worker-manager.js';
import { ExecutionModeManager } from './execution-mode-manager.js';

export class WorkerIntegratedWakeword {
    constructor() {
        this.workerManager = null;
        this.executionManager = null;
        this.mlWorker = null;
        this.isInitialized = false;
        
        // 模型配置
        this.models = {
            melspectrogram: null,
            embedding: null,
            wakeword: null
        };
        
        // 喚醒詞配置
        this.currentWakeword = 'hey_jarvis';
        this.detectionThreshold = 0.5;
        this.scoreHistory = [];
        this.maxHistoryLength = 50;
        
        // Mel-spectrogram 幀緩衝 (需要累積 76 幀)
        this.melBuffer = [];  // 存儲 mel-spectrogram 幀 (每幀 32 個特徵)
        this.melBufferRequired = 76;  // embedding 模型需要 76 幀
        
        // Embedding 緩衝 (需要 16 個歷史 embeddings)
        this.embeddingBuffer = [];  
        this.embeddingBufferSize = 16;  // embedding 緩衝大小
        this.embeddingDimension = 96;  // embedding 維度
        
        // 初始化 embedding buffer
        for (let i = 0; i < this.embeddingBufferSize; i++) {
            this.embeddingBuffer.push(new Float32Array(this.embeddingDimension).fill(0));
        }
        
        // 回調函數
        this.callbacks = {
            onDetection: null,
            onScore: null,
            onError: null
        };
        
        // 效能監控
        this.performanceMonitor = {
            inferenceCount: 0,
            totalTime: 0,
            lastInferenceTime: 0
        };
    }

    /**
     * 初始化喚醒詞偵測器
     * @param {Object} config - 配置選項
     * @returns {Promise<void>}
     */
    async initialize(config = {}) {
        try {
            console.log('初始化 Worker 整合喚醒詞偵測器...');
            
            // 如果沒有傳入管理器，才創建新的
            if (!this.workerManager) {
                this.workerManager = new WorkerManager();
                await this.workerManager.initialize();
            }
            
            if (!this.executionManager) {
                this.executionManager = new ExecutionModeManager();
                await this.executionManager.initialize();
            }
            
            // 取得執行配置
            const execConfig = this.executionManager.getExecutionConfig();
            console.log('執行配置:', execConfig);
            
            // 創建 ML Worker
            if (execConfig.useWorker) {
                this.mlWorker = await this.workerManager.createWorker(
                    'wakeword-ml',
                    'ml-inference',
                    {
                        config: execConfig,
                        fallback: true
                    }
                );
                
                // 註冊訊息處理器
                this.workerManager.onMessage('wakeword-ml', (data) => {
                    this.handleWorkerMessage(data);
                });
            }
            
            // 載入模型
            await this.loadModels(config);
            
            this.isInitialized = true;
            console.log('喚醒詞偵測器初始化完成');
            
        } catch (error) {
            console.error('初始化喚醒詞偵測器失敗:', error);
            throw error;
        }
    }

    /**
     * 載入所有必要的模型
     * @param {Object} config - 配置選項
     * @returns {Promise<void>}
     */
    async loadModels(config = {}) {
        const modelBasePath = config.modelPath || '/models/github/dscripka/openWakeWord';
        
        // 載入 Melspectrogram 模型
        await this.loadModel('melspectrogram', `${modelBasePath}/melspectrogram.onnx`);
        
        // 載入 Embedding 模型
        await this.loadModel('embedding', `${modelBasePath}/embedding_model.onnx`);
        
        // 載入喚醒詞模型
        const wakewordModel = config.wakewordModel || this.currentWakeword;
        await this.loadWakewordModel(wakewordModel);
    }

    /**
     * 載入單個模型
     * @param {string} modelId - 模型 ID
     * @param {string} modelPath - 模型路徑
     * @returns {Promise<void>}
     */
    async loadModel(modelId, modelPath) {
        console.log(`載入模型: ${modelId} from ${modelPath}`);
        
        if (this.mlWorker) {
            // 使用 Worker 載入
            const result = await this.workerManager.sendToWorker('wakeword-ml', {
                type: 'loadModel',
                modelId,
                modelPath,
                options: {
                    graphOptimizationLevel: 'all'
                }
            });
            
            this.models[modelId] = {
                loaded: true,
                path: modelPath,
                provider: result.provider
            };
            
        } else {
            // 主執行緒降級載入
            await this.loadModelMainThread(modelId, modelPath);
        }
    }

    /**
     * 載入喚醒詞模型
     * @param {string} wakewordName - 喚醒詞名稱
     * @returns {Promise<void>}
     */
    async loadWakewordModel(wakewordName) {
        const modelPath = `/models/github/dscripka/openWakeWord/${wakewordName}_v0.1.onnx`;
        await this.loadModel('wakeword', modelPath);
        this.currentWakeword = wakewordName;
        console.log(`喚醒詞模型已載入: ${wakewordName}`);
    }

    /**
     * 處理音訊塊
     * @param {Float32Array} audioData - 音訊資料 (1280 samples at 16kHz)
     * @returns {Promise<number>} 偵測分數
     */
    async processAudioChunk(audioData) {
        if (!this.isInitialized) {
            console.warn('喚醒詞偵測器尚未初始化');
            return 0;
        }
        
        const startTime = performance.now();
        
        try {
            let score;
            
            if (this.mlWorker) {
                // 使用 Worker 執行推論
                score = await this.processWithWorker(audioData);
            } else {
                // 主執行緒降級執行
                score = await this.processMainThread(audioData);
            }
            
            // 更新效能指標
            const inferenceTime = performance.now() - startTime;
            this.updatePerformanceMetrics(inferenceTime);
            
            // 記錄分數歷史
            this.updateScoreHistory(score);
            
            // 檢查是否偵測到喚醒詞
            if (score > this.detectionThreshold) {
                this.handleDetection(score);
            }
            
            // 觸發分數回調
            if (this.callbacks.onScore) {
                this.callbacks.onScore(score);
            }
            
            return score;
            
        } catch (error) {
            console.error('處理音訊塊失敗:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
            return 0;
        }
    }

    /**
     * 使用 Worker 處理音訊
     * @param {Float32Array} audioData - 音訊資料
     * @returns {Promise<number>} 偵測分數
     */
    async processWithWorker(audioData) {
        // Step 1: Melspectrogram
        const melResult = await this.workerManager.sendToWorker('wakeword-ml', {
            type: 'runInference',
            modelId: 'melspectrogram',
            inputs: {
                'input': {
                    data: Array.from(audioData),
                    dims: [1, audioData.length],
                    dtype: 'float32',
                    tensor: true
                }
            }
        });
        
        // 檢查 melspectrogram 結果
        if (!melResult || !melResult.outputs) {
            console.error('Melspectrogram 推論失敗，沒有輸出');
            return 0;
        }
        
        // 獲取 melspectrogram 輸出
        const melOutputName = Object.keys(melResult.outputs)[0];
        const melFeatures = melResult.outputs[melOutputName].data;
        
        // melFeatures 包含 160 個元素 = 5 frames × 32 features
        // 將 5 個 mel frames 加入緩衝區
        for (let i = 0; i < 5; i++) {
            const frame = melFeatures.slice(i * 32, (i + 1) * 32);
            this.melBuffer.push(frame);
        }
        
        // 如果緩衝區不足 76 幀，返回低分數
        if (this.melBuffer.length < this.melBufferRequired) {
            console.log(`緩衝中: ${this.melBuffer.length}/${this.melBufferRequired} 幀`);
            return 0.01;  // 返回很低的分數表示還在累積
        }
        
        // 處理每個可用的 76 幀窗口
        let maxScore = 0;
        while (this.melBuffer.length >= this.melBufferRequired) {
            // 取出 76 幀
            const windowFrames = this.melBuffer.slice(0, this.melBufferRequired);
            
            // 將 76 幀扁平化為一個陣列
            const flattenedMel = new Float32Array(this.melBufferRequired * 32);
            for (let j = 0; j < windowFrames.length; j++) {
                flattenedMel.set(windowFrames[j], j * 32);
            }
            
            // Step 2: Embedding
            const embeddingResult = await this.workerManager.sendToWorker('wakeword-ml', {
                type: 'runInference',
                modelId: 'embedding',
                inputs: {
                    'input': {
                        data: Array.from(flattenedMel),
                        dims: [1, this.melBufferRequired, 32, 1],  // [batch, frames, features, channels]
                        dtype: 'float32',
                        tensor: true
                    }
                }
            });
            
            // 檢查 embedding 結果
            if (!embeddingResult || !embeddingResult.outputs) {
                console.error('Embedding 推論失敗，沒有輸出');
                this.melBuffer.shift();  // 移除一幀並繼續
                continue;
            }
            
            // 獲取 embedding
            const embeddingOutputName = Object.keys(embeddingResult.outputs)[0];
            const newEmbedding = embeddingResult.outputs[embeddingOutputName].data;
            
            // 更新 embedding 緩衝
            this.embeddingBuffer.shift();
            this.embeddingBuffer.push(new Float32Array(newEmbedding));
            
            // 準備最終推論的 embedding 資料
            const flattenedEmbeddings = new Float32Array(this.embeddingBufferSize * this.embeddingDimension);
            for (let i = 0; i < this.embeddingBuffer.length; i++) {
                flattenedEmbeddings.set(this.embeddingBuffer[i], i * this.embeddingDimension);
            }
            
            // Step 3: Wake Word Detection
            const wakewordResult = await this.workerManager.sendToWorker('wakeword-ml', {
                type: 'runInference',
                modelId: 'wakeword',
                inputs: {
                    'input': {
                        data: Array.from(flattenedEmbeddings),
                        dims: [1, this.embeddingBufferSize, this.embeddingDimension],
                        dtype: 'float32',
                        tensor: true
                    }
                }
            });
            
            // 檢查 wakeword 結果
            if (!wakewordResult || !wakewordResult.outputs) {
                console.error('Wakeword 推論失敗，沒有輸出');
                this.melBuffer.shift();  // 移除一幀並繼續
                continue;
            }
            
            // 取得分數 (假設輸出是 [negative_score, positive_score])
            const wakewordOutputName = Object.keys(wakewordResult.outputs)[0];
            const scores = wakewordResult.outputs[wakewordOutputName].data;
            const positiveScore = scores[1] || scores[0];
            
            // 更新最高分數
            maxScore = Math.max(maxScore, positiveScore);
            
            // 移除最舊的幀，為下次推論準備
            this.melBuffer.shift();
        }
        
        return maxScore;
    }

    /**
     * 主執行緒處理音訊（降級方案）
     * @param {Float32Array} audioData - 音訊資料
     * @returns {Promise<number>} 偵測分數
     */
    async processMainThread(audioData) {
        // 這裡需要實作主執行緒的推論邏輯
        // 暫時返回隨機值作為示例
        console.warn('使用主執行緒降級處理');
        return Math.random() * 0.3; // 通常不會超過閾值
    }

    /**
     * 主執行緒載入模型（降級方案）
     * @param {string} modelId - 模型 ID
     * @param {string} modelPath - 模型路徑
     * @returns {Promise<void>}
     */
    async loadModelMainThread(modelId, modelPath) {
        // 這裡需要實作主執行緒的模型載入邏輯
        console.warn(`主執行緒載入模型: ${modelId}`);
        this.models[modelId] = {
            loaded: true,
            path: modelPath,
            provider: 'main-thread'
        };
    }

    /**
     * 處理 Worker 訊息
     * @param {Object} data - 訊息資料
     */
    handleWorkerMessage(data) {
        switch (data.type) {
            case 'error':
                console.error('Worker 錯誤:', data.error);
                if (this.callbacks.onError) {
                    this.callbacks.onError(new Error(data.error.message));
                }
                break;
                
            case 'status':
                console.log('Worker 狀態:', data);
                break;
                
            default:
                // 其他訊息類型
                break;
        }
    }

    /**
     * 處理喚醒詞偵測
     * @param {number} score - 偵測分數
     */
    handleDetection(score) {
        console.log(`偵測到喚醒詞: ${this.currentWakeword}, 分數: ${score.toFixed(3)}`);
        
        if (this.callbacks.onDetection) {
            this.callbacks.onDetection({
                wakeword: this.currentWakeword,
                score: score,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 更新分數歷史
     * @param {number} score - 分數
     */
    updateScoreHistory(score) {
        this.scoreHistory.push(score);
        if (this.scoreHistory.length > this.maxHistoryLength) {
            this.scoreHistory.shift();
        }
    }

    /**
     * 更新效能指標
     * @param {number} inferenceTime - 推論時間
     */
    updatePerformanceMetrics(inferenceTime) {
        this.performanceMonitor.inferenceCount++;
        this.performanceMonitor.totalTime += inferenceTime;
        this.performanceMonitor.lastInferenceTime = inferenceTime;
        
        // 記錄到執行管理器
        const mode = this.mlWorker ? 'worker' : 'main';
        this.executionManager?.recordPerformance(mode, 'wakeword-inference', inferenceTime);
    }

    /**
     * 設定回調函數
     * @param {string} event - 事件名稱
     * @param {Function} callback - 回調函數
     */
    on(event, callback) {
        if (event in this.callbacks) {
            this.callbacks[event] = callback;
        }
    }

    /**
     * 切換喚醒詞模型
     * @param {string} wakewordName - 喚醒詞名稱
     * @returns {Promise<void>}
     */
    async switchWakeword(wakewordName) {
        if (wakewordName === this.currentWakeword) {
            console.log(`已經是 ${wakewordName} 模型`);
            return;
        }
        
        // 卸載舊模型
        if (this.mlWorker) {
            await this.workerManager.sendToWorker('wakeword-ml', {
                type: 'unloadModel',
                modelId: 'wakeword'
            });
        }
        
        // 載入新模型
        await this.loadWakewordModel(wakewordName);
        
        // 清空分數歷史
        this.scoreHistory = [];
    }

    /**
     * 設定偵測閾值
     * @param {number} threshold - 閾值 (0-1)
     */
    setThreshold(threshold) {
        this.detectionThreshold = Math.max(0, Math.min(1, threshold));
        console.log(`偵測閾值設定為: ${this.detectionThreshold}`);
    }

    /**
     * 取得效能統計
     * @returns {Object}
     */
    getPerformanceStats() {
        const avgTime = this.performanceMonitor.inferenceCount > 0
            ? this.performanceMonitor.totalTime / this.performanceMonitor.inferenceCount
            : 0;
        
        return {
            inferenceCount: this.performanceMonitor.inferenceCount,
            averageTime: avgTime,
            lastTime: this.performanceMonitor.lastInferenceTime,
            executionMode: this.mlWorker ? 'worker' : 'main',
            models: this.models,
            executionReport: this.executionManager?.generateReport()
        };
    }

    /**
     * 預熱模型
     * @returns {Promise<void>}
     */
    async warmup() {
        console.log('預熱喚醒詞模型...');
        
        if (this.mlWorker) {
            // 預熱所有模型
            for (const modelId of Object.keys(this.models)) {
                if (this.models[modelId].loaded) {
                    await this.workerManager.sendToWorker('wakeword-ml', {
                        type: 'warmupModel',
                        modelId,
                        warmupRuns: 3
                    });
                }
            }
        }
        
        // 執行幾次測試推論
        const testAudio = new Float32Array(1280).fill(0);
        for (let i = 0; i < 3; i++) {
            await this.processAudioChunk(testAudio);
        }
        
        console.log('模型預熱完成');
    }

    /**
     * 清理資源
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            // 清理緩衝區
            this.melBuffer = [];
            this.embeddingBuffer = [];
            for (let i = 0; i < this.embeddingBufferSize; i++) {
                this.embeddingBuffer.push(new Float32Array(this.embeddingDimension).fill(0));
            }
            
            if (this.mlWorker) {
                await this.workerManager.sendToWorker('wakeword-ml', {
                    type: 'cleanup'
                });
                this.workerManager.terminateWorker('wakeword-ml');
            }
            
            this.isInitialized = false;
            this.scoreHistory = [];
            this.models = {
                melspectrogram: null,
                embedding: null,
                wakeword: null
            };
            
            console.log('喚醒詞偵測器資源已清理');
            
        } catch (error) {
            console.error('清理資源失敗:', error);
        }
    }

    /**
     * 取得分數歷史
     * @returns {Array<number>}
     */
    getScoreHistory() {
        return [...this.scoreHistory];
    }

    /**
     * 重置偵測器
     */
    reset() {
        this.scoreHistory = [];
        this.performanceMonitor = {
            inferenceCount: 0,
            totalTime: 0,
            lastInferenceTime: 0
        };
    }
}