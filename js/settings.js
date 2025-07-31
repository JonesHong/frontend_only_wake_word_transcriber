// 設定管理系統
class SettingsManager {
    constructor() {
        // 預設設定
        this.defaultSettings = {
            useVAD: true,               // 是否使用自動結束（false = 手動結束）
            silenceTimeout: 1.8,        // 靜音超時秒數 (0.5 - 5.0)
            wakewordModel: 'hey_jarvis' // 預設喚醒詞模型
        };
        
        // 當前設定
        this.currentSettings = { ...this.defaultSettings };
        
        // 設定變更回調函數
        this.callbacks = [];
        
        // 初始化
        this.init();
    }
    
    init() {
        // 從 localStorage 載入設定
        this.loadSettings();
        
        // 記錄初始化
        console.log('設定系統初始化完成', this.currentSettings);
    }
    
    // 載入設定
    loadSettings() {
        try {
            const savedSettings = localStorage.getItem('voiceAssistantSettings');
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                // 合併設定，確保新增的設定項目有預設值
                this.currentSettings = { ...this.defaultSettings, ...parsed };
                console.log('已載入儲存的設定');
            }
        } catch (error) {
            console.error('載入設定失敗:', error);
            this.currentSettings = { ...this.defaultSettings };
        }
    }
    
    // 儲存設定
    saveSettings() {
        try {
            localStorage.setItem('voiceAssistantSettings', JSON.stringify(this.currentSettings));
            console.log('設定已儲存');
        } catch (error) {
            console.error('儲存設定失敗:', error);
        }
    }
    
    // 取得設定值
    getSetting(key) {
        return this.currentSettings[key];
    }
    
    // 取得所有設定
    getAllSettings() {
        return { ...this.currentSettings };
    }
    
    // 更新單一設定
    updateSetting(key, value) {
        if (!(key in this.defaultSettings)) {
            console.warn(`未知的設定項目: ${key}`);
            return false;
        }
        
        // 驗證設定值
        if (!this.validateSetting(key, value)) {
            console.error(`無效的設定值: ${key} = ${value}`);
            return false;
        }
        
        const oldValue = this.currentSettings[key];
        this.currentSettings[key] = value;
        
        // 儲存到 localStorage
        this.saveSettings();
        
        // 觸發回調
        this.notifyCallbacks(key, value, oldValue);
        
        // 記錄變更
        if (window.logger) {
            window.logger.logEvent(`設定變更: ${key}`, { oldValue, newValue: value });
        }
        
        return true;
    }
    
    // 批次更新設定
    updateSettings(settings) {
        let hasChanges = false;
        
        Object.entries(settings).forEach(([key, value]) => {
            if (this.updateSetting(key, value)) {
                hasChanges = true;
            }
        });
        
        return hasChanges;
    }
    
    // 重置為預設值
    resetToDefaults() {
        const oldSettings = { ...this.currentSettings };
        this.currentSettings = { ...this.defaultSettings };
        
        // 儲存並通知
        this.saveSettings();
        
        // 觸發所有設定的回調
        Object.keys(this.defaultSettings).forEach(key => {
            if (oldSettings[key] !== this.currentSettings[key]) {
                this.notifyCallbacks(key, this.currentSettings[key], oldSettings[key]);
            }
        });
        
        console.log('設定已重置為預設值');
    }
    
    // 驗證設定值
    validateSetting(key, value) {
        switch (key) {
            case 'useVAD':
                return typeof value === 'boolean';
                
            case 'silenceTimeout':
                return typeof value === 'number' && value >= 0.5 && value <= 5.0;
                
            case 'wakewordModel':
                return ['hey_jarvis', 'hey_mycroft', 'alexa', 'hi_kmu'].includes(value);
                
            default:
                return false;
        }
    }
    
    // 註冊設定變更回調
    onSettingChange(callback) {
        if (typeof callback === 'function') {
            this.callbacks.push(callback);
            return () => {
                const index = this.callbacks.indexOf(callback);
                if (index > -1) {
                    this.callbacks.splice(index, 1);
                }
            };
        }
        return null;
    }
    
    // 通知回調函數
    notifyCallbacks(key, newValue, oldValue) {
        this.callbacks.forEach(callback => {
            try {
                callback(key, newValue, oldValue);
            } catch (error) {
                console.error('設定回調執行錯誤:', error);
            }
        });
    }
    
    // 取得可用的喚醒詞模型列表
    getAvailableModels() {
        return [
            { value: 'hey_jarvis', name: 'Hey Jarvis', file: 'models/hey_jarvis_v0.1.onnx' },
            { value: 'hey_mycroft', name: 'Hey Mycroft', file: 'models/hey_mycroft_v0.1.onnx' },
            { value: 'alexa', name: 'Alexa', file: 'models/alexa_v0.1.onnx' },
            { value: 'hi_kmu', name: '嗨高醫', file: 'models/hi_kmu_0721.onnx' },
        ];
    }
}

