/**
 * ML Inference Worker - 機器學習推論專用 Worker
 * 負責執行 ONNX 模型推論，支援 WebGPU/WASM 自動選擇
 */

// 全域變數
let ort = null;
let sessions = new Map();
let config = {};
let executionProvider = null;

/**
 * 初始化 ONNX Runtime
 */
async function initializeONNXRuntime() {
    try {
        const hasWebGPU = 'gpu' in self && self.gpu;
        let useModuleImport = true;
        
        // 嘗試判斷是否為 ES Module Worker
        try {
            // 如果是 Module Worker，importScripts 會拋出錯誤
            if (typeof importScripts === 'function') {
                // 測試是否真的可以使用 importScripts
                const testScript = 'data:text/javascript,';
                importScripts(testScript);
                useModuleImport = false;
            }
        } catch (e) {
            // importScripts 失敗，使用 ES Module import
            useModuleImport = true;
        }
        
        if (useModuleImport) {
            // ES Module 環境
            if (hasWebGPU) {
                try {
                    ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.webgpu.min.mjs');
                    executionProvider = 'webgpu';
                    console.log('ONNX Runtime WebGPU 載入成功 (ES Module)');
                } catch (error) {
                    console.warn('WebGPU 版本載入失敗，降級到 WASM:', error);
                    ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.min.mjs');
                    executionProvider = 'wasm';
                }
            } else {
                ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.min.mjs');
                executionProvider = 'wasm';
            }
        } else {
            // 傳統 Worker 環境
            if (hasWebGPU) {
                try {
                    importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.webgpu.min.js');
                    executionProvider = 'webgpu';
                    console.log('ONNX Runtime WebGPU 載入成功 (Classic Worker)');
                } catch (error) {
                    console.warn('WebGPU 版本載入失敗，降級到 WASM:', error);
                    importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.min.js');
                    executionProvider = 'wasm';
                }
            } else {
                importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.min.js');
                executionProvider = 'wasm';
            }
            
            ort = self.ort;
        }

        // 設定 ONNX Runtime 配置
        if (ort) {
            // 設定 WASM 路徑
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/';
            
            // 啟用多執行緒（如果支援）
            if (self.crossOriginIsolated) {
                ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
            }
            
            console.log(`ONNX Runtime 初始化成功 (${executionProvider})`);
        }

        return true;
    } catch (error) {
        console.error('ONNX Runtime 初始化失敗:', error);
        throw error;
    }
}

/**
 * 載入 ONNX 模型
 * @param {Object} params - 載入參數
 */
async function loadModel(params) {
    const { modelId, modelPath, options = {} } = params;
    
    try {
        if (!ort) {
            await initializeONNXRuntime();
        }

        // 配置執行提供者
        const providers = executionProvider === 'webgpu' 
            ? ['webgpu', 'wasm'] 
            : ['wasm'];

        // 創建推論會話
        const sessionOptions = {
            executionProviders: providers,
            graphOptimizationLevel: options.graphOptimizationLevel || 'all',
            enableCpuMemArena: options.enableCpuMemArena !== false,
            enableMemPattern: options.enableMemPattern !== false,
            ...options.sessionOptions
        };

        // 將相對路徑轉換為絕對 URL
        let fullModelPath = modelPath;
        if (!modelPath.startsWith('http://') && !modelPath.startsWith('https://')) {
            // 如果是相對路徑，轉換為絕對 URL
            const baseUrl = self.location.origin;
            fullModelPath = modelPath.startsWith('/') 
                ? `${baseUrl}${modelPath}`
                : `${baseUrl}/${modelPath}`;
        }

        console.log(`載入模型: ${modelId} from ${fullModelPath}`);
        const session = await ort.InferenceSession.create(fullModelPath, sessionOptions);
        
        // 儲存會話
        sessions.set(modelId, {
            session,
            modelPath,
            inputNames: session.inputNames,
            outputNames: session.outputNames,
            loadedAt: Date.now()
        });

        console.log(`模型 ${modelId} 載入成功`);
        console.log(`  輸入名稱: ${session.inputNames.join(', ')}`);
        console.log(`  輸出名稱: ${session.outputNames.join(', ')}`);
        
        return {
            success: true,
            modelId,
            inputNames: session.inputNames,
            outputNames: session.outputNames,
            provider: executionProvider
        };

    } catch (error) {
        console.error(`載入模型 ${modelId} 失敗:`, error);
        throw error;
    }
}

/**
 * 執行推論
 * @param {Object} params - 推論參數
 */
