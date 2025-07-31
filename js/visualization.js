// 視覺化元件模組
class Visualizer {
    constructor() {
        // 音波圖設定
        this.waveformCanvas = null;
        this.waveformCtx = null;
        this.waveformData = new Array(100).fill(0);
        
        // 喚醒詞分數圖設定
        this.wakewordCanvas = null;
        this.wakewordCtx = null;
        this.wakewordHistory = new Array(50).fill(0);
        
        // 動畫相關
        this.animationId = null;
        this.isRunning = false;
    }
    
    initialize() {
        // 取得 Canvas 元素
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.wakewordCanvas = document.getElementById('wakewordCanvas');
        
        if (!this.waveformCanvas || !this.wakewordCanvas) {
            console.error('找不到視覺化 Canvas 元素');
            return false;
        }
        
        // 取得繪圖上下文
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        this.wakewordCtx = this.wakewordCanvas.getContext('2d');
        
        // 設定 Canvas 大小
        this.resizeCanvases();
        
        // 監聽視窗大小改變
        window.addEventListener('resize', () => this.resizeCanvases());
        
        console.log('視覺化元件初始化完成');
        return true;
    }
    
    resizeCanvases() {
        // 設定實際像素大小
        const waveformRect = this.waveformCanvas.getBoundingClientRect();
        this.waveformCanvas.width = waveformRect.width * window.devicePixelRatio;
        this.waveformCanvas.height = waveformRect.height * window.devicePixelRatio;
        this.waveformCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        const wakewordRect = this.wakewordCanvas.getBoundingClientRect();
        this.wakewordCanvas.width = wakewordRect.width * window.devicePixelRatio;
        this.wakewordCanvas.height = wakewordRect.height * window.devicePixelRatio;
        this.wakewordCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    
    start() {
        this.isRunning = true;
        this.animate();
    }
    
    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // 清空畫布
        this.clearCanvases();
    }
    
    animate() {
        if (!this.isRunning) return;
        
        // 繪製音波圖
        this.drawWaveform();
        
        // 繪製喚醒詞分數圖
        this.drawWakewordScore();
        
        // 下一幀
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    updateWaveform(audioData) {
        if (!audioData || audioData.length === 0) return;
        
        // 計算音量 RMS (Root Mean Square)
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        const rms = Math.sqrt(sum / audioData.length);
        
        // 更新波形資料（標準化到 0-1）
        this.waveformData.shift();
        this.waveformData.push(Math.min(rms * 10, 1)); // 放大顯示
    }
    
    updateWakewordScore(score, history) {
        // 如果提供了完整歷史，直接使用
        if (history && history.length > 0) {
            this.wakewordHistory = [...history];
        } else if (score !== undefined) {
            // 否則只更新最新分數
            this.wakewordHistory.shift();
            this.wakewordHistory.push(score);
        }
    }
    
    drawWaveform() {
        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width / window.devicePixelRatio;
        const height = this.waveformCanvas.height / window.devicePixelRatio;
        
        // 檢查是否為深色模式
        const isDark = window.themeManager && window.themeManager.isDarkMode();
        
        // 清空畫布
        ctx.clearRect(0, 0, width, height);
        
        // 背景
        ctx.fillStyle = isDark ? '#1a1a1a' : '#f8f8f8';
        ctx.fillRect(0, 0, width, height);
        
        // 中線
        ctx.strokeStyle = isDark ? '#3a3a3a' : '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        
        // 繪製波形
        ctx.strokeStyle = isDark ? '#60a5fa' : '#007aff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const dataPoints = this.waveformData.length;
        const xStep = width / (dataPoints - 1);
        
        for (let i = 0; i < dataPoints; i++) {
            const x = i * xStep;
            const amplitude = this.waveformData[i];
            const y = height / 2 - (amplitude * height * 0.4); // 40% 最大振幅
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // 繪製下半部分（鏡像）
        ctx.beginPath();
        for (let i = 0; i < dataPoints; i++) {
            const x = i * xStep;
            const amplitude = this.waveformData[i];
            const y = height / 2 + (amplitude * height * 0.4);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }
    
    drawWakewordScore() {
        const ctx = this.wakewordCtx;
        const width = this.wakewordCanvas.width / window.devicePixelRatio;
        const height = this.wakewordCanvas.height / window.devicePixelRatio;
        
        // 檢查是否為深色模式
        const isDark = window.themeManager && window.themeManager.isDarkMode();
        
        // 清空畫布
        ctx.clearRect(0, 0, width, height);
        
        // 背景
        ctx.fillStyle = isDark ? '#1a1a1a' : '#f8f8f8';
        ctx.fillRect(0, 0, width, height);
        
        // 網格線
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5;
        
        // 水平線 (0.0, 0.25, 0.5, 0.75, 1.0)
        for (let i = 0; i <= 4; i++) {
            const y = height - (i * height / 4);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            // 標籤
            ctx.fillStyle = '#666';
            ctx.font = '11px sans-serif';
            ctx.fillText((i * 0.25).toFixed(2), 5, y - 3);
        }
        
        // 閾值線 (0.5)
        ctx.strokeStyle = isDark ? '#ef4444' : '#ff3b30';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 繪製分數曲線
        ctx.strokeStyle = isDark ? '#60a5fa' : '#007aff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const dataPoints = this.wakewordHistory.length;
        const xStep = width / (dataPoints - 1);
        
        for (let i = 0; i < dataPoints; i++) {
            const x = i * xStep;
            const score = this.wakewordHistory[i];
            const y = height - (score * height);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // 繪製最新分數點
        const lastScore = this.wakewordHistory[dataPoints - 1];
        const lastX = width;
        const lastY = height - (lastScore * height);
        
        ctx.fillStyle = lastScore > 0.5 ? (isDark ? '#4ade80' : '#34c759') : (isDark ? '#60a5fa' : '#007aff');
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // 顯示當前分數
        ctx.fillStyle = isDark ? '#e5e5ea' : '#333';
        ctx.font = 'bold 14px sans-serif';
        const currentText = window.i18n ? window.i18n.t('ui.current') : '當前';
        ctx.fillText(`${currentText}: ${lastScore.toFixed(3)}`, width - 80, 20);
    }
    
    clearCanvases() {
        // 清空音波圖
        if (this.waveformCtx) {
            const width = this.waveformCanvas.width / window.devicePixelRatio;
            const height = this.waveformCanvas.height / window.devicePixelRatio;
            this.waveformCtx.clearRect(0, 0, width, height);
        }
        
        // 清空喚醒詞分數圖
        if (this.wakewordCtx) {
            const width = this.wakewordCanvas.width / window.devicePixelRatio;
            const height = this.wakewordCanvas.height / window.devicePixelRatio;
            this.wakewordCtx.clearRect(0, 0, width, height);
        }
    }
    
    // 更新 VAD 狀態指示器
    updateVADStatus(isActive) {
        const vadIndicator = document.getElementById('vadStatus');
        if (vadIndicator) {
            if (isActive) {
                vadIndicator.classList.add('active');
                vadIndicator.classList.remove('inactive');
            } else {
                vadIndicator.classList.remove('active');
                vadIndicator.classList.add('inactive');
            }
        }
    }
}

// 建立全域視覺化實例
window.visualizer = new Visualizer();