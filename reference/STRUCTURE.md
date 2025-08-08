# JS 目錄結構

## 當前結構 (2025-08-08)

```
js/
├── config.js              # 全域配置
├── main.js                # 主程式入口
│
├── core/                  # 核心業務邏輯
│   ├── fsm.js            # 有限狀態機
│   ├── wakeword.js       # 喚醒詞偵測
│   ├── vad.js            # 語音活動偵測
│   └── speech.js         # 語音識別
│
├── ui/                    # UI 相關模組
│   ├── i18n.js           # 國際化
│   ├── language.js       # 語言切換
│   ├── theme.js          # 主題管理
│   ├── visualization.js  # 視覺化
│   ├── settings.js       # 設定管理
│   └── logger.js         # 日誌顯示
│
├── audio/                 # 音訊處理（待實作）
│   └── (待添加音訊管道模組)
│
├── workers/               # Web Workers（待實作）
│   └── (待添加 Worker 模組)
│
├── worklets/              # Audio Worklets（待實作）
│   └── (待添加 Worklet 模組)
│
├── utils/                 # 工具函數（待實作）
│   └── (待添加工具模組)
│
├── models/                # 模型管理（待實作）
│   └── (待添加模型管理模組)
│
└── performance/           # 性能優化（待實作）
    └── (待添加性能模組)
```

## 模組依賴關係

### 全域物件
- `window.Config` - 配置管理
- `window.i18n` - 國際化
- `window.themeManager` - 主題管理
- `window.logger` - 日誌系統
- `window.settingsManager` - 設定管理
- `window.languageManager` - 語言管理
- `window.visualizer` - 視覺化
- `window.voiceAssistantFSM` - 有限狀態機
- `window.wakewordDetector` - 喚醒詞偵測
- `window.voiceActivityDetector` - VAD
- `window.speechTranscriber` - 語音轉譯

### 載入順序（index.html）
1. 外部函式庫（ONNX Runtime, JSZip）
2. 配置（config.js）
3. UI 模組（i18n → theme → logger → settings → language → visualization）
4. 核心模組（fsm → wakeword → vad → speech）
5. 主程式（main.js）

## 測試文件
- `test-structure.html` - 檔案結構測試頁面
- `audio-pipeline-test.html` - 音訊管道測試頁面

## 下一步計劃

### Phase 1: 音訊管道（已規劃）
- [ ] 將音訊模組移至 audio/ 目錄
- [ ] 實作 AudioWorklet

### Phase 2: Worker 架構
- [ ] 實作 ML Inference Worker
- [ ] 實作 Whisper Worker
- [ ] 遷移 ONNX 推論到 Worker

### Phase 3: 模組化改進
- [ ] 改為 ES6 模組
- [ ] 實作動態載入
- [ ] 優化依賴管理

## 注意事項

1. **路徑更新**：所有檔案已從扁平結構遷移到分層結構
2. **相容性**：保持向後相容，使用全域變數
3. **漸進式改進**：先完成功能，再優化架構