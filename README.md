# 🎙️ Multilingual Smart Voice Assistant

A feature-complete frontend-only voice assistant application that integrates wake word detection, voice activity detection (VAD), speech transcription, and intelligent interface design.

🌐 **[Live Demo](https://joneshong.github.io/frontend_only_wake_word_transcriber/)**

## ✨ Features

### 🔊 Speech Processing
- **Multiple Wake Word Models**: Supports Hey Jarvis, Hey Mycroft, and Alexa wake words
- **Intelligent Voice Activity Detection (VAD)**: Automatically detects voice activity with support for automatic/manual ending modes
- **Real-time Speech Transcription**: Uses Web Speech API to convert speech to text
- **Audio Playback**: Records and allows replaying of audio segments

### 🎨 User Interface
- **Bilingual Interface**: Complete Traditional Chinese/English multilingual support
- **Dark/Light Theme**: Switchable visual themes
- **Real-time Visualization**: Waveform charts, wake word score graphs, and VAD status display
- **Responsive Design**: Supports desktop and mobile devices

### ⚙️ Advanced Features
- **Flexible Settings System**: Adjustable silence timeout, model switching, and detection mode configuration
- **Logging System**: Complete system activity logging and debugging functionality
- **Modular Architecture**: Finite State Machine (FSM) based system state management
- **Pure Frontend Implementation**: No backend services required, deployable directly to GitHub Pages

## System Architecture

### Finite State Machine (FSM)

The application uses three states to control the flow:

1. **Initialization**: System initial state
2. **Idle**: Waiting for wake word trigger
3. **Listening**: After wake word detection, starts listening and transcribing speech

### State Transitions

- Initialization → Idle: Press "Start Recording"
- Idle → Listening: Wake word detected
- Listening → Idle: No voice activity for 3 consecutive seconds
- Any State → Initialization: Press "Stop Recording"

## 🚀 Usage

### Basic Operations
1. Open `index.html` in a supported browser (Chrome or Edge recommended)
2. Allow microphone permissions
3. Click the "▶️ Start" button to activate the system
4. Say a wake word (Hey Jarvis, Hey Mycroft, Alexa)
5. After wake word detection, the system will play a notification sound and start listening
6. Start speaking, the system will transcribe your speech in real-time and display results
7. The system automatically returns to waiting state after speech ends

### Advanced Settings
- **Settings Button**: Click the gear icon in the bottom right to open the settings panel
  - Switch between manual/automatic ending modes
  - Adjust silence timeout (0.5-5.0 seconds)
  - Select different wake word models
- **Theme Toggle**: Click the 🌓 button to switch between dark/light themes
- **Language Switch**: Use the dropdown menu to switch between Traditional Chinese/English interface
- **Log Viewing**: Click the 📋 button in the bottom right to view system logs

## Technical Specifications

- **Audio Sample Rate**: 16kHz
- **Audio Processing**: 80ms audio chunks (1280 samples)
- **VAD Delay**: 12-frame buffer to prevent premature cutoff
- **Wake Word Threshold**: 0.5

## 📁 Project Structure

```
voice-assistant/
├── index.html          # Main HTML page
├── styles.css          # CSS stylesheet
├── js/                 # JavaScript modules
│   ├── main.js         # Main program and application initialization
│   ├── fsm.js          # Finite state machine logic
│   ├── wakeword.js     # Wake word detection module
│   ├── vad.js          # Voice activity detection module
│   ├── speech.js       # Speech transcription module
│   ├── visualization.js # Audio visualization charts
│   ├── settings.js     # Settings system and UI
│   ├── logger.js       # Logging system
│   ├── theme.js        # Theme switching management
│   ├── i18n.js         # Multilingual internationalization
│   └── language.js     # Language switching logic
├── models/             # ONNX model files
│   ├── hey_jarvis_v0.1.onnx     # Hey Jarvis wake word model
│   ├── hey_mycroft_v0.1.onnx    # Hey Mycroft wake word model
│   ├── alexa_v0.1.onnx          # Alexa wake word model
│   ├── embedding_model.onnx     # Audio feature extraction model
│   ├── melspectrogram.onnx      # Spectrogram conversion model
│   └── silero_vad.onnx          # VAD detection model
└── reference/          # Reference materials and example code
```

## 🌐 Deployment

### GitHub Pages Deployment
1. Fork or Clone this project to your GitHub account
2. In GitHub repository settings → Pages → Source, select "Deploy from a branch"
3. Choose the main branch
4. Wait for deployment to complete, then access via GitHub Pages URL

### Local Development
Due to browser security restrictions, it's recommended to use an HTTP server:
```bash
# Using Python 3
python -m http.server 8000

# Using Node.js http-server
npx http-server

# Or use Live Server extension (VS Code)
```

## 🖥️ Browser Compatibility

| Browser | Support Level | Notes |
|---------|---------------|-------|
| Chrome | ✅ Full Support | Recommended, all features complete |
| Edge | ✅ Full Support | Chromium-based, full functionality |
| Firefox | ⚠️ Partial Support | Limited Web Speech API functionality |
| Safari | ⚠️ Partial Support | Some WebRTC features may be restricted |

## ⚠️ Important Notes

### Requirements
- **Microphone Permission**: Application requires microphone access
- **HTTPS Protocol**: Some browser APIs require secure connections
- **WebAssembly Support**: ONNX Runtime requires WASM support
- **Network Connection**: Web Speech API requires internet connectivity

### Usage Recommendations
- Use in quiet environments for optimal wake word detection
- Maintain appropriate volume and clarity when speaking
- Check the logging system for detailed information if issues occur

## 🛠️ Technical Highlights

- **Pure Frontend Implementation**: No backend services required, runs entirely in the browser
- **Modular Design**: Each functional module is independent, easy to maintain and extend
- **State Management**: Uses finite state machine to ensure consistent system behavior
- **Performance Optimization**: Uses WebAssembly to accelerate AI model inference
- **Accessibility Design**: Supports keyboard navigation and screen readers

## 🙏 Acknowledgments and References

This project's implementation benefits from the following excellent open-source projects and technical articles:

### Core Technical References
- **[Open Wake Word on the Web](https://deepcorelabs.com/open-wake-word-on-the-web/)** by Miro Hristov  
  In-depth technical article detailing how to port a Python wake word system to the browser, including key audio processing pipeline architecture and debugging experience

- **[VAD (Voice Activity Detection)](https://github.com/ricky0123/vad)**  
  Provides browser-based voice activity detection implementation examples and best practices

- **[Web Speech API](https://www.google.com/intl/en/chrome/demos/speech.html)**  
  Google Chrome's official speech recognition API demonstration, providing the foundation for speech-to-text functionality

### Open Source Community Contributions
- **OpenWakeWord** - Provides high-quality wake word detection models
- **ONNX Runtime Web** - Enables efficient machine learning model execution in browsers
- **Silero VAD** - Provides accurate voice activity detection capabilities

### Special Thanks
Thanks to all developers and researchers who have contributed to the development of speech processing, machine learning, and web technologies. Without these open-source projects and detailed technical sharing, this project would not have been possible.

## 📄 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

**🤝 Contributions Welcome!** If you have any suggestions or find issues, please feel free to submit an Issue or Pull Request.