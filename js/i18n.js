// 多語言系統
class I18nManager {
    constructor() {
        this.currentLanguage = 'zh-TW';
        this.fallbackLanguage = 'zh-TW';
        this.translations = {};
        this.loadTranslations();
        this.callbacks = [];
    }
    
    loadTranslations() {
        this.translations = {
            'zh-TW': {
                // 系統狀態
                'system.initialization': '初始化',
                'system.idle': '閒置',
                'system.listening': '聆聽中',
                
                // UI 元素
                'ui.title': '純前端喚醒詞語音轉譯',
                'ui.start': '開始收音',
                'ui.stop': '停止收音',
                'ui.uploadModel': '上傳模型',
                'ui.system': '系統',
                'ui.vad': 'VAD',
                'ui.microphoneWaveform': '麥克風音波',
                'ui.wakewordScore': '喚醒詞偵測分數',
                'ui.transcriptionResults': '語音轉譯結果',
                'ui.waitingForInput': '等待語音輸入...',
                'ui.current': '當前',
                'ui.play': '播放',
                'ui.pause': '暫停',
                
                // 日誌訊息
                'log.systemInitStart': '系統初始化開始',
                'log.logSystemInit': '日誌系統初始化完成',
                'log.visualizerInit': '視覺化元件初始化完成',
                'log.wakewordInit': '喚醒詞偵測器初始化完成',
                'log.vadInit': 'VAD 初始化完成',
                'log.speechInit': '語音轉譯器初始化完成',
                'log.systemInitComplete': '語音助理應用初始化完成',
                'log.systemInitFailed': '初始化失敗',
                'log.stateTransition': '狀態轉換',
                'log.wakewordDetected': '偵測到喚醒詞，進入 Listening 狀態',
                'log.silenceDetected': '偵測到 1.8 秒靜音，返回 Idle 狀態',
                'log.voiceActivity': '偵測到語音活動，重置靜音計時器',
                'log.recordingStarted': '開始錄音',
                'log.recordingStopped': '停止錄音',
                'log.transcriptionComplete': '語音轉譯完成',
                'log.wakewordEventDetected': '喚醒詞偵測',
                'log.themeChanged': '主題切換',
                'log.languageChanged': '語言切換',
                'log.modelLoaded': '已載入喚醒詞模型',
                'log.modelReplaced': '已替換喚醒詞模型',
                'log.logsCleared': '日誌已清空',
                
                // 狀態訊息
                'state.initialization': 'Initialization',
                'state.idle': 'Idle',
                'state.listening': 'Listening',
                
                // 錯誤訊息
                'error.browserNotSupported': '瀏覽器不支援 Web Speech API',
                'error.initFailed': '初始化失敗',
                'error.modelLoadFailed': '載入模型失敗',
                'error.speechRecognitionError': '語音識別錯誤',
                
                // 載入訊息
                'loading.models': '正在載入模型...',
                'loading.progress': '載入進度',
                
                // 日誌視窗
                'logger.title': '日誌記錄',
                'logger.clear': '清空',
                'logger.close': '×',
                
                // 設定相關
                'settings.title': '設定',
                'settings.manualEnd': '手動結束',
                'settings.manualEndDesc': '開啟後需手動結束聆聽（關閉自動計時）',
                'settings.silenceTimeout': '靜音超時',
                'settings.silenceTimeoutUnit': '秒',
                'settings.wakewordModel': '喚醒詞模型',
                'settings.reset': '重置設定',
                'settings.resetConfirm': '確定要重置所有設定為預設值嗎？',
                
                // 新增的UI按鈕
                'ui.manualListen': '手動聆聽',
                'ui.endListening': '結束聆聽',
                'ui.downloadText': '下載文字',
                'ui.downloadAudio': '下載語音',
            },
            'en': {
                // System states
                'system.initialization': 'Initialization',
                'system.idle': 'Idle',
                'system.listening': 'Listening',
                
                // UI elements
                'ui.title': 'Frontend-Only Wake Word Transcriber',
                'ui.start': 'Start Recording',
                'ui.stop': 'Stop Recording',
                'ui.uploadModel': 'Upload Model',
                'ui.system': 'System',
                'ui.vad': 'VAD',
                'ui.microphoneWaveform': 'Microphone Waveform',
                'ui.wakewordScore': 'Wake Word Detection Score',
                'ui.transcriptionResults': 'Speech Transcription Results',
                'ui.waitingForInput': 'Waiting for voice input...',
                'ui.current': 'Current',
                'ui.play': 'Play',
                'ui.pause': 'Pause',
                
                // Log messages
                'log.systemInitStart': 'System initialization started',
                'log.logSystemInit': 'Logger system initialized',
                'log.visualizerInit': 'Visualizer initialized',
                'log.wakewordInit': 'Wake word detector initialized',
                'log.vadInit': 'VAD initialized',
                'log.speechInit': 'Speech transcriber initialized',
                'log.systemInitComplete': 'Voice assistant app initialized',
                'log.systemInitFailed': 'Initialization failed',
                'log.stateTransition': 'State transition',
                'log.wakewordDetected': 'Wake word detected, entering Listening state',
                'log.silenceDetected': 'Detected 1.8s silence, returning to Idle state',
                'log.voiceActivity': 'Voice activity detected, resetting silence timer',
                'log.recordingStarted': 'Recording started',
                'log.recordingStopped': 'Recording stopped',
                'log.transcriptionComplete': 'Speech transcription complete',
                'log.wakewordEventDetected': 'Wake word detection',
                'log.themeChanged': 'Theme changed',
                'log.languageChanged': 'Language changed',
                'log.modelLoaded': 'Wake word model loaded',
                'log.modelReplaced': 'Wake word model replaced',
                'log.logsCleared': 'Logs cleared',
                
                // State messages
                'state.initialization': 'Initialization',
                'state.idle': 'Idle',
                'state.listening': 'Listening',
                
                // Error messages
                'error.browserNotSupported': 'Browser does not support Web Speech API',
                'error.initFailed': 'Initialization failed',
                'error.modelLoadFailed': 'Failed to load model',
                'error.speechRecognitionError': 'Speech recognition error',
                
                // Loading messages
                'loading.models': 'Loading models...',
                'loading.progress': 'Loading progress',
                
                // Logger window
                'logger.title': 'Log Records',
                'logger.clear': 'Clear',
                'logger.close': '×',
                
                // Settings
                'settings.title': 'Settings',
                'settings.manualEnd': 'Manual End',
                'settings.manualEndDesc': 'Manually end listening when enabled (disables auto timer)',
                'settings.silenceTimeout': 'Silence Timeout',
                'settings.silenceTimeoutUnit': 'seconds',
                'settings.wakewordModel': 'Wake Word Model',
                'settings.reset': 'Reset Settings',
                'settings.resetConfirm': 'Are you sure you want to reset all settings to defaults?',
                
                // New UI buttons
                'ui.manualListen': 'Manual Listen',
                'ui.endListening': 'End Listening',
                'ui.downloadText': 'Download Text',
                'ui.downloadAudio': 'Download Audio',
            },
            'ja': {
                // システム状態
                'system.initialization': '初期化中',
                'system.idle': 'アイドル',
                'system.listening': 'リスニング中',
                
                // UI要素
                'ui.title': 'フロントエンド音声転写システム',
                'ui.start': '録音開始',
                'ui.stop': '録音停止',
                'ui.uploadModel': 'モデルアップロード',
                'ui.system': 'システム',
                'ui.vad': 'VAD',
                'ui.microphoneWaveform': 'マイク波形',
                'ui.wakewordScore': 'ウェイクワード検出スコア',
                'ui.transcriptionResults': '音声認識結果',
                'ui.waitingForInput': '音声入力を待っています...',
                'ui.current': '現在',
                'ui.play': '再生',
                'ui.pause': '一時停止',
                
                // ログメッセージ
                'log.systemInitStart': 'システム初期化開始',
                'log.logSystemInit': 'ログシステム初期化完了',
                'log.visualizerInit': 'ビジュアライザー初期化完了',
                'log.wakewordInit': 'ウェイクワード検出器初期化完了',
                'log.vadInit': 'VAD初期化完了',
                'log.speechInit': '音声認識初期化完了',
                'log.systemInitComplete': '音声アシスタントアプリ初期化完了',
                'log.systemInitFailed': '初期化失敗',
                'log.stateTransition': '状態遷移',
                'log.wakewordDetected': 'ウェイクワード検出、リスニング状態へ',
                'log.silenceDetected': '1.8秒の無音検出、アイドル状態へ',
                'log.voiceActivity': '音声アクティビティ検出、無音タイマーリセット',
                'log.recordingStarted': '録音開始',
                'log.recordingStopped': '録音停止',
                'log.transcriptionComplete': '音声認識完了',
                'log.wakewordEventDetected': 'ウェイクワード検出',
                'log.themeChanged': 'テーマ変更',
                'log.languageChanged': '言語変更',
                'log.modelLoaded': 'ウェイクワードモデル読み込み完了',
                'log.modelReplaced': 'ウェイクワードモデル置換完了',
                'log.logsCleared': 'ログクリア',
                
                // 状態メッセージ
                'state.initialization': 'Initialization',
                'state.idle': 'Idle',
                'state.listening': 'Listening',
                
                // エラーメッセージ
                'error.browserNotSupported': 'ブラウザはWeb Speech APIをサポートしていません',
                'error.initFailed': '初期化失敗',
                'error.modelLoadFailed': 'モデル読み込み失敗',
                'error.speechRecognitionError': '音声認識エラー',
                
                // ローディングメッセージ
                'loading.models': 'モデル読み込み中...',
                'loading.progress': '読み込み進捗',
                
                // ログウィンドウ
                'logger.title': 'ログ記録',
                'logger.clear': 'クリア',
                'logger.close': '×',
                
                // 設定
                'settings.title': '設定',
                'settings.manualEnd': '手動終了',
                'settings.manualEndDesc': '有効時は手動でリスニングを終了（自動タイマー無効）',
                'settings.silenceTimeout': '無音タイムアウト',
                'settings.silenceTimeoutUnit': '秒',
                'settings.wakewordModel': 'ウェイクワードモデル',
                'settings.reset': '設定リセット',
                'settings.resetConfirm': 'すべての設定をデフォルトにリセットしますか？',
                
                // 新しいUIボタン
                'ui.manualListen': '手動リスニング',
                'ui.endListening': 'リスニング終了',
                'ui.downloadText': 'テキストダウンロード',
                'ui.downloadAudio': '音声ダウンロード',
            }
        };
    }
    
