/**
 * Whisper Engine
 * 使用 Whisper 模型進行離線語音識別
 * 支援檔案轉譯和即時串流（通過 Worker）
 */

import { SpeechRecognitionEngine } from '../speech-recognition-manager.js';
import { decodeAudioFile } from '../../utils/audio-decoder.js';

export class WhisperEngine extends SpeechRecognitionEngine {
    constructor(config = {}) {
        super(config);
        this.engineType = 'whisper';
        this.worker = null;
        this.modelLoaded = false;
        this.isLoading = false;
        this.audioBuffer = [];
        this.transcriptionQueue = [];
    }

    /**
     * 檢查 Whisper 是否可用
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        // 檢查 Worker 支援
        if (!window.Worker) {
            console.log('[WhisperEngine] Web Workers not supported');
            return false;
        }

        // 檢查 WebAssembly 支援
        if (!window.WebAssembly) {
            console.log('[WhisperEngine] WebAssembly not supported');
            return false;
        }

        return true;
    }

    /**
     * 初始化 Whisper 引擎
     * @param {Object} config - 配置選項
     * @returns {Promise<void>}
     */
    async initialize(config = {}) {
        await super.initialize(config);

        // 設定預設配置
        this.config = {
            model: 'Xenova/whisper-base',
            language: 'zh',  // Whisper 使用 ISO 639-1 代碼
            task: 'transcribe',
            ...this.config
        };
        
        // 語言代碼映射（將區域代碼轉換為 Whisper 支援的語言代碼）
        this.languageMap = {
            'zh-TW': 'zh',
            'zh-CN': 'zh',
            'en-US': 'en',
            'en-GB': 'en',
            'ja-JP': 'ja',
            'ko-KR': 'ko',
            'es-ES': 'es',
            'fr-FR': 'fr',
            'de-DE': 'de',
            'it-IT': 'it',
            'pt-BR': 'pt',
            'ru-RU': 'ru',
            'ar-SA': 'ar',
            'hi-IN': 'hi'
        };

        // 創建 Worker（但不立即載入模型）
        await this.createWorker();

        console.log('[WhisperEngine] Initialized (model not loaded yet)');
    }

    /**
     * 創建 Worker
     * @private
     */
    async createWorker() {
        try {
            // 使用相對於當前頁面的路徑，支援 GitHub Pages 子目錄
            const basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
            const workerPath = basePath + '/js/workers/whisper.worker.js';
            this.worker = new Worker(workerPath, { type: 'module' });
            
            // 用於追蹤待處理的訊息回應
            this.pendingMessages = new Map();
            
            // 設定 Worker 訊息處理
            this.worker.onmessage = (event) => {
                const data = event.data;
                
                // 如果有 messageId，檢查是否有對應的 Promise 處理器
                if (data.messageId && this.pendingMessages.has(data.messageId)) {
                    const handler = this.pendingMessages.get(data.messageId);
                    this.pendingMessages.delete(data.messageId);
                    
                    if (data.error) {
                        handler.reject(new Error(data.error));
                    } else {
                        handler.resolve(data);
                    }
                } else {
                    // 處理一般訊息（包括串流更新）
                    this.handleWorkerMessage(data);
                }
            };

            this.worker.onerror = (error) => {
                console.error('[WhisperEngine] Worker error:', error);
                this.emit('error', error);
            };

            // 初始化 Worker（包含輸出模式配置）
            await this.sendWorkerMessage({
                type: 'initialize',
                config: {
                    ...this.config,
                    whisperOutputMode: window.Config?.speech?.whisperOutputMode || 'streaming'
                }
            });

        } catch (error) {
            console.error('[WhisperEngine] Failed to create worker:', error);
            throw error;
        }
    }

