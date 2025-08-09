/**
 * Speech Recognition Manager
 * 統一管理不同的語音識別引擎（Web Speech API、Whisper等）
 */

// 事件發射器基礎類別
class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        return this;
    }

    off(event, listener) {
        if (!this.events[event]) return this;
        
        const index = this.events[event].indexOf(listener);
        if (index > -1) {
            this.events[event].splice(index, 1);
        }
        return this;
    }

    emit(event, ...args) {
        if (!this.events[event]) return false;
        
        this.events[event].forEach(listener => {
            listener.apply(this, args);
        });
        return true;
    }

    once(event, listener) {
        const onceWrapper = (...args) => {
            listener.apply(this, args);
            this.off(event, onceWrapper);
        };
        this.on(event, onceWrapper);
        return this;
    }
}

// 語音識別引擎抽象基礎類別
export class SpeechRecognitionEngine extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.isInitialized = false;
        this.isActive = false;
        this.engineType = 'base';
    }

    /**
     * 初始化引擎
     * @param {Object} config - 引擎配置
     * @returns {Promise<void>}
     */
    async initialize(config = {}) {
        this.config = { ...this.config, ...config };
        this.isInitialized = true;
    }

    /**
     * 檢查引擎是否可用
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        return false;
    }

    /**
     * 開始語音識別
     * @param {Object} options - 識別選項
     * @returns {Promise<void>}
     */
    async start(options = {}) {
        if (!this.isInitialized) {
            throw new Error(`${this.engineType} engine not initialized`);
        }
        this.isActive = true;
    }

    /**
     * 停止語音識別
     * @returns {Promise<void>}
     */
    async stop() {
        this.isActive = false;
    }

    /**
     * 轉譯音訊檔案
     * @param {File|Blob|ArrayBuffer} file - 音訊檔案
     * @param {Object} options - 轉譯選項
     * @returns {Promise<string>}
     */
    async transcribeFile(file, options = {}) {
        throw new Error('transcribeFile not implemented');
    }

    /**
     * 釋放資源
     * @returns {Promise<void>}
     */
    async dispose() {
        await this.stop();
        this.isInitialized = false;
        this.events = {};
    }
}

