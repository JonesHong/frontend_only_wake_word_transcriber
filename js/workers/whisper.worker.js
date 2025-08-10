/**
 * Whisper Worker
 * 基於參考實現的架構，使用 Transformers.js 在 Web Worker 中運行 Whisper 模型
 */

// 使用 @xenova/transformers v2 以支援回調函數實現即時輸出
// v2 版本支援 callback_function 和 chunk_callback
// 注意：改為動態導入以確保在設定正確路徑後才載入
let pipeline, env;

// Transformers.js 環境配置將在初始化時設定
let transformersInitialized = false;

// 動態計算本地模型路徑，支援 GitHub Pages 子目錄
// self.location.href 可能是 blob: URL，需要從 origin 和 pathname 重建
let modelBasePath = '/models/';
try {
    // 嘗試從 Worker 的 location 獲取基礎路徑
    if (self.location.href.startsWith('blob:')) {
        // Blob URL 的情況，使用主頁面的路徑
        // 需要從主線程傳遞過來，暫時使用預設值
        // 先不設定，等待主線程傳遞正確的路徑
        modelBasePath = null;
    } else {
        // 正常的 Worker URL
        const workerPath = self.location.pathname;
        // 移除 worker 檔名和 js/workers 目錄
        modelBasePath = workerPath.replace(/\/js\/workers\/[^\/]*$/, '') + '/models/';
    }
} catch (e) {
    console.warn('[WhisperWorker] Failed to calculate model base path, using default:', e);
}

// 初始路徑將在收到主線程配置後設定
let initialModelBasePath = modelBasePath;
console.log('[WhisperWorker] Initial model base path:', initialModelBasePath);
// 設置 WASM 路徑 (v2 版本不需要 backends 配置)
// env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';

/**
 * Pipeline 工廠類 - 確保每種模型類型只創建一個實例
 */
class PipelineFactory {
    static task = null;
    static model = null;
    static quantized = null;
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, {
                quantized: this.quantized,
                progress_callback,
                // 對於本地模型，不需要指定 revision
                // revision 參數只用於從 HuggingFace 下載
                // revision: this.model.includes("/whisper-medium") ? "no_attentions" : "main"
            });
        }
        return this.instance;
    }

    static async updateModel(model, quantized) {
        // 如果模型改變，釋放舊模型
        if (this.model !== model || this.quantized !== quantized) {
            if (this.instance !== null) {
                const oldInstance = await this.getInstance();
                oldInstance.dispose();
                this.instance = null;
            }
            this.model = model;
            this.quantized = quantized;
        }
    }
}

/**
 * 自動語音識別 Pipeline 工廠
 */
class AutomaticSpeechRecognitionPipelineFactory extends PipelineFactory {
    static task = "automatic-speech-recognition";
}

/**
 * 修復文字中的編碼問題
 * @param {string} text - 可能包含編碼問題的文字
 * @returns {string} - 修復後的文字
 */
function fixEncodingIssues(text) {
    if (!text || typeof text !== 'string') {
        return text || '';
    }
    
    // 常見的繁體中文錯誤編碼修復對照表
    const replacements = {
        '獸�': '獸',  // 常見的"獸"字編碼問題
        '�': '',      // 移除無法識別的字符
        '锟斤拷': '',  // 常見的 UTF-8 編碼錯誤標記
        '陝ｦ': '麼',
        '陝ｯ': '們',
        '陝ｬ': '個',
        '竄ｰ': '裡',
        '竄ｧ': '麼',
        '莽ｪ': '的',
        '竄ｹ': '這',
        '竄ｮ': '說',
        '竄ｽ': '會',
        '笆ｰ': '對',
        '笆ｱ': '時'
    };
    
    // 執行替換
    let fixedText = text;
    for (const [error, correct] of Object.entries(replacements)) {
        fixedText = fixedText.replace(new RegExp(error, 'g'), correct);
    }
    
    // 嘗試檢測並修復其他可能的 UTF-8 編碼問題
    try {
        // 如果文字中包含替換字符 (U+FFFD)，嘗試重新解碼
        if (fixedText.includes('\uFFFD') || fixedText.includes('�')) {
            // 移除無法解碼的字符
            fixedText = fixedText.replace(/[\uFFFD�]/g, '');
            
            // 記錄警告
            console.warn('[WhisperWorker] Detected encoding issues in text:', {
                original: text.substring(0, 50),
                fixed: fixedText.substring(0, 50)
            });
        }
    } catch (e) {
        console.error('[WhisperWorker] Error fixing encoding:', e);
    }
    
    return fixedText;
}

