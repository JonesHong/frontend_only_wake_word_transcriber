/**
 * AudioProcessor Worklet - 智能音訊格式轉換器
 * 負責將任意格式的音訊轉換為 16kHz 單聲道 Int16 格式
 */
class AudioFormatProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        
        // 目標參數
        this.targetSampleRate = 16000;
        this.targetChannels = 1;
        
        // 來源參數（從主執行緒傳入）
        this.sourceSampleRate = options.processorOptions?.sourceSampleRate || 48000;
        this.sourceChannels = options.processorOptions?.sourceChannels || 2;
        
        // 重採樣器設定
        this.resampleRatio = this.targetSampleRate / this.sourceSampleRate;
        this.needsResampling = this.sourceSampleRate !== this.targetSampleRate;
        
        // 緩衝區管理
        this.bufferSize = 1280; // 80ms at 16kHz
        this.buffer = new Float32Array(this.bufferSize * 2); // 額外空間用於重採樣
        this.bufferIndex = 0;
        
        // 重採樣緩衝
        this.resampleBuffer = [];
        this.resamplePhase = 0;
        
        // 狀態
        this.isProcessing = true;
        
        // 監聽來自主執行緒的訊息
        this.port.onmessage = this.handleMessage.bind(this);
        
        console.log('AudioFormatProcessor 初始化:', {
            sourceSampleRate: this.sourceSampleRate,
            targetSampleRate: this.targetSampleRate,
            resampleRatio: this.resampleRatio,
            needsResampling: this.needsResampling
        });
    }
    
    /**
     * 處理來自主執行緒的訊息
     */
    handleMessage(event) {
        switch (event.data.command) {
            case 'stop':
                this.isProcessing = false;
                break;
            case 'updateParams':
                this.updateParameters(event.data.params);
                break;
            case 'getStats':
                this.sendStatistics();
                break;
        }
    }
    
    /**
     * 更新處理參數
     */
    updateParameters(params) {
        if (params.sourceSampleRate) {
            this.sourceSampleRate = params.sourceSampleRate;
            this.resampleRatio = this.targetSampleRate / this.sourceSampleRate;
            this.needsResampling = this.sourceSampleRate !== this.targetSampleRate;
        }
        if (params.sourceChannels) {
            this.sourceChannels = params.sourceChannels;
        }
    }
    
    /**
     * 主處理函數
     */
    process(inputs, outputs, parameters) {
        if (!this.isProcessing || !inputs[0]?.length) {
            return true;
        }
        
        const input = inputs[0];
        
        // Step 1: 轉換為單聲道
        let monoData = this.convertToMono(input);
        
        // Step 2: 重採樣（如果需要）
        if (this.needsResampling) {
            monoData = this.resample(monoData);
        }
        
        // Step 3: 累積到緩衝區
        this.accumulateBuffer(monoData);
        
        return true;
    }
    
    /**
     * 轉換為單聲道
     * @param {Float32Array[]} input - 多聲道輸入
     * @returns {Float32Array} 單聲道輸出
     */
    convertToMono(input) {
        const length = input[0].length;
        const mono = new Float32Array(length);
        const channelCount = input.length;
        
        if (channelCount === 1) {
            // 已經是單聲道
            return input[0];
        }
        
        // 多聲道平均混合
        for (let i = 0; i < length; i++) {
            let sum = 0;
            for (let channel = 0; channel < channelCount; channel++) {
                sum += input[channel][i];
            }
            mono[i] = sum / channelCount;
        }
        
        return mono;
    }
    
    /**
     * 重採樣音訊資料
     * 使用線性插值法進行重採樣
     * @param {Float32Array} input - 輸入資料
     * @returns {Float32Array} 重採樣後的資料
     */
    resample(input) {
        if (!this.needsResampling) {
            return input;
        }
        
        const inputLength = input.length;
        const outputLength = Math.floor(inputLength * this.resampleRatio);
        const output = new Float32Array(outputLength);
        
        // 簡單的線性插值重採樣
        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i / this.resampleRatio;
            const srcIndexInt = Math.floor(srcIndex);
            const srcIndexFrac = srcIndex - srcIndexInt;
            
            if (srcIndexInt < inputLength - 1) {
                // 線性插值
                output[i] = input[srcIndexInt] * (1 - srcIndexFrac) + 
                           input[srcIndexInt + 1] * srcIndexFrac;
            } else {
                // 邊界處理
                output[i] = input[Math.min(srcIndexInt, inputLength - 1)];
            }
        }
        
        return output;
    }
    
    /**
     * 累積資料到緩衝區
     * @param {Float32Array} data - 要累積的資料
     */
    accumulateBuffer(data) {
        const dataLength = data.length;
        
        for (let i = 0; i < dataLength; i++) {
            this.buffer[this.bufferIndex++] = data[i];
            
            // 當緩衝區滿了，發送資料
            if (this.bufferIndex >= this.bufferSize) {
                this.sendProcessedData();
                this.bufferIndex = 0;
            }
        }
    }
    
    /**
     * 發送處理後的資料到主執行緒
     */
    sendProcessedData() {
        // 轉換 Float32 到 Int16
        const int16Data = this.convertToInt16(
            this.buffer.slice(0, this.bufferSize)
        );
        
        // 發送到主執行緒
        this.port.postMessage({
            type: 'audio-data',
            data: int16Data,
            sampleRate: this.targetSampleRate,
            timestamp: currentTime,
            stats: {
                bufferSize: this.bufferSize,
                actualSamples: this.bufferSize,
                processingLatency: 0 // 可以添加實際延遲測量
            }
        }, [int16Data.buffer]); // 使用 Transferable 物件提高效能
    }
    
    /**
     * 轉換 Float32 到 Int16
     * @param {Float32Array} float32Data - Float32 資料
     * @returns {Int16Array} Int16 資料
     */
    convertToInt16(float32Data) {
        const length = float32Data.length;
        const int16Data = new Int16Array(length);
        
        for (let i = 0; i < length; i++) {
            // 限制範圍到 [-1, 1]
            let value = Math.max(-1, Math.min(1, float32Data[i]));
            // 轉換到 Int16 範圍 [-32768, 32767]
            int16Data[i] = Math.floor(value * 32767);
        }
        
        return int16Data;
    }
    
    /**
     * 發送統計資訊
     */
    sendStatistics() {
        this.port.postMessage({
            type: 'statistics',
            stats: {
                sourceSampleRate: this.sourceSampleRate,
                targetSampleRate: this.targetSampleRate,
                needsResampling: this.needsResampling,
                resampleRatio: this.resampleRatio,
                bufferIndex: this.bufferIndex,
                bufferSize: this.bufferSize,
                isProcessing: this.isProcessing
            }
        });
    }
}

// 註冊處理器
registerProcessor('audio-format-processor', AudioFormatProcessor);