# Frontend-Only Wake Word Transcriber 優化任務清單

## 📋 總覽
基於優化建議書的實施計劃，共分為 5 個階段，預計 6 週完成。

---

## 階段一：音訊管道（第 1 週）

### 核心任務
- [ ] 實作 AudioInputManager 類別
  - [ ] 實現 `initializeAudioInput()` 方法
  - [ ] 整合 `MediaStreamTrack.getSettings()` 檢測
  - [ ] 實現音訊參數自動檢測邏輯
  - [ ] 加入重採樣需求判斷

- [ ] 開發 AudioWorklet 格式轉換器
  - [ ] 創建 `/js/worklets/audio-processor.worklet.js`
  - [ ] 實現 `convertToMono()` 方法（立體聲→單聲道）
  - [ ] 實現 `resample()` 方法（48kHz→16kHz）
  - [ ] 實現 `convertToInt16()` 方法（Float32→Int16）
  - [ ] 實現緩衝管理（1280 samples chunks）

- [ ] 建立音訊診斷工具
  - [ ] 創建 AudioCompatibilityManager 類別
  - [ ] 實現 `diagnoseAudioCapabilities()` 方法
  - [ ] 實現 `generateConversionStrategy()` 方法
  - [ ] 建立診斷報告生成功能

### 測試項目
- [ ] 測試不同採樣率設備（8kHz, 16kHz, 44.1kHz, 48kHz）
- [ ] 測試單聲道/立體聲轉換
- [ ] 測試音訊格式轉換正確性
- [ ] 驗證延遲 < 10ms

---

## 階段二：Worker 架構（第 2 週）

### 核心任務
- [ ] 建立 WorkerManager 基礎架構
  - [ ] 創建 `/js/modules/worker-manager.js`
  - [ ] 實現 `detectCapabilities()` 方法
  - [ ] 實現 `createWorker()` 方法
  - [ ] 實現主執行緒降級機制

- [ ] 開發 ML Inference Worker
  - [ ] 創建 `/js/workers/ml-inference.worker.js`
  - [ ] 實現 ONNX Runtime 動態載入
  - [ ] 實現 WebGPU/WASM 自動選擇
  - [ ] 實現模型載入與快取機制
  - [ ] 實現推論介面

- [ ] 實現能力檢測與降級機制
  - [ ] 創建 ExecutionModeManager 類別
  - [ ] 實現 `determineOptimalMode()` 方法
  - [ ] 實現降級鏈（Worker+WebGPU → Worker+WASM → Main+WebGPU → Main+WASM）
  - [ ] 實現 ErrorRecoveryManager

### 整合任務
- [ ] 遷移 Wake Word 推論到 Worker
- [ ] 遷移 VAD 推論到 Worker
- [ ] 實現 Worker 訊息協議
- [ ] 實現 Worker 生命週期管理

### 測試項目
- [ ] 測試 Worker 創建與終止
- [ ] 測試訊息傳遞效能
- [ ] 測試降級機制
- [ ] 驗證 UI 響應性提升 > 80%

---

## 階段三：雙模式語音識別（第 3-4 週）

### 核心任務
- [ ] 實現 SpeechRecognitionManager
  - [ ] 創建 `/js/modules/speech-recognition-manager.js`
  - [ ] 實現 Web Speech API 初始化
  - [ ] 實現 `startStreaming()` 方法
  - [ ] 實現 `transcribeFile()` 方法
  - [ ] 實現 `determineMode()` 智能選擇

- [ ] 建立模式切換邏輯
  - [ ] 實現 `switchMode()` 方法
  - [ ] 實現模式狀態管理
  - [ ] 實現回調機制
  - [ ] 實現錯誤處理

- [ ] 開發 Whisper Worker（延遲載入）
  - [ ] 創建 `/js/workers/whisper.worker.js`
  - [ ] 整合 `@xenova/transformers`
  - [ ] 實現模型延遲載入
  - [ ] 實現進度回調
  - [ ] 實現分塊處理

