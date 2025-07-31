# 🎙️ 多語言智能語音助理

一個功能完整的純前端語音助理應用，整合喚醒詞偵測、語音活動偵測（VAD）、語音轉譯與智能介面設計。

## ✨ 功能特色

### 🔊 語音處理功能
- **多喚醒詞模型**：支援 Hey Jarvis、Hey Mycroft、Alexa 三種喚醒詞
- **智能語音偵測 (VAD)**：自動偵測語音活動，支援自動/手動結束模式
- **即時語音轉譯**：使用 Web Speech API 將語音轉換為文字
- **音訊回放功能**：錄製並可重播語音片段

### 🎨 使用者介面
- **雙語介面**：完整的繁體中文/英文多語言支援
- **深色/淺色主題**：可切換的視覺主題
- **即時視覺化**：音波圖、喚醒詞分數圖和 VAD 狀態顯示
- **響應式設計**：支援桌面與行動裝置

### ⚙️ 進階功能
- **彈性設定系統**：可調整靜音超時、切換模型、設定偵測模式
- **日誌記錄系統**：完整的系統活動記錄與除錯功能
- **模組化架構**：基於有限狀態機（FSM）的系統狀態管理
- **純前端實現**：無需後端服務，可直接部署到 GitHub Pages

## 系統架構

### 有限狀態機 (FSM)

應用使用三個狀態控制流程：

1. **Initialization**：系統初始狀態
2. **Idle**：等待喚醒詞觸發
3. **Listening**：偵測到喚醒詞後，開始聆聽並轉譯語音

### 狀態轉換

- Initialization → Idle：按下「開始收音」
- Idle → Listening：偵測到喚醒詞
- Listening → Idle：連續 3 秒無語音活動
- 任何狀態 → Initialization：按下「停止收音」

## 🚀 使用方式

### 基本操作
1. 在支援的瀏覽器中開啟 `index.html`（建議使用 Chrome 或 Edge）
2. 允許麥克風權限
3. 點擊「▶️ 開始」按鈕啟動系統
4. 說出喚醒詞（Hey Jarvis、Hey Mycroft、Alexa）
5. 偵測到喚醒詞後，系統會播放提示音並開始聆聽
6. 開始說話，系統會即時轉譯您的語音並顯示結果
7. 語音結束後系統會自動返回等待狀態

### 進階設定
- **設定按鈕**：點擊右下角齒輪圖標開啟設定面板
  - 切換手動/自動結束模式
  - 調整靜音超時時間（0.5-5.0秒）
  - 選擇不同的喚醒詞模型
- **主題切換**：點擊 🌓 按鈕切換深色/淺色主題
- **語言切換**：使用下拉選單切換繁體中文/英文介面
- **日誌查看**：點擊右下角 📋 按鈕查看系統日誌

## 技術規格

- **音訊採樣率**：16kHz
- **音訊處理**：80ms 音訊塊 (1280 samples)
- **VAD 延遲**：12 幀緩衝避免過早切斷
- **喚醒詞閾值**：0.5

## 📁 專案結構

```
voice-assistant/
├── index.html          # 主要 HTML 頁面
├── styles.css          # CSS 樣式檔案
├── js/                 # JavaScript 模組
│   ├── main.js         # 主程式與應用初始化
│   ├── fsm.js          # 有限狀態機邏輯
│   ├── wakeword.js     # 喚醒詞偵測模組
│   ├── vad.js          # 語音活動偵測模組
│   ├── speech.js       # 語音轉譯模組
│   ├── visualization.js # 音訊視覺化圖表
│   ├── settings.js     # 設定系統與 UI
│   ├── logger.js       # 日誌記錄系統
│   ├── theme.js        # 主題切換管理
│   ├── i18n.js         # 多語言國際化
│   └── language.js     # 語言切換邏輯
├── models/             # ONNX 模型檔案
│   ├── hey_jarvis_v0.1.onnx     # Hey Jarvis 喚醒詞模型
│   ├── hey_mycroft_v0.1.onnx    # Hey Mycroft 喚醒詞模型
│   ├── alexa_v0.1.onnx          # Alexa 喚醒詞模型
│   ├── embedding_model.onnx     # 音訊特徵提取模型
│   ├── melspectrogram.onnx      # 頻譜圖轉換模型
│   └── silero_vad.onnx          # VAD 偵測模型
└── reference/          # 參考資料與範例程式碼
```

## 🌐 部署方式

### GitHub Pages 部署
1. Fork 或 Clone 此專案到你的 GitHub 帳號
2. 在 GitHub 倉庫設定 → Pages → Source 選擇 "Deploy from a branch"
3. 選擇 main 分支
4. 等待部署完成，即可透過 GitHub Pages URL 存取

### 本地運行
由於瀏覽器安全限制，建議使用 HTTP 伺服器：
```bash
# 使用 Python 3
python -m http.server 8000

# 使用 Node.js http-server
npx http-server

# 或使用 Live Server 擴充功能（VS Code）
```

## 🖥️ 瀏覽器相容性

| 瀏覽器 | 支援程度 | 備註 |
|--------|----------|------|
| Chrome | ✅ 完整支援 | 建議使用，所有功能完整 |
| Edge | ✅ 完整支援 | 基於 Chromium，功能完整 |
| Firefox | ⚠️ 部分支援 | Web Speech API 功能有限 |
| Safari | ⚠️ 部分支援 | 某些 WebRTC 功能可能受限 |

## ⚠️ 注意事項

### 必要條件
- **麥克風權限**：應用需要麥克風存取權限
- **HTTPS 協定**：某些瀏覽器 API 需要安全連線
- **WebAssembly 支援**：ONNX Runtime 需要 WASM 支援
- **網路連線**：Web Speech API 需要網路連線

### 使用建議
- 建議在安靜環境使用以獲得最佳喚醒詞偵測效果
- 說話時保持適當音量和清晰度
- 如遇到問題，可查看日誌系統了解詳細資訊

## 🛠️ 技術特色

- **純前端實現**：無需後端服務，完全在瀏覽器端運行
- **模組化設計**：每個功能模組獨立，易於維護和擴展
- **狀態管理**：使用有限狀態機確保系統行為一致性
- **效能最佳化**：使用 WebAssembly 加速 AI 模型推論
- **無障礙設計**：支援鍵盤操作和螢幕閱讀器

## 📄 授權條款

本專案採用 MIT 授權條款，詳見 LICENSE 檔案。

---

**🤝 貢獻歡迎！** 如果你有任何建議或發現問題，歡迎提交 Issue 或 Pull Request。