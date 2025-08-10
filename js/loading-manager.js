/**
 * Loading Manager - 管理全螢幕載入提示的顯示和更新
 */

class LoadingManager {
    constructor() {
        this.startTime = Date.now();
        this.loadingFiles = new Map();
        this.currentModel = null;
        this.updateTimer = null;
        this.isVisible = false;
        
        // DOM 元素
        this.overlay = null;
        this.loadingText = null;
        this.loadingDetails = null;
        this.currentLoadingModel = null;
        this.loadingProgressText = null;
        this.loadingSize = null;
        this.progressBar = null;
        this.loadingTime = null;
        this.loadingFilesList = null;
        
        this.init();
    }
    
    init() {
        // 取得 DOM 元素
        this.overlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');
        this.loadingDetails = document.getElementById('loadingDetails');
        this.currentLoadingModel = document.getElementById('currentLoadingModel');
        this.loadingProgressText = document.getElementById('loadingProgressText');
        this.loadingSize = document.getElementById('loadingSize');
        this.progressBar = document.querySelector('#loadingProgress .progress-bar');
        this.loadingTime = document.getElementById('loadingTime');
        this.loadingFilesList = document.getElementById('loadingFilesList');
        
        // 監聽模型載入進度事件
        window.addEventListener('modelLoadProgress', (event) => {
            this.updateProgress(event.detail);
        });
        
        // 監聽載入開始和結束事件
        window.addEventListener('modelLoadStart', (event) => {
            this.show(event.detail?.modelName || '模型');
        });
        
        window.addEventListener('modelLoadComplete', (event) => {
            this.complete();
        });
        
        // 開始更新計時器
        this.startUpdateTimer();
    }
    
    show(modelName = '') {
        this.isVisible = true;
        this.startTime = Date.now();
        this.currentModel = modelName;
        
        if (this.overlay) {
            this.overlay.classList.remove('hidden');
        }
        
        if (this.loadingDetails) {
            this.loadingDetails.classList.remove('hidden');
        }
        
        if (this.currentLoadingModel && modelName) {
            this.currentLoadingModel.textContent = modelName;
        }
        
        this.updateElapsedTime();
    }
    
    hide() {
        this.isVisible = false;
        
        if (this.overlay) {
            this.overlay.classList.add('hidden');
        }
        
        // 清理狀態
        this.loadingFiles.clear();
        this.currentModel = null;
        
        // 重置顯示
        if (this.loadingFilesList) {
            this.loadingFilesList.innerHTML = '';
        }
        
        if (this.progressBar) {
            this.progressBar.style.width = '0%';
        }
    }
    
    updateText(text) {
        if (this.loadingText) {
            this.loadingText.textContent = text;
        }
    }
    
    updateProgress(details) {
        const { fileName, progress, received, total } = details;
        
        // 顯示載入詳情
        if (this.loadingDetails && this.loadingDetails.classList.contains('hidden')) {
            this.loadingDetails.classList.remove('hidden');
        }
        
        // 更新當前載入的檔案
        const displayName = fileName.split('/').pop();
        
        // 儲存檔案載入狀態
        this.loadingFiles.set(fileName, {
            displayName,
            progress: Math.round(progress),
            received,
            total,
            status: progress >= 100 ? 'completed' : 'loading'
        });
        
        // 更新進度條和文字
        if (this.progressBar) {
            this.progressBar.style.width = `${Math.min(progress, 100)}%`;
        }
        
        if (this.loadingProgressText) {
            this.loadingProgressText.textContent = `${Math.round(progress)}%`;
        }
        
        if (this.loadingSize && total) {
            const receivedMB = (received / 1024 / 1024).toFixed(1);
            const totalMB = (total / 1024 / 1024).toFixed(1);
            this.loadingSize.textContent = `${receivedMB} / ${totalMB} MB`;
        }
        
        // 更新當前載入的模型名稱
        if (this.currentLoadingModel) {
            this.currentLoadingModel.textContent = displayName;
        }
        
        // 更新檔案列表
        this.updateFilesList();
    }
    
    updateFilesList() {
        if (!this.loadingFilesList) return;
        
        let html = '';
        this.loadingFiles.forEach((file, path) => {
            const iconClass = file.status === 'completed' ? 'fa-check-circle text-green-500' : 'fa-spinner fa-spin text-blue-500';
            const textClass = file.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-600 dark:text-gray-400';
            
            html += `
                <div class="flex items-center justify-between px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded">
                    <div class="flex items-center space-x-2">
                        <i class="fas ${iconClass} text-xs"></i>
                        <span class="${textClass}">${file.displayName}</span>
                    </div>
                    <span class="text-gray-400 text-xs">${file.progress}%</span>
                </div>
            `;
        });
        
        this.loadingFilesList.innerHTML = html;
    }
    
    updateElapsedTime() {
        if (!this.loadingTime || !this.isVisible) return;
        
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        if (minutes > 0) {
            this.loadingTime.textContent = `${minutes}分${seconds}秒`;
        } else {
            this.loadingTime.textContent = `${seconds}秒`;
        }
    }
    
    startUpdateTimer() {
        // 每秒更新一次時間
        this.updateTimer = setInterval(() => {
            if (this.isVisible) {
                this.updateElapsedTime();
            }
        }, 1000);
    }
    
    stopUpdateTimer() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }
    
    complete() {
        // 顯示完成訊息
        this.updateText('載入完成！');
        
        if (this.progressBar) {
            this.progressBar.style.width = '100%';
        }
        
        if (this.loadingProgressText) {
            this.loadingProgressText.textContent = '100%';
        }
        
        // 標記所有檔案為完成
        this.loadingFiles.forEach((file) => {
            file.status = 'completed';
            file.progress = 100;
        });
        
        this.updateFilesList();
        
        // 延遲隱藏
        setTimeout(() => {
            this.hide();
        }, 1500);
    }
    
    setProgress(percent) {
        if (this.progressBar) {
            this.progressBar.style.width = `${Math.min(percent, 100)}%`;
        }
        
        if (this.loadingProgressText) {
            this.loadingProgressText.textContent = `${Math.round(percent)}%`;
        }
    }
}

// 創建全局實例
window.LoadingManager = new LoadingManager();

// 導出給模組系統使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingManager;
}