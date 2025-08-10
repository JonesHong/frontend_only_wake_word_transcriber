/**
 * Model Preloader - 優化模型載入速度
 */

class ModelPreloader {
    constructor() {
        this.preloadedUrls = new Set();
        this.preloadPromises = new Map();
        this.loadingStatus = new Map();
    }

    /**
     * 預載入模型文件（使用 link prefetch）
     */
    prefetchModel(modelPath) {
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
        const files = [
            `${modelPath}/onnx/encoder_model_quantized.onnx`,
            `${modelPath}/onnx/decoder_model_merged_quantized.onnx`,
            `${modelPath}/config.json`,
            `${modelPath}/tokenizer.json`
        ];

        files.forEach(file => {
            const fullUrl = baseUrl + file;
            if (!this.preloadedUrls.has(fullUrl)) {
                // 創建 link prefetch 標籤
                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.href = fullUrl;
                link.as = 'fetch';
                link.crossOrigin = 'anonymous';
                document.head.appendChild(link);
                this.preloadedUrls.add(fullUrl);
                
                console.log(`[ModelPreloader] Prefetching: ${file}`);
            }
        });
    }

    /**
     * 預載入模型文件（使用 fetch 並快取）
     */
    async preloadModelWithCache(modelPath) {
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
        const files = [
            `${modelPath}/onnx/encoder_model_quantized.onnx`,
            `${modelPath}/onnx/decoder_model_merged_quantized.onnx`,
            `${modelPath}/config.json`,
            `${modelPath}/tokenizer.json`,
            `${modelPath}/tokenizer_config.json`,
            `${modelPath}/generation_config.json`
        ];

        const promises = [];
        
        for (const file of files) {
            const fullUrl = baseUrl + file;
            
            if (this.preloadPromises.has(fullUrl)) {
                promises.push(this.preloadPromises.get(fullUrl));
                continue;
            }

            const promise = this.fetchWithRetry(fullUrl, file);
            this.preloadPromises.set(fullUrl, promise);
            promises.push(promise);
        }

        try {
            await Promise.all(promises);
            console.log(`[ModelPreloader] All files preloaded for ${modelPath}`);
            return true;
        } catch (error) {
            console.error(`[ModelPreloader] Failed to preload some files:`, error);
            return false;
        }
    }

    /**
     * 使用重試機制的 fetch
     */
    async fetchWithRetry(url, fileName, retries = 3) {
        this.loadingStatus.set(fileName, { status: 'loading', progress: 0 });
        
        for (let i = 0; i < retries; i++) {
            try {
                console.log(`[ModelPreloader] Loading ${fileName} (attempt ${i + 1}/${retries})`);
                
                const startTime = Date.now();
                const response = await fetch(url, {
                    method: 'GET',
                    cache: 'force-cache', // 強制使用快取
                    mode: 'cors',
                    credentials: 'omit'
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                // 獲取內容長度
                const contentLength = response.headers.get('content-length');
                const total = parseInt(contentLength, 10);
                
                // 如果有內容長度，追蹤下載進度
                if (total) {
                    const reader = response.body.getReader();
                    const chunks = [];
                    let received = 0;

                    while (true) {
                        const { done, value } = await reader.read();
                        
                        if (done) break;
                        
                        chunks.push(value);
                        received += value.length;
                        
                        const progress = (received / total) * 100;
                        this.loadingStatus.set(fileName, { status: 'loading', progress });
                        
                        // 發送進度事件
                        window.dispatchEvent(new CustomEvent('modelLoadProgress', {
                            detail: { fileName, progress, received, total }
                        }));
                    }

                    const loadTime = Date.now() - startTime;
                    console.log(`[ModelPreloader] Loaded ${fileName} (${(total / 1024 / 1024).toFixed(2)}MB) in ${loadTime}ms`);
                    
                    this.loadingStatus.set(fileName, { status: 'completed', progress: 100 });
                    return new Blob(chunks);
                } else {
                    // 沒有內容長度，直接讀取
                    const blob = await response.blob();
                    const loadTime = Date.now() - startTime;
                    console.log(`[ModelPreloader] Loaded ${fileName} in ${loadTime}ms`);
                    
                    this.loadingStatus.set(fileName, { status: 'completed', progress: 100 });
                    return blob;
                }
            } catch (error) {
                console.warn(`[ModelPreloader] Failed to load ${fileName} (attempt ${i + 1}/${retries}):`, error);
                
                if (i === retries - 1) {
                    this.loadingStatus.set(fileName, { status: 'failed', error: error.message });
                    throw error;
                }
                
                // 等待後重試
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }

    /**
     * 檢查模型是否已預載入
     */
    isPreloaded(modelPath) {
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
        const criticalFiles = [
            `${modelPath}/onnx/encoder_model_quantized.onnx`,
            `${modelPath}/onnx/decoder_model_merged_quantized.onnx`
        ];

        return criticalFiles.every(file => {
            const fullUrl = baseUrl + file;
            return this.preloadPromises.has(fullUrl);
        });
    }

    /**
     * 獲取載入狀態
     */
    getLoadingStatus() {
        const statuses = [];
        this.loadingStatus.forEach((status, fileName) => {
            statuses.push({ fileName, ...status });
        });
        return statuses;
    }

    /**
     * 清除預載入快取
     */
    clear() {
        this.preloadedUrls.clear();
        this.preloadPromises.clear();
        this.loadingStatus.clear();
    }
}

// 創建全局實例
window.ModelPreloader = new ModelPreloader();

// 自動預載入預設模型
document.addEventListener('DOMContentLoaded', async () => {
    // 檢測是否在 GitHub Pages
    const isGitHubPages = window.location.hostname.includes('github') || 
                         window.location.hostname.includes('github.io');
    
    if (isGitHubPages) {
        console.log('[ModelPreloader] Detected GitHub Pages, starting prefetch...');
        
        // 預載入最常用的模型
        const modelsToPreload = [
            'models/huggingface/Xenova/whisper-tiny',
            'models/huggingface/Xenova/whisper-base'
        ];
        
        // 使用 prefetch 預載入（瀏覽器空閒時載入）
        modelsToPreload.forEach(model => {
            window.ModelPreloader.prefetchModel(model);
        });
        
        // 延遲主動預載入（給主要資源載入優先權）
        setTimeout(async () => {
            console.log('[ModelPreloader] Starting active preload...');
            
            // 如果用戶還沒有開始使用，主動預載入第一個模型
            if (window.Config && window.Config.models.whisper.default) {
                const defaultModel = window.Config.models.whisper.default;
                const modelInfo = window.Config.getModelInfo('whisper', defaultModel);
                
                if (modelInfo && modelInfo.path) {
                    await window.ModelPreloader.preloadModelWithCache(modelInfo.path);
                }
            }
        }, 5000); // 5 秒後開始
    }
});

// 監聽載入進度
window.addEventListener('modelLoadProgress', (event) => {
    const { fileName, progress, received, total } = event.detail;
    
    // 可以在這裡更新 UI 顯示載入進度
    if (window.Logger) {
        const receivedMB = (received / 1024 / 1024).toFixed(2);
        const totalMB = (total / 1024 / 1024).toFixed(2);
        
        if (progress < 100) {
            // 使用 debug 級別避免過多日誌
            if (progress % 10 === 0) {
                window.Logger.debug(`載入 ${fileName}: ${progress.toFixed(0)}% (${receivedMB}/${totalMB}MB)`);
            }
        }
    }
});