// 深色模式管理
class ThemeManager {
    constructor() {
        this.themeToggle = null;
        this.currentTheme = 'light';
        this.init();
    }
    
    init() {
        // 等待 DOM 載入完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }
    
    setup() {
        this.themeToggle = document.getElementById('themeToggle');
        if (!this.themeToggle) return;
        
        // 從 localStorage 讀取主題設定
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            this.currentTheme = savedTheme;
        } else {
            // 檢測系統偏好
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.currentTheme = prefersDark ? 'dark' : 'light';
        }
        
        // 應用主題
        this.applyTheme();
        
        // 綁定切換事件
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        
        // 監聽系統主題變更
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                this.currentTheme = e.matches ? 'dark' : 'light';
                this.applyTheme();
            }
        });
    }
    
    applyTheme() {
        if (this.currentTheme === 'dark') {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark');
        }
        
        // 更新日誌視窗
        const logWindow = document.getElementById('logWindow');
        if (logWindow) {
            if (this.currentTheme === 'dark') {
                logWindow.classList.add('dark');
            } else {
                logWindow.classList.remove('dark');
            }
        }
        
        // 更新設定視窗
        const settingsWindow = document.getElementById('settingsWindow');
        if (settingsWindow) {
            if (this.currentTheme === 'dark') {
                settingsWindow.classList.add('dark');
            } else {
                settingsWindow.classList.remove('dark');
            }
        }
        
        // 更新圖表顏色
        this.updateChartColors();
        
        // 記錄主題變更
        if (window.logger) {
            window.logger.logEvent('主題切換', { theme: this.currentTheme });
        }
    }
    
    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.currentTheme);
        this.applyTheme();
        
        // 添加切換動畫
        this.animateToggle();
    }
    
    animateToggle() {
        if (!this.themeToggle) return;
        
        this.themeToggle.style.transform = 'rotate(180deg)';
        setTimeout(() => {
            this.themeToggle.style.transform = 'rotate(0deg)';
        }, 300);
    }
    
    updateChartColors() {
        // 更新視覺化圖表的顏色
        if (window.visualizer) {
            const isDark = this.currentTheme === 'dark';
            
            // 更新波形圖顏色
            if (window.visualizer.waveformCanvas) {
                const ctx = window.visualizer.waveformCanvas.getContext('2d');
                ctx.fillStyle = isDark ? '#1a1a1a' : '#ffffff';
                ctx.strokeStyle = isDark ? '#60a5fa' : '#3b82f6';
            }
            
            // 更新喚醒詞圖表顏色
            if (window.visualizer.wakewordCanvas) {
                const ctx = window.visualizer.wakewordCanvas.getContext('2d');
                ctx.fillStyle = isDark ? '#1a1a1a' : '#ffffff';
            }
            
            // 強制重繪
            if (window.visualizer.draw) {
                window.visualizer.draw();
            }
        }
    }
    
    // 獲取當前主題
    getCurrentTheme() {
        return this.currentTheme;
    }
    
    // 檢查是否為深色模式
    isDarkMode() {
        return this.currentTheme === 'dark';
    }
}

// 建立全域實例
window.themeManager = new ThemeManager();