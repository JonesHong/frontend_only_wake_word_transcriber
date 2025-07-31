// VAD (語音活動偵測) 模組
class VoiceActivityDetector {
    constructor() {
        this.vadModel = null;
        this.vadState = { h: null, c: null };
        this.vadThreshold = 0.5;
        this.isInitialized = false;
        this.vadCallback = null;
        
        // VAD 參數
        this.vadHangoverFrames = 12; // 延遲幀數，避免過早切斷
        this.vadHangoverCounter = 0;
        this.isSpeechActive = false;
        
        // ONNX Runtime 設定
        this.ortConfig = {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        };
    }
    
    async initialize() {
        try {
            console.log('初始化 VAD...');
            
            // 載入 Silero VAD 模型（已複製到 models 資料夾）
            const modelPath = 'models/silero_vad.onnx';
            const response = await fetch(modelPath);
            
            if (!response.ok) {
                throw new Error('無法載入 VAD 模型');
            }
            
            const modelData = await response.arrayBuffer();
            this.vadModel = await ort.InferenceSession.create(modelData, this.ortConfig);
            
            // 初始化 VAD 狀態
            this.resetState();
            
            this.isInitialized = true;
            console.log('VAD 初始化完成');
            
        } catch (error) {
            console.error('VAD 初始化失敗:', error);
            throw error;
        }
    }
    
    resetState() {
        // Silero VAD 使用 LSTM，需要初始化隱藏狀態
        const stateShape = [2, 1, 64]; // batch_size=1, hidden_size=64
        this.vadState = {
            h: new ort.Tensor('float32', new Float32Array(2 * 1 * 64), stateShape),
            c: new ort.Tensor('float32', new Float32Array(2 * 1 * 64), stateShape)
        };
        this.vadHangoverCounter = 0;
        this.isSpeechActive = false;
    }
    
    async processAudioChunk(audioData) {
        if (!this.isInitialized || !this.vadModel) {
            return false;
        }
        
        try {
            // 準備輸入張量
            const inputTensor = new ort.Tensor('float32', audioData, [1, audioData.length]);
            const srTensor = new ort.Tensor('int64', [BigInt(16000)], []); // 採樣率 16kHz
            
            // 執行 VAD 推論
            const results = await this.vadModel.run({
                input: inputTensor,
                sr: srTensor,
                h: this.vadState.h,
                c: this.vadState.c
            });
            
            // 更新狀態
            this.vadState.h = results.hn;
            this.vadState.c = results.cn;
            
            // 取得 VAD 分數
            const vadScore = results.output.data[0];
            const vadDetected = vadScore > this.vadThreshold;
            
            // 處理語音活動狀態
            if (vadDetected) {
                if (!this.isSpeechActive) {
                    console.log('偵測到語音活動開始');
                }
                this.isSpeechActive = true;
                this.vadHangoverCounter = this.vadHangoverFrames;
            } else if (this.isSpeechActive) {
                this.vadHangoverCounter--;
                if (this.vadHangoverCounter <= 0) {
                    console.log('語音活動結束');
                    this.isSpeechActive = false;
                }
            }
            
            // 觸發回調
            if (this.vadCallback) {
                this.vadCallback(vadDetected, vadScore, this.isSpeechActive);
            }
            
            return vadDetected;
            
        } catch (error) {
            console.error('VAD 處理失敗:', error);
            return false;
        }
    }
    
    setCallback(callback) {
        this.vadCallback = callback;
    }
    
    setThreshold(threshold) {
        this.vadThreshold = threshold;
    }
    
    getState() {
        return {
            isActive: this.isSpeechActive,
            hangoverCounter: this.vadHangoverCounter
        };
    }
    
    reset() {
        this.resetState();
    }
}

// 建立全域 VAD 實例
window.voiceActivityDetector = new VoiceActivityDetector();