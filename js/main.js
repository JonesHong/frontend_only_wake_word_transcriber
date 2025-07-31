// 主程式 - 整合所有模組
class VoiceAssistantApp {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.workletNode = null;
        this.isInitialized = false;
        
        // 音訊處理參數
        this.sampleRate = 16000;
        this.frameSize = 1280; // 80ms chunks
        
        // 音訊緩衝區
        this.currentAudioBuffer = [];
        
        // DOM 元素
        this.startBtn = null;
        this.stopBtn = null;
        this.modelUpload = null;
        this.modelName = null;
        this.systemStatus = null;
        this.transcriptionResults = null;
        this.manualListenBtn = null;
        this.endListeningBtn = null;
        this.downloadTextBtn = null;
        this.downloadAudioBtn = null;
        
        // 語音記錄
        this.transcriptionHistory = [];
        this.audioRecordings = [];
        this.totalDurationMs = 0; // 累計時間（毫秒）
    }
    
    async initialize() {
        console.log(window.i18n ? window.i18n.t('log.systemInitStart') : '初始化語音助理應用...');
        if (window.logger) {
            window.logger.logEvent(window.i18n ? window.i18n.t('log.systemInitStart') : '系統初始化開始');
        }
        
        // 取得 DOM 元素
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.modelUpload = document.getElementById('modelUpload');
        this.modelName = document.getElementById('modelName');
        this.systemStatus = document.getElementById('systemStatus');
        this.transcriptionResults = document.getElementById('transcriptionResults');
        this.manualListenBtn = document.getElementById('manualListenBtn');
        this.endListeningBtn = document.getElementById('endListeningBtn');
        this.downloadTextBtn = document.getElementById('downloadTextBtn');
        this.downloadAudioBtn = document.getElementById('downloadAudioBtn');
        
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        const progressBar = document.querySelector('.progress-bar');
        
        // 設定事件監聽器
        this.setupEventListeners();
        
        // 初始化所有模組
        try {
            // 更新載入進度
            loadingText.textContent = '正在初始化視覺化元件...';
            progressBar.style.width = '20%';
            
            // 初始化視覺化
            if (!window.visualizer.initialize()) {
                throw new Error('視覺化元件初始化失敗');
            }
            
            // 更新載入進度
            loadingText.textContent = '正在載入喚醒詞模型...';
            progressBar.style.width = '40%';
            
            // 初始化喚醒詞偵測器
            await window.wakewordDetector.initialize();
            
            // 更新載入進度
            loadingText.textContent = '正在載入 VAD 模型...';
            progressBar.style.width = '60%';
            
            // 初始化 VAD
            await window.voiceActivityDetector.initialize();
            
            // 更新載入進度
            loadingText.textContent = '正在初始化語音轉譯器...';
            progressBar.style.width = '80%';
            
            // 初始化語音轉譯器
            if (!window.speechTranscriber.initialize()) {
                throw new Error('語音轉譯器初始化失敗');
            }
            
            // 設定 FSM 回調
            window.voiceAssistantFSM.setStateChangeCallback((oldState, newState) => {
                this.handleStateChange(oldState, newState);
            });
            
            // 設定喚醒詞偵測回調
            window.wakewordDetector.setDetectionCallback((score) => {
                console.log(`偵測到喚醒詞！分數: ${score}`);
                // 音效改由狀態轉換時處理
                window.voiceAssistantFSM.onWakeWordDetected();
            });
            
            window.wakewordDetector.setScoreCallback((score, history) => {
                window.visualizer.updateWakewordScore(score, history);
            });
            
            // 設定 VAD 回調
            window.voiceActivityDetector.setCallback((vadDetected, vadScore, isSpeechActive) => {
                window.visualizer.updateVADStatus(vadDetected);
                
                if (vadDetected) {
                    window.voiceAssistantFSM.onVoiceActivityDetected();
                }
            });
            
            // 設定語音轉譯回調
            window.speechTranscriber.setTranscriptionCallback((result) => {
                this.handleTranscription(result);
            });
            
            // 更新載入進度
            progressBar.style.width = '100%';
            loadingText.textContent = '初始化完成！';
            
            this.isInitialized = true;
            console.log('語音助理應用初始化完成');
            
            // 初始化模型顯示
            if (window.settingsManager) {
                const currentModel = window.settingsManager.getSetting('wakewordModel');
                this.updateModelDisplay(currentModel);
            }
            
            // 隱藏載入畫面
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
            }, 500);
            
        } catch (error) {
            console.error('初始化失敗:', error);
            loadingText.textContent = '初始化失敗: ' + error.message;
            this.updateStatus('初始化失敗: ' + error.message);
            
            // 延遲後隱藏載入畫面
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
            }, 2000);
        }
    }
    
    setupEventListeners() {
        // 開始按鈕
        this.startBtn.addEventListener('click', () => this.start());
        
        // 停止按鈕
        this.stopBtn.addEventListener('click', () => this.stop());
        
        // 模型上傳
        this.modelUpload.addEventListener('change', (event) => this.handleModelUpload(event));
        
        // 手動聆聽按鈕
        this.manualListenBtn.addEventListener('click', () => {
            window.voiceAssistantFSM.manualStartListening();
        });
        
        // 結束聆聽按鈕
        this.endListeningBtn.addEventListener('click', () => {
            window.voiceAssistantFSM.manualStopListening();
        });
        
        // 下載按鈕
        this.downloadTextBtn.addEventListener('click', () => this.downloadTranscriptionText());
        this.downloadAudioBtn.addEventListener('click', () => this.downloadAllAudio());
        
        // 監聽設定變更以更新按鈕顯示
        if (window.settingsManager) {
            window.settingsManager.onSettingChange((key, value) => {
                if (key === 'useVAD') {
                    this.updateButtonVisibility();
                } else if (key === 'wakewordModel') {
                    this.updateModelDisplay(value);
                }
            });
        }
    }
    
    async start() {
        if (!this.isInitialized) {
            alert('系統尚未初始化完成');
            return;
        }
        
        try {
            // 請求麥克風權限
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: this.sampleRate
                } 
            });
            
            // 建立音訊上下文
            this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
            
            // 建立音訊處理 worklet
            await this.setupAudioWorklet();
            
            // 連接音訊流
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            source.connect(this.workletNode);
            this.workletNode.connect(this.audioContext.destination);
            
            // 啟動視覺化
            window.visualizer.start();
            
            // 更新 UI
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            
            // 啟動 FSM
            window.voiceAssistantFSM.start();
            
        } catch (error) {
            console.error('啟動失敗:', error);
            this.updateStatus('啟動失敗: ' + error.message);
        }
    }
    
    async stop() {
        // 停止 FSM
        window.voiceAssistantFSM.stop();
        
        // 停止視覺化
        window.visualizer.stop();
        
        // 停止語音轉譯
        window.speechTranscriber.stop();
        
        // 清理音訊資源
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
        
        // 重置 VAD
        window.voiceActivityDetector.reset();
        
        // 更新 UI
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }
    
    async setupAudioWorklet() {
        // 建立音訊處理 worklet
        const workletCode = `
            class AudioProcessor extends AudioWorkletProcessor {
                constructor() {
                    super();
                    this.bufferSize = ${this.frameSize};
                    this.buffer = new Float32Array(this.bufferSize);
                    this.bufferIndex = 0;
                }
                
                process(inputs, outputs, parameters) {
                    const input = inputs[0];
                    if (input && input[0]) {
                        const inputData = input[0];
                        
                        for (let i = 0; i < inputData.length; i++) {
                            this.buffer[this.bufferIndex++] = inputData[i];
                            
                            if (this.bufferIndex >= this.bufferSize) {
                                // 發送完整的音訊塊
                                this.port.postMessage({
                                    type: 'audio',
                                    data: this.buffer.slice()
                                });
                                this.bufferIndex = 0;
                            }
                        }
                    }
                    
                    return true;
                }
            }
            
            registerProcessor('audio-processor', AudioProcessor);
        `;
        
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        
        await this.audioContext.audioWorklet.addModule(workletUrl);
        this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
        
        // 處理音訊資料
        this.workletNode.port.onmessage = async (event) => {
            if (event.data.type === 'audio') {
                const audioData = event.data.data;
                
                // 更新音波圖
                window.visualizer.updateWaveform(audioData);
                
                // 根據當前狀態處理音訊
                const currentState = window.voiceAssistantFSM.getCurrentState();
                
                // 持續執行喚醒詞偵測以更新分數
                await window.wakewordDetector.processAudioChunk(audioData);
                
                if (currentState === 'Listening') {
                    // 在 Listening 狀態執行 VAD 並收集音訊
                    this.currentAudioBuffer.push(audioData.slice());
                    // 即時更新語音轉譯器的音訊緩衝區
                    window.speechTranscriber.setAudioBuffer(this.currentAudioBuffer);
                    
                    // 總是處理 VAD（自動模式用於結束，手動模式用於分段）
                    await window.voiceActivityDetector.processAudioChunk(audioData);
                }
            }
        };
    }
    
    handleStateChange(oldState, newState) {
        console.log(`狀態變更: ${oldState} -> ${newState}`);
        
        // 更新狀態顯示
        const stateKey = `system.${newState.toLowerCase()}`;
        const stateText = window.i18n ? window.i18n.t(stateKey) : this.getStateDisplayName(newState);
        this.updateStatus(stateText);
        
        // 更新 data-i18n 屬性
        if (this.systemStatus) {
            this.systemStatus.setAttribute('data-i18n', stateKey);
        }
        
        // 根據新狀態執行相應動作
        switch (newState) {
            case 'Initialization':
                // 停止所有處理
                break;
                
            case 'Idle':
                // 如果從 Listening 狀態返回，播放結束音效
                if (oldState === 'Listening') {
                    this.playEndSound();
                }
                
                // 先設定音訊緩衝區，再停止語音轉譯
                if (this.currentAudioBuffer.length > 0) {
                    window.speechTranscriber.setAudioBuffer(this.currentAudioBuffer);
                    this.currentAudioBuffer = [];
                }
                // 停止語音轉譯
                window.speechTranscriber.pause();
                // 清理喚醒詞偵測器的緩衝區以快速重置分數
                window.wakewordDetector.resetBuffers();
                break;
                
            case 'Listening':
                // 播放開始音效
                this.playStartSound();
                
                // 清空音訊緩衝區並啟動語音轉譯
                this.currentAudioBuffer = [];
                window.speechTranscriber.start();
                break;
        }
        
        // 更新按鈕顯示狀態
        this.updateButtonVisibility();
    }
    
    getStateDisplayName(state) {
        const stateNames = {
            'Initialization': '初始化',
            'Idle': '等待喚醒詞',
            'Listening': '聆聽中'
        };
        return stateNames[state] || state;
    }
    
    updateStatus(status) {
        if (this.systemStatus) {
            this.systemStatus.textContent = status;
        }
    }
    
    handleTranscription(result) {
        if (result.completed) {
            // 完成的轉譯結果
            this.addTranscriptionToResults(result.final, result.timestamp, result.audioUrl);
        } else if (result.interim || result.final) {
            // 即時顯示（可選）
            // 這裡可以顯示即時轉譯結果
        }
    }
    
    addTranscriptionToResults(text, timestamp, audioUrl) {
        if (!text || text.trim() === '') return;
        
        // 估算語音時長（基於文字長度，平均每秒3-4個字）
        const estimatedDurationMs = Math.max(2000, text.trim().length * 200); // 最少2秒
        const startTimeMs = this.totalDurationMs;
        const endTimeMs = this.totalDurationMs + estimatedDurationMs;
        
        // 記錄到歷史
        const transcriptionRecord = {
            text: text.trim(),
            timestamp: timestamp,
            audioUrl: audioUrl,
            startTimeMs: startTimeMs,
            endTimeMs: endTimeMs,
            durationMs: estimatedDurationMs
        };
        this.transcriptionHistory.push(transcriptionRecord);
        
        // 更新累計時間
        this.totalDurationMs = endTimeMs;
        
        // 如果有音訊，記錄到音訊列表
        if (audioUrl) {
            this.audioRecordings.push({
                url: audioUrl,
                timestamp: timestamp,
                text: text.trim(),
                startTimeMs: startTimeMs,
                endTimeMs: endTimeMs,
                durationMs: estimatedDurationMs
            });
        }
        
        // 更新下載按鈕狀態
        this.updateDownloadButtons();
        
        // 移除佔位符
        const placeholder = this.transcriptionResults.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        // 建立新的轉譯項目
        const item = document.createElement('div');
        item.className = 'transcription-item';
        
        // 如果有音訊，加入播放按鈕
        if (audioUrl) {
            const audioContainer = document.createElement('div');
            audioContainer.className = 'audio-controls';
            
            const audio = document.createElement('audio');
            audio.src = audioUrl;
            audio.style.display = 'none';
            
            const playBtn = document.createElement('button');
            playBtn.className = 'play-btn';
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
            playBtn.onclick = () => {
                if (audio.paused) {
                    audio.play();
                    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                } else {
                    audio.pause();
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                }
            };
            
            audio.onended = () => {
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
            };
            
            audioContainer.appendChild(playBtn);
            audioContainer.appendChild(audio);
            item.appendChild(audioContainer);
        }
        
        // 時間戳記
        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = timestamp.toLocaleTimeString('zh-TW');
        
        // 文字內容
        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        textDiv.textContent = text;
        
        item.appendChild(timeDiv);
        item.appendChild(textDiv);
        
        // 插入到最前面
        this.transcriptionResults.insertBefore(item, this.transcriptionResults.firstChild);
        
        // 限制顯示數量
        while (this.transcriptionResults.children.length > 20) {
            this.transcriptionResults.removeChild(this.transcriptionResults.lastChild);
        }
    }
    
    async handleModelUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.name.endsWith('.onnx')) {
            alert('請上傳 ONNX 格式的模型檔案');
            return;
        }
        
        try {
            const success = await window.wakewordDetector.replaceModel(file);
            if (success) {
                this.modelName.textContent = `使用模型: ${file.name}`;
                alert('模型替換成功');
            } else {
                alert('模型替換失敗');
            }
        } catch (error) {
            console.error('模型上傳錯誤:', error);
            alert('模型上傳失敗: ' + error.message);
        }
        
        // 清空 input
        event.target.value = '';
    }
    
    // 播放提示音
    playBeep() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = 880; // A5 音符
        gainNode.gain.value = 0.1;
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.1); // 100ms 的嗶聲
    }
    
    // 播放開始收音音效（上升音調）
    playStartSound() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        
        // 第一個音：C5 (523Hz)
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.value = 523;
        gain1.gain.value = 0.1;
        osc1.start(currentTime);
        osc1.stop(currentTime + 0.1);
        
        // 第二個音：E5 (659Hz)
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.value = 659;
        gain2.gain.value = 0.1;
        osc2.start(currentTime + 0.1);
        osc2.stop(currentTime + 0.2);
    }
    
    // 播放結束收音音效（下降音調）
    playEndSound() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        
        // 第一個音：E5 (659Hz)
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.value = 659;
        gain1.gain.value = 0.1;
        osc1.start(currentTime);
        osc1.stop(currentTime + 0.1);
        
        // 第二個音：C5 (523Hz)
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.value = 523;
        gain2.gain.value = 0.1;
        osc2.start(currentTime + 0.1);
        osc2.stop(currentTime + 0.2);
    }
    
    // 更新按鈕顯示狀態
    updateButtonVisibility() {
        if (!window.settingsManager || !window.voiceAssistantFSM) return;
        
        const useVAD = window.settingsManager.getSetting('useVAD');
        const currentState = window.voiceAssistantFSM.getCurrentState();
        
        // 手動聆聽按鈕：在 Idle 狀態且系統已啟動時顯示
        if (this.manualListenBtn) {
            this.manualListenBtn.style.display = 
                (currentState === 'Idle' && this.audioContext) ? 'inline-block' : 'none';
        }
        
        // 結束聆聽按鈕：在 Listening 狀態且 VAD 關閉時顯示
        if (this.endListeningBtn) {
            this.endListeningBtn.style.display = 
                (currentState === 'Listening' && !useVAD) ? 'inline-block' : 'none';
        }
    }
    
    // 更新模型顯示
    updateModelDisplay(modelValue) {
        if (!this.modelName || !window.settingsManager) return;
        
        const availableModels = window.settingsManager.getAvailableModels();
        const modelInfo = availableModels.find(model => model.value === modelValue);
        
        if (modelInfo) {
            this.modelName.textContent = modelInfo.file.replace('models/', '');
        }
    }
    
    // 更新下載按鈕狀態
    updateDownloadButtons() {
        if (this.downloadTextBtn) {
            this.downloadTextBtn.disabled = this.transcriptionHistory.length === 0;
        }
        if (this.downloadAudioBtn) {
            this.downloadAudioBtn.disabled = this.audioRecordings.length === 0;
        }
    }
    
    // 下載轉譯文字（Whisper 格式）
    downloadTranscriptionText() {
        if (this.transcriptionHistory.length === 0) {
            alert('沒有可下載的轉譯記錄');
            return;
        }
        
        // 依記錄順序排序（不需要重新排序，因為已經是按順序記錄的）
        const sortedHistory = [...this.transcriptionHistory];
        
        // 生成 Whisper 格式文字
        const whisperFormat = sortedHistory.map((record) => {
            const startTime = this.formatTimestampFromMs(record.startTimeMs);
            const endTime = this.formatTimestampFromMs(record.endTimeMs);
            return `[${startTime} --> ${endTime}] ${record.text}`;
        }).join('\n');
        
        // 創建並下載文件
        const blob = new Blob([whisperFormat], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcription_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // 下載所有語音檔案
    async downloadAllAudio() {
        if (this.audioRecordings.length === 0) {
            alert('沒有可下載的語音記錄');
            return;
        }
        
        try {
            // 使用 JSZip 來打包所有音訊文件（如果可用）
            if (typeof JSZip !== 'undefined') {
                const zip = new JSZip();
                
                for (let i = 0; i < this.audioRecordings.length; i++) {
                    const recording = this.audioRecordings[i];
                    const response = await fetch(recording.url);
                    const audioBlob = await response.blob();
                    const filename = `audio_${i + 1}_${recording.timestamp.toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
                    zip.file(filename, audioBlob);
                }
                
                const content = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `voice_recordings_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                // 如果沒有 JSZip，逐個下載
                for (let i = 0; i < this.audioRecordings.length; i++) {
                    const recording = this.audioRecordings[i];
                    const a = document.createElement('a');
                    a.href = recording.url;
                    a.download = `audio_${i + 1}_${recording.timestamp.toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    
                    // 添加延遲避免瀏覽器阻擋多個下載
                    if (i < this.audioRecordings.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
        } catch (error) {
            console.error('下載音訊檔案時發生錯誤:', error);
            alert('下載失敗: ' + error.message);
        }
    }
    
    // 格式化時間戳記為 Whisper 格式 (HH:MM:SS.mmm)
    formatTimestamp(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${milliseconds}`;
    }
    
    // 從毫秒格式化時間戳記為 Whisper 格式 (HH:MM:SS.mmm)
    formatTimestampFromMs(totalMs) {
        const hours = Math.floor(totalMs / 3600000);
        const minutes = Math.floor((totalMs % 3600000) / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const milliseconds = totalMs % 1000;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }
}

// 當頁面載入完成時初始化應用
document.addEventListener('DOMContentLoaded', async () => {
    window.voiceAssistantApp = new VoiceAssistantApp();
    await window.voiceAssistantApp.initialize();
});