    /**
     * 處理 Worker 訊息
     * @private
     */
    handleWorkerMessage(data) {
        // 處理一般訊息（串流更新、進度更新等）
        switch (data.type) {
            case 'initialized':
            case 'initializeResponse':
                console.log('[WhisperEngine] Worker initialized');
                break;

            case 'modelLoadProgress':
                this.emit('loadProgress', {
                    progress: data.progress,
                    message: data.message
                });
                console.log(`[WhisperEngine] Model loading: ${data.progress}%`);
                break;

            case 'modelLoaded':
            case 'loadModelResponse':
                this.modelLoaded = true;
                this.isLoading = false;
                this.emit('modelLoaded');
                console.log('[WhisperEngine] Model loaded successfully');
                break;

            case 'transcriptionResult':
                this.handleTranscriptionResult(data.result);
                break;
                
            case 'transcriptionUpdate':
                // 即時更新的轉譯結果 (串流輸出)
                if (data.data) {
                    // Worker 現在發送的是已經格式化的 {text, chunks}
                    const text = data.data.text || '';
                    const chunks = data.data.chunks || [];
                    
                    // 發送兩種事件以支援不同的使用場景
                    this.emit('interimResult', {
                        transcript: text,
                        chunks: chunks,
                        isFinal: false
                    });
                    
                    // 專門為檔案轉譯的串流更新
                    this.emit('interimTranscription', {
                        transcript: text,
                        chunks: chunks
                    });
                    
                    // 記錄串流更新（包含 chunks 資訊）
                    if (text || chunks.length > 0) {
                        const preview = text.substring(0, 100) + (text.length > 100 ? '...' : '');
                        console.log('[WhisperEngine] Streaming update:', {
                            text: preview,
                            chunksCount: chunks.length,
                            latestChunk: chunks.length > 0 ? chunks[chunks.length - 1] : null
                        });
                    }
                }
                break;

            case 'transcriptionProgress':
                this.emit('transcriptionProgress', data.progress);
                break;
                
            case 'startStreamingResponse':
            case 'stopStreamingResponse':
            case 'transcribeFileResponse':
                // 這些是正常的回應訊息，不需要警告
                break;

            case 'error':
                this.isLoading = false;
                this.emit('error', new Error(data.error));
                console.error('[WhisperEngine] Worker error:', data.error);
                break;

            default:
                // 只有真正未知的訊息才警告
                if (data.type && !data.type.endsWith('Response')) {
                    console.warn('[WhisperEngine] Unknown worker message:', data.type);
                }
        }
    }

    /**
     * 處理轉譯結果
     * @private
     */
    handleTranscriptionResult(result) {
        this.emit('result', {
            transcript: result.text,
            confidence: result.confidence || 1.0,
            isFinal: true,
            language: result.language,
            segments: result.segments || []
        });

        console.log('[WhisperEngine] Transcription result:', result.text);
    }

    /**
     * 發送訊息給 Worker
     * @private
     */
    sendWorkerMessage(message) {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Worker not initialized'));
                return;
            }

            const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            
            // 儲存 Promise 處理器
            const timeoutId = setTimeout(() => {
                if (this.pendingMessages.has(messageId)) {
                    this.pendingMessages.delete(messageId);
                    reject(new Error('Worker response timeout'));
                }
            }, 300000); // 300秒超時
            
