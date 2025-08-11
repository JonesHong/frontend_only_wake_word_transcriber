// Web Speech API 語音轉譯模組
class SpeechTranscriber {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.transcriptionCallback = null;
        this.utteranceBuffer = [];
        this.currentTranscript = '';
        this.currentAudioBuffer = [];
        this.sessionId = null; // 當前聆聽會話 ID
        
        // 檢查瀏覽器支援
        this.isSupported = this.checkBrowserSupport();
    }
    
    checkBrowserSupport() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error('瀏覽器不支援 Web Speech API');
            return false;
        }
        return true;
    }
    
    initialize() {
        if (!this.isSupported) {
            return false;
        }
        
        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            // 設定語音識別參數
            this.recognition.lang = 'zh-TW'; // 繁體中文
            this.recognition.continuous = true; // 持續聆聽
            this.recognition.interimResults = true; // 顯示即時結果
            this.recognition.maxAlternatives = 1;
            
            // 設定事件處理器
            this.setupEventHandlers();
            
            console.log('語音轉譯器初始化完成');
            return true;
        } catch (error) {
            console.error('語音轉譯器初始化失敗:', error);
            return false;
        }
    }
    
    setupEventHandlers() {
        // 開始事件
        this.recognition.onstart = () => {
            console.log('語音識別已開始');
            this.isListening = true;
            this.sessionId = Date.now(); // 新的會話 ID
            this.currentTranscript = ''; // 重置當前轉譯
            // 保留音訊緩衝區，不在這裡重置
        };
        
        // 結束事件
        this.recognition.onend = () => {
            console.log('語音識別已結束');
            this.isListening = false;
            
            // 合併本次會話的所有內容為一個完整項目
            if (this.currentTranscript && this.currentTranscript.trim() !== '') {
                let audioUrl = null;
                if (this.currentAudioBuffer && this.currentAudioBuffer.length > 0) {
                    audioUrl = this.createWavBlobUrl(this.currentAudioBuffer);
                }
                
                // 觸發完整結果回調
                if (this.transcriptionCallback) {
                    this.transcriptionCallback({
                        finalizeSession: true,
                        sessionId: this.sessionId,
                        fullText: this.currentTranscript,
                        audioUrl: audioUrl,
                        timestamp: new Date()
                    });
                }
            }
            
            // 清除臨時顯示
            if (this.transcriptionCallback) {
                this.transcriptionCallback({
                    clearInterim: true
                });
            }
            
            // 重置狀態
            this.currentTranscript = '';
            this.sessionId = null;
        };
        
        // 錯誤事件
        this.recognition.onerror = (event) => {
            console.error('語音識別錯誤:', event.error);
            
            // 某些錯誤可以自動恢復
            if (event.error === 'no-speech' || event.error === 'audio-capture') {
                // 這些錯誤通常是暫時的
                console.log('暫時性錯誤，將嘗試繼續...');
            }
        };
        
        // 結果事件
        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            
            // 處理所有結果
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // 更新當前轉譯
            if (finalTranscript) {
                this.currentTranscript += finalTranscript;
                if (window.logger) {
                    window.logger.logEvent('語音轉譯完成', { text: finalTranscript });
                }
            }
            
            // 觸發回調（包含即時和最終結果）
            if (this.transcriptionCallback) {
                this.transcriptionCallback({
                    interim: interimTranscript,
                    final: this.currentTranscript,
                    timestamp: new Date(),
                    isStreaming: true
                });
            }
            
            // 不再在串流時顯示每個片段
            // 只更新臨時顯示區域
        };
    }
    
    start() {
        if (!this.isSupported || !this.recognition) {
            console.error('語音轉譯器未初始化');
            return false;
        }
        
        if (!this.isListening) {
            try {
                this.recognition.start();
                this.currentTranscript = '';
                // 不要在這裡清空音訊緩衝區，讓它保留從 main.js 收集的音訊
                // this.currentAudioBuffer = [];
                return true;
            } catch (error) {
                console.error('啟動語音識別失敗:', error);
                return false;
            }
        }
        
        return true;
    }
    
    stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }
    
    // 暫停但不結束（用於 FSM 狀態切換）
    pause() {
        if (this.recognition && this.isListening) {
            // 不需要在暫停時保存，讓 onend 事件處理
            this.recognition.stop();
        }
    }
    
    // 恢復聆聽
    resume() {
        if (this.recognition && !this.isListening) {
            this.start();
        }
    }
    
    // 設定轉譯回調
    setTranscriptionCallback(callback) {
        this.transcriptionCallback = callback;
    }
    
    // 設定音訊緩衝區
    setAudioBuffer(audioBuffer) {
        this.currentAudioBuffer = audioBuffer;
    }
    
    // 觸發分段轉譯（手動模式下使用）
    triggerSegment() {
        console.log('觸發分段轉譯');
        if (this.currentTranscript && this.currentTranscript.trim() !== '') {
            // 保存當前的轉譯結果
            this.saveTranscription(this.currentTranscript);
            
            // 清空當前轉譯但繼續聆聽
            this.currentTranscript = '';
            
            // 記錄日誌
            if (window.logger) {
                window.logger.logEvent('分段轉譯完成', { 
                    mode: '手動模式',
                    trigger: '靜音超時'
                });
            }
        }
        
        // 清空音訊緩衝區以開始新的分段
        this.currentAudioBuffer = [];
        
        // 也清空主程式的音訊緩衝區
        if (window.voiceAssistantApp) {
            window.voiceAssistantApp.currentAudioBuffer = [];
        }
    }
    
    // 移除不再需要的方法
    
    // 保存轉譯結果（最終結果含音訊）
    saveTranscription(text, isStreaming = false) {
        if (!text || text.trim() === '') return;
        
        // 建立音訊 URL
        let audioUrl = null;
        if (this.currentAudioBuffer && this.currentAudioBuffer.length > 0) {
            audioUrl = this.createWavBlobUrl(this.currentAudioBuffer);
        }
        
        const transcription = {
            text: text,
            timestamp: new Date(),
            id: Date.now(),
            audioUrl: audioUrl
        };
        
        // 加入歷史記錄
        this.addToHistory(transcription);
        
        // 觸發完成回調
        if (this.transcriptionCallback) {
            this.transcriptionCallback({
                final: text,
                timestamp: transcription.timestamp,
                completed: true,
                audioUrl: audioUrl,
                isStreaming: false
            });
        }
    }
    
    // 建立 WAV 音訊 URL
    createWavBlobUrl(audioChunks) {
        const sampleRate = 16000;
        let totalLength = audioChunks.reduce((len, chunk) => len + chunk.length, 0);
        if (totalLength === 0) return null;
        
        // 合併所有音訊塊
        let combined = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of audioChunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }
        
        // 轉換為 16-bit PCM
        let pcmData = new Int16Array(totalLength);
        for (let i = 0; i < totalLength; i++) {
            let s = Math.max(-1, Math.min(1, combined[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // 建立 WAV 檔頭
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        const channels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * channels * (bitsPerSample / 8);
        const blockAlign = channels * (bitsPerSample / 8);
        
        view.setUint32(0, 0x52494646, false); // "RIFF"
        view.setUint32(4, 36 + pcmData.byteLength, true);
        view.setUint32(8, 0x57415645, false); // "WAVE"
        view.setUint32(12, 0x666d7420, false); // "fmt "
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        view.setUint32(36, 0x64617461, false); // "data"
        view.setUint32(40, pcmData.byteLength, true);
        
        const wavBlob = new Blob([view, pcmData], { type: 'audio/wav' });
        return URL.createObjectURL(wavBlob);
    }
    
    // 轉譯歷史管理
    transcriptionHistory = [];
    
    addToHistory(transcription) {
        this.transcriptionHistory.push(transcription);
        
        // 限制歷史記錄數量（保留最近 50 筆）
        if (this.transcriptionHistory.length > 50) {
            this.transcriptionHistory.shift();
        }
    }
    
    getHistory() {
        return this.transcriptionHistory;
    }
    
    clearHistory() {
        this.transcriptionHistory = [];
    }
    
    // 設定語言
    setLanguage(lang) {
        if (this.recognition) {
            this.recognition.lang = lang;
        }
    }
}

// 建立全域語音轉譯器實例
window.speechTranscriber = new SpeechTranscriber();