async function runInference(params) {
    const { modelId, inputs, options = {} } = params;
    
    try {
        const modelInfo = sessions.get(modelId);
        if (!modelInfo) {
            throw new Error(`模型 ${modelId} 未載入`);
        }

        const { session } = modelInfo;
        
        // 準備輸入張量
        const feeds = {};
        console.log(`[runInference] Processing inputs for model ${modelId}:`, Object.keys(inputs));
        console.log(`[runInference] Model expects inputs:`, modelInfo.inputNames);
        
        // 如果只有一個輸入且模型也只期望一個輸入，自動映射
        const inputEntries = Object.entries(inputs);
        const modelInputNames = modelInfo.inputNames;
        
        let remappedInputs = inputs;
        if (inputEntries.length === 1 && modelInputNames.length === 1) {
            // 單輸入情況，自動映射到模型期望的輸入名稱
            const [providedName, data] = inputEntries[0];
            const expectedName = modelInputNames[0];
            
            if (providedName !== expectedName) {
                console.log(`[runInference] Remapping input '${providedName}' to expected name '${expectedName}'`);
                remappedInputs = { [expectedName]: data };
            }
        }
        
        for (const [name, data] of Object.entries(remappedInputs)) {
            console.log(`[runInference] Input ${name}:`, {
                hasTensor: data.tensor,
                hasDtype: !!data.dtype,
                hasDims: !!data.dims,
                hasData: !!data.data,
                dataType: data.data?.constructor?.name || typeof data
            });
            
            if (data.tensor || (data.dtype && data.dims && data.data)) {
                // 已經是張量格式
                let tensorData = data.data;
                const dtype = data.dtype || 'float32';
                
                // 處理不同的資料類型
                if (dtype === 'int64') {
                    // 將數字陣列轉換為 BigInt64Array
                    if (!(tensorData instanceof BigInt64Array)) {
                        tensorData = new BigInt64Array(data.data.map(v => BigInt(v)));
                    }
                } else if (dtype === 'float32') {
                    // 只有當資料不是 Float32Array 時才轉換
                    if (Array.isArray(tensorData)) {
                        console.log(`Converting Array to Float32Array for ${name}`);
                        tensorData = new Float32Array(tensorData);
                    } else if (!(tensorData instanceof Float32Array)) {
                        console.log(`Warning: Unexpected data type for float32 tensor ${name}:`, tensorData?.constructor?.name);
                        // 嘗試轉換
                        try {
                            tensorData = new Float32Array(tensorData);
                        } catch (e) {
                            console.error(`Failed to convert to Float32Array:`, e);
                            throw e;
                        }
                    }
                }
                
                feeds[name] = new ort.Tensor(
                    dtype,
                    tensorData,
                    data.dims
                );
            } else {
                // 假設是原始資料
                feeds[name] = new ort.Tensor(
                    'float32',
                    data,
                    options.inputShapes?.[name] || [1, data.length]
                );
            }
        }

        // 執行推論
        const startTime = performance.now();
        const results = await session.run(feeds);
        const inferenceTime = performance.now() - startTime;

        // 處理輸出
        const outputs = {};
        for (const [name, tensor] of Object.entries(results)) {
            outputs[name] = {
                data: Array.from(tensor.data),
                dims: tensor.dims,
                dtype: tensor.type
            };
        }

        return {
            success: true,
            modelId,
            outputs,
            inferenceTime,
            provider: executionProvider
        };

    } catch (error) {
        console.error(`推論失敗 (${modelId}):`, error);
        throw error;
    }
}

/**
 * 批次推論
 * @param {Object} params - 批次推論參數
 */
async function runBatchInference(params) {
    const { modelId, batchInputs, options = {} } = params;
    
    try {
        const results = [];
        const startTime = performance.now();
        
        for (const inputs of batchInputs) {
            const result = await runInference({
                modelId,
                inputs,
                options
            });
            results.push(result.outputs);
        }
        
        const totalTime = performance.now() - startTime;
        
        return {
            success: true,
            modelId,
            results,
            totalTime,
            averageTime: totalTime / batchInputs.length,
            provider: executionProvider
        };

    } catch (error) {
        console.error(`批次推論失敗 (${modelId}):`, error);
        throw error;
    }
}

/**
 * 卸載模型
 * @param {Object} params - 卸載參數
 */
async function unloadModel(params) {
    const { modelId } = params;
    
    try {
        const modelInfo = sessions.get(modelId);
        if (modelInfo) {
            // 釋放資源
            await modelInfo.session.release();
            sessions.delete(modelId);
            
            console.log(`模型 ${modelId} 已卸載`);
            return { success: true, modelId };
        } else {
            return { 
                success: false, 
                modelId, 
                error: '模型未載入' 
            };
        }
    } catch (error) {
        console.error(`卸載模型 ${modelId} 失敗:`, error);
        throw error;
    }
}

