/**
 * WorkerManager - Web Worker 管理器
 * 負責創建、管理和協調 Web Workers，包含自動降級機制
 */
export class WorkerManager {
    constructor() {
        this.workers = new Map();
        this.capabilities = null;
        this.executionMode = 'auto'; // 'auto' | 'worker' | 'main'
        this.messageHandlers = new Map();
        this.pendingRequests = new Map();
        this.requestId = 0;
    }

    /**
     * 初始化並檢測能力
     * @returns {Promise<Object>}
     */
    async initialize() {
        this.capabilities = await this.detectCapabilities();
        this.executionMode = this.determineExecutionMode();
        
        console.log('WorkerManager 初始化:', {
            capabilities: this.capabilities,
            executionMode: this.executionMode
        });
        
        return {
            capabilities: this.capabilities,
            executionMode: this.executionMode
        };
    }

    /**
     * 檢測瀏覽器能力
     * @returns {Promise<Object>}
     */
    async detectCapabilities() {
        const capabilities = {
            webWorker: typeof Worker !== 'undefined',
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            transferableObjects: true, // 大多數現代瀏覽器都支援
            offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
            webAssembly: typeof WebAssembly !== 'undefined',
            atomics: typeof Atomics !== 'undefined',
            moduleWorker: false, // 將通過測試確定
            workerPerformance: null
        };

        // 測試 Module Worker 支援
        if (capabilities.webWorker) {
            try {
                const testWorker = new Worker(
                    'data:application/javascript,export {};',
                    { type: 'module' }
                );
                testWorker.terminate();
                capabilities.moduleWorker = true;
            } catch (e) {
                capabilities.moduleWorker = false;
            }
        }

        // 測試 Worker 效能
        if (capabilities.webWorker) {
            capabilities.workerPerformance = await this.benchmarkWorker();
        }

        return capabilities;
    }

    /**
     * 基準測試 Worker 效能
     * @returns {Promise<Object>}
     */
    async benchmarkWorker() {
        return new Promise((resolve) => {
            const startTime = performance.now();
            
            // 創建簡單的測試 Worker
            const workerCode = `
                self.onmessage = function(e) {
                    const { data } = e;
                    if (data.type === 'benchmark') {
                        // 執行簡單的計算任務
                        let result = 0;
                        for (let i = 0; i < data.iterations; i++) {
                            result += Math.sqrt(i);
                        }
                        self.postMessage({ type: 'result', result });
                    }
                };
            `;
            
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const worker = new Worker(URL.createObjectURL(blob));
            
            worker.onmessage = (e) => {
                const endTime = performance.now();
                worker.terminate();
                
                resolve({
                    creationTime: endTime - startTime,
                    supported: true,
                    score: Math.round(1000000 / (endTime - startTime))
                });
            };
            
            worker.onerror = () => {
                resolve({
                    creationTime: -1,
                    supported: false,
                    score: 0
                });
            };
            
            // 發送測試任務
            worker.postMessage({ type: 'benchmark', iterations: 100000 });
            
            // 超時處理
            setTimeout(() => {
                worker.terminate();
                resolve({
                    creationTime: -1,
                    supported: false,
                    score: 0
                });
            }, 5000);
        });
    }

    /**
     * 決定最佳執行模式
     * @returns {string}
     */
    determineExecutionMode() {
        if (this.executionMode !== 'auto') {
            return this.executionMode;
        }

        // 如果不支援 Worker，使用主執行緒
        if (!this.capabilities.webWorker) {
            console.warn('Web Worker 不支援，降級到主執行緒');
            return 'main';
        }

        // 如果 Worker 效能太差，使用主執行緒
        if (this.capabilities.workerPerformance?.score < 100) {
            console.warn('Worker 效能不佳，降級到主執行緒');
            return 'main';
        }

        // 預設使用 Worker
        return 'worker';
    }