// 狀態管理
let isModelLoaded = false;
let isTranscribing = false;
let currentLanguage = 'zh';
let currentTask = 'transcribe';
let outputMode = 'streaming'; // 'streaming' or 'complete'

/**
 * 處理主執行緒訊息
 */
self.onmessage = async (event) => {
    const { type, messageId, ...data } = event.data;

    try {
        switch (type) {
            case 'initialize':
                await handleInitialize(data);
                sendResponse(messageId, { success: true });
                break;

            case 'loadModel':
                await handleLoadModel(data);
                sendResponse(messageId, { success: true });
                break;

            case 'transcribe':
            case 'transcribeFile':
                const result = await handleTranscribe(data);
                sendResponse(messageId, { 
                    success: true, 
                    transcript: result.text,
                    chunks: result.chunks 
                });
                break;

            case 'transcribeChunk':
                await handleTranscribeChunk(data);
                break;

            case 'updateConfig':
                handleUpdateConfig(data);
                sendResponse(messageId, { success: true });
                break;

            case 'dispose':
                await handleDispose();
                sendResponse(messageId, { success: true });
                break;

            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        console.error('[WhisperWorker] Error:', error);
        // 提供更詳細的錯誤信息
        const errorMessage = error.message || 'Unknown error occurred';
        const errorDetails = {
            message: errorMessage,
            type: type,
            stack: error.stack
        };
        
        sendError(messageId, errorMessage);
        
        // 也發送一個錯誤事件供更詳細的錯誤處理
        self.postMessage({
            type: 'error',
            error: errorDetails
        });
    }
};

/**
 * 初始化 Worker
 */
async function handleInitialize(data) {
    const { language = 'zh', task = 'transcribe', whisperOutputMode = 'streaming', basePath } = data.config || {};
    currentLanguage = normalizeLanguage(language);
    currentTask = task;
    outputMode = whisperOutputMode;
    
    // 如果尚未初始化 Transformers.js，現在初始化
    if (!transformersInitialized) {
        // 確定最終的基礎路徑 - 使用應用程式根目錄，不包含 /models/
        let finalBasePath;
        if (basePath) {
            // 如果是 GitHub Pages，需要完整的 URL
            if (self.location.origin.includes('github.io')) {
                finalBasePath = self.location.origin + basePath;
            } else {
                finalBasePath = basePath;
            }
        } else {
            // 預設為根目錄
            finalBasePath = '/';
        }
        
        console.log('[WhisperWorker] Initializing Transformers.js with base path:', finalBasePath);
        
        // 動態導入 Transformers.js
        const transformersModule = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
        pipeline = transformersModule.pipeline;
        env = transformersModule.env;
        
        // 配置 Transformers.js 環境
        env.allowLocalModels = true;  // 使用本地模型
        env.allowRemoteModels = false;  // 預設禁用遠端模型
        env.localURL = finalBasePath;  // 設定應用程式根目錄（不包含 /models/）
        
        transformersInitialized = true;
        console.log('[WhisperWorker] Transformers.js initialized with env.localURL:', env.localURL);
    }
    
    console.log('[WhisperWorker] Initialized with:', {
        language: currentLanguage,
        task: currentTask,
        modelBasePath: env ? env.localURL : 'not yet initialized'
    });
}

/**
 * 載入模型
 */
async function handleLoadModel(data) {
    // 支援多種模型格式：
    // 1. 完整本地路徑: models/huggingface/Xenova/whisper-base
    // 2. HuggingFace ID: Xenova/whisper-base  
    // 3. 配置傳入的路徑: models/huggingface/onnx-community/whisper-large-v3-turbo
    
    let { model = 'models/huggingface/Xenova/whisper-base', config = {}, quantized = false } = data;
    
    // 處理配置傳入的路徑
    if (config && config.model) {
        model = config.model;
    }
    
    // 處理量化選項
    if (config && typeof config.quantized !== 'undefined') {
        quantized = config.quantized;
    }
    
    // 處理模型來源配置 (local or remote)
    const modelSource = config.whisperModelSource || 'local';
    console.log('[WhisperWorker] Model source:', modelSource);
    
    if (modelSource === 'remote') {
        // 遠端模型：從 Hugging Face 載入
        env.allowRemoteModels = true;
        env.allowLocalModels = false;
        env.useBrowserCache = true;  // 啟用瀏覽器快取（重要！）
        
        // 如果是本地路徑格式，轉換為 HuggingFace ID
        if (model.includes('huggingface/')) {
            // 從路徑中提取 HuggingFace ID
            // 例如: models/huggingface/Xenova/whisper-base -> Xenova/whisper-base
            const parts = model.split('huggingface/');
            if (parts.length > 1) {
                model = parts[1];
            }
        } else if (model.startsWith('models/') || model.startsWith('/models/')) {
            // 處理其他本地路徑格式
            model = model.replace(/^\/?(models\/)?/, '');
        }
        
        // 對於遠端模型，不需要額外的路徑處理
        // transformers.js 期望直接的 HuggingFace ID（例如：Xenova/whisper-base）
        console.log('[WhisperWorker] Loading remote model from Hugging Face:', model);
        
        // 檢測是否離線
        if (!navigator.onLine) {
            throw new Error('無法載入遠端模型：目前處於離線狀態。請切換到本地模型或連接網路。');
        }
    } else {
        // 本地模型：從本地檔案載入
        env.allowRemoteModels = false;
        env.allowLocalModels = true;
        env.useBrowserCache = false;  // 本地模型不需要瀏覽器快取
        console.log('[WhisperWorker] Loading local model:', model);
        
        // 只對本地模型進行路徑處理
        // Transformers.js 會將 env.localURL + model 作為完整路徑
        // env.localURL 現在是應用程式根目錄，所以需要加上 models/ 前綴
        if (model.startsWith('models/')) {
            // 已經有 models/ 前綴，保持不變
            // model = model;
        } else if (model.startsWith('/models/')) {
            // 移除前導斜線
            model = model.substring(1);
        } else if (model.includes('/')) {
            // 如果是 HuggingFace ID 格式（如 Xenova/whisper-base）
            model = 'models/huggingface/' + model;
        } else {
            // 如果只是模型名稱，假設是本地的 HuggingFace 結構
            model = 'models/huggingface/Xenova/' + model;
        }
    }
    
    console.log('[WhisperWorker] Loading model from path:', model, 'quantized:', quantized);
    
    // 更新模型工廠
    await AutomaticSpeechRecognitionPipelineFactory.updateModel(model, quantized);
    
    // 載入模型，帶進度回調
    const progressCallback = (progress) => {
        if (progress.status === 'progress') {
            // progress.progress 已經是 0-100 的百分比值，保留兩位小數
            const percent = (progress.progress || 0).toFixed(2);
            self.postMessage({
                type: 'modelLoadProgress',
                progress: parseFloat(percent),
                message: `Loading ${progress.file}: ${percent}%`
            });
        }
    };
    
    try {
        await AutomaticSpeechRecognitionPipelineFactory.getInstance(progressCallback);
        isModelLoaded = true;
        
        self.postMessage({
            type: 'modelLoaded',
            model: model,
            source: modelSource,
            cached: modelSource === 'remote' ? 'Check IndexedDB for cache' : 'N/A'
        });
        
        console.log('[WhisperWorker] Model loaded successfully:', {
            model: model,
            source: modelSource,
            quantized: quantized
        });
    } catch (error) {
        console.error('[WhisperWorker] Failed to load model:', {
            error: error.message,
            model: model,
            source: modelSource,
            online: navigator.onLine,
            stack: error.stack
        });
        
        // 提供更詳細的錯誤訊息
        let detailedError = error.message;
        if (modelSource === 'remote') {
            if (!navigator.onLine) {
                detailedError = '無法載入遠端模型：您目前處於離線狀態。請連接網路或切換到本地模型。';
            } else if (error.message.includes('404') || error.message.includes('Not Found')) {
                detailedError = `找不到模型 "${model}"。請確認模型名稱正確，或嘗試其他模型。`;
            } else if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                detailedError = '網路請求失敗。這可能是 CORS 問題或網路連接問題。請稍後再試。';
            }
        }
        
        throw new Error(detailedError);
    }
}

