/**
 * Audio Decoder Utility
 * 使用 Web Audio API 解碼各種音訊格式（MP3, WAV, OGG 等）
 */

/**
 * 解碼音訊檔案為 Float32Array
 * @param {ArrayBuffer|Blob|File} input - 音訊資料
 * @param {number} targetSampleRate - 目標採樣率（預設 16000）
 * @returns {Promise<Float32Array>} - 解碼後的音訊資料
 */
export async function decodeAudioFile(input, targetSampleRate = 16000) {
    let arrayBuffer;
    
    // 轉換輸入為 ArrayBuffer
    if (input instanceof ArrayBuffer) {
        arrayBuffer = input;
    } else if (input instanceof Blob || input instanceof File) {
        arrayBuffer = await input.arrayBuffer();
    } else {
        throw new Error('Unsupported input type');
    }
    
    // 創建 AudioContext
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: targetSampleRate
    });
    
    try {
        // 使用 Web Audio API 解碼音訊
        // 這會自動處理 MP3, WAV, OGG, M4A 等格式
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        console.log(`[AudioDecoder] Decoded audio: ${audioBuffer.duration}s, ${audioBuffer.sampleRate}Hz, ${audioBuffer.numberOfChannels}ch`);
        
        // 獲取音訊資料
        let channelData;
        
        if (audioBuffer.numberOfChannels === 1) {
            // 單聲道，直接使用
            channelData = audioBuffer.getChannelData(0);
        } else {
            // 多聲道，混音為單聲道
            channelData = mixToMono(audioBuffer);
        }
        
        // 如果採樣率不匹配，進行重採樣
        if (audioBuffer.sampleRate !== targetSampleRate) {
            console.log(`[AudioDecoder] Resampling from ${audioBuffer.sampleRate}Hz to ${targetSampleRate}Hz`);
            channelData = await resampleAudio(channelData, audioBuffer.sampleRate, targetSampleRate);
        }
        
        return channelData;
        
    } finally {
        // 關閉 AudioContext
        await audioContext.close();
    }
}

/**
 * 將多聲道音訊混音為單聲道
 * @param {AudioBuffer} audioBuffer - 多聲道音訊緩衝
 * @returns {Float32Array} - 單聲道音訊資料
 */
function mixToMono(audioBuffer) {
    const length = audioBuffer.length;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const mixed = new Float32Array(length);
    
    // 混音所有聲道
    for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            mixed[i] += channelData[i];
        }
    }
    
    // 正規化（除以聲道數）
    const scale = 1 / numberOfChannels;
    for (let i = 0; i < length; i++) {
        mixed[i] *= scale;
    }
    
    console.log(`[AudioDecoder] Mixed ${numberOfChannels} channels to mono`);
    
    return mixed;
}

/**
 * 重採樣音訊資料
 * @param {Float32Array} audioData - 原始音訊資料
 * @param {number} fromRate - 原始採樣率
 * @param {number} toRate - 目標採樣率
 * @returns {Promise<Float32Array>} - 重採樣後的音訊資料
 */
async function resampleAudio(audioData, fromRate, toRate) {
    // 如果瀏覽器支援 OfflineAudioContext，使用高品質重採樣
    if (window.OfflineAudioContext) {
        return await resampleWithOfflineContext(audioData, fromRate, toRate);
    } else {
        // 降級到簡單的線性插值
        return resampleWithLinearInterpolation(audioData, fromRate, toRate);
    }
}

/**
 * 使用 OfflineAudioContext 進行高品質重採樣
 */
async function resampleWithOfflineContext(audioData, fromRate, toRate) {
    const length = audioData.length;
    const duration = length / fromRate;
    const targetLength = Math.floor(duration * toRate);
    
    // 創建離線音訊上下文
    const offlineContext = new OfflineAudioContext(1, targetLength, toRate);
    
    // 創建源緩衝
    const sourceBuffer = offlineContext.createBuffer(1, length, fromRate);
    sourceBuffer.copyToChannel(audioData, 0);
    
    // 創建源節點
    const source = offlineContext.createBufferSource();
    source.buffer = sourceBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    
    // 渲染並獲取結果
    const resultBuffer = await offlineContext.startRendering();
    return resultBuffer.getChannelData(0);
}

/**
 * 使用線性插值進行簡單重採樣
 */
function resampleWithLinearInterpolation(audioData, fromRate, toRate) {
    const ratio = fromRate / toRate;
    const newLength = Math.floor(audioData.length / ratio);
    const resampled = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexInt = Math.floor(srcIndex);
        const srcIndexFrac = srcIndex - srcIndexInt;
        
        if (srcIndexInt + 1 < audioData.length) {
            // 線性插值
            resampled[i] = audioData[srcIndexInt] * (1 - srcIndexFrac) + 
                          audioData[srcIndexInt + 1] * srcIndexFrac;
        } else {
            resampled[i] = audioData[srcIndexInt];
        }
    }
    
    return resampled;
}

/**
 * 檢測音訊格式
 * @param {ArrayBuffer} arrayBuffer - 音訊資料
 * @returns {string} - 檢測到的格式
 */
export function detectAudioFormat(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    
    // 檢查前幾個位元組來識別格式
    if (arrayBuffer.byteLength < 4) {
        return 'unknown';
    }
    
    // WAV
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (riff === 'RIFF') {
        return 'wav';
    }
    
    // MP3
    if (view.getUint8(0) === 0xFF && (view.getUint8(1) & 0xE0) === 0xE0) {
        return 'mp3';
    }
    
    // ID3 tag (MP3)
    if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
        return 'mp3';
    }
    
    // OGG
    const ogg = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (ogg === 'OggS') {
        return 'ogg';
    }
    
    // M4A/MP4
    const ftyp = arrayBuffer.byteLength > 8 ? 
        String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)) : '';
    if (ftyp === 'ftyp') {
        return 'm4a';
    }
    
    // WebM
    if (view.getUint8(0) === 0x1A && view.getUint8(1) === 0x45 && 
        view.getUint8(2) === 0xDF && view.getUint8(3) === 0xA3) {
        return 'webm';
    }
    
    return 'unknown';
}