// 建立全域實例
window.settingsManager = new SettingsManager();

// 設定視窗 UI 管理
class SettingsUI {
    constructor(settingsManager) {
        this.settings = settingsManager;
        this.isVisible = false;
        this.windowState = this.loadWindowState();
        
        // 建立 UI
        this.createUI();
        this.bindEvents();
        
        // 監聽設定變更
        this.settings.onSettingChange((key, value) => {
            this.updateUIFromSettings(key, value);
        });
    }
    
    loadWindowState() {
        const saved = localStorage.getItem('settingsWindowState');
        if (saved) {
            return JSON.parse(saved);
        }
        return {
            right: 20,
            bottom: 90, // 在日誌按鈕上方
            width: 350,
            height: 400
        };
    }
    
    saveWindowState() {
        localStorage.setItem('settingsWindowState', JSON.stringify(this.windowState));
    }
    
    createUI() {
        // 建立懸浮按鈕
        const floatButton = document.createElement('button');
        floatButton.id = 'settingsFloatButton';
        floatButton.innerHTML = '<i class="fas fa-cog"></i>';
        floatButton.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 90px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
            color: white;
            border: none;
            box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
            cursor: pointer;
            z-index: 9997;
            font-size: 24px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // 建立設定視窗
        const settingsWindow = document.createElement('div');
        settingsWindow.id = 'settingsWindow';
        settingsWindow.style.cssText = `
            position: fixed;
            right: ${this.windowState.right}px;
            bottom: ${this.windowState.bottom}px;
            width: ${this.windowState.width}px;
            height: ${this.windowState.height}px;
            background: var(--settings-window-bg, rgba(255, 255, 255, 0.95));
            backdrop-filter: blur(10px);
            border: 1px solid var(--settings-window-border, rgba(255, 255, 255, 0.3));
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 9998;
            display: none;
            flex-direction: column;
            min-width: 300px;
            min-height: 350px;
            max-width: 500px;
            max-height: 600px;
        `;
        
        // 視窗內容
        settingsWindow.innerHTML = `
            <div id="settingsHeader" style="
                padding: 10px 15px;
                border-radius: 12px 12px 0 0;
                cursor: move;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <span style="font-weight: 600; font-size: 16px;">
                    <i class="fas fa-cog mr-2"></i><span data-i18n="settings.title">設定</span>
                </span>
                <button id="settingsClose" style="
                    background: none;
                    border: none;
                    color: #6c757d;
                    cursor: pointer;
                    font-size: 20px;
                    line-height: 1;
                    padding: 0 4px;
                    transition: color 0.2s;
                " data-i18n="logger.close">×</button>
            </div>
            
            <div id="settingsContent" style="
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                background: var(--settings-content-bg, #ffffff);
            ">
                <!-- VAD 自動結束 -->
                <div class="setting-item" style="margin-bottom: 20px;">
                    <label class="toggle-label" style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        cursor: pointer;
                    ">
                        <div>
                            <div style="font-weight: 500; margin-bottom: 4px;" data-i18n="settings.manualEnd">手動結束</div>
                            <div style="font-size: 12px;" data-i18n="settings.manualEndDesc">開啟後需手動結束聆聽（關閉自動計時）</div>
                        </div>
                        <label class="toggle-switch" style="
                            position: relative;
                            display: inline-block;
                            width: 50px;
                            height: 24px;
                            margin-left: 10px;
                        ">
                            <input type="checkbox" id="useVADToggle" style="opacity: 0; width: 0; height: 0;">
                            <span class="toggle-slider" style="
                                position: absolute;
                                cursor: pointer;
                                top: 0;
                                left: 0;
                                right: 0;
                                bottom: 0;
                                background-color: #ccc;
                                transition: .4s;
                                border-radius: 24px;
                            "></span>
                        </label>
                    </label>
                </div>
                
                <!-- 靜音超時 -->
                <div class="setting-item" style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 500; margin-bottom: 8px;">
                        <span data-i18n="settings.silenceTimeout">靜音超時</span>
                        <span id="silenceTimeoutValue" style="color: #6366f1; margin-left: 8px;">1.8</span>
                        <span data-i18n="settings.silenceTimeoutUnit">秒</span>
                    </label>
                    <input type="range" id="silenceTimeoutSlider" 
                        min="0.5" max="5.0" step="0.1" value="1.8"
                        style="
                            width: 100%;
                            height: 6px;
                            border-radius: 3px;
                            background: #e5e7eb;
                            outline: none;
                            -webkit-appearance: none;
                        ">
                </div>
                
                <!-- 喚醒詞模型 -->
                <div class="setting-item" style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 500; margin-bottom: 8px;" data-i18n="settings.wakewordModel">喚醒詞模型</label>
                    <select id="wakewordModelSelect" style="
                        width: 100%;
                        padding: 8px 12px;
                        border: 1px solid #d1d5db;
                        border-radius: 6px;
                        background: var(--select-bg, white);
                        color: var(--select-color, #333);
                        font-size: 14px;
                        cursor: pointer;
                        outline: none;
                        transition: border-color 0.2s;
                    ">
                        <option value="hey_jarvis">Hey Jarvis</option>
                        <option value="hey_mycroft">Hey Mycroft</option>
                        <option value="alexa">Alexa</option>
                        <option value="hi_kmu">嗨高醫</option>
                    </select>
                </div>
                
                <!-- 重置按鈕 -->
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <button id="resetSettingsBtn" style="
                        width: 100%;
                        padding: 10px;
                        background: #ef4444;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: background 0.2s;
                    " data-i18n="settings.reset">重置設定</button>
                </div>
            </div>
            
            <div id="settingsResize" style="
                position: absolute;
                right: 0;
                bottom: 0;
                width: 20px;
                height: 20px;
                cursor: se-resize;
                background: linear-gradient(135deg, transparent 50%, #dee2e6 50%);
                border-radius: 0 0 12px 0;
            "></div>
        `;
        
        // 加入樣式
        const style = document.createElement('style');
        style.textContent = `
            #settingsFloatButton:hover {
                transform: scale(1.1) rotate(180deg);
                box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
            }
            
            #settingsClose:hover {
                color: #dc3545 !important;
            }
            
            /* 預設狀態（OFF）：藍色背景 = 自動結束開啟 */
            .toggle-slider {
                background-color: #6366f1 !important;
            }
            
            /* 勾選狀態（ON）：紅色背景 = 手動結束開啟 */
            .toggle-switch input:checked + .toggle-slider {
                background-color: #ef4444 !important;
            }
            
            .toggle-switch input:focus + .toggle-slider {
                box-shadow: 0 0 1px #6366f1;
            }
            
            .toggle-switch input:checked + .toggle-slider:before {
                transform: translateX(26px);
            }
            
            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            
            #silenceTimeoutSlider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 16px;
                background: #6366f1;
                border-radius: 50%;
                cursor: pointer;
            }
            
            #silenceTimeoutSlider::-moz-range-thumb {
                width: 16px;
                height: 16px;
                background: #6366f1;
                border-radius: 50%;
                cursor: pointer;
                border: none;
            }
            
            #wakewordModelSelect:hover,
            #wakewordModelSelect:focus {
                border-color: #6366f1;
            }
            
            #resetSettingsBtn:hover {
                background: #dc2626;
            }
            
            /* 深色模式支援 */
            .dark #settingsWindow {
                background: rgba(31, 41, 55, 0.95);
                border-color: rgba(55, 65, 81, 0.3);
            }
            
            .dark #settingsHeader {
                background: #374151;
                border-color: #4b5563;
            }
            
            .dark #settingsHeader span {
                color: #e5e7eb;
            }
            
            .dark #settingsContent {
                background: #1f2937;
            }
            
            .dark .setting-item label {
                color: #e5e7eb;
            }
            
            .dark #wakewordModelSelect {
                background: #374151;
                border-color: #4b5563;
                color: #e5e7eb;
            }
            
            .dark #silenceTimeoutSlider {
                background: #4b5563;
            }
        `;
        document.head.appendChild(style);
        
        // 加入到 DOM
        document.body.appendChild(floatButton);
        document.body.appendChild(settingsWindow);
        
        // 儲存參考
        this.floatButton = floatButton;
        this.window = settingsWindow;
    }
    