/**
 * 轉譯音訊
 */
async function handleTranscribe(data) {
    if (!isModelLoaded) {
        // 使用本地的預設模型
        await handleLoadModel({ model: 'huggingface/Xenova/whisper-base' });
    }

    const { audio, config = {} } = data;
    const language = normalizeLanguage(config.language || currentLanguage);
    const task = config.task || currentTask;
    // 允許在轉譯時動態設定輸出模式
    const useStreaming = config.whisperOutputMode !== undefined ? 
                         config.whisperOutputMode === 'streaming' : 
                         outputMode === 'streaming';
    
    console.log('[WhisperWorker] Starting transcription:', {
        audioLength: audio?.length || audio?.byteLength,
        language,
        task,
        streaming: useStreaming
    });

    // 處理音訊資料
    let audioData = await processAudioData(audio);
    
    // 取得 Pipeline 實例
    const transcriber = await AutomaticSpeechRecognitionPipelineFactory.getInstance();
    
    // 設定時間精度
    const time_precision = 
        transcriber.processor.feature_extractor.config.chunk_length /
        transcriber.model.config.max_source_positions;

    // 儲存處理中的片段
    const chunks_to_process = [{
        tokens: [],
        finalised: false,
    }];

    // Chunk 回調函數
    function chunk_callback(chunk) {
        const last = chunks_to_process[chunks_to_process.length - 1];
        Object.assign(last, chunk);
        last.finalised = true;

        if (!chunk.is_last) {
            chunks_to_process.push({
                tokens: [],
                finalised: false,
            });
        }
    }

    // 生成回調函數 - 提供即時更新
    function callback_function(item) {
        const last = chunks_to_process[chunks_to_process.length - 1];
        last.tokens = [...item[0].output_token_ids];
        
        console.log('[WhisperWorker] Callback triggered, tokens:', last.tokens.length);

        // 解碼並發送即時更新
        // _decode_asr 返回格式: [text, {chunks: [{text, timestamp}...]}]
        // TODO: 未來優化 - 實現增量解碼以提升性能
        // 目前每次都重新解碼所有 chunks（O(N)複雜度）
        // 理想情況應該只解碼新增的 tokens（O(1)複雜度）
        const decoded = transcriber.tokenizer._decode_asr(chunks_to_process, {
            time_precision: time_precision,
            return_timestamps: true,
            force_full_sequences: false,
        });

        // 正確解析 _decode_asr 的返回值
        let text = '';
        let chunks = [];
        
        if (Array.isArray(decoded) && decoded.length >= 2) {
            // 標準格式: [text, {chunks: [...]}]
            text = decoded[0] || '';
            chunks = decoded[1]?.chunks || [];
        } else if (decoded && typeof decoded === 'object') {
            // 可能的對象格式
            text = decoded.text || '';
            chunks = decoded.chunks || [];
        }
        
        // 修復可能的編碼問題
        text = fixEncodingIssues(text);
        chunks = chunks.map(chunk => ({
            ...chunk,
            text: fixEncodingIssues(chunk.text || '')
        }));

        // 發送格式化的數據
        self.postMessage({
            type: 'transcriptionUpdate',
            data: {
                text: text,
                chunks: chunks
            }
        });
        
        // 調試日誌（只在有內容時）
        if (text || chunks.length > 0) {
            console.log('[WhisperWorker] Stream update:', {
                textLength: text.length,
                chunksCount: chunks.length,
                firstChunk: chunks[0]
            });
        }
    }

    try {
        isTranscribing = true;
        
        // 發送開始轉譯的訊息
        self.postMessage({
            type: 'transcriptionUpdate',
            data: {
                text: '正在處理音訊...',
                chunks: []
            }
        });
        
        // 檢查是否為 Distil-Whisper 模型
        const isDistilWhisper = AutomaticSpeechRecognitionPipelineFactory.model?.startsWith("distil-whisper/");
        
        // 執行轉譯
        const output = await transcriber(audioData, {
            // 解碼策略
            top_k: 0,  // Greedy decoding
            do_sample: false,
            
            // 滑動窗口設定
            chunk_length_s: isDistilWhisper ? 20 : 30,
            stride_length_s: isDistilWhisper ? 3 : 5,
            
            // 語言和任務設定
            language: language === 'auto' ? null : language,
            task: task,
            
            // 時間戳設定
            return_timestamps: true,
            force_full_sequences: false,
            
            // v2 版本支援 callback_function 和 chunk_callback
            callback_function: useStreaming ? callback_function : undefined,
            chunk_callback: useStreaming ? chunk_callback : undefined
        });
        
        isTranscribing = false;
        
        console.log('[WhisperWorker] Transcription completed:', {
            textLength: output?.text?.length || 0,
            chunksCount: output?.chunks?.length || 0
        });
        
        // 確保返回正確的格式，並修復編碼問題
        const finalText = fixEncodingIssues(output?.text || '');
        const finalChunks = (output?.chunks || []).map(chunk => ({
            ...chunk,
            text: fixEncodingIssues(chunk.text || '')
        }));
        
        return {
            text: finalText,
            chunks: finalChunks,
            language: output?.language || language
        };
        
    } catch (error) {
        isTranscribing = false;
        console.error('[WhisperWorker] Transcription error:', error);
        throw error;
    }
}

