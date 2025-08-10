/**
 * Model Loading UI - 顯示模型載入進度
 */

class ModelLoadingUI {
    constructor() {
        this.container = null;
        this.progressBars = new Map();
        this.isVisible = false;
        this.createUI();
    }

    createUI() {
        // 創建容器
        this.container = document.createElement('div');
        this.container.id = 'model-loading-ui';
        this.container.className = 'fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 min-w-80 hidden z-50';
        this.container.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    <i class="fas fa-download mr-2"></i>模型載入中
                </h3>
                <button id="close-loading-ui" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="loading-progress-list" class="space-y-2">
                <!-- 進度條將動態加入這裡 -->
            </div>
            <div id="loading-status" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                準備載入模型...
            </div>
        `;

        // 添加到頁面
        document.body.appendChild(this.container);

        // 綁定關閉按鈕
        document.getElementById('close-loading-ui').addEventListener('click', () => {
            this.hide();
        });

        // 監聽載入進度事件
        window.addEventListener('modelLoadProgress', (event) => {
            this.updateProgress(event.detail);
        });

        // 監聽模型載入開始/完成事件
        window.addEventListener('modelLoadStart', (event) => {
            this.show();
            this.setStatus('開始載入模型...');
        });

        window.addEventListener('modelLoadComplete', (event) => {
            this.setStatus('模型載入完成！');
            setTimeout(() => this.hide(), 3000);
        });
    }

    show() {
        if (!this.isVisible) {
            this.container.classList.remove('hidden');
            this.isVisible = true;
        }
    }

    hide() {
        if (this.isVisible) {
            this.container.classList.add('hidden');
            this.isVisible = false;
            // 清空進度條
            this.progressBars.clear();
            document.getElementById('loading-progress-list').innerHTML = '';
        }
    }

    updateProgress(details) {
        const { fileName, progress, received, total } = details;
        
        // 顯示 UI
        this.show();

        // 獲取或創建進度條
        if (!this.progressBars.has(fileName)) {
            this.createProgressBar(fileName);
        }

        const bar = this.progressBars.get(fileName);
        if (bar) {
            // 更新進度條
            bar.progress.style.width = `${progress}%`;
            bar.progressText.textContent = `${progress.toFixed(0)}%`;
            
            // 更新文件大小資訊
            if (total) {
                const receivedMB = (received / 1024 / 1024).toFixed(1);
                const totalMB = (total / 1024 / 1024).toFixed(1);
                bar.sizeText.textContent = `${receivedMB}/${totalMB}MB`;
            }

            // 完成時改變顏色
            if (progress >= 100) {
                bar.progress.classList.remove('bg-blue-500');
                bar.progress.classList.add('bg-green-500');
                bar.statusIcon.className = 'fas fa-check-circle text-green-500';
            }
        }
    }

    createProgressBar(fileName) {
        const list = document.getElementById('loading-progress-list');
        
        // 創建進度條元素
        const item = document.createElement('div');
        item.className = 'bg-gray-50 dark:bg-gray-700 rounded p-2';
        
        // 簡化文件名顯示
        const displayName = fileName.split('/').pop();
        
        item.innerHTML = `
            <div class="flex items-center justify-between mb-1">
                <div class="flex items-center">
                    <i class="fas fa-spinner fa-spin text-blue-500 mr-2 status-icon"></i>
                    <span class="text-xs font-medium text-gray-700 dark:text-gray-300">${displayName}</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="text-xs text-gray-500 dark:text-gray-400 size-text"></span>
                    <span class="text-xs font-semibold text-gray-700 dark:text-gray-300 progress-text">0%</span>
                </div>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                <div class="bg-blue-500 h-2 rounded-full transition-all duration-300 progress-bar" style="width: 0%"></div>
            </div>
        `;
        
        list.appendChild(item);

        // 保存引用
        this.progressBars.set(fileName, {
            element: item,
            progress: item.querySelector('.progress-bar'),
            progressText: item.querySelector('.progress-text'),
            sizeText: item.querySelector('.size-text'),
            statusIcon: item.querySelector('.status-icon')
        });
    }

    setStatus(message) {
        const statusElement = document.getElementById('loading-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }
}

// 創建全局實例
document.addEventListener('DOMContentLoaded', () => {
    // 暫時停用右下角的載入視窗，避免與全螢幕載入提示重複
    // window.ModelLoadingUI = new ModelLoadingUI();
    
    // 添加必要的樣式
    if (!document.getElementById('model-loading-ui-styles')) {
        const style = document.createElement('style');
        style.id = 'model-loading-ui-styles';
        style.textContent = `
            #model-loading-ui {
                transition: opacity 0.3s ease-in-out;
                max-height: 400px;
                overflow-y: auto;
            }
            
            #model-loading-ui::-webkit-scrollbar {
                width: 6px;
            }
            
            #model-loading-ui::-webkit-scrollbar-track {
                background: transparent;
            }
            
            #model-loading-ui::-webkit-scrollbar-thumb {
                background-color: rgba(156, 163, 175, 0.5);
                border-radius: 3px;
            }
            
            #model-loading-ui::-webkit-scrollbar-thumb:hover {
                background-color: rgba(156, 163, 175, 0.7);
            }
            
            @media (max-width: 640px) {
                #model-loading-ui {
                    left: 1rem;
                    right: 1rem;
                    bottom: 1rem;
                    min-width: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }
});