    // 翻譯函數
    t(key, params = {}) {
        const translation = this.getTranslation(key);
        
        // 替換參數
        let result = translation;
        Object.keys(params).forEach(param => {
            result = result.replace(`{${param}}`, params[param]);
        });
        
        return result;
    }
    
    // 取得翻譯
    getTranslation(key) {
        // 直接從當前語言的翻譯中取得
        if (this.translations[this.currentLanguage] && this.translations[this.currentLanguage][key]) {
            return this.translations[this.currentLanguage][key];
        }
        
        // 如果找不到，嘗試使用預設語言
        if (this.translations[this.fallbackLanguage] && this.translations[this.fallbackLanguage][key]) {
            console.warn(`Translation key not found in ${this.currentLanguage}, using fallback: ${key}`);
            return this.translations[this.fallbackLanguage][key];
        }
        
        // 如果都找不到，返回 key
        console.warn(`Translation key not found: ${key}`);
        return key;
    }
    
    // 設定語言
    setLanguage(lang) {
        if (this.translations[lang]) {
            const oldLang = this.currentLanguage;
            this.currentLanguage = lang;
            localStorage.setItem('language', lang);
            
            // 更新 Speech Recognition 語言
            this.updateSpeechRecognitionLanguage(lang);
            
            // 觸發所有回調
            this.callbacks.forEach(callback => callback(lang, oldLang));
            
            // 記錄語言變更
            if (window.logger) {
                window.logger.logEvent(this.t('log.languageChanged'), { from: oldLang, to: lang });
            }
            
            // 更新頁面上的所有文字
            this.updatePageTranslations();
        }
    }
    