/**
 * 處理音訊片段（串流模式）
 */
async function handleTranscribeChunk(data) {
    // 串流模式的實現（可選）
    const { audio, sampleRate = 16000 } = data;
    
    // 累積音訊片段，達到一定長度後進行轉譯
    // 這裡可以實現更複雜的串流邏輯
    
    console.log('[WhisperWorker] Processing audio chunk:', audio.length);
}

/**
 * 更新配置
 */
function handleUpdateConfig(data) {
    const { language, task } = data.config || {};
    
    if (language) {
        currentLanguage = normalizeLanguage(language);
    }
    if (task) {
        currentTask = task;
    }
    
    console.log('[WhisperWorker] Config updated:', {
        language: currentLanguage,
        task: currentTask
    });
}

/**
 * 釋放資源
 */
async function handleDispose() {
    if (AutomaticSpeechRecognitionPipelineFactory.instance !== null) {
        const instance = await AutomaticSpeechRecognitionPipelineFactory.getInstance();
        instance.dispose();
        AutomaticSpeechRecognitionPipelineFactory.instance = null;
    }
    
    isModelLoaded = false;
    isTranscribing = false;
    
    console.log('[WhisperWorker] Disposed');
}

/**
 * 處理音訊資料
 */
async function processAudioData(audio) {
    // 如果已經是 Float32Array，直接返回
    if (audio instanceof Float32Array) {
        return audio;
    }
    
    // 如果是數組，轉換為 Float32Array
    if (Array.isArray(audio)) {
        return new Float32Array(audio);
    }
    
    // 對於 ArrayBuffer 或其他格式，嘗試使用舊方法作為降級
    // 注意：主執行緒應該使用 audio-decoder.js 預處理音訊
    if (audio instanceof ArrayBuffer) {
        console.warn('[WhisperWorker] ArrayBuffer should be decoded in main thread using Web Audio API');
        return decodeAudioData(audio);
    }
    
    throw new Error('Unsupported audio format');
}

