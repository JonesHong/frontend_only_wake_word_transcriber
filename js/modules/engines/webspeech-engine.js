/**
 * Web Speech API Engine
 * 封裝瀏覽器的 Web Speech API，提供即時語音識別功能
 */

import { SpeechRecognitionEngine } from '../speech-recognition-manager.js';

export class WebSpeechEngine extends SpeechRecognitionEngine {
    constructor(config = {}) {
        super(config);
        this.engineType = 'webspeech';
        this.recognition = null;
        this.isListening = false;
        this.restartTimer = null;
        this.finalTranscript = '';
        this.interimTranscript = '';
    }

    /**
     * 檢查 Web Speech API 是否可用
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        // 檢查瀏覽器支援
        const SpeechRecognition = window.SpeechRecognition || 
                                 window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.log('[WebSpeechEngine] Web Speech API not supported');
            return false;
        }

        // 檢查是否在安全上下文（HTTPS 或 localhost）
        if (!window.isSecureContext) {
            console.log('[WebSpeechEngine] Not in secure context (HTTPS required)');
            return false;
        }

        // 檢查網路連線（Web Speech API 需要網路）
        if (!navigator.onLine) {
            console.log('[WebSpeechEngine] No internet connection');
            return false;
        }

        return true;
    }

    /**
     * 初始化 Web Speech API
     * @param {Object} config - 配置選項
     * @returns {Promise<void>}
     */
    async initialize(config = {}) {
        await super.initialize(config);

        const SpeechRecognition = window.SpeechRecognition || 
                                 window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            throw new Error('Web Speech API not supported');
        }

        // 創建識別實例
        this.recognition = new SpeechRecognition();

        // 配置識別參數
        this.recognition.continuous = this.config.continuous !== false;
        this.recognition.interimResults = this.config.interimResults !== false;
        this.recognition.maxAlternatives = this.config.maxAlternatives || 1;
        this.recognition.lang = this.config.language || 'zh-TW';

        // 設定事件處理器
        this.setupEventHandlers();

