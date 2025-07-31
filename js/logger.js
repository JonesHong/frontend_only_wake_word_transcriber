// 日誌系統模組
class LoggerSystem {
    constructor() {
        this.logs = [];
        this.maxLogs = 500;
        this.isVisible = false;
        this.updateTimer = null;
        this.pendingLogs = [];
        
        // 日誌類型配色
        this.typeColors = {
            LOG: '#6c757d',
            ERROR: '#dc3545',
            WARN: '#ffc107',
            STATE: '#0066cc',
            EVENT: '#28a745'
        };
        
        // 儲存原始 console 方法
        this.originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn
        };
        
        // 視窗位置和大小
        this.windowState = this.loadWindowState();
        
        // 初始化
        this.init();
    }
    
    init() {
        // 攔截 console 方法
        this.interceptConsole();
        
        // 建立 UI 元素
        this.createUI();
        
        // 綁定事件
        this.bindEvents();
        
        // 記錄初始化
        const initMsg = window.i18n ? window.i18n.t('log.logSystemInit') : '日誌系統初始化完成';
        this.log(initMsg, 'LOG');
    }
    
    interceptConsole() {
        // 攔截 console.log
        console.log = (...args) => {
            this.originalConsole.log(...args);
            this.log(args.join(' '), 'LOG');
        };
        
        // 攔截 console.error
        console.error = (...args) => {
            this.originalConsole.error(...args);
            this.log(args.join(' '), 'ERROR');
        };
        
        // 攔截 console.warn
        console.warn = (...args) => {
            this.originalConsole.warn(...args);
            this.log(args.join(' '), 'WARN');
        };
    }
    
    log(message, type = 'LOG', details = null) {
        const entry = {
            timestamp: new Date(),
            type: type,
            message: message,
            details: details
        };
        
        // 加入日誌
        this.logs.push(entry);
        this.pendingLogs.push(entry);
        
        // 限制日誌數量
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // 批次更新 UI
        this.scheduleUpdate();
        
        // 如果有新的錯誤或警告，顯示提示
        if ((type === 'ERROR' || type === 'WARN') && !this.isVisible) {
            this.showNotification();
        }
    }
    
    scheduleUpdate() {
        if (this.updateTimer) return;
        
        this.updateTimer = setTimeout(() => {
            this.updateUI();
            this.updateTimer = null;
        }, 100);
    }
    
    updateUI() {
        if (!this.isVisible || this.pendingLogs.length === 0) return;
        
        const container = document.getElementById('logContent');
        if (!container) return;
        
        // 批次加入新日誌
        const fragment = document.createDocumentFragment();
        
        this.pendingLogs.forEach(entry => {
            const logElement = this.createLogElement(entry);
            fragment.appendChild(logElement);
        });
        
        container.appendChild(fragment);
        this.pendingLogs = [];
        
        // 自動捲動到底部
        container.scrollTop = container.scrollHeight;
    }
    
    createLogElement(entry) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.style.cssText = `
            padding: 4px 8px;
            border-bottom: 1px solid #e9ecef;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 12px;
            line-height: 1.4;
            animation: fadeIn 0.3s ease;
        `;
        
        const time = entry.timestamp.toLocaleTimeString('zh-TW');
        const color = this.typeColors[entry.type] || '#6c757d';
        
        div.innerHTML = `
            <span style="color: #6c757d">[${time}]</span>
            <span style="color: ${color}; font-weight: bold">[${entry.type}]</span>
            <span>${this.escapeHtml(entry.message)}</span>
        `;
        
        return div;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    createUI() {
        // 建立懸浮按鈕
        const floatButton = document.createElement('button');
        floatButton.id = 'logFloatButton';
        floatButton.innerHTML = '📋';
        floatButton.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 20px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #0066cc 0%, #004499 100%);
            color: white;
            border: none;
            box-shadow: 0 4px 16px rgba(0, 102, 204, 0.4);
            cursor: pointer;
            z-index: 9998;
            font-size: 24px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // 建立日誌視窗
        const logWindow = document.createElement('div');
        logWindow.id = 'logWindow';
        logWindow.style.cssText = `
            position: fixed;
            right: ${this.windowState.right}px;
            bottom: ${this.windowState.bottom}px;
            width: ${this.windowState.width}px;
            height: ${this.windowState.height}px;
            background: var(--log-window-bg, rgba(255, 255, 255, 0.95));
            backdrop-filter: blur(10px);
            border: 1px solid var(--log-window-border, rgba(255, 255, 255, 0.3));
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            display: none;
            flex-direction: column;
            min-width: 300px;
            min-height: 200px;
            max-width: 800px;
            max-height: 600px;
        `;
        
        logWindow.innerHTML = `
            <div id="logHeader" style="
                padding: 10px;
                border-radius: 8px 8px 0 0;
                cursor: move;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <span style="font-weight: 600;" data-i18n="logger.title">日誌記錄</span>
                <div>
                    <button id="logClear" style="
                        background: none;
                        border: none;
                        color: #6c757d;
                        cursor: pointer;
                        padding: 4px 8px;
                        margin: 0 2px;
                    " data-i18n="logger.clear">清空</button>
                    <button id="logClose" style="
                        background: none;
                        border: none;
                        color: #6c757d;
                        cursor: pointer;
                        font-size: 20px;
                        line-height: 1;
                        padding: 0 4px;
                    " data-i18n="logger.close">×</button>
                </div>
            </div>
            <div id="logContent" style="
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            "></div>
            <div id="logResize" style="
                position: absolute;
                right: 0;
                bottom: 0;
                width: 20px;
                height: 20px;
                cursor: se-resize;
                background: linear-gradient(135deg, transparent 50%, #dee2e6 50%);
                border-radius: 0 0 8px 0;
            "></div>
        `;
        
        // 加入 CSS 動畫
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse-logger {
                0% { 
                    transform: scale(1);
                    box-shadow: 0 4px 16px rgba(0, 102, 204, 0.4);
                }
                50% { 
                    transform: scale(1.08);
                    box-shadow: 0 6px 20px rgba(0, 102, 204, 0.6);
                }
                100% { 
                    transform: scale(1);
                    box-shadow: 0 4px 16px rgba(0, 102, 204, 0.4);
                }
            }
            
            @keyframes fadeIn {
                from { 
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to { 
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            #logFloatButton:hover {
                transform: scale(1.1) rotate(10deg);
                box-shadow: 0 6px 20px rgba(0, 102, 204, 0.5);
            }
            
            #logFloatButton.has-notification {
                animation: pulse-logger 1s infinite;
                background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
            }
            
            #logClear:hover {
                background: #e9ecef !important;
                border-radius: 4px;
            }
            
            #logClose:hover {
                color: #dc3545 !important;
            }
            
            .log-entry:hover {
                background: #f8f9fa;
            }
        `;
        document.head.appendChild(style);
        
        // 加入 DOM
        document.body.appendChild(floatButton);
        document.body.appendChild(logWindow);
    }
    
    bindEvents() {
        const floatButton = document.getElementById('logFloatButton');
        const logWindow = document.getElementById('logWindow');
        const logHeader = document.getElementById('logHeader');
        const logClose = document.getElementById('logClose');
        const logClear = document.getElementById('logClear');
        const logResize = document.getElementById('logResize');
        
        // 懸浮按鈕點擊
        floatButton.addEventListener('click', () => {
            this.toggleWindow();
        });
        
        // 關閉按鈕
        logClose.addEventListener('click', () => {
            this.hideWindow();
        });
        
        // 清空按鈕
        logClear.addEventListener('click', () => {
            this.clearLogs();
        });
        
        // 拖動功能
        this.setupDragging(logHeader, logWindow);
        
        // 調整大小功能
        this.setupResizing(logResize, logWindow);
    }
    
    setupDragging(handle, element) {
        let isDragging = false;
        let startX, startY, startRight, startBottom;
        
        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startRight = parseInt(element.style.right);
            startBottom = parseInt(element.style.bottom);
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        const onMouseMove = (e) => {
            if (!isDragging) return;
            
            const deltaX = startX - e.clientX;
            const deltaY = startY - e.clientY;
            
            const newRight = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, startRight + deltaX));
            const newBottom = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, startBottom + deltaY));
            
            element.style.right = newRight + 'px';
            element.style.bottom = newBottom + 'px';
        };
        
        const onMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // 儲存位置
            this.saveWindowState();
        };
    }
    
    setupResizing(handle, element) {
        let isResizing = false;
        let startX, startY, startWidth, startHeight;
        
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(element.style.width);
            startHeight = parseInt(element.style.height);
            
            e.stopPropagation();
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        const onMouseMove = (e) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            const newWidth = Math.max(300, Math.min(800, startWidth + deltaX));
            const newHeight = Math.max(200, Math.min(600, startHeight + deltaY));
            
            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
        };
        
        const onMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // 儲存大小
            this.saveWindowState();
        };
    }
    
    toggleWindow() {
        if (this.isVisible) {
            this.hideWindow();
        } else {
            this.showWindow();
        }
    }
    
    showWindow() {
        const logWindow = document.getElementById('logWindow');
        const floatButton = document.getElementById('logFloatButton');
        
        logWindow.style.display = 'flex';
        floatButton.classList.remove('has-notification');
        this.isVisible = true;
        
        // 應用當前主題
        if (window.themeManager && window.themeManager.currentTheme === 'dark') {
            logWindow.classList.add('dark');
        } else {
            logWindow.classList.remove('dark');
        }
        
        // 更新所有待顯示的日誌
        this.pendingLogs = [...this.logs];
        this.updateUI();
        
        // 更新多語言文字
        if (window.i18n) {
            window.i18n.updatePageTranslations();
        }
    }
    
    hideWindow() {
        const logWindow = document.getElementById('logWindow');
        this.isVisible = false;
        logWindow.style.display = 'none';
    }
    
    clearLogs() {
        this.logs = [];
        this.pendingLogs = [];
        const container = document.getElementById('logContent');
        if (container) {
            container.innerHTML = '';
        }
        const clearMsg = window.i18n ? window.i18n.t('log.logsCleared') : '日誌已清空';
        this.log(clearMsg, 'LOG');
    }
    
    showNotification() {
        const floatButton = document.getElementById('logFloatButton');
        floatButton.classList.add('has-notification');
    }
    
    saveWindowState() {
        const logWindow = document.getElementById('logWindow');
        this.windowState = {
            right: parseInt(logWindow.style.right),
            bottom: parseInt(logWindow.style.bottom),
            width: parseInt(logWindow.style.width),
            height: parseInt(logWindow.style.height)
        };
        localStorage.setItem('logWindowState', JSON.stringify(this.windowState));
    }
    
    loadWindowState() {
        const saved = localStorage.getItem('logWindowState');
        if (saved) {
            return JSON.parse(saved);
        }
        return {
            right: 20,
            bottom: 20,
            width: 400,
            height: 300
        };
    }
    
    // 公開方法
    logState(oldState, newState) {
        this.log(`${oldState} → ${newState}`, 'STATE');
    }
    
    logEvent(eventName, details = null) {
        this.log(eventName, 'EVENT', details);
    }
}

// 建立全域實例
window.logger = new LoggerSystem();