// 語言切換管理
class LanguageManager {
    constructor() {
        this.init();
    }
    
    init() {
        // 等待 DOM 載入完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }
    
    setup() {
        const languageSelect = document.getElementById('languageSelect');
        if (!languageSelect) return;
        
        // 設定當前語言
        const currentLang = window.i18n.getCurrentLanguage();
        languageSelect.value = currentLang;
        
        // 監聽語言切換
        languageSelect.addEventListener('change', (e) => {
            window.i18n.setLanguage(e.target.value);
        });
        
        // 註冊語言變更回調
        window.i18n.onLanguageChange((newLang, oldLang) => {
            console.log(`語言切換: ${oldLang} -> ${newLang}`);
            
            // 更新語音識別語言
            if (window.speechTranscriber && window.speechTranscriber.recognition) {
                const langMap = {
                    'zh-TW': 'zh-TW',
                    'en': 'en-US',
                    'ja': 'ja-JP'
                };
                window.speechTranscriber.recognition.lang = langMap[newLang] || 'zh-TW';
            }
            
            // 更新圖表文字
            if (window.visualizer) {
                window.requestAnimationFrame(() => {
                    if (window.visualizer.isRunning) {
                        window.visualizer.drawWaveform();
                        window.visualizer.drawWakewordScore();
                    }
                });
            }
        });
    }
}

// 建立全域實例
window.languageManager = new LanguageManager();