/**
 * 解碼音訊資料（支援 WAV 格式）
 */
function decodeAudioData(arrayBuffer) {
    const dataView = new DataView(arrayBuffer);
    
    // 檢查 WAV 標頭
    if (arrayBuffer.byteLength > 44) {
        try {
            const riff = String.fromCharCode(
                dataView.getUint8(0),
                dataView.getUint8(1),
                dataView.getUint8(2),
                dataView.getUint8(3)
            );
            
            if (riff === 'RIFF') {
                // 解析 WAV 檔案
                return parseWavFile(arrayBuffer);
            }
        } catch (e) {
            console.warn('[WhisperWorker] Not a WAV file, treating as raw PCM');
        }
    }
    
    // 作為原始 PCM 處理
    const numSamples = Math.floor(arrayBuffer.byteLength / 2);
    const audioData = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
        const sample = dataView.getInt16(i * 2, true);
        audioData[i] = sample / 32768.0;
    }
    
    return audioData;
}

/**
 * 解析 WAV 檔案
 */
function parseWavFile(arrayBuffer) {
    const dataView = new DataView(arrayBuffer);
    
    // 解析 fmt chunk 獲取音訊格式資訊
    let offset = 12;
    let fmtOffset = 0;
    let dataOffset = 0;
    let dataLength = 0;
    let sampleRate = 16000;
    let bitsPerSample = 16;
    let numChannels = 1;
    
    // 尋找 fmt 和 data chunks
    while (offset < arrayBuffer.byteLength - 8) {
        const chunkId = String.fromCharCode(
            dataView.getUint8(offset),
            dataView.getUint8(offset + 1),
            dataView.getUint8(offset + 2),
            dataView.getUint8(offset + 3)
        );
        const chunkSize = dataView.getUint32(offset + 4, true);
        
        if (chunkId === 'fmt ') {
            fmtOffset = offset + 8;
            // 讀取格式資訊
            const audioFormat = dataView.getUint16(fmtOffset, true);
            numChannels = dataView.getUint16(fmtOffset + 2, true);
            sampleRate = dataView.getUint32(fmtOffset + 4, true);
            bitsPerSample = dataView.getUint16(fmtOffset + 14, true);
            
            console.log(`[WhisperWorker] WAV format: ${sampleRate}Hz, ${bitsPerSample}bit, ${numChannels}ch`);
        } else if (chunkId === 'data') {
            dataOffset = offset + 8;
            dataLength = chunkSize;
        }
        
        offset += 8 + chunkSize;
        // 確保偏移量是偶數（某些 WAV 檔案需要）
        if (offset & 1) offset++;
    }
    
    if (dataOffset === 0) {
        throw new Error('Invalid WAV file: data chunk not found');
    }
    
    // 計算樣本數
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = dataLength / (bytesPerSample * numChannels);
    
    // 創建單聲道 Float32Array
    const audioData = new Float32Array(numSamples);
    
    // 根據位元深度和聲道數解碼
    if (bitsPerSample === 16) {
        for (let i = 0; i < numSamples; i++) {
            let sample = 0;
            // 如果是多聲道，取平均值
            for (let ch = 0; ch < numChannels; ch++) {
                const idx = dataOffset + (i * numChannels + ch) * 2;
                sample += dataView.getInt16(idx, true) / 32768.0;
            }
            audioData[i] = sample / numChannels;
        }
    } else if (bitsPerSample === 8) {
        for (let i = 0; i < numSamples; i++) {
            let sample = 0;
            for (let ch = 0; ch < numChannels; ch++) {
                const idx = dataOffset + i * numChannels + ch;
                sample += (dataView.getUint8(idx) - 128) / 128.0;
            }
            audioData[i] = sample / numChannels;
        }
    } else if (bitsPerSample === 24) {
        for (let i = 0; i < numSamples; i++) {
            let sample = 0;
            for (let ch = 0; ch < numChannels; ch++) {
                const idx = dataOffset + (i * numChannels + ch) * 3;
                const b1 = dataView.getUint8(idx);
                const b2 = dataView.getUint8(idx + 1);
                const b3 = dataView.getUint8(idx + 2);
                const val = (b3 << 16) | (b2 << 8) | b1;
                // 處理有符號 24-bit
                const signed = val > 0x7FFFFF ? val - 0x1000000 : val;
                sample += signed / 8388608.0;
            }
            audioData[i] = sample / numChannels;
        }
    } else if (bitsPerSample === 32) {
        for (let i = 0; i < numSamples; i++) {
            let sample = 0;
            for (let ch = 0; ch < numChannels; ch++) {
                const idx = dataOffset + (i * numChannels + ch) * 4;
                sample += dataView.getInt32(idx, true) / 2147483648.0;
            }
            audioData[i] = sample / numChannels;
        }
    } else {
        console.warn(`[WhisperWorker] Unsupported bit depth: ${bitsPerSample}, treating as 16-bit`);
        // 降級到 16-bit 處理
        for (let i = 0; i < numSamples; i++) {
            const sample = dataView.getInt16(dataOffset + i * 2, true);
            audioData[i] = sample / 32768.0;
        }
    }
    
    console.log(`[WhisperWorker] Parsed WAV: ${numSamples} samples, normalized to mono`);
    
    // 如果採樣率不是 16kHz，需要重採樣
    if (sampleRate !== 16000) {
        console.log(`[WhisperWorker] Resampling from ${sampleRate}Hz to 16000Hz`);
        return resampleAudio(audioData, sampleRate, 16000);
    }
    
    return audioData;
}

