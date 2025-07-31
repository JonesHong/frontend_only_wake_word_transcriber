// 有限狀態機 (FSM) 實作
class VoiceAssistantFSM {
    constructor() {
        // 定義狀態
        this.states = {
            INITIALIZATION: 'Initialization',
            IDLE: 'Idle',
            LISTENING: 'Listening'
        };
        
        // 初始狀態
        this.currentState = this.states.INITIALIZATION;
        
        // 狀態改變回調函數
        this.onStateChange = null;
        
        // 計時器
        this.silenceTimer = null;
        this.silenceTimeout = 1800; // 1.8秒靜音計時（可動態調整）
        this.wakewordCooldown = false; // 喚醒詞冷卻時間
        
        // VAD 設定
        this.useVAD = true; // 是否使用 VAD 自動結束
        this.manualMode = false; // 手動結束模式
        
        // 初始化設定
        this.initializeSettings();
    }
    
    // 設定狀態改變回調
    setStateChangeCallback(callback) {
        this.onStateChange = callback;
    }
    
    // 取得當前狀態
    getCurrentState() {
        return this.currentState;
    }
    
    // 狀態轉換
    transition(newState) {
        const oldState = this.currentState;
        this.currentState = newState;
        
        const msg = window.i18n 
            ? `${window.i18n.t('log.stateTransition')}: ${oldState} -> ${newState}`
            : `狀態轉換: ${oldState} -> ${newState}`;
        console.log(msg);
        
        // 記錄狀態變更到日誌系統
        if (window.logger) {
            window.logger.logState(oldState, newState);
        }
        
        // 觸發狀態改變回調
        if (this.onStateChange) {
            this.onStateChange(oldState, newState);
        }
        
        // 處理狀態轉換後的動作
        this.handleStateEntry(newState);
    }
    
    // 處理進入新狀態的動作
    handleStateEntry(state) {
        switch (state) {
            case this.states.INITIALIZATION:
                this.clearSilenceTimer();
                break;
                
            case this.states.IDLE:
                this.clearSilenceTimer();
                // 在 Idle 狀態啟用喚醒詞偵測
                if (window.wakewordDetector) {
                    window.wakewordDetector.start();
                }
                break;
                
            case this.states.LISTENING:
                // 在 Listening 狀態停用喚醒詞偵測
                if (window.wakewordDetector) {
                    window.wakewordDetector.stop();
                }
                // 只在 VAD 模式下啟動靜音計時器
                if (this.useVAD) {
                    this.startSilenceTimer();
                }
                break;
        }
    }
    
    // 重置靜音計時器
    resetSilenceTimer() {
        if (this.currentState === this.states.LISTENING && this.useVAD) {
            this.startSilenceTimer();
        }
    }
    
    // 清除靜音計時器
    clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }
    
    // 開始錄音
    start() {
        if (this.currentState === this.states.INITIALIZATION) {
            this.transition(this.states.IDLE);
        }
    }
    
    // 停止錄音
    stop() {
        this.transition(this.states.INITIALIZATION);
    }
    
    // 偵測到喚醒詞
    onWakeWordDetected() {
        if (this.currentState === this.states.IDLE && !this.wakewordCooldown) {
            console.log('偵測到喚醒詞，進入 Listening 狀態');
            if (window.logger) {
                window.logger.logEvent('喚醒詞偵測', { state: this.currentState });
            }
            this.transition(this.states.LISTENING);
            // 設定冷卻時間，避免重複觸發
            this.wakewordCooldown = true;
            setTimeout(() => {
                this.wakewordCooldown = false;
            }, 2000); // 2秒冷卻時間
        }
    }
    
    // 偵測到語音活動
    onVoiceActivityDetected() {
        if (this.currentState === this.states.LISTENING) {
            console.log('偵測到語音活動，重置靜音計時器');
            this.resetSilenceTimer();
        }
    }
    
    // 初始化設定
    initializeSettings() {
        // 從設定管理器載入設定
        if (window.settingsManager) {
            this.useVAD = window.settingsManager.getSetting('useVAD');
            this.manualMode = !this.useVAD; // 設定手動模式
            this.silenceTimeout = window.settingsManager.getSetting('silenceTimeout') * 1000; // 轉換為毫秒
            
            // 監聽設定變更
            window.settingsManager.onSettingChange((key, value) => {
                switch (key) {
                    case 'useVAD':
                        this.useVAD = value;
                        this.manualMode = !value; // 反轉邏輯
                        console.log(`手動結束模式: ${this.manualMode ? '開啟' : '關閉'}`);
                        console.log(`VAD 自動結束: ${value ? '開啟' : '關閉'}`);
                        
                        if (this.currentState === this.states.LISTENING) {
                            if (this.manualMode) {
                                console.log('切換到手動模式，停止自動結束計時器');
                                // 手動模式下清除計時器
                                this.clearSilenceTimer();
                            } else {
                                console.log('切換到自動模式，啟動自動結束計時器');
                                this.startSilenceTimer();
                            }
                        }
                        break;
                        
                    case 'silenceTimeout':
                        this.silenceTimeout = value * 1000; // 轉換為毫秒
                        console.log(`靜音超時設定為: ${value} 秒`);
                        // 如果正在聆聽，重新啟動計時器
                        if (this.currentState === this.states.LISTENING && this.useVAD) {
                            this.startSilenceTimer();
                        }
                        break;
                }
            });
        }
    }
    
    // 手動開始聆聽（從 Idle 狀態）
    manualStartListening() {
        if (this.currentState === this.states.IDLE) {
            console.log('手動觸發聆聽狀態');
            if (window.logger) {
                window.logger.logEvent('手動開始聆聽', { state: this.currentState });
            }
            this.transition(this.states.LISTENING);
        }
    }
    
    // 手動停止聆聽（返回 Idle 狀態）
    manualStopListening() {
        if (this.currentState === this.states.LISTENING) {
            console.log('手動結束聆聽狀態');
            if (window.logger) {
                window.logger.logEvent('手動結束聆聽', { state: this.currentState });
            }
            this.transition(this.states.IDLE);
        }
    }
    
    // 修改計時器邏輯
    startSilenceTimer() {
        // 手動模式下不啟動計時器
        if (this.manualMode) {
            console.log('手動模式下不啟動自動結束計時器');
            return;
        }
        
        this.clearSilenceTimer();
        console.log(`啟動靜音計時器 - 自動模式，超時: ${this.silenceTimeout}ms`);
        
        this.silenceTimer = setTimeout(() => {
            // 自動模式：返回 Idle 狀態
            const msg = window.i18n 
                ? window.i18n.t('log.silenceDetected')
                : `偵測到 ${(this.silenceTimeout / 1000).toFixed(1)} 秒靜音，返回 Idle 狀態`;
            console.log(msg);
            this.transition(this.states.IDLE);
        }, this.silenceTimeout);
    }
}

// 建立全域 FSM 實例
window.voiceAssistantFSM = new VoiceAssistantFSM();