            this.pendingMessages.set(messageId, {
                resolve: (data) => {
                    clearTimeout(timeoutId);
                    resolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            });
            
            // 發送訊息
            this.worker.postMessage({ ...message, messageId });
        });
    }

    /**
     * 載入模型（支援動態切換）
     * @param {string} modelId - 模型 ID（可選，預設使用配置中的模型）
     * @public
     */
    async loadModel(modelId = null) {
        // 如果指定了新模型，更新配置
        if (modelId) {
            // 獲取模型資訊
            const modelInfo = window.Config?.getModelInfo('whisper', modelId);
            if (!modelInfo) {
                throw new Error(`Unknown Whisper model: ${modelId}`);
            }
            
            // 更新配置
            this.config.model = modelInfo.path;
            this.config.modelId = modelId;
            this.config.quantized = modelInfo.quantized || false;
            
            // 標記需要重新載入
            this.modelLoaded = false;
            this.isLoading = false;
            
            console.log(`[WhisperEngine] Switching to model: ${modelId} (${modelInfo.name})`);
        }
        
        if (this.modelLoaded && !modelId) {
            return;
        }

        if (this.isLoading) {
            // 等待載入完成
            return new Promise((resolve, reject) => {
                const checkLoaded = () => {
                    if (this.modelLoaded) {
                        resolve();
                    } else if (!this.isLoading) {
                        reject(new Error('Model loading failed'));
                    } else {
                        setTimeout(checkLoaded, 100);
                    }
                };
                checkLoaded();
            });
        }

        this.isLoading = true;
        console.log('[WhisperEngine] Loading model...');

        try {
            // 準備載入配置
            const loadConfig = {
                model: this.config.model,
                modelId: this.config.modelId,
                quantized: this.config.quantized,
                whisperModelSource: window.Config?.speech?.whisperModelSource || 'local'
            };
            
            await this.sendWorkerMessage({
                type: 'loadModel',
                config: loadConfig,
                model: this.config.model
            });
        } catch (error) {
            this.isLoading = false;
            throw error;
        }
    }

    /**
     * 開始語音識別（即時串流模式）
     * @param {Object} options - 識別選項
     * @returns {Promise<void>}
     */
    async start(options = {}) {
        await super.start(options);

        // 延遲載入模型
        await this.loadModel();

        // 清空音訊緩衝
        this.audioBuffer = [];
        
        // 轉換語言代碼
        let language = options.language || this.config.language;
        if (this.languageMap[language]) {
            language = this.languageMap[language];
        }

        // 通知 Worker 開始串流模式
        await this.sendWorkerMessage({
            type: 'startStreaming',
            config: {
                language: language,
                task: options.task || this.config.task
            }
        });

        console.log('[WhisperEngine] Started streaming recognition');
    }

    /**
     * 處理音訊資料（串流模式）
     * @param {Float32Array} audioData - 音訊資料
     */
    async processAudio(audioData) {
        if (!this.isActive || !this.modelLoaded) {
            return;
        }

        // 累積音訊資料
        this.audioBuffer.push(audioData);

        // 當累積足夠資料時進行轉譯（例如 3 秒）
        const sampleRate = 16000;
        const chunkDuration = 3; // 秒
        const samplesPerChunk = sampleRate * chunkDuration;
        
        const totalSamples = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);

        if (totalSamples >= samplesPerChunk) {
            // 合併音訊緩衝
            const audioChunk = this.mergeAudioBuffers(this.audioBuffer);
            
            // 清空緩衝
            this.audioBuffer = [];

            // 發送給 Worker 進行轉譯
            this.worker.postMessage({
                type: 'transcribeChunk',
                audio: audioChunk,
                sampleRate: sampleRate
            }, [audioChunk.buffer]);
        }
    }

    /**
     * 合併音訊緩衝
     * @private
     */
    mergeAudioBuffers(buffers) {
        const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
        const result = new Float32Array(totalLength);
        
        let offset = 0;
        for (const buffer of buffers) {
            result.set(buffer, offset);
            offset += buffer.length;
        }
        
        return result;
    }

    /**
     * 停止語音識別
     * @returns {Promise<void>}
     */
    async stop() {
        await super.stop();

        // 處理剩餘的音訊資料
        if (this.audioBuffer.length > 0) {
            const audioChunk = this.mergeAudioBuffers(this.audioBuffer);
            this.audioBuffer = [];

            if (this.modelLoaded) {
                this.worker.postMessage({
                    type: 'transcribeChunk',
                    audio: audioChunk,
                    sampleRate: 16000
                }, [audioChunk.buffer]);
            }
        }

        // 通知 Worker 停止
        if (this.worker) {
            await this.sendWorkerMessage({ type: 'stopStreaming' });
        }

        console.log('[WhisperEngine] Stopped recognition');
    }

    /**
     * 轉譯音訊檔案
     * @param {File|Blob|ArrayBuffer} file - 音訊檔案
     * @param {Object} options - 轉譯選項
     * @returns {Promise<string>}
     */
    async transcribeFile(file, options = {}) {
        // 延遲載入模型
        await this.loadModel();

        console.log('[WhisperEngine] Starting file transcription');

        // 使用 Web Audio API 解碼音訊（支援 MP3, WAV, OGG 等）
        let audioData;
        try {
            // 使用靜態導入的解碼器（已在檔案頂部導入）
            // 解碼音訊檔案為 Float32Array (16kHz)
            audioData = await decodeAudioFile(file, 16000);
            
            console.log(`[WhisperEngine] Audio decoded: ${audioData.length} samples`);
            
        } catch (error) {
            console.error('[WhisperEngine] Audio decoding failed:', error);
            
            // 降級：嘗試作為 ArrayBuffer 處理（僅支援 WAV）
            console.warn('[WhisperEngine] Falling back to basic WAV decoder');
            
            let audioBuffer;
            if (file instanceof File || file instanceof Blob) {
                audioBuffer = await file.arrayBuffer();
            } else if (file instanceof ArrayBuffer) {
                audioBuffer = file;
            } else {
                throw new Error('Invalid file type');
            }
            
            // 讓 Worker 嘗試解碼（僅支援 WAV）
            audioData = audioBuffer;
        }
        
        // 轉換語言代碼
        let language = options.language || this.config.language;
        if (this.languageMap[language]) {
            language = this.languageMap[language];
        }

        // 發送給 Worker 進行轉譯（包含輸出模式和模型來源）
        const result = await this.sendWorkerMessage({
            type: 'transcribeFile',
            audio: audioData,
            config: {
                language: language,
                task: options.task || this.config.task,
                returnSegments: options.returnSegments || false,
                whisperOutputMode: window.Config?.speech?.whisperOutputMode || 'streaming',
                whisperModelSource: window.Config?.speech?.whisperModelSource || 'local'
            }
        });

        return result.transcript;
    }

    /**
     * 取得支援的語言列表
     * @returns {Array<Object>}
     */
    getSupportedLanguages() {
        // Whisper 支援 100+ 種語言
        // 這裡列出常用語言
        return [
            { code: 'zh', name: '中文' },
            { code: 'en', name: 'English' },
            { code: 'ja', name: '日本語' },
            { code: 'ko', name: '한국어' },
            { code: 'es', name: 'Español' },
            { code: 'fr', name: 'Français' },
            { code: 'de', name: 'Deutsch' },
            { code: 'it', name: 'Italiano' },
            { code: 'pt', name: 'Português' },
            { code: 'ru', name: 'Русский' },
            { code: 'ar', name: 'العربية' },
            { code: 'hi', name: 'हिन्दी' },
            { code: 'th', name: 'ไทย' },
            { code: 'vi', name: 'Tiếng Việt' },
            { code: 'id', name: 'Bahasa Indonesia' }
        ];
    }

    /**
     * 取得可用的模型列表
     * @returns {Array<Object>}
     */
    getAvailableModels() {
        return [
            { id: 'Xenova/whisper-tiny', name: 'Tiny (39 MB)', speed: 'fastest' },
            { id: 'Xenova/whisper-base', name: 'Base (74 MB)', speed: 'fast' },
            { id: 'Xenova/whisper-small', name: 'Small (244 MB)', speed: 'balanced' },
            { id: 'Xenova/whisper-medium', name: 'Medium (769 MB)', speed: 'slow' },
            { id: 'Xenova/whisper-large', name: 'Large (1550 MB)', speed: 'slowest' }
        ];
    }

    /**
     * 釋放資源
     * @returns {Promise<void>}
     */
    async dispose() {
        await this.stop();

        if (this.worker) {
            await this.sendWorkerMessage({ type: 'dispose' });
            this.worker.terminate();
            this.worker = null;
        }

        this.modelLoaded = false;
        this.isLoading = false;
        this.audioBuffer = [];
        this.transcriptionQueue = [];

        await super.dispose();
    }
}

export default WhisperEngine;