        console.log('[WebSpeechEngine] Initialized with config:', {
            language: this.recognition.lang,
            continuous: this.recognition.continuous,
            interimResults: this.recognition.interimResults
        });
    }

    /**
     * 設定事件處理器
     * @private
     */
    setupEventHandlers() {
        // 開始事件
        this.recognition.onstart = () => {
            this.isListening = true;
            console.log('[WebSpeechEngine] Recognition started');
            this.emit('start');
        };

        // 結果事件
        this.recognition.onresult = (event) => {
            this.handleResult(event);
        };

        // 錯誤事件
        this.recognition.onerror = (event) => {
            console.error('[WebSpeechEngine] Recognition error:', event.error);
            
            // 處理不同錯誤類型
            switch(event.error) {
                case 'no-speech':
                    // 沒有檢測到語音，可能需要重啟
                    if (this.config.continuous && this.isActive) {
                        this.scheduleRestart();
                    }
                    break;
                    
                case 'audio-capture':
                    this.emit('error', new Error('無法存取麥克風'));
                    break;
                    
                case 'not-allowed':
                    this.emit('error', new Error('麥克風權限被拒絕'));
                    break;
                    
                case 'network':
                    this.emit('error', new Error('網路連線錯誤'));
                    break;
                    
                case 'aborted':
                    // 識別被中止，通常是正常停止
                    break;
                    
                default:
                    this.emit('error', new Error(`識別錯誤: ${event.error}`));
            }
        };

        // 結束事件
        this.recognition.onend = () => {
            this.isListening = false;
            console.log('[WebSpeechEngine] Recognition ended');
            
            // 如果設定為連續模式且仍然活躍，自動重啟
            if (this.config.continuous && this.isActive) {
                this.scheduleRestart();
            } else {
                this.emit('end');
            }
        };

        // 語音開始事件
        this.recognition.onspeechstart = () => {
            console.log('[WebSpeechEngine] Speech detected');
            this.emit('speechStart');
        };

        // 語音結束事件
        this.recognition.onspeechend = () => {
            console.log('[WebSpeechEngine] Speech ended');
            this.emit('speechEnd');
        };

        // 無匹配事件
        this.recognition.onnomatch = () => {
            console.log('[WebSpeechEngine] No match found');
            this.emit('noMatch');
        };
    }

    /**
     * 處理識別結果
     * @private
     */
    handleResult(event) {
        this.interimTranscript = '';
        
        // 遍歷所有結果
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            const confidence = result[0].confidence || 0;

            if (result.isFinal) {
                // 最終結果
                this.finalTranscript += transcript;
                
                this.emit('result', {
                    transcript: transcript,
                    confidence: confidence,
                    isFinal: true,
                    alternatives: this.getAlternatives(result)
                });

                console.log('[WebSpeechEngine] Final result:', transcript, 'confidence:', confidence);
            } else {
                // 臨時結果
                this.interimTranscript += transcript;
                
                if (this.config.interimResults) {
                    this.emit('interimResult', {
                        transcript: transcript,
                        confidence: confidence,
                        isFinal: false
                    });

                    console.log('[WebSpeechEngine] Interim result:', transcript);
                }
            }
        }
    }

    /**
     * 取得替代結果
     * @private
     */
    getAlternatives(result) {
        const alternatives = [];
        const maxAlternatives = Math.min(result.length, this.config.maxAlternatives);
        
        for (let i = 0; i < maxAlternatives; i++) {
            alternatives.push({
                transcript: result[i].transcript,
                confidence: result[i].confidence || 0
            });
        }
        
        return alternatives;
    }

    /**
     * 排程重啟識別
     * @private
     */
    scheduleRestart() {
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
        }

        this.restartTimer = setTimeout(() => {
            if (this.isActive && !this.isListening) {
                console.log('[WebSpeechEngine] Auto-restarting recognition');
                this.recognition.start();
            }
        }, 1000);
    }

    /**
     * 開始語音識別
     * @param {Object} options - 識別選項
     * @returns {Promise<void>}
     */
    async start(options = {}) {
        await super.start(options);

        // 更新語言設定
        if (options.language) {
            this.recognition.lang = options.language;
        }

        // 重置轉錄文本
        this.finalTranscript = '';
        this.interimTranscript = '';

        try {
            this.recognition.start();
        } catch (error) {
            if (error.message.includes('already started')) {
                // 如果已經在運行，先停止再啟動
                this.recognition.stop();
                setTimeout(() => {
                    this.recognition.start();
                }, 100);
            } else {
                throw error;
            }
        }
    }

    /**
     * 停止語音識別
     * @returns {Promise<void>}
     */
    async stop() {
        await super.stop();

        // 清除重啟計時器
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }

        // 停止識別
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }

    /**
     * 中止語音識別（立即停止，不等待最終結果）
     * @returns {Promise<void>}
     */
    async abort() {
        this.isActive = false;

        // 清除重啟計時器
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }

        // 中止識別
        if (this.recognition && this.isListening) {
            this.recognition.abort();
        }
    }

    /**
     * 轉譯音訊檔案（Web Speech API 不支援檔案轉譯）
     * @param {File|Blob|ArrayBuffer} file - 音訊檔案
     * @param {Object} options - 轉譯選項
     * @returns {Promise<string>}
     */
    async transcribeFile(file, options = {}) {
        throw new Error('Web Speech API does not support file transcription. Please use Whisper engine instead.');
    }

    /**
     * 設定語言
     * @param {string} language - 語言代碼
     */
    setLanguage(language) {
        this.config.language = language;
        if (this.recognition) {
            this.recognition.lang = language;
        }
    }

    /**
     * 取得支援的語言列表
     * @returns {Array<Object>}
     */
    getSupportedLanguages() {
        // Web Speech API 支援的常用語言
        return [
            { code: 'zh-TW', name: '中文（臺灣）' },
            { code: 'zh-CN', name: '中文（中国）' },
            { code: 'en-US', name: 'English (US)' },
            { code: 'en-GB', name: 'English (UK)' },
            { code: 'ja-JP', name: '日本語' },
            { code: 'ko-KR', name: '한국어' },
            { code: 'es-ES', name: 'Español' },
            { code: 'fr-FR', name: 'Français' },
            { code: 'de-DE', name: 'Deutsch' },
            { code: 'it-IT', name: 'Italiano' },
            { code: 'pt-BR', name: 'Português (Brasil)' },
            { code: 'ru-RU', name: 'Русский' },
            { code: 'ar-SA', name: 'العربية' },
            { code: 'hi-IN', name: 'हिन्दी' }
        ];
    }

    /**
     * 釋放資源
     * @returns {Promise<void>}
     */
    async dispose() {
        await this.stop();
        
        if (this.recognition) {
            // 移除所有事件處理器
            this.recognition.onstart = null;
            this.recognition.onresult = null;
            this.recognition.onerror = null;
            this.recognition.onend = null;
            this.recognition.onspeechstart = null;
            this.recognition.onspeechend = null;
            this.recognition.onnomatch = null;
            
            this.recognition = null;
        }

        await super.dispose();
    }
}

export default WebSpeechEngine;