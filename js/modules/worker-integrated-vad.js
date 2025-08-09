/**
 * WorkerIntegratedVAD - 整合 Worker 的語音活動偵測器
 * 將原本的 VAD 邏輯遷移到 Worker 執行
 */
import { WorkerManager } from './worker-manager.js';
import { ExecutionModeManager } from './execution-mode-manager.js';

export class WorkerIntegratedVAD {
    constructor() {
        this.workerManager = null;
        this.executionManager = null;
        this.mlWorker = null;
        this.isInitialized = false;
        
        // VAD 配置
        this.config = {
            threshold: 0.5,
            minSpeechFrames: 3,
            minSilenceFrames: 30,
            hangoverFrames: 12,
            sampleRate: 16000,
            frameSize: 512
        };
        
        // VAD 狀態
        this.state = {
            h: new Float32Array(2 * 64).fill(0),
            c: new Float32Array(2 * 64).fill(0),
            isSpeaking: false,
            speechFrames: 0,
            silenceFrames: 0,
            hangoverCounter: 0
        };
        
        // 模型資訊
        this.model = {
            loaded: false,
            path: '/models/github/snakers4/silero-vad/silero_vad.onnx',
            provider: null
        };
        
        // 回調函數
        this.callbacks = {
            onSpeechStart: null,
            onSpeechEnd: null,
            onVadState: null,
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
     * 初始化 VAD
     * @param {Object} config - 配置選項
     * @returns {Promise<void>}
     */
    async initialize(config = {}) {
        try {
            console.log('初始化 Worker 整合 VAD...');
            
            // 合併配置
            Object.assign(this.config, config);
            
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
            console.log('VAD 執行配置:', execConfig);
            
            // 創建 ML Worker
            if (execConfig.useWorker) {
                this.mlWorker = await this.workerManager.createWorker(
                    'vad-ml',
                    'ml-inference',
                    {
                        config: execConfig,
                        fallback: true
                    }
                );
                
                // 註冊訊息處理器
                this.workerManager.onMessage('vad-ml', (data) => {
                    this.handleWorkerMessage(data);
                });
            }
            
            // 載入 VAD 模型
            await this.loadModel();
            
            // 預熱模型
            if (config.warmup !== false) {
                await this.warmup();
            }
            
            this.isInitialized = true;
            console.log('VAD 初始化完成');
            
        } catch (error) {
            console.error('初始化 VAD 失敗:', error);
            throw error;
        }
    }

    /**
     * 載入 VAD 模型
     * @returns {Promise<void>}
     */
    async loadModel() {
        console.log(`載入 VAD 模型: ${this.model.path}`);
        
        if (this.mlWorker) {
            // 使用 Worker 載入
            const result = await this.workerManager.sendToWorker('vad-ml', {
                type: 'loadModel',
                modelId: 'vad',
                modelPath: this.model.path,
                options: {
                    graphOptimizationLevel: 'all'
                }
            });
            
            this.model.loaded = true;
            this.model.provider = result.provider;
            
        } else {
            // 主執行緒降級載入
            await this.loadModelMainThread();
        }
        
        console.log('VAD 模型載入完成');
    }

    /**
     * 處理音訊塊
     * @param {Float32Array} audioData - 音訊資料
     * @returns {Promise<Object>} VAD 結果
     */
    async processAudioChunk(audioData) {
        if (!this.isInitialized) {
            console.warn('VAD 尚未初始化');
            return { isSpeech: false, probability: 0 };
        }
        
        const startTime = performance.now();
        
        try {
            // 確保音訊資料長度正確
            const processedAudio = this.preprocessAudio(audioData);
            
            let result;
            
            if (this.mlWorker) {
                // 使用 Worker 執行推論
                result = await this.processWithWorker(processedAudio);
            } else {
                // 主執行緒降級執行
                result = await this.processMainThread(processedAudio);
            }
            
            // 更新效能指標
            const inferenceTime = performance.now() - startTime;
            this.updatePerformanceMetrics(inferenceTime);
            
            // 處理 VAD 結果
            const vadState = this.processVadResult(result);
            
            // 觸發回調
            if (this.callbacks.onVadState) {
                this.callbacks.onVadState(vadState);
            }
            
            return vadState;
            
        } catch (error) {
            console.error('處理音訊塊失敗:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
            return { isSpeech: false, probability: 0, error: error.message };
        }
    }

    /**
     * 預處理音訊資料
     * @param {Float32Array} audioData - 原始音訊資料
     * @returns {Float32Array} 處理後的音訊資料
     */
    preprocessAudio(audioData) {
        // 如果長度不是 512，進行重採樣或填充
        if (audioData.length === this.config.frameSize) {
            return audioData;
        }
        
        const processed = new Float32Array(this.config.frameSize);
        
        if (audioData.length > this.config.frameSize) {
            // 取前 512 個樣本
            processed.set(audioData.slice(0, this.config.frameSize));
        } else {
            // 填充零
            processed.set(audioData);
        }
        
        return processed;
    }

    /**
     * 使用 Worker 處理音訊
     * @param {Float32Array} audioData - 音訊資料
     * @returns {Promise<Object>} 推論結果
     */
    async processWithWorker(audioData) {
        // 準備輸入
        const inputs = {
            'input': {
                data: Array.from(audioData),
                dims: [1, audioData.length],
                dtype: 'float32',
                tensor: true
            },
            'h': {
                data: Array.from(this.state.h),
                dims: [2, 1, 64],
                dtype: 'float32',
                tensor: true
            },
            'c': {
                data: Array.from(this.state.c),
                dims: [2, 1, 64],
                dtype: 'float32',
                tensor: true
            },
            'sr': {
                data: [16000],  // 發送數字，Worker 會轉換為 BigInt
                dims: [],  // sr 是標量，沒有維度
                dtype: 'int64',
                tensor: true
            }
        };
        
        // 執行推論
        const result = await this.workerManager.sendToWorker('vad-ml', {
            type: 'runInference',
            modelId: 'vad',
            inputs
        });
        
        // 更新狀態
        const outputs = result.outputs;
        if (outputs.hn && outputs.cn) {
            this.state.h = new Float32Array(outputs.hn.data);
            this.state.c = new Float32Array(outputs.cn.data);
        }
        
        // 取得語音機率
        const probability = outputs.output?.data[0] || 0;
        
        return { probability };
    }

    /**
     * 主執行緒處理音訊（降級方案）
     * @param {Float32Array} audioData - 音訊資料
     * @returns {Promise<Object>} 推論結果
     */
    async processMainThread(audioData) {
        // 簡單的能量檢測作為降級方案
        const energy = this.calculateEnergy(audioData);
        const probability = Math.min(1, energy / 0.1);
        
        console.warn('使用主執行緒能量檢測降級方案');
        return { probability };
    }

    /**
     * 計算音訊能量
     * @param {Float32Array} audioData - 音訊資料
     * @returns {number} 能量值
     */
    calculateEnergy(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    }

    /**
     * 處理 VAD 結果
     * @param {Object} result - 推論結果
     * @returns {Object} VAD 狀態
     */
    processVadResult(result) {
        const probability = result.probability;
        const isSpeech = probability > this.config.threshold;
        
        const previousState = this.state.isSpeaking;
        
        if (isSpeech) {
            // 偵測到語音
            this.state.speechFrames++;
            this.state.silenceFrames = 0;
            this.state.hangoverCounter = this.config.hangoverFrames;
            
            // 檢查是否開始說話
            if (!this.state.isSpeaking && this.state.speechFrames >= this.config.minSpeechFrames) {
                this.state.isSpeaking = true;
                this.handleSpeechStart();
            }
        } else {
            // 沒有偵測到語音
            this.state.speechFrames = 0;
            
            // 使用 hangover 機制
            if (this.state.hangoverCounter > 0) {
                this.state.hangoverCounter--;
            } else {
                this.state.silenceFrames++;
                
                // 檢查是否停止說話
                if (this.state.isSpeaking && this.state.silenceFrames >= this.config.minSilenceFrames) {
                    this.state.isSpeaking = false;
                    this.handleSpeechEnd();
                }
            }
        }
        
        return {
            isSpeech,
            probability,
            isSpeaking: this.state.isSpeaking,
            speechFrames: this.state.speechFrames,
            silenceFrames: this.state.silenceFrames,
            stateChanged: previousState !== this.state.isSpeaking
        };
    }

    /**
     * 處理語音開始
     */
    handleSpeechStart() {
        console.log('偵測到語音開始');
        if (this.callbacks.onSpeechStart) {
            this.callbacks.onSpeechStart({
                timestamp: Date.now()
            });
        }
    }

    /**
     * 處理語音結束
     */
    handleSpeechEnd() {
        console.log('偵測到語音結束');
        if (this.callbacks.onSpeechEnd) {
            this.callbacks.onSpeechEnd({
                timestamp: Date.now(),
                duration: this.state.speechFrames * (this.config.frameSize / this.config.sampleRate) * 1000
            });
        }
    }

    /**
     * 處理 Worker 訊息
     * @param {Object} data - 訊息資料
     */
    handleWorkerMessage(data) {
        switch (data.type) {
            case 'error':
                console.error('VAD Worker 錯誤:', data.error);
                if (this.callbacks.onError) {
                    this.callbacks.onError(new Error(data.error.message));
                }
                break;
                
            case 'status':
                console.log('VAD Worker 狀態:', data);
                break;
                
            default:
                // 其他訊息類型
                break;
        }
    }

    /**
     * 主執行緒載入模型（降級方案）
     * @returns {Promise<void>}
     */
    async loadModelMainThread() {
        console.warn('主執行緒載入 VAD 模型（降級模式）');
        this.model.loaded = true;
        this.model.provider = 'main-thread-fallback';
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
        this.executionManager?.recordPerformance(mode, 'vad-inference', inferenceTime);
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
     * 設定配置
     * @param {Object} config - 配置物件
     */
    setConfig(config) {
        Object.assign(this.config, config);
        console.log('VAD 配置已更新:', this.config);
    }

    /**
     * 重置 VAD 狀態
     */
    reset() {
        this.state = {
            h: new Float32Array(2 * 64).fill(0),
            c: new Float32Array(2 * 64).fill(0),
            isSpeaking: false,
            speechFrames: 0,
            silenceFrames: 0,
            hangoverCounter: 0
        };
        
        this.performanceMonitor = {
            inferenceCount: 0,
            totalTime: 0,
            lastInferenceTime: 0
        };
        
        console.log('VAD 狀態已重置');
    }

    /**
     * 預熱模型
     * @returns {Promise<void>}
     */
    async warmup() {
        console.log('預熱 VAD 模型...');
        
        if (this.mlWorker) {
            await this.workerManager.sendToWorker('vad-ml', {
                type: 'warmupModel',
                modelId: 'vad',
                warmupRuns: 3
            });
        }
        
        // 執行幾次測試推論
        const testAudio = new Float32Array(this.config.frameSize).fill(0);
        for (let i = 0; i < 3; i++) {
            await this.processAudioChunk(testAudio);
        }
        
        // 重置狀態
        this.reset();
        
        console.log('VAD 模型預熱完成');
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
            model: this.model,
            config: this.config,
            state: this.state,
            executionReport: this.executionManager?.generateReport()
        };
    }

    /**
     * 清理資源
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            if (this.mlWorker) {
                await this.workerManager.sendToWorker('vad-ml', {
                    type: 'cleanup'
                });
                this.workerManager.terminateWorker('vad-ml');
            }
            
            this.reset();
            this.isInitialized = false;
            this.model.loaded = false;
            
            console.log('VAD 資源已清理');
            
        } catch (error) {
            console.error('清理 VAD 資源失敗:', error);
        }
    }

    /**
     * 取得當前狀態
     * @returns {Object}
     */
    getState() {
        return {
            isSpeaking: this.state.isSpeaking,
            speechFrames: this.state.speechFrames,
            silenceFrames: this.state.silenceFrames,
            isInitialized: this.isInitialized,
            modelLoaded: this.model.loaded
        };
    }
}