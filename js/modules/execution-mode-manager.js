/**
 * ExecutionModeManager - 執行模式管理器
 * 負責決定最佳執行模式並提供降級策略
 */
export class ExecutionModeManager {
    constructor() {
        this.capabilities = null;
        this.executionChain = [];
        this.currentMode = null;
        this.performanceMetrics = {
            worker: {},
            main: {}
        };
    }

    /**
     * 初始化並決定最佳執行模式
     * @returns {Promise<Object>}
     */
    async initialize() {
        // 檢測所有能力
        this.capabilities = await this.detectFullCapabilities();
        
        // 建立執行鏈
        this.executionChain = this.buildExecutionChain();
        
        // 決定初始模式
        this.currentMode = await this.determineOptimalMode();
        
        console.log('ExecutionModeManager 初始化:', {
            capabilities: this.capabilities,
            executionChain: this.executionChain,
            currentMode: this.currentMode
        });
        
        return {
            capabilities: this.capabilities,
            currentMode: this.currentMode,
            availableModes: this.executionChain
        };
    }

    /**
     * 檢測完整的系統能力
     * @returns {Promise<Object>}
     */
    async detectFullCapabilities() {
        const caps = {
            // 基礎能力
            webWorker: typeof Worker !== 'undefined',
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            webAssembly: typeof WebAssembly !== 'undefined',
            
            // GPU 相關
            webGPU: await this.checkWebGPU(),
            webGL: this.checkWebGL(),
            webGL2: this.checkWebGL2(),
            
            // 效能相關
            hardwareConcurrency: navigator.hardwareConcurrency || 1,
            deviceMemory: navigator.deviceMemory || 0,
            connection: this.getConnectionInfo(),
            
            // 瀏覽器特性
            offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
            atomics: typeof Atomics !== 'undefined',
            bigInt: typeof BigInt !== 'undefined',
            
            // ONNX Runtime 特定
            simd: await this.checkSIMD(),
            threads: self.crossOriginIsolated || false
        };
        
        // 計算效能分數
        caps.performanceScore = this.calculatePerformanceScore(caps);
        
        return caps;
    }

    /**
     * 檢查 WebGPU 支援
     * @returns {Promise<boolean>}
     */
    async checkWebGPU() {
        if (!navigator.gpu) return false;
        
        try {
            const adapter = await navigator.gpu.requestAdapter();
            return !!adapter;
        } catch (e) {
            return false;
        }
    }

    /**
     * 檢查 WebGL 支援
     * @returns {boolean}
     */
    checkWebGL() {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch (e) {
            return false;
        }
    }

    /**
     * 檢查 WebGL2 支援
     * @returns {boolean}
     */
    checkWebGL2() {
        try {
            const canvas = document.createElement('canvas');
            return !!canvas.getContext('webgl2');
        } catch (e) {
            return false;
        }
    }

    /**
     * 檢查 SIMD 支援
     * @returns {Promise<boolean>}
     */
    async checkSIMD() {
        try {
            // 檢查 WebAssembly SIMD
            const simdSupported = WebAssembly.validate(new Uint8Array([
                0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
                0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
                0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00,
                0x41, 0x00, 0xfd, 0x0f, 0x0b
            ]));
            return simdSupported;
        } catch (e) {
            return false;
        }
    }

    /**
     * 取得連線資訊
     * @returns {Object}
     */
    getConnectionInfo() {
        const connection = navigator.connection || 
                         navigator.mozConnection || 
                         navigator.webkitConnection;
        
        if (!connection) return { type: 'unknown', effectiveType: 'unknown' };
        
        return {
            type: connection.type || 'unknown',
            effectiveType: connection.effectiveType || 'unknown',
            downlink: connection.downlink || 0,
            rtt: connection.rtt || 0,
            saveData: connection.saveData || false
        };
    }

