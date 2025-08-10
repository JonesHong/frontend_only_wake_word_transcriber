// 主程式 - 整合所有模組
import { AudioPipelineIntegration } from './modules/audio-pipeline-integration.js';
import { getSpeechRecognitionManager } from './modules/speech-recognition-manager.js';

class VoiceAssistantApp {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.workletNode = null;
        this.isInitialized = false;
        
        // 新的音訊管道整合
        this.audioPipeline = new AudioPipelineIntegration();
        
        // 語音識別管理器
        this.speechRecognitionManager = null;
        
        // 音訊處理參數
        this.sampleRate = 16000;
        this.frameSize = 1280; // 80ms chunks - 喚醒詞模型需要此大小
        
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
        
        // 模式切換元素
        this.streamingModeBtn = null;
        this.batchModeBtn = null;
        this.streamingResults = null;
        this.batchMode = null;
        this.dropZone = null;
        this.audioFileInput = null;
        this.recordBtn = null;
        this.stopRecordBtn = null;
        this.engineSelect = null;
        this.batchResults = null;
        
        // 批次模式狀態
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        
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
        
        // 取得模式切換元素
        this.streamingModeBtn = document.getElementById('streamingModeBtn');
        this.batchModeBtn = document.getElementById('batchModeBtn');
        this.streamingResults = document.getElementById('streamingResults');
        this.batchMode = document.getElementById('batchUploadPanel'); // 改為新的 ID
        this.dropZone = document.getElementById('dropZone');
        this.audioFileInput = document.getElementById('audioFileInput');
        this.recordBtn = document.getElementById('batchRecordBtn'); // 更新為批次模式專用ID
        this.stopRecordBtn = document.getElementById('batchStopRecordBtn'); // 更新為批次模式專用ID
        this.engineSelect = document.getElementById('engineSelect');
        this.batchResults = document.getElementById('batchResultsContainer'); // 改為新的 ID
        this.batchDownloadTextBtn = document.getElementById('batchDownloadTextBtn');
        this.batchDownloadAudioBtn = document.getElementById('batchDownloadAudioBtn');
        // 批次模式暫時不使用獨立的 canvas，因為會重用主要的 waveformCanvas
        
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
            
            // 確保 Config 已經初始化完成（載入 registry）
            loadingText.textContent = '正在載入模型註冊表...';
            progressBar.style.width = '30%';
            
            if (window.Config) {
                // 總是重新初始化以確保載入完成
                console.log('初始化 Config...');
                await window.Config.init();
                
                // 驗證載入成功
                console.log('Config 載入完成，可用的喚醒詞模型:', Object.keys(window.Config.models.wakeword.available));
                console.log('Config 載入完成，可用的 Whisper 模型:', Object.keys(window.Config.models.whisper.available));
                console.log('VAD 模型路徑:', window.Config.models.vad.model);
                
                // 在 Config 載入完成後初始化 Whisper 模型列表
                this.initializeWhisperModelList();
            } else {
                throw new Error('Config 物件不存在');
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
            
            // 初始化語音識別管理器
            this.speechRecognitionManager = getSpeechRecognitionManager({
                language: window.settingsManager?.getSetting('recognitionLanguage') || 'zh-TW',
                continuous: true,
                interimResults: true
            });
            
            await this.speechRecognitionManager.initialize();
            
            // 設定事件監聽器
            this.speechRecognitionManager.on('result', (data) => {
                this.handleTranscription({
                    transcript: data.transcript,
                    isFinal: true,
                    confidence: data.confidence || 1.0,
                    engine: data.engine
                });
            });
            
            this.speechRecognitionManager.on('interimResult', (data) => {
                this.handleTranscription({
                    transcript: data.transcript,
                    isFinal: false,
                    engine: data.engine
                });
            });
            
            this.speechRecognitionManager.on('error', (error) => {
                console.error('語音識別錯誤:', error);
                if (window.logger) {
                    window.logger.logEvent('語音識別錯誤', error);
                }
            });
            
            // 保持向後相容性（暫時）
            window.speechTranscriber = {
                initialize: () => true,
                start: () => this.speechRecognitionManager.start(),
                stop: () => this.speechRecognitionManager.stop(),
                setAudioBuffer: (buffer) => { this.currentAudioBuffer = buffer; },
                setTranscriptionCallback: () => {}
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
                
                // 處理語音活動狀態變化
                if (isSpeechActive) {
                    // 語音活動中，重置計時器
                    window.voiceAssistantFSM.onVoiceActivityDetected();
                } else if (window.voiceAssistantFSM.getCurrentState() === 'Listening' && 
                          window.voiceActivityDetector.hasDetectedSpeech) {
                    // 只有在曾經偵測到語音後，語音活動結束才觸發靜音偵測
                    window.voiceAssistantFSM.onSilenceDetected();
                }
            });
            
            // 語音轉譯回調已在上方設定
            
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
        
        // 模式切換按鈕
        this.streamingModeBtn?.addEventListener('click', () => this.switchToStreamingMode());
        this.batchModeBtn?.addEventListener('click', () => this.switchToBatchMode());
        
        // 批次模式事件
        this.setupBatchModeListeners();
        
        // 批次下載按鈕事件
        this.batchDownloadTextBtn?.addEventListener('click', () => this.downloadBatchText());
        this.batchDownloadAudioBtn?.addEventListener('click', () => this.downloadBatchAudio());
        
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
            // 使用新的音訊管道初始化
            const result = await this.audioPipeline.initialize({
                onDiagnostics: (diagnostics) => {
                    console.log('音訊診斷報告:', diagnostics);
                    // 可選：顯示診斷資訊給使用者
                    if (diagnostics.recommendations.length > 0) {
                        console.warn('音訊建議:', diagnostics.recommendations);
                    }
                }
            });
            