/**
 * 取得 Worker 狀態
 */
function getStatus() {
    const loadedModels = Array.from(sessions.keys());
    const memoryUsage = performance.memory ? {
        usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1048576),
        totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1048576),
        jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
    } : null;

    return {
        initialized: !!ort,
        provider: executionProvider,
        loadedModels,
        modelCount: loadedModels.length,
        memoryUsage,
        config
    };
}

/**
 * 預熱模型
 * @param {Object} params - 預熱參數
 */
async function warmupModel(params) {
    const { modelId, warmupRuns = 3 } = params;
    
    try {
        const modelInfo = sessions.get(modelId);
        if (!modelInfo) {
            throw new Error(`模型 ${modelId} 未載入`);
        }

        console.log(`預熱模型 ${modelId}...`);
        
        // 創建虛擬輸入
        const dummyInputs = {};
        for (const inputName of modelInfo.inputNames) {
            // 根據不同模型調整輸入
            if (modelId === 'vad') {
                // Silero VAD 模型需要特定的輸入格式
                if (inputName === 'input') {
                    dummyInputs[inputName] = {
                        tensor: true,
                        data: new Float32Array(512).fill(0),
                        dims: [1, 512],
                        dtype: 'float32'
                    };
                } else if (inputName === 'sr') {
                    // Sample rate as int64
                    dummyInputs[inputName] = {
                        tensor: true,
                        data: new BigInt64Array([16000n]),
                        dims: [],
                        dtype: 'int64'
                    };
                } else if (inputName === 'h' || inputName === 'c') {
                    // Hidden states
                    dummyInputs[inputName] = {
                        tensor: true,
                        data: new Float32Array(2 * 1 * 64).fill(0),
                        dims: [2, 1, 64],
                        dtype: 'float32'
                    };
                }
            } else {
                // 預設輸入（用於喚醒詞等模型）
                dummyInputs[inputName] = {
                    tensor: true,
                    data: new Float32Array(1280).fill(0),
                    dims: [1, 1280],
                    dtype: 'float32'
                };
            }
        }

        // 執行預熱
        const times = [];
        for (let i = 0; i < warmupRuns; i++) {
            const result = await runInference({
                modelId,
                inputs: dummyInputs
            });
            times.push(result.inferenceTime);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        
        console.log(`模型 ${modelId} 預熱完成，平均時間: ${avgTime.toFixed(2)}ms`);
        
        return {
            success: true,
            modelId,
            warmupRuns,
            times,
            averageTime: avgTime
        };

    } catch (error) {
        console.error(`預熱模型 ${modelId} 失敗:`, error);
        throw error;
    }
}

/**
 * 清理資源
 */
async function cleanup() {
    try {
        // 卸載所有模型
        for (const modelId of sessions.keys()) {
            await unloadModel({ modelId });
        }
        
        // 清理 ONNX Runtime
        if (ort) {
            ort = null;
        }
        
        config = {};
        executionProvider = null;
        
        return { success: true, message: '資源已清理' };
        
    } catch (error) {
        console.error('清理資源失敗:', error);
        throw error;
    }
}

/**
 * 處理訊息
 */
self.onmessage = async function(event) {
    const { type, requestId, ...params } = event.data;
    
    try {
        let result;
        
        switch (type) {
            case 'init':
                config = params.config || {};
                await initializeONNXRuntime();
                result = { success: true, provider: executionProvider };
                break;
                
            case 'loadModel':
                result = await loadModel(params);
                break;
                
            case 'runInference':
                result = await runInference(params);
                break;
                
            case 'runBatchInference':
                result = await runBatchInference(params);
                break;
                
            case 'unloadModel':
                result = await unloadModel(params);
                break;
                
            case 'warmupModel':
                result = await warmupModel(params);
                break;
                
            case 'getStatus':
                result = getStatus();
                break;
                
            case 'cleanup':
                result = await cleanup();
                break;
                
            default:
                throw new Error(`未知的訊息類型: ${type}`);
        }
        
        // 回傳結果
        self.postMessage({
            type: `${type}-result`,
            requestId,
            ...result
        });
        
    } catch (error) {
        // 回傳錯誤
        self.postMessage({
            type: 'error',
            requestId,
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }
};

// Worker 初始化
console.log('ML Inference Worker 已啟動');