/**
 * 重採樣音訊到目標採樣率
 */
function resampleAudio(audioData, fromRate, toRate) {
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
    
    console.log(`[WhisperWorker] Resampled: ${audioData.length} -> ${resampled.length} samples`);
    return resampled;
}

/**
 * 正規化語言代碼
 */
function normalizeLanguage(language) {
    // 將區域代碼轉換為 ISO 639-1 代碼
    const languageMap = {
        'zh-TW': 'zh',
        'zh-CN': 'zh',
        'en-US': 'en',
        'en-GB': 'en',
        'ja-JP': 'ja',
        'ko-KR': 'ko',
        'es-ES': 'es',
        'fr-FR': 'fr',
        'de-DE': 'de',
        'it-IT': 'it',
        'pt-BR': 'pt',
        'ru-RU': 'ru',
        'ar-SA': 'ar',
        'hi-IN': 'hi'
    };
    
    return languageMap[language] || language;
}

/**
 * 發送回應
 */
function sendResponse(messageId, data) {
    if (messageId) {
        self.postMessage({
            messageId,
            ...data
        });
    }
}

/**
 * 發送錯誤
 */
function sendError(messageId, error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (messageId) {
        self.postMessage({
            messageId,
            error: errorMessage
        });
    } else {
        self.postMessage({
            type: 'error',
            error: errorMessage
        });
    }
}

// Worker 錯誤處理
self.onerror = (error) => {
    console.error('[WhisperWorker] Global error:', error);
    self.postMessage({
        type: 'error',
        error: error.message || 'Unknown error'
    });
};

console.log('[WhisperWorker] Worker initialized');