    bindEvents() {
        // 懸浮按鈕點擊
        this.floatButton.addEventListener('click', () => {
            this.toggleWindow();
        });
        
        // 關閉按鈕
        document.getElementById('settingsClose').addEventListener('click', () => {
            this.hideWindow();
        });
        
        // VAD 開關
        const vadToggle = document.getElementById('useVADToggle');
        vadToggle.addEventListener('change', (e) => {
            // 反轉邏輯：toggle ON = 手動結束 = useVAD false
            const useVAD = !e.target.checked;
            console.log(`手動結束 Toggle: ${e.target.checked}, useVAD: ${useVAD}`);
            this.settings.updateSetting('useVAD', useVAD);
        });
        
        // 靜音超時滑桿
        const timeoutSlider = document.getElementById('silenceTimeoutSlider');
        const timeoutValue = document.getElementById('silenceTimeoutValue');
        
        timeoutSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            timeoutValue.textContent = value.toFixed(1);
        });
        
        timeoutSlider.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value);
            this.settings.updateSetting('silenceTimeout', value);
        });
        
        // 模型選擇
        const modelSelect = document.getElementById('wakewordModelSelect');
        modelSelect.addEventListener('change', (e) => {
            this.settings.updateSetting('wakewordModel', e.target.value);
        });
        
        // 重置按鈕
        document.getElementById('resetSettingsBtn').addEventListener('click', () => {
            const confirmText = window.i18n ? 
                window.i18n.t('settings.resetConfirm') : 
                '確定要重置所有設定為預設值嗎？';
                
            if (confirm(confirmText)) {
                this.settings.resetToDefaults();
            }
        });
        
        // 拖動功能
        this.setupDragging();
        
        // 調整大小功能
        this.setupResizing();
        
        // 初始化 UI 值
        this.updateAllUIFromSettings();
    }
    
    setupDragging() {
        const header = document.getElementById('settingsHeader');
        let isDragging = false;
        let startX, startY, startRight, startBottom;
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.id === 'settingsClose') return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startRight = parseInt(this.window.style.right);
            startBottom = parseInt(this.window.style.bottom);
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        const onMouseMove = (e) => {
            if (!isDragging) return;
            
            const deltaX = startX - e.clientX;
            const deltaY = startY - e.clientY;
            
            const newRight = Math.max(0, Math.min(window.innerWidth - this.window.offsetWidth, startRight + deltaX));
            const newBottom = Math.max(0, Math.min(window.innerHeight - this.window.offsetHeight, startBottom + deltaY));
            
            this.window.style.right = newRight + 'px';
            this.window.style.bottom = newBottom + 'px';
        };
        
        const onMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // 儲存位置
            this.windowState.right = parseInt(this.window.style.right);
            this.windowState.bottom = parseInt(this.window.style.bottom);
            this.saveWindowState();
        };
    }
    
    setupResizing() {
        const handle = document.getElementById('settingsResize');
        let isResizing = false;
        let startX, startY, startWidth, startHeight;
        
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(this.window.style.width);
            startHeight = parseInt(this.window.style.height);
            
            e.stopPropagation();
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        const onMouseMove = (e) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            const newWidth = Math.max(300, Math.min(500, startWidth + deltaX));
            const newHeight = Math.max(350, Math.min(600, startHeight + deltaY));
            
            this.window.style.width = newWidth + 'px';
            this.window.style.height = newHeight + 'px';
        };
        
        const onMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // 儲存大小
            this.windowState.width = parseInt(this.window.style.width);
            this.windowState.height = parseInt(this.window.style.height);
            this.saveWindowState();
        };
    }
    
    toggleWindow() {
        if (this.isVisible) {
            this.hideWindow();
        } else {
            this.showWindow();
        }
    }
    
    showWindow() {
        this.window.style.display = 'flex';
        this.isVisible = true;
        
        // 應用當前主題
        if (window.themeManager && window.themeManager.currentTheme === 'dark') {
            this.window.classList.add('dark');
        } else {
            this.window.classList.remove('dark');
        }
        
        // 更新多語言文字
        if (window.i18n) {
            window.i18n.updatePageTranslations();
        }
    }
    
    hideWindow() {
        this.window.style.display = 'none';
        this.isVisible = false;
    }
    
    updateUIFromSettings(key, value) {
        switch (key) {
            case 'useVAD':
                // 反轉顯示：useVAD false = 手動結束 ON
                document.getElementById('useVADToggle').checked = !value;
                break;
                
            case 'silenceTimeout':
                document.getElementById('silenceTimeoutSlider').value = value;
                document.getElementById('silenceTimeoutValue').textContent = value.toFixed(1);
                break;
                
            case 'wakewordModel':
                document.getElementById('wakewordModelSelect').value = value;
                break;
        }
    }
    
    updateAllUIFromSettings() {
        const settings = this.settings.getAllSettings();
        Object.entries(settings).forEach(([key, value]) => {
            this.updateUIFromSettings(key, value);
        });
    }
}

// 當 DOM 載入完成後初始化 UI
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.settingsUI = new SettingsUI(window.settingsManager);
    });
} else {
    window.settingsUI = new SettingsUI(window.settingsManager);
}