    /**
     * 創建 Worker
     * @param {string} name - Worker 名稱
     * @param {string} type - Worker 類型
     * @param {Object} options - 選項
     * @returns {Promise<Object>}
     */
    async createWorker(name, type, options = {}) {
        // 檢查執行模式
        if (this.executionMode === 'main') {
            return this.createMainThreadFallback(name, type, options);
        }

        try {
            let worker;
            const workerPath = `/js/workers/${type}.worker.js`;
            
            // 嘗試創建 Module Worker
            if (this.capabilities.moduleWorker && options.module !== false) {
                worker = new Worker(workerPath, { type: 'module' });
            } else {
                worker = new Worker(workerPath);
            }

            // 設定訊息處理
            worker.onmessage = (event) => {
                this.handleWorkerMessage(name, event.data);
            };

            worker.onerror = (error) => {
                console.error(`Worker ${name} 錯誤:`, error);
                this.handleWorkerError(name, error);
            };

            // 儲存 Worker 資訊
            const workerInfo = {
                worker,
                type,
                status: 'ready',
                createdAt: Date.now(),
                options
            };

            this.workers.set(name, workerInfo);

            // 初始化 Worker
            await this.sendToWorker(name, {
                type: 'init',
                config: options.config || {}
            });

            console.log(`Worker ${name} 創建成功`);
            return workerInfo;

        } catch (error) {
            console.error(`創建 Worker ${name} 失敗:`, error);
            
            // 降級到主執行緒
            if (options.fallback !== false) {
                console.warn(`Worker ${name} 創建失敗，降級到主執行緒`);
                return this.createMainThreadFallback(name, type, options);
            }
            
            throw error;
        }
    }

    /**
     * 創建主執行緒降級方案
     * @param {string} name - Worker 名稱
     * @param {string} type - Worker 類型
     * @param {Object} options - 選項
     * @returns {Object}
     */
    createMainThreadFallback(name, type, options = {}) {
        console.log(`使用主執行緒模擬 Worker: ${name}`);
        
        // 動態載入對應的處理邏輯
        const fallback = {
            type: 'main-thread',
            status: 'ready',
            createdAt: Date.now(),
            options,
            postMessage: (data) => {
                // 模擬異步處理
                setTimeout(() => {
                    this.handleMainThreadProcess(name, type, data);
                }, 0);
            }
        };

        this.workers.set(name, fallback);
        return fallback;
    }

    /**
     * 處理主執行緒降級邏輯
     * @param {string} name - Worker 名稱
     * @param {string} type - Worker 類型
     * @param {Object} data - 資料
     */
    async handleMainThreadProcess(name, type, data) {
        // 根據 Worker 類型處理不同邏輯
        let result;
        
        try {
            switch (type) {
                case 'ml-inference':
                    result = await this.processMLInferenceMainThread(data);
                    break;
                case 'audio-processor':
                    result = await this.processAudioMainThread(data);
                    break;
                default:
                    result = { error: `未知的 Worker 類型: ${type}` };
            }
            
            this.handleWorkerMessage(name, result);
        } catch (error) {
            this.handleWorkerError(name, error);
        }
    }

