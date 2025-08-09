/**
 * AudioPipelineIntegration - 整合新的音訊管道到現有系統
 * 作為現有 main.js 和新音訊模組之間的橋接層
 */
import { AudioInputManager } from './audio-input-manager.js';
import { AudioCompatibilityManager } from './audio-compatibility-manager.js';

export class AudioPipelineIntegration {
    constructor() {
        this.audioInputManager = new AudioInputManager();
        this.compatibilityManager = new AudioCompatibilityManager();
        this.audioWorkletNode = null;
        this.isInitialized = false;
        this.callbacks = {
            onAudioData: null,
            onDiagnostics: null,
            onError: null
        };
    }

    /**
     * 初始化音訊管道
     * @param {Object} options - 初始化選項
     * @returns {Promise<Object>}
     */
    async initialize(options = {}) {
        try {
            console.log('開始初始化音訊管道...');
            
            // Step 1: 檢查瀏覽器相容性
            const compatibility = AudioInputManager.checkBrowserCompatibility();
            if (!compatibility.supported) {
                throw new Error(`瀏覽器不相容: ${compatibility.issues.join(', ')}`);
            }
            
            if (compatibility.warnings.length > 0) {
                console.warn('相容性警告:', compatibility.warnings);
            }
            
            // Step 2: 執行音訊診斷
            console.log('執行音訊診斷...');
            const diagnostics = await this.compatibilityManager.diagnoseAudioCapabilities();
            
            if (options.onDiagnostics) {
                options.onDiagnostics(diagnostics);
            }
            
            // Step 3: 初始化音訊輸入
            console.log('初始化音訊輸入...');
            const audioInfo = await this.audioInputManager.initializeAudioInput();
            
            // Step 4: 生成轉換策略
            const strategy = this.compatibilityManager.generateConversionStrategy({
                sampleRate: audioInfo.actualSpec.sampleRate || 48000,
                channels: audioInfo.actualSpec.channelCount || 2,
                format: 'float32'
            });
            
            console.log('轉換策略:', strategy);
            
            // Step 5: 載入 AudioWorklet (如果需要轉換)
            if (audioInfo.needsConversion) {
                await this.loadAudioWorklet(audioInfo.actualSpec);
            }
            
            this.isInitialized = true;
            
            return {
                success: true,
                audioInfo,
                diagnostics,
                strategy,
                message: '音訊管道初始化成功'
            };
            
        } catch (error) {
            console.error('音訊管道初始化失敗:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
            throw error;
        }
    }

    /**
     * 載入並配置 AudioWorklet
     * @param {Object} audioSpec - 音訊規格
     * @returns {Promise<void>}
     */
    async loadAudioWorklet(audioSpec) {
        const audioContext = this.audioInputManager.audioContext;
        
        // 載入 worklet 模組
        await audioContext.audioWorklet.addModule('/js/worklets/audio-processor.worklet.js');
        
        // 創建 worklet 節點
        this.audioWorkletNode = new AudioWorkletNode(
            audioContext,
            'audio-format-processor',
            {
                processorOptions: {
                    sourceSampleRate: audioSpec.sampleRate || 48000,
                    sourceChannels: audioSpec.channelCount || 2
                }
            }
        );
        
        // 設定訊息處理
        this.audioWorkletNode.port.onmessage = this.handleWorkletMessage.bind(this);
        
        // 連接音訊管道
        await this.audioInputManager.connectAudioPipeline(this.audioWorkletNode);
        
        console.log('AudioWorklet 已載入並連接');
    }

    /**
     * 處理來自 Worklet 的訊息
     * @param {MessageEvent} event
     */
    handleWorkletMessage(event) {
        const { type, data, stats } = event.data;
        
        switch (type) {
            case 'audio-data':
                if (this.callbacks.onAudioData) {
                    this.callbacks.onAudioData(data, stats);
                }
                break;
                
            case 'statistics':
                console.log('AudioWorklet 統計:', stats);
                break;
                
            default:
                console.log('未知的 Worklet 訊息類型:', type);
        }
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
     * 開始處理音訊
     * @param {Function} onAudioData - 音訊資料回調
     * @returns {Promise<void>}
     */
    async startProcessing(onAudioData) {
        if (!this.isInitialized) {
            throw new Error('請先呼叫 initialize()');
        }
        
        this.callbacks.onAudioData = onAudioData;
        
        // 如果沒有使用 Worklet（不需要轉換），直接設定原生處理
        if (!this.audioWorkletNode) {
            await this.setupDirectProcessing();
        }
        
        console.log('音訊處理已開始');
    }

    /**
     * 設定直接處理（不需要格式轉換時）
     * @returns {Promise<void>}
     */
    async setupDirectProcessing() {
        const audioContext = this.audioInputManager.audioContext;
        const source = audioContext.createMediaStreamSource(this.audioInputManager.stream);
        
        // 創建 ScriptProcessor 作為備援（如果不需要 Worklet）
        const processor = audioContext.createScriptProcessor(1280, 1, 1);
        
        processor.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            
            // 轉換為 Int16
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const value = Math.max(-1, Math.min(1, inputData[i]));
                int16Data[i] = Math.floor(value * 32767);
            }
            
            if (this.callbacks.onAudioData) {
                this.callbacks.onAudioData(int16Data, {
                    sampleRate: audioContext.sampleRate,
                    bufferSize: inputData.length
                });
            }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
    }

    /**
     * 停止音訊處理
     * @returns {Promise<void>}
     */
    async stop() {
        try {
            // 停止 Worklet
            if (this.audioWorkletNode) {
                this.audioWorkletNode.port.postMessage({ command: 'stop' });
                this.audioWorkletNode.disconnect();
                this.audioWorkletNode = null;
            }
            
            // 停止音訊輸入
            await this.audioInputManager.stop();
            
            this.isInitialized = false;
            console.log('音訊管道已停止');
            
        } catch (error) {
            console.error('停止音訊管道時發生錯誤:', error);
        }
    }

    /**
     * 取得診斷報告
     * @returns {Object}
     */
    getDiagnostics() {
        return {
            inputManager: this.audioInputManager.getDiagnostics(),
            compatibility: this.compatibilityManager.exportReport(),
            workletActive: !!this.audioWorkletNode,
            initialized: this.isInitialized
        };
    }

    /**
     * 生成診斷報告 HTML
     * @returns {string}
     */
    generateDiagnosticHTML() {
        return this.compatibilityManager.generateDiagnosticHTML();
    }

    /**
     * 更新 Worklet 參數
     * @param {Object} params
     */
    updateWorkletParams(params) {
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage({
                command: 'updateParams',
                params
            });
        }
    }

    /**
     * 取得 Worklet 統計資訊
     */
    requestWorkletStats() {
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage({
                command: 'getStats'
            });
        }
    }
}