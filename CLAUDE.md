# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a frontend-only voice assistant application that provides wake word detection, voice activity detection (VAD), speech transcription, and an interactive multilingual interface. The entire application runs in the browser without any backend services.

## Development Commands

### Local Development Server
```bash
# Using Python 3 (available at /usr/bin/python3)
python3 -m http.server 8000

# Or using any other HTTP server
npx http-server
```

**Important**: This is a pure frontend application with no build process or package manager. Simply serve the files via HTTP to run locally.

## Architecture Overview

### Core Modules

The application follows a modular architecture with distinct responsibilities:

1. **Finite State Machine (FSM)** (`js/fsm.js`)
   - Controls application flow through three states: Initialization → Idle → Listening
   - Handles state transitions based on wake word detection and voice activity
   - Manages silence timeouts and automatic/manual ending modes

2. **Wake Word Detection** (`js/wakeword.js`)
   - Loads ONNX models for wake word detection (Hey Jarvis, Hey Mycroft, Alexa)
   - Processes audio chunks through mel-spectrogram and embedding models
   - Maintains detection threshold of 0.5 and score history

3. **Voice Activity Detection** (`js/vad.js`)
   - Uses Silero VAD ONNX model for detecting speech presence
   - Implements hangover frames (12) to prevent premature cutoff
   - Works at 16kHz sample rate with 80ms audio chunks

4. **Speech Transcription** (`js/speech.js`)
   - Utilizes Web Speech API for speech-to-text conversion
   - Supports continuous recognition with interim results
   - Configurable for multiple languages (default: zh-TW)

5. **Main Application** (`js/main.js`)
   - Orchestrates all modules and manages audio pipeline
   - Handles Web Audio API setup and worklet processing
   - Manages recording sessions and audio buffering

### Audio Processing Pipeline

1. **Sample Rate**: 16kHz throughout the pipeline
2. **Chunk Size**: 1280 samples (80ms) for model inference
3. **Audio Flow**: Microphone → AudioWorklet → Processing modules → UI updates

### Model Files

All ONNX models are located in `/models/`:
- Wake word models: `hey_jarvis_v0.1.onnx`, `alexa_v0.1.onnx`, `hey_mycroft_v0.1.onnx`
- Feature extraction: `embedding_model.onnx`, `melspectrogram.onnx`
- VAD: `silero_vad.onnx`
- Whisper models in `/models/whisper/` (multiple variants)

### UI Components

- **Internationalization** (`js/i18n.js`, `js/language.js`): Full Traditional Chinese/English support
- **Theme Management** (`js/theme.js`): Dark/light mode switching
- **Visualization** (`js/visualization.js`): Real-time waveform and score charts
- **Settings** (`js/settings.js`): Runtime configuration management
- **Logger** (`js/logger.js`): System activity logging

## Key Technical Details

### Browser Requirements
- WebAssembly support for ONNX Runtime
- Web Speech API (Chrome/Edge recommended)
- AudioWorklet API for audio processing
- HTTPS or localhost for microphone access

### State Management Flow
```
User clicks Start → Initialization complete → Idle (listening for wake word)
→ Wake word detected → Listening (VAD active, transcription running)
→ Silence detected (3 seconds) → Back to Idle
```

### Critical Files
- `index.html`: Main application entry point with Tailwind CSS
- `styles.css`: Custom styles and animations
- ONNX Runtime loaded via CDN in index.html

## Deployment

The application is designed for static hosting:
- GitHub Pages ready (see live demo link in README)
- No build process required
- All dependencies loaded via CDN