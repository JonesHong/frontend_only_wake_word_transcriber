# 系統架構文件

## 📐 整體架構

本系統採用模組化設計，實現了雙重彈性架構：

1. **ML 執行位置彈性**：可在 Worker 或主執行緒執行
2. **語音識別引擎彈性**：可使用 Web Speech API 或 Whisper

```
┌─────────────────────────────────────────────────────────────┐
│                        使用者介面                              │
│                    (Control Panel)                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   應用程式協調器                               │
│                 (AppOrchestrator)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ 音訊處理管線   │  │ 狀態管理     │  │ 事件分發         │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
└──────┬────────────────┬─────────────────┬──────────────────┘
       │                │                 │
┌──────▼─────────┐ ┌───▼──────────┐ ┌───▼──────────────────┐
│ 執行模式管理器   │ │ 語音識別管理器 │ │ 控制面板            │
│(ExecutionMode  │ │(HybridSpeech  │ │(ControlPanel)       │
│ Manager)       │ │ Manager)      │ │                     │
├────────────────┤ ├───────────────┤ ├─────────────────────┤
│ ┌──────────┐  │ │ ┌───────────┐ │ │ ┌─────────────────┐ │
│ │Worker    │  │ │ │Web Speech │ │ │ │ 狀態顯示        │ │
│ │Processor │  │ │ │Recognizer │ │ │ ├─────────────────┤ │
│ ├──────────┤  │ │ ├───────────┤ │ │ │ 設定管理        │ │
│ │MainThread│  │ │ │Whisper    │ │ │ ├─────────────────┤ │
│ │Processor │  │ │ │Recognizer │ │ │ │ 視覺化          │ │
│ └──────────┘  │ │ └───────────┘ │ │ └─────────────────┘ │
└────────────────┘ └───────────────┘ └─────────────────────┘
```

## 🧩 核心模組

### 1. 應用程式協調器 (AppOrchestrator)
- **職責**：協調所有子系統的運作
- **功能**：
  - 音訊管線管理
  - 系統狀態維護
  - 事件分發
  - 錯誤處理

### 2. 執行模式管理器 (ExecutionModeManager)
- **職責**：管理 ML 模型的執行位置
- **模式**：
  - Worker 模式（預設）
  - 主執行緒模式
  - 自動選擇模式

### 3. 混合語音識別管理器 (HybridSpeechRecognitionManager)
- **職責**：管理多個語音識別引擎
- **引擎**：
  - Web Speech API（需要網路）
  - Whisper（離線運作）
- **特性**：
  - 自動切換
  - 網路狀態監控
  - 錯誤恢復

### 4. 控制面板 (ControlPanel)
- **職責**：提供統一的使用者介面
- **功能**：
  - 系統狀態顯示
  - 設定管理
  - 音訊視覺化
  - 操作日誌

## 🔄 資料流程

### 音訊處理流程
```
麥克風輸入 
    │
    ▼
AudioContext (16kHz)
    │
    ▼
ScriptProcessor
    │
    ▼
AppOrchestrator.processAudioFrame()
    │
    ├─► ExecutionManager (ML 處理)
    │       │
    │       ├─► VAD
    │       └─► 喚醒詞偵測
    │
    └─► SpeechManager (語音識別)
            │
            ├─► Web Speech API
            └─► Whisper
```

### 事件流程
```
使用者說話
    │
    ▼
VAD 偵測到語音
    │
    ▼
喚醒詞偵測
    │
    ▼ (如果偵測到)
開始語音識別
    │
    ▼
識別結果
    │
    ▼
命令處理
```

## 🎯 設計原則

### 1. 模組化
- 每個模組職責單一
- 透過介面通訊
- 可獨立測試和替換

### 2. 漸進式增強
- 基本功能優先
- 進階功能可選
- 優雅降級

### 3. 彈性架構
- 執行位置可切換
- 識別引擎可切換
- 配置可動態調整

### 4. 向後相容
- 保持現有 API
- 透過包裝器整合
- 無破壞性變更

## 📦 檔案結構

```
/js/
├── modules/                    # 新架構模組
│   ├── worker-adapter.js      # Worker 通訊適配器
│   ├── ml-processor-interface.js  # ML 處理器介面
│   ├── main-thread-processor.js   # 主執行緒處理器
│   ├── worker-processor.js        # Worker 處理器
│   ├── execution-mode-manager.js  # 執行模式管理
│   ├── speech-recognition-interface.js  # 語音識別介面
│   ├── web-speech-recognizer.js        # Web Speech 包裝器
│   ├── whisper-recognizer.js           # Whisper 包裝器
│   ├── hybrid-speech-recognition-manager.js  # 混合管理器
│   ├── control-panel.js               # 控制面板 UI
│   └── app-orchestrator.js            # 應用程式協調器
│
├── workers/                   # Worker 腳本
│   ├── simple.worker.js      # 簡單測試 Worker
│   └── ml-processor.worker.js # ML 處理 Worker
│
└── (原有檔案)                # 保持不變
    ├── fsm.js
    ├── vad.js
    ├── wakeword.js
    ├── speech.js
    └── ...
```

## 🚀 使用方式

### 基本使用
```javascript
// 建立協調器
const orchestrator = new AppOrchestrator();

// 初始化
await orchestrator.initialize({
    controlPanelContainer: 'controlPanel',
    wakewordEnabled: true,
    language: 'zh-TW'
});

// 啟動
await orchestrator.start();
```

### 進階配置
```javascript
// 切換執行模式
orchestrator.systems.executionManager.switchMode('worker');

// 設定語音引擎
orchestrator.systems.speechManager.setPreferredEngine('webSpeech');

// 更新配置
orchestrator.updateConfig({
    continuousListening: true,
    audioFeedback: false
});
```

## 🔍 除錯

### 啟用除錯模式
```javascript
// 在控制面板啟用
controlPanel.setDebugMode(true);

// 或透過配置
orchestrator.updateConfig({ debug: true });
```

### 效能監控
- 控制面板顯示即時處理時間
- 統計資訊包含各種計數器
- 可透過 `getStats()` 取得詳細資料

## 📈 效能優化

1. **Worker 執行**：預設使用 Worker 避免阻塞 UI
2. **音訊緩衝**：適當的緩衝區大小（80ms）
3. **智慧切換**：根據網路狀態選擇最佳引擎
4. **資源管理**：適時釋放不用的資源

## 🔒 安全考量

1. **HTTPS 要求**：麥克風和語音 API 需要安全連線
2. **權限管理**：適當處理使用者權限
3. **隱私保護**：音訊資料僅在本地處理

---

*架構文件版本：1.0.0*
*最後更新：2025-08-02*