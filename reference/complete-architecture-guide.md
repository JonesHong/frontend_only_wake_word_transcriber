# 完整架構優化指南：Web Worker + 混合式語音識別

## 📋 目錄

1. [架構概述](#架構概述)
2. [核心設計理念](#核心設計理念)
3. [架構層級](#架構層級)
4. [實作細節](#實作細節)
5. [遷移策略](#遷移策略)
6. [效能優化](#效能優化)
7. [部署配置](#部署配置)

## 架構概述

本架構提供完整的彈性配置，支援多層級的選擇：

### 🎯 雙重彈性設計

1. **ML 模型執行位置**
   - **Web Worker**（預設）：最佳效能，UI 不阻塞
   - **主執行緒**：簡單除錯，適合開發階段

2. **語音識別引擎**
   - **Web Speech API**（預設）：即時串流，需要網路
   - **Whisper**：離線運作，完全本地化

### 🔄 智慧切換機制

```
┌─────────────────┐     ┌─────────────────┐
│   有網路環境    │     │   無網路環境    │
├─────────────────┤     ├─────────────────┤
│ Web Speech API  │ <-> │    Whisper      │
│   (串流優先)    │     │  (離線備援)     │
└─────────────────┘     └─────────────────┘
         ↓                       ↓
┌─────────────────────────────────────────┐
│          可選擇執行環境                  │
├─────────────────┬───────────────────────┤
│   Web Worker    │    主執行緒           │
│   (效能優先)    │    (除錯方便)         │
└─────────────────┴───────────────────────┘
```

## 核心設計理念

### 1. **漸進式增強**
- 基礎功能在所有環境可用
- 進階功能根據環境自動啟用
- 平滑降級確保可用性

### 2. **使用者優先**
- 提供清晰的控制選項
- 即時狀態回饋
- 智慧預設值

### 3. **效能最佳化**
- 運算密集任務隔離
- 資源按需載入
- 記憶體智慧管理

## 架構層級

### 📁 檔案結構

```
js/
├── workers/
│   ├── ml-inference.worker.js         # ML 推論 Worker
│   ├── audio-processor.worklet.js     # 音訊處理 Worklet
│   └── whisper-integration.worker.js  # Whisper 整合
├── modules/
│   ├── worker-manager.js              # Worker 管理器
│   ├── execution-mode-manager.js      # 執行模式管理器
│   ├── hybrid-speech-transcriber.js   # 混合式語音轉譯器
│   └── app-controller.js              # 應用程式控制器
└── config/
    └── default-settings.js            # 預設配置
```

### 🏗️ 架構圖

```
┌─────────────────────────────────────────┐
│             使用者介面 (UI)              │
├─────────────────────────────────────────┤
│          應用程式控制器                  │
│  ┌────────────┬────────────────────┐    │
│  │ 執行模式   │   語音識別引擎     │    │
│  │  管理器    │     選擇器         │    │
│  └────────────┴────────────────────┘    │
├─────────────────────────────────────────┤
│            音訊處理層                    │
│  ┌────────────────────────────────┐     │
│  │     AudioWorklet Node          │     │
│  └────────────────────────────────┘     │
├─────────────────────────────────────────┤
│            ML 處理層                     │
│  ┌─────────────┬─────────────────┐      │
│  │ Web Worker  │   主執行緒      │      │
│  │  (預設)     │   (可選)        │      │
│  └─────────────┴─────────────────┘      │
├─────────────────────────────────────────┤
│           語音識別層                     │
│  ┌─────────────┬─────────────────┐      │
│  │Web Speech   │    Whisper      │      │
│  │   API       │    (離線)       │      │
│  └─────────────┴─────────────────┘      │
└─────────────────────────────────────────┘
```

## 實作細節

### 1. 執行模式管理器

```javascript
// execution-mode-manager.js
class ExecutionModeManager {
    constructor() {
        this.mode = 'worker'; // 'worker' | 'main-thread'
        this.mlProcessor = null;
        this.isTransitioning = false;
        
        // 配置
        this.config = {
            defaultMode: 'worker',
            autoDetect: true,
            workerTimeout: 5000
        };
    }
    
    async initialize() {
        // 自動檢測最佳模式
        if (this.config.autoDetect) {
            this.mode = await this.detectBestMode();
        }
        
        // 初始化對應的處理器
        await this.initializeProcessor();
    }
    
    async detectBestMode() {
        // 檢測 Worker 支援
        if (!window.Worker) {
            console.warn('瀏覽器不支援 Web Worker，使用主執行緒模式');
            return 'main-thread';
        }
        
        // 測試 Worker 效能
        try {
            const testWorker = new Worker('/js/workers/test.worker.js');
            const startTime = performance.now();
            
            // 發送測試任務
            const result = await this.testWorkerPerformance(testWorker);
            const elapsed = performance.now() - startTime;
            
            testWorker.terminate();
            
            // 如果 Worker 回應太慢，使用主執行緒
            if (elapsed > this.config.workerTimeout) {
                console.warn('Worker 效能不佳，使用主執行緒模式');
                return 'main-thread';
            }
            
            return 'worker';
        } catch (error) {
            console.error('Worker 測試失敗:', error);
            return 'main-thread';
        }
    }
    
    async switchMode(newMode) {
        if (this.isTransitioning || newMode === this.mode) {
            return;
        }
        
        this.isTransitioning = true;
        
        try {
            // 儲存當前狀態
            const currentState = await this.saveCurrentState();
            
            // 清理當前處理器
            await this.cleanupProcessor();
            
            // 切換模式
            this.mode = newMode;
            
            // 初始化新處理器
            await this.initializeProcessor();
            
            // 恢復狀態
            await this.restoreState(currentState);
            
            // 通知 UI
            this.notifyModeChange(newMode);
            
        } finally {
            this.isTransitioning = false;
        }
    }
    
    async initializeProcessor() {
        if (this.mode === 'worker') {
            // 使用 Worker Manager
            this.mlProcessor = window.workerManager;
            await this.mlProcessor.initialize();
        } else {
            // 使用主執行緒處理器
            this.mlProcessor = new MainThreadMLProcessor();
            await this.mlProcessor.initialize();
        }
    }
}

// 主執行緒 ML 處理器（作為備選）
class MainThreadMLProcessor {
    constructor() {
        this.wakewordDetector = null;
        this.vadDetector = null;
        this.whisperModel = null;
    }
    
    async initialize() {
        // 在主執行緒載入模型
        console.log('在主執行緒初始化 ML 模型...');
        
        // 載入必要的腳本
        if (!window.ort) {
            await this.loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js');
        }
        
        // 初始化模型
        await Promise.all([
            this.initializeWakeword(),
            this.initializeVAD()
        ]);
    }
    
    async processAudioFrame(audioData) {
        // 在主執行緒處理音訊
        // 注意：這會影響 UI 效能
        const results = await Promise.all([
            this.processWakeword(audioData),
            this.processVAD(audioData)
        ]);
        
        return {
            wakeword: results[0],
            vad: results[1]
        };
    }
}
```

### 2. 混合式語音識別控制器

```javascript
// hybrid-speech-controller.js
class HybridSpeechController {
    constructor() {
        // 執行模式
        this.executionMode = 'worker'; // 'worker' | 'main-thread'
        
        // 語音引擎
        this.speechEngine = 'webspeech'; // 'webspeech' | 'whisper'
        
        // 管理器
        this.executionManager = new ExecutionModeManager();
        this.speechTranscriber = new HybridSpeechTranscriber();
        
        // 狀態
        this.state = {
            isOnline: navigator.onLine,
            isProcessing: false,
            currentEngine: null,
            currentMode: null
        };
        
        // 配置
        this.config = {
            // 執行模式設定
            preferredExecutionMode: 'worker',
            allowMainThreadFallback: true,
            
            // 語音引擎設定
            preferredSpeechEngine: 'webspeech',
            autoSwitchOnOffline: true,
            
            // Whisper 設定
            whisperModel: 'tiny',
            whisperLanguage: 'zh',
            
            // 效能設定
            processingInterval: 50,
            maxBufferSize: 10000
        };
    }
    
    async initialize() {
        console.log('初始化混合式語音控制器...');
        
        // 初始化執行模式
        await this.executionManager.initialize();
        this.executionMode = this.executionManager.mode;
        
        // 初始化語音引擎
        await this.initializeSpeechEngine();
        
        // 設定事件監聽
        this.setupEventListeners();
        
        // 更新狀態
        this.updateState();
    }
    
    setupEventListeners() {
        // 網路狀態變化
        window.addEventListener('online', () => this.handleNetworkChange(true));
        window.addEventListener('offline', () => this.handleNetworkChange(false));
        
        // 效能監控
        if (window.performance && window.performance.memory) {
            setInterval(() => this.monitorPerformance(), 5000);
        }
    }
    
    handleNetworkChange(isOnline) {
        this.state.isOnline = isOnline;
        
        if (this.config.autoSwitchOnOffline) {
            const targetEngine = isOnline ? 'webspeech' : 'whisper';
            if (targetEngine !== this.speechEngine) {
                this.switchSpeechEngine(targetEngine);
            }
        }
    }
    
    monitorPerformance() {
        if (this.executionMode !== 'worker') {
            return;
        }
        
        // 監控記憶體使用
        const memoryUsage = performance.memory.usedJSHeapSize / 1048576; // MB
        
        // 如果記憶體使用過高，考慮切換模式
        if (memoryUsage > 1000 && this.config.allowMainThreadFallback) {
            console.warn(`記憶體使用過高: ${memoryUsage.toFixed(2)} MB`);
            // 可以實作自動切換邏輯
        }
    }
    
    // 手動切換執行模式
    async switchExecutionMode(mode) {
        if (mode === this.executionMode) {
            return;
        }
        
        console.log(`切換執行模式: ${this.executionMode} -> ${mode}`);
        
        await this.executionManager.switchMode(mode);
        this.executionMode = mode;
        
        // 通知 UI
        this.notifyModeChange({
            type: 'execution',
            from: this.executionMode,
            to: mode
        });
    }
    
    // 手動切換語音引擎
    async switchSpeechEngine(engine) {
        if (engine === this.speechEngine) {
            return;
        }
        
        console.log(`切換語音引擎: ${this.speechEngine} -> ${engine}`);
        
        // 停止當前引擎
        await this.speechTranscriber.stop();
        
        // 切換引擎
        this.speechEngine = engine;
        await this.speechTranscriber.switchEngine(engine);
        
        // 如果需要，初始化 Whisper
        if (engine === 'whisper' && this.executionMode === 'worker') {
            await this.initializeWhisperInWorker();
        }
        
        // 通知 UI
        this.notifyModeChange({
            type: 'speech',
            from: this.speechEngine,
            to: engine,
            reason: this.state.isOnline ? 'manual' : 'network'
        });
    }
    
    // 取得當前配置
    getConfiguration() {
        return {
            execution: {
                mode: this.executionMode,
                preferred: this.config.preferredExecutionMode,
                allowFallback: this.config.allowMainThreadFallback
            },
            speech: {
                engine: this.speechEngine,
                preferred: this.config.preferredSpeechEngine,
                autoSwitch: this.config.autoSwitchOnOffline
            },
            network: {
                isOnline: this.state.isOnline
            },
            performance: {
                memory: window.performance?.memory?.usedJSHeapSize || 0,
                isProcessing: this.state.isProcessing
            }
        };
    }
}
```

### 3. UI 控制面板

```javascript
// ui-control-panel.js
class UnifiedControlPanel {
    constructor() {
        this.controller = null;
        this.elements = {};
    }
    
    initialize(controller) {
        this.controller = controller;
        this.createUI();
        this.bindEvents();
        this.updateUI();
    }
    
    createUI() {
        const html = `
            <div class="unified-control-panel">
                <!-- 執行模式控制 -->
                <div class="execution-mode-section">
                    <h3>執行模式</h3>
                    <div class="mode-selector">
                        <label>
                            <input type="radio" name="executionMode" value="worker" checked>
                            <span>Web Worker（推薦）</span>
                            <small>最佳效能，UI 不阻塞</small>
                        </label>
                        <label>
                            <input type="radio" name="executionMode" value="main-thread">
                            <span>主執行緒</span>
                            <small>簡單除錯，可能影響效能</small>
                        </label>
                    </div>
                </div>
                
                <!-- 語音引擎控制 -->
                <div class="speech-engine-section">
                    <h3>語音識別引擎</h3>
                    <div class="engine-selector">
                        <label>
                            <input type="radio" name="speechEngine" value="webspeech" checked>
                            <span>Web Speech API</span>
                            <small>即時串流，需要網路</small>
                        </label>
                        <label>
                            <input type="radio" name="speechEngine" value="whisper">
                            <span>Whisper</span>
                            <small>離線運作，本地處理</small>
                        </label>
                    </div>
                    
                    <div class="auto-switch">
                        <label>
                            <input type="checkbox" id="autoSwitchEngine" checked>
                            <span>離線時自動切換到 Whisper</span>
                        </label>
                    </div>
                </div>
                
                <!-- 狀態顯示 -->
                <div class="status-display">
                    <div class="status-item">
                        <span class="status-label">網路狀態：</span>
                        <span class="status-value" id="networkStatus">
                            <i class="status-icon">🌐</i> 線上
                        </span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">執行模式：</span>
                        <span class="status-value" id="executionStatus">
                            <i class="status-icon">⚡</i> Web Worker
                        </span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">語音引擎：</span>
                        <span class="status-value" id="engineStatus">
                            <i class="status-icon">🎙️</i> Web Speech API
                        </span>
                    </div>
                </div>
                
                <!-- 進階設定 -->
                <details class="advanced-settings">
                    <summary>進階設定</summary>
                    <div class="settings-content">
                        <div class="setting-item">
                            <label>Whisper 模型：</label>
                            <select id="whisperModel">
                                <option value="tiny">Tiny (39MB)</option>
                                <option value="base">Base (74MB)</option>
                                <option value="small">Small (244MB)</option>
                            </select>
                        </div>
                        <div class="setting-item">
                            <label>處理間隔（毫秒）：</label>
                            <input type="number" id="processingInterval" value="50" min="10" max="200">
                        </div>
                    </div>
                </details>
            </div>
        `;
        
        document.getElementById('controlPanel').innerHTML = html;
    }
    
    bindEvents() {
        // 執行模式切換
        document.querySelectorAll('input[name="executionMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.controller.switchExecutionMode(e.target.value);
            });
        });
        
        // 語音引擎切換
        document.querySelectorAll('input[name="speechEngine"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.controller.switchSpeechEngine(e.target.value);
            });
        });
        
        // 自動切換開關
        document.getElementById('autoSwitchEngine').addEventListener('change', (e) => {
            this.controller.config.autoSwitchOnOffline = e.target.checked;
        });
        
        // 監聽狀態變化
        this.controller.on('modeChange', (data) => this.handleModeChange(data));
        this.controller.on('statusUpdate', (data) => this.updateStatus(data));
    }
    
    updateUI() {
        const config = this.controller.getConfiguration();
        
        // 更新執行模式
        document.querySelector(`input[value="${config.execution.mode}"]`).checked = true;
        
        // 更新語音引擎
        document.querySelector(`input[value="${config.speech.engine}"]`).checked = true;
        
        // 更新狀態顯示
        this.updateNetworkStatus(config.network.isOnline);
        this.updateExecutionStatus(config.execution.mode);
        this.updateEngineStatus(config.speech.engine);
    }
    
    updateNetworkStatus(isOnline) {
        const element = document.getElementById('networkStatus');
        if (isOnline) {
            element.innerHTML = '<i class="status-icon">🌐</i> 線上';
            element.className = 'status-value online';
        } else {
            element.innerHTML = '<i class="status-icon">📴</i> 離線';
            element.className = 'status-value offline';
        }
    }
}
```

### 4. 樣式設計

```css
/* 控制面板樣式 */
.unified-control-panel {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    max-width: 600px;
    margin: 20px auto;
}

.unified-control-panel h3 {
    margin: 0 0 15px 0;
    color: #333;
    font-size: 18px;
}

/* 模式選擇器 */
.mode-selector,
.engine-selector {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
}

.mode-selector label,
.engine-selector label {
    display: flex;
    align-items: flex-start;
    padding: 12px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.mode-selector label:hover,
.engine-selector label:hover {
    border-color: #4a90e2;
    background: #f8f9fa;
}

.mode-selector input:checked + span,
.engine-selector input:checked + span {
    font-weight: bold;
    color: #4a90e2;
}

.mode-selector small,
.engine-selector small {
    display: block;
    color: #666;
    font-size: 12px;
    margin-top: 4px;
}

/* 狀態顯示 */
.status-display {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    margin: 20px 0;
}

.status-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
}

.status-value {
    font-weight: 500;
}

.status-value.online {
    color: #22c55e;
}

.status-value.offline {
    color: #ef4444;
}

/* 進階設定 */
.advanced-settings {
    margin-top: 20px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 15px;
}

.advanced-settings summary {
    cursor: pointer;
    font-weight: 500;
    color: #4a90e2;
}

.settings-content {
    margin-top: 15px;
}

.setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

/* 響應式設計 */
@media (max-width: 600px) {
    .unified-control-panel {
        margin: 10px;
        padding: 15px;
    }
    
    .mode-selector label,
    .engine-selector label {
        font-size: 14px;
    }
}
```

## 遷移策略

### 階段一：基礎架構建立（1-2 週）
1. 實作執行模式管理器
2. 建立 Worker 通訊機制
3. 保留現有功能運作

### 階段二：功能整合（2-3 週）
1. 整合 Web Speech API
2. 加入 Whisper 支援
3. 實作自動切換邏輯

### 階段三：優化與測試（1-2 週）
1. 效能調校
2. 錯誤處理完善
3. 使用者測試

### 階段四：部署與監控（持續）
1. 漸進式部署
2. 效能監控
3. 用戶回饋收集

## 效能優化

### 1. **懶載入策略**
```javascript
// 只在需要時載入 Whisper
async loadWhisperOnDemand() {
    if (!this.whisperLoaded) {
        await import('./whisper-processor.js');
        this.whisperLoaded = true;
    }
}
```

### 2. **資源管理**
```javascript
// 智慧記憶體管理
class ResourceManager {
    constructor() {
        this.maxMemoryMB = 500;
        this.currentUsage = 0;
    }
    
    async checkMemoryBeforeLoad(modelSize) {
        const available = this.maxMemoryMB - this.currentUsage;
        if (modelSize > available) {
            await this.freeUpMemory();
        }
    }
}
```

### 3. **快取機制**
```javascript
// 模型快取
class ModelCache {
    async getModel(modelName) {
        // 檢查 IndexedDB
        const cached = await this.checkIndexedDB(modelName);
        if (cached) return cached;
        
        // 下載並快取
        const model = await this.downloadModel(modelName);
        await this.saveToIndexedDB(modelName, model);
        return model;
    }
}
```

## 部署配置

### 預設配置檔案

```javascript
// config/default-settings.js
export const defaultSettings = {
    // 執行模式
    execution: {
        mode: 'worker',              // 預設使用 Worker
        fallbackEnabled: true,       // 啟用降級
        performanceThreshold: 100    // 效能閾值（毫秒）
    },
    
    // 語音識別
    speech: {
        engine: 'webspeech',         // 預設引擎
        autoSwitch: true,            // 自動切換
        offlineFirst: false          // 離線優先
    },
    
    // Whisper 配置
    whisper: {
        model: 'tiny',               // 預設模型
        language: 'zh',              // 預設語言
        chunkLength: 30,             // 處理片段長度
        overlapLength: 5             // 重疊長度
    },
    
    // 效能配置
    performance: {
        maxWorkers: 1,               // 最大 Worker 數
        bufferSize: 16384,           // 音訊緩衝大小
        processingInterval: 50       // 處理間隔
    },
    
    // 使用者偏好
    preferences: {
        showAdvancedOptions: false,  // 顯示進階選項
        enableTelemetry: false,      // 遙測數據
        debugMode: false             // 除錯模式
    }
};
```

### 環境特定配置

```javascript
// 根據環境載入不同配置
const loadConfiguration = async () => {
    const env = detectEnvironment();
    
    switch (env) {
        case 'development':
            return { ...defaultSettings, preferences: { debugMode: true } };
            
        case 'production':
            return { ...defaultSettings, execution: { mode: 'worker' } };
            
        case 'mobile':
            return { 
                ...defaultSettings, 
                whisper: { model: 'tiny' },
                performance: { bufferSize: 8192 }
            };
            
        default:
            return defaultSettings;
    }
};
```

## 總結

這個完整架構提供了：

1. **雙重彈性**
   - ML 執行位置可選（Worker/主執行緒）
   - 語音引擎可選（Web Speech/Whisper）

2. **智慧適應**
   - 自動選擇最佳配置
   - 網路狀態自動切換
   - 效能自動優化

3. **使用者控制**
   - 清晰的控制介面
   - 即時狀態顯示
   - 進階配置選項

4. **漸進式增強**
   - 基礎功能始終可用
   - 進階功能按需載入
   - 平滑降級機制

透過這個架構，您的應用程式將能夠在各種環境下提供最佳的使用者體驗，同時保持高度的可維護性和擴展性。