    /**
     * 發送訊息到 Worker
     * @param {string} name - Worker 名稱
     * @param {Object} data - 資料
     * @param {Array} transferables - 可轉移物件
     * @returns {Promise}
     */
    sendToWorker(name, data, transferables = []) {
        return new Promise((resolve, reject) => {
            const workerInfo = this.workers.get(name);
            
            if (!workerInfo) {
                reject(new Error(`Worker ${name} 不存在`));
                return;
            }

            // 生成請求 ID
            const requestId = ++this.requestId;
            data.requestId = requestId;

            // 儲存待處理請求
            this.pendingRequests.set(requestId, { resolve, reject });

            // 發送訊息
            if (workerInfo.worker) {
                // 真實 Worker
                workerInfo.worker.postMessage(data, transferables);
            } else if (workerInfo.postMessage) {
                // 主執行緒降級
                workerInfo.postMessage(data);
            } else {
                reject(new Error(`無法發送訊息到 Worker ${name}`));
            }

            // 設定超時
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`Worker ${name} 回應超時`));
                }
            }, 30000);
        });
    }

    /**
     * 處理 Worker 訊息
     * @param {string} name - Worker 名稱
     * @param {Object} data - 資料
     */
    handleWorkerMessage(name, data) {
        // 處理請求回應
        if (data.requestId && this.pendingRequests.has(data.requestId)) {
            const { resolve } = this.pendingRequests.get(data.requestId);
            this.pendingRequests.delete(data.requestId);
            resolve(data);
            return;
        }

        // 處理一般訊息
        const handlers = this.messageHandlers.get(name) || [];
        handlers.forEach(handler => handler(data));
    }

    /**
     * 處理 Worker 錯誤
     * @param {string} name - Worker 名稱
     * @param {Error} error - 錯誤
     */
    handleWorkerError(name, error) {
        console.error(`Worker ${name} 錯誤:`, error);
        
        // 通知所有待處理請求
        this.pendingRequests.forEach(({ reject }) => {
            reject(error);
        });
        this.pendingRequests.clear();

        // 嘗試重啟 Worker
        if (this.workers.has(name)) {
            const workerInfo = this.workers.get(name);
            if (workerInfo.options?.autoRestart !== false) {
                console.log(`嘗試重啟 Worker ${name}...`);
                setTimeout(() => {
                    this.restartWorker(name);
                }, 1000);
            }
        }
    }

    /**
     * 重啟 Worker
     * @param {string} name - Worker 名稱
     */
    async restartWorker(name) {
        const workerInfo = this.workers.get(name);
        if (!workerInfo) return;

        // 終止舊 Worker
        this.terminateWorker(name);

        // 創建新 Worker
        try {
            await this.createWorker(name, workerInfo.type, workerInfo.options);
            console.log(`Worker ${name} 重啟成功`);
        } catch (error) {
            console.error(`Worker ${name} 重啟失敗:`, error);
        }
    }

    /**
     * 註冊訊息處理器
     * @param {string} name - Worker 名稱
     * @param {Function} handler - 處理函數
     */
    onMessage(name, handler) {
        if (!this.messageHandlers.has(name)) {
            this.messageHandlers.set(name, []);
        }
        this.messageHandlers.get(name).push(handler);
    }

    /**
     * 終止 Worker
     * @param {string} name - Worker 名稱
     */
    terminateWorker(name) {
        const workerInfo = this.workers.get(name);
        if (workerInfo?.worker) {
            workerInfo.worker.terminate();
        }
        this.workers.delete(name);
        this.messageHandlers.delete(name);
    }

    /**
     * 終止所有 Workers
     */
    terminateAll() {
        this.workers.forEach((info, name) => {
            this.terminateWorker(name);
        });
    }

    /**
     * 取得 Worker 狀態
     * @param {string} name - Worker 名稱
     * @returns {Object}
     */
    getWorkerStatus(name) {
        const workerInfo = this.workers.get(name);
        if (!workerInfo) return null;

        return {
            type: workerInfo.type,
            status: workerInfo.status,
            createdAt: workerInfo.createdAt,
            isMainThread: !workerInfo.worker
        };
    }

    /**
     * 取得所有 Workers 狀態
     * @returns {Object}
     */
    getAllWorkersStatus() {
        const status = {};
        this.workers.forEach((info, name) => {
            status[name] = this.getWorkerStatus(name);
        });
        return status;
    }

    /**
     * 主執行緒 ML 推論處理
     * @param {Object} data - 資料
     * @returns {Promise<Object>}
     */
    async processMLInferenceMainThread(data) {
        // 這裡將在整合時實作具體的推論邏輯
        return {
            type: 'inference-result',
            requestId: data.requestId,
            result: 'main-thread-fallback',
            warning: '使用主執行緒執行 ML 推論'
        };
    }

    /**
     * 主執行緒音訊處理
     * @param {Object} data - 資料
     * @returns {Promise<Object>}
     */
    async processAudioMainThread(data) {
        // 這裡將在整合時實作具體的音訊處理邏輯
        return {
            type: 'audio-processed',
            requestId: data.requestId,
            result: 'main-thread-fallback',
            warning: '使用主執行緒處理音訊'
        };
    }
}