    /**
     * 計算效能分數
     * @param {Object} caps - 能力物件
     * @returns {number}
     */
    calculatePerformanceScore(caps) {
        let score = 0;
        
        // 硬體因素
        score += Math.min(caps.hardwareConcurrency * 10, 80);
        score += Math.min(caps.deviceMemory * 5, 40);
        
        // GPU 支援
        if (caps.webGPU) score += 50;
        else if (caps.webGL2) score += 30;
        else if (caps.webGL) score += 20;
        
        // 進階功能
        if (caps.sharedArrayBuffer) score += 20;
        if (caps.simd) score += 20;
        if (caps.threads) score += 20;
        if (caps.offscreenCanvas) score += 10;
        if (caps.atomics) score += 10;
        
        // 網路狀況
        const conn = caps.connection;
        if (conn.effectiveType === '4g') score += 10;
        else if (conn.effectiveType === '3g') score += 5;
        
        return Math.min(score, 300);
    }

    /**
     * 建立執行鏈（優先順序）
     * @returns {Array}
     */
    buildExecutionChain() {
        const chain = [];
        const caps = this.capabilities;
        
        // 最佳：Worker + WebGPU
        if (caps.webWorker && caps.webGPU) {
            chain.push({
                mode: 'worker-webgpu',
                score: 100,
                description: 'Worker with WebGPU acceleration'
            });
        }
        
        // 次佳：Worker + WASM (SIMD + Threads)
        if (caps.webWorker && caps.simd && caps.threads) {
            chain.push({
                mode: 'worker-wasm-simd-threads',
                score: 90,
                description: 'Worker with WASM SIMD and multi-threading'
            });
        }
        
        // 良好：Worker + WASM (SIMD)
        if (caps.webWorker && caps.simd) {
            chain.push({
                mode: 'worker-wasm-simd',
                score: 80,
                description: 'Worker with WASM SIMD'
            });
        }
        
        // 標準：Worker + WASM
        if (caps.webWorker) {
            chain.push({
                mode: 'worker-wasm',
                score: 70,
                description: 'Worker with basic WASM'
            });
        }
        
        // 降級：主執行緒 + WebGPU
        if (caps.webGPU) {
            chain.push({
                mode: 'main-webgpu',
                score: 60,
                description: 'Main thread with WebGPU'
            });
        }
        
        // 基礎：主執行緒 + WASM
        chain.push({
            mode: 'main-wasm',
            score: 50,
            description: 'Main thread with WASM'
        });
        
        // 按分數排序
        return chain.sort((a, b) => b.score - a.score);
    }

    /**
     * 決定最佳執行模式
     * @returns {Promise<Object>}
     */
    async determineOptimalMode() {
        const caps = this.capabilities;
        
        // 根據效能分數選擇
        if (caps.performanceScore >= 200) {
            // 高效能設備：優先使用最佳模式
            return this.executionChain[0];
        } else if (caps.performanceScore >= 100) {
            // 中等設備：平衡效能和資源
            const workerModes = this.executionChain.filter(m => m.mode.includes('worker'));
            return workerModes[Math.min(1, workerModes.length - 1)] || this.executionChain[0];
        } else {
            // 低效能設備：使用輕量模式
            const mainModes = this.executionChain.filter(m => m.mode.includes('main'));
            return mainModes[0] || this.executionChain[this.executionChain.length - 1];
        }
    }

    /**
     * 降級到下一個執行模式
     * @returns {Object}
     */
    fallbackToNextMode() {
        const currentIndex = this.executionChain.findIndex(
            m => m.mode === this.currentMode.mode
        );
        
        if (currentIndex < this.executionChain.length - 1) {
            this.currentMode = this.executionChain[currentIndex + 1];
            console.warn(`降級到執行模式: ${this.currentMode.mode}`);
            return this.currentMode;
        }
        
        console.error('已經是最低執行模式，無法再降級');
        return null;
    }