// 語音識別管理器
export class SpeechRecognitionManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            defaultMode: 'auto',
            language: 'zh-TW',
            continuous: true,
            interimResults: true,
            maxAlternatives: 1,
            ...config
        };

        this.engines = new Map();
        this.currentEngine = null;
        this.currentMode = null;
        this.isInitialized = false;
    }

    /**
     * 註冊語音識別引擎
     * @param {string} name - 引擎名稱
     * @param {SpeechRecognitionEngine} engine - 引擎實例
     */
    registerEngine(name, engine) {
        if (!(engine instanceof SpeechRecognitionEngine)) {
            throw new Error('Engine must extend SpeechRecognitionEngine');
        }

        // 轉發引擎事件
        engine.on('result', (data) => this.emit('result', { ...data, engine: name }));
        engine.on('interimResult', (data) => this.emit('interimResult', { ...data, engine: name }));
        engine.on('error', (error) => this.emit('error', { ...error, engine: name }));
        engine.on('end', () => this.emit('end', { engine: name }));
        engine.on('start', () => this.emit('start', { engine: name }));

        this.engines.set(name, engine);
        console.log(`[SpeechRecognitionManager] Registered engine: ${name}`);
    }

    /**
     * 初始化管理器
     * @returns {Promise<void>}
     */
    async initialize() {
        console.log('[SpeechRecognitionManager] Initializing...');
        
        // 動態載入可用的引擎
        await this.loadAvailableEngines();
        
        // 決定預設模式
        const mode = await this.determineMode();
        if (mode) {
            await this.setMode(mode);
        }

        this.isInitialized = true;
        console.log('[SpeechRecognitionManager] Initialized with mode:', this.currentMode);
    }

    /**
     * 載入可用的引擎
     * @private
     */
    async loadAvailableEngines() {
        const engines = [];

        // 嘗試載入 Web Speech API 引擎
        try {
            const { WebSpeechEngine } = await import('./engines/webspeech-engine.js');
            const webSpeechEngine = new WebSpeechEngine(this.config);
            if (await webSpeechEngine.isAvailable()) {
                this.registerEngine('webspeech', webSpeechEngine);
                engines.push('webspeech');
            }
        } catch (error) {
            console.warn('[SpeechRecognitionManager] Web Speech API not available:', error);
        }

        // 嘗試載入 Whisper 引擎（延遲載入）
        // 注意：Whisper 引擎將在實際需要時才載入模型
        try {
            const { WhisperEngine } = await import('./engines/whisper-engine.js');
            const whisperEngine = new WhisperEngine(this.config);
            this.registerEngine('whisper', whisperEngine);
            engines.push('whisper');
        } catch (error) {
            console.warn('[SpeechRecognitionManager] Whisper engine not available:', error);
        }

        console.log('[SpeechRecognitionManager] Available engines:', engines);
        return engines;
    }

    /**
     * 智能決定使用哪種模式
     * @param {Object} context - 上下文資訊
     * @returns {Promise<string>}
     */
    async determineMode(context = {}) {
        // 如果指定了檔案模式，使用 Whisper
        if (context.type === 'file') {
            return this.engines.has('whisper') ? 'whisper' : null;
        }

        // 如果離線，優先使用 Whisper
        if (!navigator.onLine) {
            return this.engines.has('whisper') ? 'whisper' : null;
        }

        // 檢查 Web Speech API 可用性
        if (this.engines.has('webspeech')) {
            const webSpeechEngine = this.engines.get('webspeech');
            if (await webSpeechEngine.isAvailable()) {
                return 'webspeech';
            }
        }

        // 降級到 Whisper
        if (this.engines.has('whisper')) {
            return 'whisper';
        }

        return null;
    }

    /**
     * 設定當前使用的模式
     * @param {string} mode - 模式名稱
     * @returns {Promise<void>}
     */
    async setMode(mode) {
        if (!this.engines.has(mode)) {
            throw new Error(`Engine ${mode} not available`);
        }

        // 停止當前引擎
        if (this.currentEngine && this.currentEngine.isActive) {
            await this.currentEngine.stop();
        }

        // 切換引擎
        this.currentEngine = this.engines.get(mode);
        this.currentMode = mode;

        // 初始化新引擎
        if (!this.currentEngine.isInitialized) {
            await this.currentEngine.initialize(this.config);
        }

        this.emit('modeChanged', { mode });
        console.log(`[SpeechRecognitionManager] Switched to mode: ${mode}`);
    }

    /**
     * 切換模式（運行時切換）
     * @param {string} mode - 目標模式
     * @returns {Promise<void>}
     */
    async switchMode(mode) {
        const wasActive = this.currentEngine?.isActive;
        
        // 停止當前引擎
        if (wasActive) {
            await this.stop();
        }

        // 切換到新模式
        await this.setMode(mode);

        // 如果之前在運行，重新啟動
        if (wasActive) {
            await this.start();
        }
    }

    /**
     * 開始語音識別
     * @param {Object} options - 識別選項
     * @returns {Promise<void>}
     */
    async start(options = {}) {
        if (!this.currentEngine) {
            throw new Error('No recognition engine available');
        }

        await this.currentEngine.start(options);
        console.log(`[SpeechRecognitionManager] Started recognition with ${this.currentMode}`);
    }

    /**
     * 停止語音識別
     * @returns {Promise<void>}
     */
    async stop() {
        if (this.currentEngine) {
            await this.currentEngine.stop();
            console.log(`[SpeechRecognitionManager] Stopped recognition`);
        }
    }

    /**
     * 轉譯音訊檔案
     * @param {File|Blob|ArrayBuffer} file - 音訊檔案
     * @param {Object} options - 轉譯選項
     * @returns {Promise<string>}
     */
    async transcribeFile(file, options = {}) {
        // 檔案轉譯優先使用 Whisper
        let engine = this.engines.get('whisper');
        
        // 如果 Whisper 不可用，嘗試其他引擎
        if (!engine) {
            engine = this.currentEngine;
        }

        if (!engine) {
            throw new Error('No engine available for file transcription');
        }

        if (!engine.isInitialized) {
            await engine.initialize(this.config);
        }

        return await engine.transcribeFile(file, options);
    }

    /**
     * 取得當前模式資訊
     * @returns {Object}
     */
    getStatus() {
        return {
            currentMode: this.currentMode,
            availableEngines: Array.from(this.engines.keys()),
            isActive: this.currentEngine?.isActive || false,
            isInitialized: this.isInitialized
        };
    }

    /**
     * 釋放所有資源
     * @returns {Promise<void>}
     */
    async dispose() {
        for (const [name, engine] of this.engines) {
            await engine.dispose();
        }
        this.engines.clear();
        this.currentEngine = null;
        this.currentMode = null;
        this.isInitialized = false;
    }
}

// 建立單例實例
let instance = null;

export function getSpeechRecognitionManager(config) {
    if (!instance) {
        instance = new SpeechRecognitionManager(config);
    }
    return instance;
}

export default SpeechRecognitionManager;