### 整合任務
- [ ] 整合 Web Speech API 與現有 FSM
- [ ] 實現檔案上傳處理
- [ ] 實現錄音轉譯功能
- [ ] 實現即時結果顯示

### 測試項目
- [ ] 測試 Web Speech API 延遲 < 100ms
- [ ] 測試 Whisper 檔案轉譯準確度
- [ ] 測試模式自動切換
- [ ] 測試離線降級功能

---

## 階段四：WebGPU 整合（第 5 週）

### Whisper WebGPU 支援
- [ ] 檢測 WebGPU 可用性
- [ ] 配置 Transformers.js WebGPU backend
- [ ] 實現 WebGPU 效能測試
- [ ] 實現自動降級機制

### ONNX Runtime WebGPU 整合
- [ ] 更新 HTML 引入方式
  - [ ] 替換為 `ort.webgpu.min.js`
  - [ ] 加入版本管理

- [ ] 實現動態載入邏輯
  - [ ] 創建 ONNXModelLoader 類別
  - [ ] 實現 `loadWithOptimalBackend()` 方法
  - [ ] 實現 WebGPU 檢測
  - [ ] 實現錯誤處理與降級

- [ ] 更新現有模型載入
  - [ ] 更新 Wake Word 模型載入
  - [ ] 更新 VAD 模型載入
  - [ ] 加入效能監控

### 測試項目
- [ ] 測試 WebGPU 加速效果（目標 2-5x）
- [ ] 測試自動降級功能
- [ ] 測試跨瀏覽器相容性
- [ ] 驗證記憶體使用優化

---

## 階段五：UI 整合與優化（第 6 週）

### UI 元件開發
- [ ] 實現模式選擇器
  - [ ] 創建 RecognitionModeSelector 類別
  - [ ] 設計模式選擇 UI
  - [ ] 實現狀態顯示
  - [ ] 加入提示訊息

- [ ] 實現檔案上傳介面
  - [ ] 設計拖放區域
  - [ ] 實現檔案類型驗證
  - [ ] 實現上傳進度顯示
  - [ ] 實現批次處理

- [ ] 實現音訊診斷 UI
  - [ ] 設計診斷介面
  - [ ] 顯示設備資訊
  - [ ] 顯示轉換策略
  - [ ] 提供優化建議

### 整合與優化
- [ ] 整合所有新功能到主介面
- [ ] 實現設定持久化
- [ ] 優化載入時間
- [ ] 實現錯誤提示系統

### 測試項目
- [ ] 端到端功能測試
- [ ] 效能基準測試
- [ ] 使用者體驗測試
- [ ] 壓力測試

---

## 📊 進度追蹤

### 里程碑
- [ ] **M1**: 音訊管道完成（第 1 週）
- [ ] **M2**: Worker 架構完成（第 2 週）
- [ ] **M3**: 雙模式語音識別完成（第 4 週）
- [ ] **M4**: WebGPU 整合完成（第 5 週）
- [ ] **M5**: 專案完成（第 6 週）

### 風險項目
- [ ] WebGPU 瀏覽器支援度
- [ ] Whisper 模型載入時間
- [ ] Worker 通訊延遲
- [ ] 記憶體使用峰值

### 效能指標
- [ ] UI 響應性提升 80-90%
- [ ] 語音延遲 < 100ms
- [ ] GPU 利用率 30-50%
- [ ] 記憶體使用降低 30%

---

## 📝 註記

### 優先順序
1. **關鍵**：音訊管道、Worker 架構
2. **重要**：Web Speech API 整合、WebGPU（ONNX）
3. **選擇性**：Whisper 整合、進階 UI 功能

### 相依性
- Worker 架構依賴音訊管道
- WebGPU 整合依賴 Worker 架構
- UI 整合依賴所有核心功能

### 測試策略
- 每個階段完成後進行整合測試
- 保持向後相容性
- 確保降級機制可靠性

---

*最後更新：2025-01-08*  
*預計完成：6 週*