    /**
     * 記錄效能指標
     * @param {string} mode - 執行模式
     * @param {string} operation - 操作名稱
     * @param {number} duration - 持續時間
     */
    recordPerformance(mode, operation, duration) {
        const modeType = mode.includes('worker') ? 'worker' : 'main';
        
        if (!this.performanceMetrics[modeType][operation]) {
            this.performanceMetrics[modeType][operation] = [];
        }
        
        this.performanceMetrics[modeType][operation].push(duration);
        
        // 保留最近 100 筆記錄
        if (this.performanceMetrics[modeType][operation].length > 100) {
            this.performanceMetrics[modeType][operation].shift();
        }
    }

    /**
     * 取得效能統計
     * @param {string} modeType - 模式類型
     * @param {string} operation - 操作名稱
     * @returns {Object}
     */
    getPerformanceStats(modeType, operation) {
        const metrics = this.performanceMetrics[modeType]?.[operation];
        if (!metrics || metrics.length === 0) return null;
        
        const sorted = [...metrics].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        
        return {
            count: sorted.length,
            mean: sum / sorted.length,
            median: sorted[Math.floor(sorted.length / 2)],
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p95: sorted[Math.floor(sorted.length * 0.95)]
        };
    }

    /**
     * 建議是否需要調整執行模式
     * @returns {Object}
     */
    suggestModeAdjustment() {
        const workerStats = this.getPerformanceStats('worker', 'inference');
        const mainStats = this.getPerformanceStats('main', 'inference');
        
        if (!workerStats && !mainStats) {
            return { adjust: false, reason: '沒有足夠的效能資料' };
        }
        
        // 如果目前使用 Worker 但效能不佳
        if (this.currentMode.mode.includes('worker') && workerStats) {
            if (workerStats.p95 > 100 && workerStats.mean > 50) {
                return {
                    adjust: true,
                    reason: 'Worker 效能不佳',
                    suggestion: this.fallbackToNextMode()
                };
            }
        }
        
        // 如果目前使用主執行緒但可以升級
        if (this.currentMode.mode.includes('main') && mainStats) {
            if (mainStats.mean < 20 && this.capabilities.webWorker) {
                const workerMode = this.executionChain.find(m => m.mode.includes('worker'));
                if (workerMode) {
                    return {
                        adjust: true,
                        reason: '效能良好，可以使用 Worker',
                        suggestion: workerMode
                    };
                }
            }
        }
        
        return { adjust: false, reason: '目前模式運作正常' };
    }

    /**
     * 取得執行配置
     * @returns {Object}
     */
    getExecutionConfig() {
        const mode = this.currentMode;
        const config = {
            mode: mode.mode,
            useWorker: mode.mode.includes('worker'),
            useWebGPU: mode.mode.includes('webgpu'),
            useSIMD: mode.mode.includes('simd'),
            useThreads: mode.mode.includes('threads'),
            description: mode.description
        };
        
        // ONNX Runtime 配置
        if (config.useWebGPU) {
            config.executionProviders = ['webgpu', 'wasm'];
        } else {
            config.executionProviders = ['wasm'];
        }
        
        // WASM 配置
        config.wasmOptions = {
            simd: config.useSIMD,
            threads: config.useThreads,
            numThreads: config.useThreads ? Math.min(4, this.capabilities.hardwareConcurrency) : 1
        };
        
        return config;
    }

    /**
     * 生成診斷報告
     * @returns {Object}
     */
    generateReport() {
        return {
            capabilities: this.capabilities,
            executionChain: this.executionChain,
            currentMode: this.currentMode,
            performanceMetrics: {
                worker: Object.keys(this.performanceMetrics.worker).reduce((acc, key) => {
                    acc[key] = this.getPerformanceStats('worker', key);
                    return acc;
                }, {}),
                main: Object.keys(this.performanceMetrics.main).reduce((acc, key) => {
                    acc[key] = this.getPerformanceStats('main', key);
                    return acc;
                }, {})
            },
            recommendation: this.suggestModeAdjustment()
        };
    }
}