    // 更新語音識別語言
    updateSpeechRecognitionLanguage(lang) {
        if (window.speechTranscriber && window.speechTranscriber.recognition) {
            const langMap = {
                'zh-TW': 'zh-TW',
                'en': 'en-US',
                'ja': 'ja-JP'
            };
            window.speechTranscriber.recognition.lang = langMap[lang] || 'zh-TW';
        }
    }
    
    // 註冊語言變更回調
    onLanguageChange(callback) {
        this.callbacks.push(callback);
    }
    
    // 更新頁面上的所有翻譯
    updatePageTranslations() {
        console.log('Updating page translations for language:', this.currentLanguage);
        
        // 更新所有具有 data-i18n 屬性的元素
        const elements = document.querySelectorAll('[data-i18n]');
        console.log('Found elements with data-i18n:', elements.length);
        
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            console.log(`Translating ${key} -> ${translation}`);
            element.textContent = translation;
        });
        
        // 更新具有 data-i18n-placeholder 屬性的元素
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.t(key);
        });
        
        // 更新具有 data-i18n-title 屬性的元素
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.t(key);
        });
    }
    
    // 取得當前語言
    getCurrentLanguage() {
        return this.currentLanguage;
    }
    
    // 取得所有支援的語言
    getSupportedLanguages() {
        return Object.keys(this.translations);
    }
    
    // 初始化
    init() {
        // 從 localStorage 讀取語言設定
        const savedLang = localStorage.getItem('language');
        if (savedLang && this.translations[savedLang]) {
            this.currentLanguage = savedLang;
        }
        
        console.log('i18n initialized with language:', this.currentLanguage);
        console.log('Available translations:', Object.keys(this.translations));
        
        // 立即更新頁面翻譯
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.updatePageTranslations());
        } else {
            this.updatePageTranslations();
        }
    }
}

// 建立全域實例
window.i18n = new I18nManager();

// 確保在 DOM 載入完成後初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.i18n.init());
} else {
    window.i18n.init();
}