            // 設定音訊資料處理回調
            await this.audioPipeline.startProcessing((audioData, stats) => {
                this.processAudioFrame(audioData);
            });
            
            // 保存音訊上下文和串流參考（向後相容）
            this.audioContext = this.audioPipeline.audioInputManager.audioContext;
            this.mediaStream = this.audioPipeline.audioInputManager.stream;
            
            // 啟動視覺化
            window.visualizer.start();
            
            // 更新 UI
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            
            // 啟動 FSM
            window.voiceAssistantFSM.start();
            
            // 顯示音訊資訊
            if (result.audioInfo.needsConversion) {
                console.log('音訊格式轉換已啟用:', result.audioInfo.conversionDetails);
            }
            
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
        if (this.speechRecognitionManager) {
            this.speechRecognitionManager.stop();
        }
        
        // 使用新的音訊管道停止
        await this.audioPipeline.stop();
        
        // 清理舊的參考（向後相容）
        this.workletNode = null;
        this.mediaStream = null;
        this.audioContext = null;
        
        // 重置 VAD
        window.voiceActivityDetector.reset();
        
        // 更新 UI
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }
    
    // 新的音訊處理方法，由音訊管道調用
    async processAudioFrame(audioData) {
        // 將 Int16Array 轉換為 Float32Array（如果需要）
        let floatData;
        if (audioData instanceof Int16Array) {
            floatData = new Float32Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                floatData[i] = audioData[i] / 32768.0;
            }
        } else {
            floatData = audioData;
        }
        
        // 更新音波圖
        window.visualizer.updateWaveform(floatData);
        
        // 根據當前狀態處理音訊
        const currentState = window.voiceAssistantFSM.getCurrentState();
        
        // 持續執行喚醒詞偵測以更新分數
        await window.wakewordDetector.processAudioChunk(floatData);
        
        if (currentState === 'Listening') {
            // 在 Listening 狀態執行 VAD 並收集音訊
            this.currentAudioBuffer.push(floatData.slice());
            
            // 總是處理 VAD（自動模式用於結束，手動模式用於分段）
            await window.voiceActivityDetector.processAudioChunk(floatData);
        }
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
                    
                    // 設定音訊緩衝區供保存用
                    if (this.currentAudioBuffer.length > 0) {
                        window.speechTranscriber.setAudioBuffer(this.currentAudioBuffer);
                        this.currentAudioBuffer = [];
                    }
                    
                    // 清除臨時顯示框
                    const interimDiv = document.getElementById('interimTranscription');
                    if (interimDiv) {
                        interimDiv.remove();
                    }
                }
                
                // 停止語音轉譯
                if (this.speechRecognitionManager) {
                    this.speechRecognitionManager.stop();
                }
                // 清理喚醒詞偵測器的緩衝區以快速重置分數
                window.wakewordDetector.resetBuffers();
                break;
                
            case 'Listening':
                // 播放開始音效
                this.playStartSound();
                
                // 清空音訊緩衝區並啟動語音轉譯
                this.currentAudioBuffer = [];
                if (this.speechRecognitionManager) {
                    this.speechRecognitionManager.start();
                }
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
        // 處理新的事件格式（來自 SpeechRecognitionManager）
        if (result.transcript) {
            if (result.isFinal) {
                // 最終結果
                this.updateInterimTranscription(result.transcript);
                // 記錄到歷史
                this.addTranscriptionToResults(result.transcript, new Date());
            } else {
                // 臨時結果
                this.updateInterimTranscription(result.transcript);
            }
            return;
        }
        
        // 保持向後相容性（舊格式）
        if (result.clearInterim) {
            // 清除臨時顯示
            const interimDiv = document.getElementById('interimTranscription');
            if (interimDiv) {
                interimDiv.remove();
            }
            return;
        }
        
        if (result.finalizeSession) {
            // 會話結束，合併所有內容為一個完整項目
            this.finalizeTranscriptionSession(result);
            return;
        }
        
        if (result.interim) {
            // 只更新臨時顯示區域
            this.updateInterimTranscription(result.interim);
        } else if (result.final) {
            // 更新完整的轉譯內容到臨時區域
            this.updateInterimTranscription(result.final);
        }
    }
    
    // 更新即時轉譯（臨時結果）
    updateInterimTranscription(text) {
        if (!text) return;
        
        // 查找或建立臨時顯示區域
        let interimDiv = document.getElementById('interimTranscription');
        if (!interimDiv) {
            interimDiv = document.createElement('div');
            interimDiv.id = 'interimTranscription';
            interimDiv.className = 'interim-transcription';
            this.transcriptionResults.insertBefore(interimDiv, this.transcriptionResults.firstChild);
        }
        
        interimDiv.textContent = text;
    }
    
    // 移除不再需要的方法
    
    // 完成會話，建立完整的轉譯項目
    finalizeTranscriptionSession(result) {
        const { sessionId, fullText, audioUrl, timestamp } = result;
        
        if (!fullText || fullText.trim() === '') return;
        
        // 清除臨時顯示
        const interimDiv = document.getElementById('interimTranscription');
        if (interimDiv) {
            interimDiv.remove();
        }
        
        // 建立最終的轉譯項目（包含音訊）
        this.addTranscriptionToResults(fullText, timestamp, audioUrl);
    }
    
    // 更新串流轉譯（即時最終結果）
    updateStreamingTranscription(text, timestamp) {
        // 移除此方法，不再需要
    }
    
    // 更新最後一個轉譯項目的音訊
    updateLastTranscriptionAudio(audioUrl, fullText) {
        if (!audioUrl) return;
        
        // 找到所有匹配全文的轉譯項目
        const items = this.transcriptionResults.querySelectorAll('.transcription-item');
        
        for (let item of items) {
            const textDiv = item.querySelector('.text');
            if (textDiv && fullText.includes(textDiv.textContent)) {
                // 檢查是否已有音訊控制
                let audioControls = item.querySelector('.audio-controls');
                if (!audioControls) {
                    // 加入音訊控制
                    audioControls = document.createElement('div');
                    audioControls.className = 'audio-controls';
                    
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
                    
                    audioControls.appendChild(playBtn);
                    audioControls.appendChild(audio);
                    item.appendChild(audioControls);
                    
                    // 同時更新記錄
                    const existingRecord = this.audioRecordings.find(r => fullText.includes(r.text));
                    if (!existingRecord) {
                        this.audioRecordings.push({
                            url: audioUrl,
                            timestamp: new Date(),
                            text: fullText,
                            startTimeMs: this.totalDurationMs,
                            endTimeMs: this.totalDurationMs + 3000,
                            durationMs: 3000
                        });
                    }
                }
            }
        }
        
        // 更新下載按鈕狀態
        this.updateDownloadButtons();
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
        item.className = 'transcription-item bg-gray-800 rounded-lg p-4 mb-2';
        
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
        textDiv.className = 'transcription-text text';
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
    
    // 保存錄音並提供 Whisper 轉譯選項
    async saveRecordingWithTranscription(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0) return;
        
        // 合併音訊緩衝區
        const totalLength = audioBuffer.reduce((sum, buffer) => sum + buffer.length, 0);
        const mergedAudio = new Float32Array(totalLength);
        let offset = 0;
        for (const buffer of audioBuffer) {
            mergedAudio.set(buffer, offset);
            offset += buffer.length;
        }
        
        // 建立 WAV Blob
        const wavBlob = this.createWavBlob(mergedAudio, 16000);
        const audioUrl = URL.createObjectURL(wavBlob);
        
        // 儲存錄音
        this.audioRecordings.push({
            blob: wavBlob,
            url: audioUrl,
            timestamp: new Date(),
            duration: mergedAudio.length / 16000
        });
        
        // 延遲一下確保 UI 已更新
        setTimeout(() => {
            // 在結果中顯示錄音播放器和 Whisper 轉譯按鈕
            const lastTranscriptionItem = this.transcriptionResults.querySelector('.transcription-item');
            if (lastTranscriptionItem && !lastTranscriptionItem.querySelector('.whisper-transcribe-btn')) {
                let audioContainer = lastTranscriptionItem.querySelector('.audio-container');
                if (!audioContainer) {
                    audioContainer = document.createElement('div');
                    audioContainer.className = 'audio-container mt-2';
                    lastTranscriptionItem.appendChild(audioContainer);
                }
                
                // 添加音訊播放器
                if (!audioContainer.querySelector('audio')) {
                    const audioPlayer = document.createElement('audio');
                    audioPlayer.controls = true;
                    audioPlayer.src = audioUrl;
                    audioPlayer.className = 'w-full h-8';
                    audioContainer.appendChild(audioPlayer);
                }
                
                // 添加 Whisper 轉譯按鈕
                const whisperBtn = document.createElement('button');
                whisperBtn.className = 'whisper-transcribe-btn bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm mt-2';
                whisperBtn.textContent = '使用 Whisper 重新轉譯';
                whisperBtn.onclick = async () => {
                    whisperBtn.disabled = true;
                    whisperBtn.textContent = '轉譯中...';
                    
                    try {
                        // 使用 Whisper 轉譯
                        const transcript = await this.speechRecognitionManager.transcribeFile(wavBlob);
                        
                        // 更新轉譯結果
                        const textElement = lastTranscriptionItem.querySelector('.transcription-text');
                        if (textElement) {
                            textElement.textContent = transcript;
                            // 標記為 Whisper 轉譯
                            const badge = document.createElement('span');
                            badge.className = 'ml-2 text-xs bg-purple-600 text-white px-2 py-1 rounded';
                            badge.textContent = 'Whisper';
                            textElement.appendChild(badge);
                        }
                        
                        whisperBtn.textContent = '轉譯完成';
                        whisperBtn.classList.replace('bg-purple-600', 'bg-green-600');
                        whisperBtn.classList.replace('hover:bg-purple-700', 'hover:bg-green-700');
                        
                    } catch (error) {
                        console.error('Whisper 轉譯失敗:', error);
                        whisperBtn.textContent = '轉譯失敗';
                        whisperBtn.classList.replace('bg-purple-600', 'bg-red-600');
                        whisperBtn.classList.replace('hover:bg-purple-700', 'hover:bg-red-700');
                    }
                };
                
                audioContainer.appendChild(whisperBtn);
            }
        }, 100);
    }
    
    // 建立 WAV Blob
    createWavBlob(audioData, sampleRate) {
        const length = audioData.length;
        const arrayBuffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(arrayBuffer);
        
        // WAV 檔頭
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);
        
        // 轉換音訊資料
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, audioData[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }
        
        return new Blob([arrayBuffer], { type: 'audio/wav' });
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
    
    // 切換到即時模式
    switchToStreamingMode() {
        // 如果批次錄音正在進行，先停止它
        if (this.isRecording) {
            console.log('停止批次錄音以切換到即時模式');
            this.stopBatchRecording();
        }
        
        // 更新按鈕樣式
        this.streamingModeBtn?.classList.add('bg-gradient-to-r', 'from-blue-500', 'to-blue-600', 'text-white');
        this.streamingModeBtn?.classList.remove('text-gray-600', 'dark:text-gray-400');
        this.batchModeBtn?.classList.remove('bg-gradient-to-r', 'from-blue-500', 'to-blue-600', 'text-white');
        this.batchModeBtn?.classList.add('text-gray-600', 'dark:text-gray-400');
        
        // 顯示控制區塊
        const controlSection = document.getElementById('controlSection');
        if (controlSection) controlSection.style.display = 'flex';
        
        // 左側：顯示視覺化，隱藏批次上傳
        const streamingVisualization = document.getElementById('streamingVisualization');
        const batchUploadPanel = document.getElementById('batchUploadPanel');
        const wakewordChart = document.querySelector('#streamingVisualization .chart-container:last-child');
        
        if (streamingVisualization) streamingVisualization.style.display = 'flex'; // 使用 flex 以正確顯示
        if (batchUploadPanel) batchUploadPanel.style.display = 'none';
        
        // 顯示喚醒詞分數圖（即時模式需要）
        if (wakewordChart) wakewordChart.style.display = 'flex'; // 使用 flex
        
        // 右側：顯示即時結果，隱藏批次結果
        const streamingResults = document.getElementById('streamingResults');
        const batchResults = document.getElementById('batchResults');
        const resultsColumn = document.getElementById('resultsColumn');
        const visualizationColumn = document.querySelector('.visualization-column');
        
        // 恢復左側欄的間距（不設定 flex，使用 CSS 預設值）
        if (visualizationColumn) {
            visualizationColumn.style.gap = '12px'; // 恢復原始間距
            // 移除 flex 設定，使用 CSS 中的預設值
            visualizationColumn.style.flex = ''; // 清除內聯樣式
        }
        
        // 確保右側欄顯示
        if (resultsColumn) {
            resultsColumn.style.display = 'flex';
            // 移除 flex 設定，使用 CSS 中的預設值
            resultsColumn.style.flex = ''; // 清除內聯樣式
        }
        
        if (streamingResults) {
            streamingResults.style.display = 'flex'; // 使用 flex
            // 移除 flex 設定，使用 CSS 中的預設值
        }
        if (batchResults) batchResults.style.display = 'none';
        
        // 更新波形圖標題
        const waveformTitle = document.querySelector('#streamingVisualization .chart-container:first-child h3 span[data-i18n]');
        if (waveformTitle) {
            waveformTitle.setAttribute('data-i18n', 'ui.microphoneWaveform');
            waveformTitle.textContent = window.i18n?.t('ui.microphoneWaveform') || '麥克風音波';
        }
    }
    
    // 切換到批次模式
    switchToBatchMode() {
        // 如果即時模式正在運行，先停止它
        if (this.stopBtn && !this.stopBtn.disabled) {
            console.log('停止即時語音服務以切換到批次模式');
            this.stop(); // 停止所有音訊處理和語音識別
        }
        
        // 更新按鈕樣式
        this.batchModeBtn?.classList.add('bg-gradient-to-r', 'from-blue-500', 'to-blue-600', 'text-white');
        this.batchModeBtn?.classList.remove('text-gray-600', 'dark:text-gray-400');
        this.streamingModeBtn?.classList.remove('bg-gradient-to-r', 'from-blue-500', 'to-blue-600', 'text-white');
        this.streamingModeBtn?.classList.add('text-gray-600', 'dark:text-gray-400');
        
        // 隱藏控制區塊
        const controlSection = document.getElementById('controlSection');
        if (controlSection) controlSection.style.display = 'none';
        
        // 左側：隱藏即時視覺化，顯示批次上傳
        const streamingVisualization = document.getElementById('streamingVisualization');
        const batchUploadPanel = document.getElementById('batchUploadPanel');
        
        // 隱藏即時模式的視覺化（包含麥克風音波和喚醒詞分數）
        if (streamingVisualization) {
            streamingVisualization.style.display = 'none';
        }
        // 顯示批次模式的上傳面板
        if (batchUploadPanel) {
            batchUploadPanel.style.display = 'flex'; // 使用 flex 以填滿高度
        }
        
        // 調整主要內容區佈局為批次模式（保持兩欄佈局）
        const mainContent = document.querySelector('.main-content');
        const visualizationColumn = document.querySelector('.visualization-column');
        const resultsColumn = document.getElementById('resultsColumn');
        const batchResults = document.getElementById('batchResults');
        
        // 保持左右兩欄佈局（不設定 flex，使用 CSS 預設值）
        if (visualizationColumn) {
            visualizationColumn.style.gap = '12px'; // 正常間距
            // 移除 flex 設定，使用 CSS 中的預設值
            visualizationColumn.style.flex = ''; // 清除內聯樣式
        }
        
        // 顯示右側欄
        if (resultsColumn) {
            resultsColumn.style.display = 'flex';
            // 移除 flex 設定，使用 CSS 中的預設值
            resultsColumn.style.flex = ''; // 清除內聯樣式
        }
        
        // 初始化批次音波圖畫布（顯示基準線）
        setTimeout(() => {
            const batchCanvas = document.getElementById('batchWaveformCanvas');
            if (batchCanvas && window.visualizer) {
                // 確保 canvas 已經初始化
                window.visualizer.resizeCanvases();
                
                // 繪製初始基準線
                const ctx = batchCanvas.getContext('2d');
                const width = batchCanvas.width;
                const height = batchCanvas.height;
                const isDark = window.themeManager && window.themeManager.isDarkMode();
                
                ctx.fillStyle = isDark ? '#1a1a1a' : '#f8f8f8';
                ctx.fillRect(0, 0, width, height);
                
                ctx.strokeStyle = isDark ? '#3a3a3a' : '#e0e0e0';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, height / 2);
                ctx.lineTo(width, height / 2);
                ctx.stroke();
            }
        }, 100); // 延遲以確保 DOM 已更新
        
        // 右側：隱藏即時結果，顯示批次結果
        const streamingResults = document.getElementById('streamingResults');
        if (streamingResults) streamingResults.style.display = 'none';
        if (batchResults) {
            batchResults.style.display = 'flex'; // 使用 flex 以填滿高度
            // 移除 flex 設定，使用 CSS 中的預設值
        }
    }
    
    // 設置批次模式事件監聽器
    setupBatchModeListeners() {
        // 檔案上傳區域點擊
        this.dropZone?.addEventListener('click', () => {
            this.audioFileInput?.click();
        });
        
        // 檔案選擇
        this.audioFileInput?.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });
        
        // 拖放功能
        this.dropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('border-blue-500', 'dark:border-blue-400');
        });
        
        this.dropZone?.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('border-blue-500', 'dark:border-blue-400');
        });
        
        this.dropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('border-blue-500', 'dark:border-blue-400');
            this.handleFileUpload(e.dataTransfer.files);
        });
        
        // 錄音按鈕
        this.recordBtn?.addEventListener('click', () => this.startBatchRecording());
        this.stopRecordBtn?.addEventListener('click', () => this.stopBatchRecording());
        
        // 引擎選擇 (改為 radio buttons)
        const engineRadios = document.querySelectorAll('input[name="engineSelect"]');
        engineRadios.forEach(radio => {
            radio.addEventListener('change', async (e) => {
                await this.handleEngineChange(e.target.value);
            });
        });
        
        // Whisper 輸出模式選擇
        const outputModeRadios = document.querySelectorAll('input[name="whisperOutputMode"]');
        outputModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const mode = e.target.value;
                console.log('切換 Whisper 輸出模式:', mode);
                
                // 更新配置
                if (window.Config) {
                    window.Config.speech.whisperOutputMode = mode;
                    console.log('已設定輸出模式為:', mode === 'streaming' ? '即時輸出' : '完整輸出');
                    
                    // 如果有 logger，記錄設定變更
                    if (window.logger) {
                        window.logger.log(`Whisper 輸出模式已切換為: ${mode === 'streaming' ? '即時輸出' : '完整輸出'}`);
                    }
                }
            });
        });
        
        // Whisper 模型來源選擇
        const modelSourceRadios = document.querySelectorAll('input[name="whisperModelSource"]');
        modelSourceRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const source = e.target.value;
                console.log('切換 Whisper 模型來源:', source);
                
                // 更新配置
                if (window.Config) {
                    window.Config.speech.whisperModelSource = source;
                    console.log('已設定模型來源為:', source === 'local' ? '本地模型' : '遠端模型');
                    
                    // 更新提示文字
                    const modelSourceHint = document.getElementById('modelSourceHint');
                    if (modelSourceHint) {
                        if (source === 'local') {
                            modelSourceHint.setAttribute('data-i18n', 'ui.localModelHint');
                            modelSourceHint.textContent = window.i18n?.t('ui.localModelHint') || '本地模型速度更快，無需網路連線';
                        } else {
                            modelSourceHint.setAttribute('data-i18n', 'ui.remoteModelHint');
                            modelSourceHint.textContent = window.i18n?.t('ui.remoteModelHint') || '遠端模型從 Hugging Face 載入，需要網路連線';
                        }
                    }
                    
                    // 如果有 logger，記錄設定變更
                    if (window.logger) {
                        window.logger.log(`Whisper 模型來源已切換為: ${source === 'local' ? '本地模型' : '遠端模型'}`);
                    }
                }
            });
        });
        
        // 移除點擊切換功能，現在一直顯示模型列表
        
        // 延遲初始化 Whisper 模型列表，等待 Config 載入完成
        // 將在 initialize() 完成後調用
        
        // 初始化時根據預設選擇（Whisper）顯示模型選擇列表
        // 但這將在 Config 載入完成後執行
        setTimeout(() => {
            const checkedEngine = document.querySelector('input[name="engineSelect"]:checked');
            if (checkedEngine) {
                this.handleEngineChange(checkedEngine.value);
            }
        }, 100);
        
        // 監聽網路狀態變化
        window.addEventListener('online', () => {
            console.log('網路已連接');
            if (window.logger) {
                window.logger.log('網路已連接');
            }
        });
        
        window.addEventListener('offline', () => {
            console.log('網路已斷開');
            if (window.logger) {
                window.logger.log('網路已斷開');
            }
            
            // 如果當前選擇的是遠端模型，提示用戶
            if (window.Config?.speech?.whisperModelSource === 'remote') {
                alert('網路已斷開。遠端模型無法使用，請切換到本地模型。');
                // 自動切換到本地模型
                const localRadio = document.querySelector('input[name="whisperModelSource"][value="local"]');
                if (localRadio) {
                    localRadio.checked = true;
                    localRadio.dispatchEvent(new Event('change'));
                }
            }
        });
    }
    
    // 處理檔案上傳
    async handleFileUpload(files) {
        for (const file of files) {
            if (this.validateAudioFile(file)) {
                await this.transcribeAudioFile(file);
            }
        }
    }
    
    // 處理引擎切換
    async handleEngineChange(mode) {
        console.log('切換轉譯引擎:', mode);
        
        // 控制模型選擇列表、輸出模式選項和模型來源選項的顯示
        const whisperModelSelection = document.getElementById('whisperModelSelection');
        const whisperOutputModeOption = document.getElementById('whisperOutputModeOption');
        const whisperModelSourceOption = document.getElementById('whisperModelSourceOption');
        
        if (whisperModelSelection) {
            whisperModelSelection.style.display = mode === 'webspeech' ? 'none' : 'block';
        }
        
        // 只在選擇 Whisper 時顯示輸出模式和模型來源選項
        if (whisperOutputModeOption) {
            whisperOutputModeOption.style.display = mode === 'whisper' ? 'block' : 'none';
        }
        
        if (whisperModelSourceOption) {
            whisperModelSourceOption.style.display = mode === 'whisper' ? 'block' : 'none';
        }
        
        // 設定引擎模式
        if (this.speechRecognitionManager) {
            try {
                await this.speechRecognitionManager.setMode(mode);
                console.log(`已切換到 ${mode} 引擎`);
            } catch (error) {
                console.error('切換引擎失敗:', error);
                alert('切換引擎失敗: ' + error.message);
            }
        }
    }
    
    // 初始化 Whisper 模型列表
    initializeWhisperModelList() {
        const modelListContainer = document.getElementById('whisperModelList');
        if (!modelListContainer || !window.Config) return;
        
        // 清空現有內容
        modelListContainer.innerHTML = '';
        
        // 獲取可用的 Whisper 模型
        const whisperModels = window.Config.models.whisper.available || {};
        
        // 如果沒有模型，顯示提示
        if (Object.keys(whisperModels).length === 0) {
            modelListContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">沒有可用的模型</p>';
            return;
        }
        
        // 分組模型（標準版和量化版）
        const standardModels = [];
        const quantizedModels = [];
        
        Object.entries(whisperModels).forEach(([id, model]) => {
            if (model.quantized) {
                quantizedModels.push({ id, ...model });
            } else {
                standardModels.push({ id, ...model });
            }
        });
        
        // 創建模型選項
        // 預設選擇 Base Quantized 模型
        const defaultModelId = 'whisper-base-quantized';
        let defaultModelSelected = false;
        
        // 標準模型組
        if (standardModels.length > 0) {
            const standardGroup = document.createElement('div');
            standardGroup.className = 'mb-3';
            standardGroup.innerHTML = '<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">標準模型</p>';
            
            standardModels.forEach(model => {
                const isDefault = model.id === defaultModelId;
                if (isDefault) defaultModelSelected = true;
                
                const label = document.createElement('label');
                label.className = 'flex items-center p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer';
                label.innerHTML = `
                    <input type="radio" name="whisperModel" value="${model.id}" 
                           class="mr-2 text-blue-600" ${isDefault ? 'checked' : ''}>
                    <div class="flex-1">
                        <span class="text-sm text-gray-700 dark:text-gray-300">${model.name}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">(${model.size}MB)</span>
                    </div>
                `;
                
                // 添加事件監聽器
                const radio = label.querySelector('input');
                radio.addEventListener('change', () => {
                    this.handleWhisperModelChange(model.id, model.name);
                });
                
                standardGroup.appendChild(label);
            });
            
            modelListContainer.appendChild(standardGroup);
        }
        
        // 量化模型組
        if (quantizedModels.length > 0) {
            const quantizedGroup = document.createElement('div');
            quantizedGroup.innerHTML = '<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">量化模型 (更快但準確度略低)</p>';
            
            quantizedModels.forEach(model => {
                const isDefault = model.id === defaultModelId;
                if (isDefault) defaultModelSelected = true;
                
                const label = document.createElement('label');
                label.className = 'flex items-center p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer';
                label.innerHTML = `
                    <input type="radio" name="whisperModel" value="${model.id}" 
                           class="mr-2 text-blue-600" ${isDefault ? 'checked' : ''}>
                    <div class="flex-1">
                        <span class="text-sm text-gray-700 dark:text-gray-300">${model.name}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">(${model.size}MB)</span>
                    </div>
                `;
                
                // 添加事件監聽器
                const radio = label.querySelector('input');
                radio.addEventListener('change', () => {
                    this.handleWhisperModelChange(model.id, model.name);
                });
                
                quantizedGroup.appendChild(label);
            });
            
            modelListContainer.appendChild(quantizedGroup);
        }
        
        // 設定初始顯示的模型名稱
        // 優先使用 Base Quantized，如果沒有則使用第一個模型
        let initialModel = null;
        if (defaultModelSelected) {
            // 找到 Base Quantized 模型
            initialModel = [...quantizedModels, ...standardModels].find(m => m.id === defaultModelId);
        } else if (quantizedModels.length > 0) {
            // 如果沒有 Base Quantized，使用第一個量化模型
            initialModel = quantizedModels[0];
            // 設定為選中
            const firstRadio = modelListContainer.querySelector('input[type="radio"]');
            if (firstRadio) firstRadio.checked = true;
        } else if (standardModels.length > 0) {
            // 否則使用第一個標準模型
            initialModel = standardModels[0];
            // 設定為選中
            const firstRadio = modelListContainer.querySelector('input[type="radio"]');
            if (firstRadio) firstRadio.checked = true;
        }
        
        if (initialModel) {
            const whisperEngineName = document.getElementById('whisperEngineName');
            if (whisperEngineName) {
                const shortName = initialModel.name.replace('Whisper ', '').replace(' (Quantized)', '-Q');
                whisperEngineName.textContent = `Whisper (${shortName})`;
            }
        }
    }
    
    // 處理 Whisper 模型切換
    async handleWhisperModelChange(modelId, modelName) {
        console.log('切換 Whisper 模型:', modelId);
        
        // 更新 Whisper 標籤顯示
        const whisperEngineName = document.getElementById('whisperEngineName');
        if (whisperEngineName && modelName) {
            // 從模型名稱中提取簡短名稱
            const shortName = modelName.replace('Whisper ', '').replace(' (Quantized)', '-Q');
            whisperEngineName.textContent = `Whisper (${shortName})`;
        }
        
        if (!this.speechRecognitionManager) return;
        
        try {
            // 更新配置中的預設模型
            if (window.Config) {
                window.Config.models.whisper.default = modelId;
            }
            
            // 如果當前是 Whisper 引擎，重新載入模型
            const currentEngine = this.speechRecognitionManager.currentMode;
            if (currentEngine === 'whisper') {
                // 通知引擎切換模型
                const whisperEngine = this.speechRecognitionManager.engines.get('whisper');
                if (whisperEngine) {
                    await whisperEngine.loadModel(modelId);
                    console.log(`已載入 Whisper 模型: ${modelId}`);
                }
            }
        } catch (error) {
            console.error('切換 Whisper 模型失敗:', error);
            alert('切換模型失敗: ' + error.message);
        }
    }
    
    // 驗證音訊檔案
    validateAudioFile(file) {
        const maxSize = 25 * 1024 * 1024; // 25MB
        const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/webm', 'audio/x-m4a'];
        
        if (file.size > maxSize) {
            alert(`檔案 ${file.name} 太大（最大 25MB）`);
            return false;
        }
        
        if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|webm)$/i)) {
            alert(`不支援的檔案類型: ${file.name}`);
            return false;
        }
        
        return true;
    }
    
    // 轉譯音訊檔案
    async transcribeAudioFile(file, audioBlob = null) {
        const fileId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // 如果是上傳的檔案，建立 blob
        if (!audioBlob && file) {
            audioBlob = file;
        }
        
        // 添加到結果列表
        this.addBatchResultItem(file.name, fileId, '準備轉譯...', audioBlob);
        
        try {
            // 開始計時
            const startTime = performance.now();
            
            // 設定即時更新的回調（用於 Whisper 串流顯示）
            const handleInterimUpdate = (data) => {
                if (data && data.transcript) {
                    // 即時更新轉譯內容
                    const item = document.getElementById(`batch_${fileId}`);
                    if (item) {
                        const statusSpan = item.querySelector('.status-text');
                        const resultDiv = item.querySelector('.transcription-result');
                        const textP = item.querySelector('p');
                        
                        if (statusSpan) {
                            statusSpan.textContent = '轉譯中...';
                            statusSpan.className = 'text-sm text-blue-500 status-text';
                        }
                        
                        if (textP && resultDiv) {
                            textP.textContent = data.transcript;
                            resultDiv.classList.remove('hidden');
                            
                            // 自動捲動到最新內容
                            if (this.batchResults) {
                                this.batchResults.scrollTop = this.batchResults.scrollHeight;
                            }
                        }
                    }
                }
            };
            
            // 監聽即時轉譯更新（針對 Whisper）
            if (this.speechRecognitionManager) {
                // 暫時監聽 interimTranscription 事件
                const whisperEngine = this.speechRecognitionManager.engines.get('whisper');
                if (whisperEngine) {
                    whisperEngine.on('interimTranscription', handleInterimUpdate);
                }
            }
            
            // 使用 SpeechRecognitionManager 轉譯
            const transcript = await this.speechRecognitionManager.transcribeFile(file);
            
            // 移除事件監聽器
            if (this.speechRecognitionManager) {
                const whisperEngine = this.speechRecognitionManager.engines.get('whisper');
                if (whisperEngine) {
                    whisperEngine.off('interimTranscription', handleInterimUpdate);
                }
            }
            
            // 計算耗時
            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            
            // 更新最終結果
            this.updateBatchResultItem(fileId, transcript, duration, null, audioBlob);
            
        } catch (error) {
            console.error('轉譯失敗:', error);
            this.updateBatchResultItem(fileId, null, null, error.message);
        }
    }
    
    // 添加批次結果項目
    addBatchResultItem(fileName, fileId, status, audioBlob = null) {
        // 移除佔位符
        const placeholder = this.batchResults?.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
            // 啟用下載文字按鈕
            if (this.batchDownloadTextBtn) {
                this.batchDownloadTextBtn.disabled = false;
            }
        }
        
        const item = document.createElement('div');
        item.id = `batch_${fileId}`;
        item.className = 'bg-white dark:bg-gray-800 rounded-lg p-4 mb-3 border border-gray-200 dark:border-gray-700';
        item.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-medium text-gray-900 dark:text-gray-100">${fileName}</h4>
                <span class="text-sm text-gray-500 dark:text-gray-400 status-text">${status}</span>
            </div>
            <div class="transcription-result hidden">
                <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap"></p>
                <div class="mt-2 flex gap-2">
                    <button class="play-btn text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded">
                        <i class="fas fa-play mr-1"></i><span data-i18n="ui.playAudio">播放</span>
                    </button>
                    <button class="pause-btn text-sm bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded hidden">
                        <i class="fas fa-pause mr-1"></i><span data-i18n="ui.pauseAudio">暫停</span>
                    </button>
                    <button class="copy-btn text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">
                        <i class="fas fa-copy mr-1"></i><span data-i18n="ui.copyText">複製文字</span>
                    </button>
                </div>
                <audio class="audio-player hidden" controls></audio>
            </div>
        `;
        
        this.batchResults?.appendChild(item);
        
        // 如果有音訊，設定播放功能
        if (audioBlob) {
            this.setupAudioPlayback(fileId, audioBlob);
        }
    }
    
    // 設定音訊播放功能
    setupAudioPlayback(fileId, audioBlob) {
        const item = document.getElementById(`batch_${fileId}`);
        if (!item) return;
        
        const audioPlayer = item.querySelector('.audio-player');
        const playBtn = item.querySelector('.play-btn');
        const pauseBtn = item.querySelector('.pause-btn');
        
        if (audioPlayer && audioBlob) {
            const url = URL.createObjectURL(audioBlob);
            audioPlayer.src = url;
            
            // 儲存 audio blob 以便之後使用
            item.audioBlob = audioBlob;
            
            // 播放按鈕事件
            playBtn?.addEventListener('click', () => {
                audioPlayer.play();
                playBtn.classList.add('hidden');
                pauseBtn.classList.remove('hidden');
            });
            
            // 暫停按鈕事件
            pauseBtn?.addEventListener('click', () => {
                audioPlayer.pause();
                pauseBtn.classList.add('hidden');
                playBtn.classList.remove('hidden');
            });
            
            // 音訊結束時重置按鈕
            audioPlayer.addEventListener('ended', () => {
                pauseBtn.classList.add('hidden');
                playBtn.classList.remove('hidden');
            });
        }
    }
    
    // 更新批次結果項目
    updateBatchResultItem(fileId, transcript, duration, error, audioBlob = null) {
        const item = document.getElementById(`batch_${fileId}`);
        if (!item) return;
        
        const statusSpan = item.querySelector('.status-text');
        const resultDiv = item.querySelector('.transcription-result');
        const textP = item.querySelector('p');
        
        if (error) {
            statusSpan.textContent = `失敗: ${error}`;
            statusSpan.className = 'text-sm text-red-500 status-text';
        } else if (transcript) {
            statusSpan.textContent = `完成 (${duration}秒)`;
            statusSpan.className = 'text-sm text-green-500 status-text';
            textP.textContent = transcript;
            resultDiv.classList.remove('hidden');
            
            // 設置複製按鈕
            const copyBtn = item.querySelector('.copy-btn');
            copyBtn?.addEventListener('click', () => {
                navigator.clipboard.writeText(transcript);
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = `<i class="fas fa-check mr-1"></i>${window.i18n?.t('ui.copied') || '已複製!'}`;
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                }, 2000);
            });
            
            // 如果有音訊，設定播放功能
            if (audioBlob) {
                this.setupAudioPlayback(fileId, audioBlob);
            }
        }
    }
    
    // 開始批次錄音
    async startBatchRecording() {
        if (!this.mediaStream) {
            try {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (error) {
                console.error('無法取得麥克風權限:', error);
                alert('無法取得麥克風權限');
                return;
            }
        }
        
        this.recordedChunks = [];
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
        
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };
        
        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
            const fileName = `錄音_${new Date().toLocaleTimeString('zh-TW')}.webm`;
            
            // 儲存最後的錄音以供下載
            this.lastRecordingBlob = blob;
            
            // 轉譯錄音
            this.transcribeAudioFile(new File([blob], fileName, { type: 'audio/webm' }));
        };
        
        this.mediaRecorder.start();
        this.isRecording = true;
        
        // 啟動音波圖顯示（不需要顯示容器，因為已經一直顯示）
        this.setupBatchWaveform();
        
        // 更新按鈕狀態
        if (this.recordBtn) {
            this.recordBtn.disabled = true;
            this.recordBtn.querySelector('span').textContent = '錄音中...';
        }
        if (this.stopRecordBtn) {
            this.stopRecordBtn.disabled = false;
        }
    }
    
    // 停止批次錄音
    stopBatchRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // 停止音波圖顯示
            this.stopBatchWaveform();
            
            // 清空批次音波圖畫布（不隱藏）
            const batchCanvas = document.getElementById('batchWaveformCanvas');
            if (batchCanvas) {
                const ctx = batchCanvas.getContext('2d');
                ctx.clearRect(0, 0, batchCanvas.width, batchCanvas.height);
                
                // 繪製一條基準線
                const width = batchCanvas.width;
                const height = batchCanvas.height;
                const isDark = window.themeManager && window.themeManager.isDarkMode();
                
                ctx.fillStyle = isDark ? '#1a1a1a' : '#f8f8f8';
                ctx.fillRect(0, 0, width, height);
                
                ctx.strokeStyle = isDark ? '#3a3a3a' : '#e0e0e0';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, height / 2);
                ctx.lineTo(width, height / 2);
                ctx.stroke();
            }
            
            // 更新按鈕狀態
            if (this.recordBtn) {
                this.recordBtn.disabled = false;
                this.recordBtn.querySelector('span').textContent = '開始錄音';
            }
            if (this.stopRecordBtn) {
                this.stopRecordBtn.disabled = true;
            }
        }
    }
    
    // 設定批次模式的波形顯示
    setupBatchWaveform() {
        if (!this.mediaStream) return;
        
        // 確保 visualizer 正在運行
        if (!window.visualizer.isRunning) {
            window.visualizer.start();
        }
        
        // 使用現有的 visualization 模組
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(this.mediaStream);
        
        source.connect(analyser);
        analyser.fftSize = 256;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // 儲存 audio context 以便之後清理
        this.batchAudioContext = audioContext;
        this.batchAnalyser = analyser;
        this.batchDataArray = dataArray;
        
        // 開始更新波形
        const updateWaveform = () => {
            if (!this.isRecording) return;
            
            this.batchAnalyser.getByteTimeDomainData(this.batchDataArray);
            
            // 轉換為 float32 並正規化
            const floatData = new Float32Array(this.batchDataArray.length);
            for (let i = 0; i < this.batchDataArray.length; i++) {
                floatData[i] = (this.batchDataArray[i] - 128) / 128.0;
            }
            
            // 更新 visualizer
            window.visualizer?.updateWaveform(floatData);
            
            requestAnimationFrame(updateWaveform);
        };
        
        updateWaveform();
    }
    
    // 停止批次模式的波形顯示
    stopBatchWaveform() {
        if (this.batchAudioContext) {
            this.batchAudioContext.close();
            this.batchAudioContext = null;
            this.batchAnalyser = null;
            this.batchDataArray = null;
        }
    }
    
    // 下載批次文字結果
    downloadBatchText() {
        const items = this.batchResults?.querySelectorAll('.transcription-result:not(.hidden) p');
        if (!items || items.length === 0) {
            alert('沒有可下載的轉譯結果');
            return;
        }
        
        let allText = '';
        items.forEach((item, index) => {
            const fileName = item.closest('[id^="batch_"]')?.querySelector('h4')?.textContent || `項目 ${index + 1}`;
            allText += `=== ${fileName} ===\n${item.textContent}\n\n`;
        });
        
        const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `批次轉譯結果_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // 下載批次錄音
    downloadBatchAudio() {
        if (!this.lastRecordingBlob) {
            alert('沒有可下載的錄音');
            return;
        }
        
        const url = URL.createObjectURL(this.lastRecordingBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `錄音_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// 當頁面載入完成時初始化應用
document.addEventListener('DOMContentLoaded', async () => {
    window.voiceAssistantApp = new VoiceAssistantApp();
    await window.voiceAssistantApp.initialize();
});