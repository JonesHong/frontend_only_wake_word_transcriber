# 語音助理應用

一個純前端的語音助理應用，提供喚醒詞偵測、語音活動偵測（VAD）與語音轉譯功能。

## 功能特色

- **喚醒詞偵測**：使用 ONNX 模型進行即時喚醒詞偵測
- **語音活動偵測 (VAD)**：偵測是否有人在說話
- **語音轉譯**：使用 Web Speech API 將語音轉換為文字
- **視覺化介面**：即時顯示音波圖、喚醒詞分數圖和 VAD 狀態
- **模型替換**：支援上傳自訂 ONNX 喚醒詞模型

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

## 使用方式

1. 在支援的瀏覽器中開啟 `index.html`（建議使用 Chrome 或 Edge）
2. 點擊「開始收音」按鈕
3. 說出喚醒詞（預設使用範例模型如 "Alexa"、"Hey Jarvis" 等）
4. 系統偵測到喚醒詞後會進入聆聽模式
5. 開始說話，系統會即時轉譯您的語音
6. 停頓 3 秒後系統會自動返回等待喚醒詞狀態

## 技術規格

- **音訊採樣率**：16kHz
- **音訊處理**：80ms 音訊塊 (1280 samples)
- **VAD 延遲**：12 幀緩衝避免過早切斷
- **喚醒詞閾值**：0.5

## 檔案結構

```
voice-assistant/
├── index.html          # 主要 HTML 檔案
├── styles.css          # 樣式檔案
├── js/
│   ├── main.js         # 主程式
│   ├── fsm.js          # 有限狀態機
│   ├── wakeword.js     # 喚醒詞偵測
│   ├── vad.js          # 語音活動偵測
│   ├── speech.js       # 語音轉譯
│   └── visualization.js # 視覺化元件
├── models/             # ONNX 模型檔案
└── example/            # 範例程式碼
```

## 瀏覽器相容性

- Chrome (建議)
- Edge
- Firefox (部分功能)

## 注意事項

1. 需要麥克風權限才能使用
2. 建議在安靜環境使用以獲得最佳效果
3. Web Speech API 需要網路連線
4. ONNX Runtime 需要 WebAssembly 支援