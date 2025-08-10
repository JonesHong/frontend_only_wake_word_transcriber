/**
 * Central Configuration File
 * Dynamically loads model paths from global_registry.json
 * Other settings are managed locally in this file
 */

const Config = {
  // Application metadata
  app: {
    name: 'Frontend-Only Wake Word Transcriber',
    version: '2.0.9',
    description: 'Pure frontend voice assistant with wake word detection',
    repository: 'https://github.com/JonesHong/frontend_only_wake_word_transcriber'
  },

  // Model registry and paths (will be populated from global_registry.json)
  models: {
    registry: 'models/global_registry.json',
    registryGithub: 'models/global_registry_github.json', // GitHub Pages specific registry
    registryData: null, // Will be loaded dynamically
    wakeword: {
      default: 'hey-jarvis',
      available: {}, // Will be populated from registry
      embedding: null, // Will be set from registry
      melspectrogram: null // Will be set from registry
    },
    vad: {
      model: null, // Will be populated from registry
      name: null,
      sampleRate: 16000,
      chunkSize: 512,
      hangoverFrames: 12
    },
    whisper: {
      default: 'whisper-base',
      quantized: true, // Default to standard models
      available: {} // Will be populated from registry
    }
  },

  // Audio processing settings
  audio: {
    sampleRate: 16000,
    chunkSize: 1280, // 80ms at 16kHz
    bufferSize: 4096,
    channels: 1,
    format: 'pcm'
  },

  // Wake word detection settings (local configuration)
  wakeword: {
    threshold: 0.5,
    historySize: 100,
    cooldownFrames: 30,
    scoreSmoothing: 0.3,
    // Model-specific thresholds (override default)
    modelThresholds: {
      'hey-jarvis': 0.5,
      'alexa': 0.5,
      'hey-mycroft': 0.5,
      'hi-kmu': 0.5
    }
  },

  // VAD settings (local configuration)
  vad: {
    silenceDuration: 3000, // ms
    speechThreshold: 0.5,
    minSpeechDuration: 250, // ms
    maxSpeechDuration: 30000, // ms
    hangoverTime: 500 // ms
  },

  // Speech recognition settings
  speech: {
    language: 'zh-TW',
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    // Whisper output mode: 'streaming' for real-time updates, 'complete' for final result only
    whisperOutputMode: 'streaming',
    // Whisper model source: 'local' for local models, 'remote' for Hugging Face models
    whisperModelSource: 'local',
    languages: {
      'zh-TW': '繁體中文',
      'en-US': 'English',
      'ja-JP': '日本語',
      'ko-KR': '한국어',
      'es-ES': 'Español',
      'fr-FR': 'Français',
      'de-DE': 'Deutsch',
      'it-IT': 'Italiano',
      'pt-BR': 'Português'
    }
  },

  // UI settings
  ui: {
    theme: 'auto', // 'light', 'dark', 'auto'
    animations: true,
    language: 'zh-TW',
    showWaveform: true,
    showScores: true,
    autoScroll: true
  },

  // Visualization settings
  visualization: {
    waveform: {
      color: '#3B82F6',
      lineWidth: 2,
      smoothing: 0.3,
      height: 100
    },
    scores: {
      maxPoints: 50,
      threshold: 0.5,
      colors: {
        below: '#94A3B8',
        above: '#10B981'
      }
    }
  },

  // Logger settings
  logger: {
    enabled: true,
    maxEntries: 100,
    levels: ['info', 'warn', 'error', 'debug'],
    defaultLevel: 'info'
  },

  // Performance settings
  performance: {
    useWebWorkers: true,
    offloadProcessing: true,
    maxConcurrentInference: 2,
    cacheModels: true
  },

  // Storage settings
  storage: {
    prefix: 'fewwt_', // Frontend Wake Word Transcriber
    useLocalStorage: true,
    useSessionStorage: false,
    maxTranscriptSize: 1000000, // characters
    autoSave: true,
    autoSaveInterval: 30000 // ms
  },

  // Development settings
  development: {
    debug: false,
    logModelLoading: true,
    logInference: false,
    mockMicrophone: false,
    bypassPermissions: false
  },

  // Load registry from JSON file
  async loadRegistry() {
    try {
      
      // Detect if we're running on GitHub Pages and select appropriate registry
      const isGitHubPages = window.location.hostname.includes('github') || 
                           window.location.hostname.includes('github.io');
      const registryPath = isGitHubPages ? this.models.registryGithub : this.models.registry;
      
      console.log(`Loading registry: ${registryPath} (GitHub Pages: ${isGitHubPages})`);
      
      const response = await fetch(registryPath);
      if (!response.ok) {
        throw new Error(`Failed to load registry: ${response.status}`);
      }
      
      const registry = await response.json();
      this.models.registryData = registry;
      
      // Process and populate model configurations
      await this.processRegistry(registry);
      
      if (this.development.logModelLoading) {
        console.log('Model registry loaded successfully', registry);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to load model registry:', error);
      // Fallback to default paths if registry loading fails
      this.setFallbackPaths();
      return false;
    }
  },

  // Check if a model file exists
  async checkModelExists(path) {
    try {
      // Try to fetch the file with HEAD request to check existence
      const response = await fetch(path, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      // If HEAD fails, try GET with range header to minimize data transfer
      try {
        const response = await fetch(path, {
          headers: { 'Range': 'bytes=0-0' }
        });
        return response.ok || response.status === 206; // 206 is partial content
      } catch (err) {
        console.log(`Model file not found: ${path}`);
        return false;
      }
    }
  },

  // Check if model directory has required files (with parallel checking)
  async checkWhisperModelExists(modelPath, files) {
    // Detect if we're on GitHub Pages
    const isGitHubPages = window.location.hostname.includes('github') || 
                         window.location.hostname.includes('github.io');
    
    // Check both quantized and standard versions
    const quantizedFiles = [
      'onnx/encoder_model_quantized.onnx',
      'onnx/decoder_model_merged_quantized.onnx'
    ];
    
    const standardFiles = [
      'onnx/encoder_model.onnx',
      'onnx/decoder_model_merged.onnx'
    ];
    
    // Parallel check for all files
    const checkPromises = [];
    const fileMap = new Map();
    
    // On GitHub Pages, only check quantized files
    if (isGitHubPages) {
      // Only check quantized file checks for GitHub Pages
      quantizedFiles.forEach(file => {
        const fullPath = `${modelPath}/${file}`;
        const promise = this.checkModelExists(fullPath);
        checkPromises.push(promise);
        fileMap.set(promise, { type: 'quantized', file });
      });
    } else {
      // Add quantized file checks
      quantizedFiles.forEach(file => {
        const fullPath = `${modelPath}/${file}`;
        const promise = this.checkModelExists(fullPath);
        checkPromises.push(promise);
        fileMap.set(promise, { type: 'quantized', file });
      });
      
      // Add standard file checks
      standardFiles.forEach(file => {
        const fullPath = `${modelPath}/${file}`;
        const promise = this.checkModelExists(fullPath);
        checkPromises.push(promise);
        fileMap.set(promise, { type: 'standard', file });
      });
    }
    
    // Wait for all checks to complete in parallel
    const results = await Promise.all(checkPromises);
    
    // Process results
    let hasQuantized = true;
    let hasStandard = !isGitHubPages; // On GitHub Pages, don't check standard
    
    results.forEach((exists, index) => {
      const promise = checkPromises[index];
      const fileInfo = fileMap.get(promise);
      
      if (!exists) {
        if (fileInfo.type === 'quantized') {
          hasQuantized = false;
        } else {
          hasStandard = false;
        }
      }
    });
    
    // Return both states
    return { 
      hasQuantized: hasQuantized,
      hasStandard: hasStandard,
      exists: hasQuantized || hasStandard
    };
  },

  // Process registry data and populate model configurations
  async processRegistry(registry) {
    if (!registry || !registry.models) return;

    // Clear existing configurations
    this.models.wakeword.available = {};
    this.models.whisper.available = {};

    // Process each model in the registry
    for (const model of registry.models) {
      const basePath = 'models/';
      const fullPath = basePath + model.local_path;
      
      console.log(`處理模型: ${model.id} (${model.type}) - 路徑: ${fullPath}`);

      switch (model.type) {
        case 'wakeword':
          // Create a simplified ID for the model
          const simpleId = model.id.replace('-wakeword', '').replace('_', '-');
          
          // Determine the correct path
          let modelPath;
          if (fullPath.endsWith('.onnx')) {
            // local_path already includes the filename
            modelPath = fullPath;
          } else {
            // local_path is a directory, find the main model file
            const mainFile = model.files.required.find(f => 
              f.endsWith('.onnx') && !f.includes('embedding') && !f.includes('melspectrogram')
            );
            modelPath = mainFile ? `${fullPath}/${mainFile}` : fullPath;
          }
          
          this.models.wakeword.available[simpleId] = {
            path: modelPath,
            name: model.name,
            threshold: this.wakeword.modelThresholds[simpleId] || 
                      model.specs?.threshold || 
                      this.wakeword.threshold
          };

          // Set embedding and melspectrogram paths from the first wake word model
          if (!this.models.wakeword.embedding || !this.models.wakeword.melspectrogram) {
            const embeddingFile = model.files.required.find(f => f.includes('embedding'));
            const melFile = model.files.required.find(f => f.includes('melspectrogram'));
            
            if (embeddingFile && melFile) {
              // Extract the directory path
              let modelDir;
              if (fullPath.endsWith('.onnx')) {
                // If fullPath includes filename, get the directory
                modelDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
              } else {
                // fullPath is already a directory
                modelDir = fullPath;
              }
              
              // Build full paths to auxiliary models
              this.models.wakeword.embedding = `${modelDir}/${embeddingFile}`;
              this.models.wakeword.melspectrogram = `${modelDir}/${melFile}`;
            }
          }
          break;

        case 'vad':
          // VAD model configuration
          const vadFile = model.files.required[0]; // Usually just one file
          // Check if fullPath already includes the file name
          if (fullPath.endsWith('.onnx')) {
            this.models.vad.model = fullPath;
          } else {
            this.models.vad.model = vadFile ? `${fullPath}/${vadFile}` : fullPath;
          }
          this.models.vad.name = model.name;
          
          // Override with registry settings if available
          if (model.features) {
            this.models.vad.sampleRate = model.features.sample_rate || this.models.vad.sampleRate;
            this.models.vad.chunkSize = model.features.chunk_size || this.models.vad.chunkSize;
          }
          break;

        case 'asr':
          // Whisper model configuration
          if (model.id.startsWith('whisper')) {
            // 檢查模型檔案是否存在
            const modelCheck = await this.checkWhisperModelExists(fullPath, model.files);
            
            if (!modelCheck.exists) {
              console.log(`Whisper model ${model.id} not found locally, skipping`);
              break;
            }
            
            // 檢測是否在 GitHub Pages 環境
            const isGitHubPages = window.location.hostname.includes('github') || 
                                 window.location.hostname.includes('github.io');
            
            // 如果在 GitHub Pages 上，強制只使用量化版本
            if (isGitHubPages && model.specs?.quantized) {
              // GitHub Pages 只添加量化版本，並且不添加 '-quantized' 後綴
              this.models.whisper.available[model.id] = {
                path: fullPath,
                name: model.name,
                size: model.specs?.size_mb || 0,
                multilingual: model.features?.multilingual || false,
                description: model.description,
                quantized: true,
                files: model.files
              };
              console.log(`Added quantized Whisper model for GitHub Pages: ${model.id}`);
              continue; // 在 GitHub Pages 環境下處理完後跳過後續邏輯
            } else {
              // 非 GitHub Pages 環境的原始邏輯
              // 添加標準版本（如果存在）
              if (modelCheck.hasStandard) {
                this.models.whisper.available[model.id] = {
                  path: fullPath,
                  name: model.name,
                  size: model.specs?.size_mb || 0,
                  multilingual: model.features?.multilingual || false,
                  description: model.description,
                  quantized: false,
                  files: model.files
                };
                console.log(`Added standard Whisper model: ${model.id}`);
              }
              
              // 添加量化版本（如果存在）
              if (modelCheck.hasQuantized) {
                const quantizedId = model.id + '-quantized';
                this.models.whisper.available[quantizedId] = {
                  path: fullPath,
                  name: model.name + ' (Quantized)',
                  size: Math.round((model.specs?.size_mb || 0) * 0.25), // 量化版本通常較小
                  multilingual: model.features?.multilingual || false,
                  description: model.description + ' - 量化版本，速度更快但準確度略低',
                  quantized: true,
                  files: model.files
                };
                console.log(`Added quantized Whisper model: ${quantizedId}`);
              }
            }
          }
          break;
      }
    }

    // Ensure default models exist
    if (!this.models.wakeword.available[this.models.wakeword.default]) {
      // Set first available model as default
      const firstKey = Object.keys(this.models.wakeword.available)[0];
      if (firstKey) {
        this.models.wakeword.default = firstKey;
      }
    }

    if (!this.models.whisper.available[this.models.whisper.default]) {
      // Set first available model as default
      const firstKey = Object.keys(this.models.whisper.available)[0];
      if (firstKey) {
        this.models.whisper.default = firstKey;
      }
    }
  },

  // Set fallback paths when registry loading fails
  setFallbackPaths() {
    console.warn('Using fallback model paths');
    
    // Fallback wake word models
    this.models.wakeword.available = {
      'hey-jarvis': {
        path: 'models/github/dscripka/openWakeWord/hey_jarvis_v0.1.onnx',
        name: 'Hey Jarvis',
        threshold: 0.5
      },
      'alexa': {
        path: 'models/github/dscripka/openWakeWord/alexa_v0.1.onnx',
        name: 'Alexa',
        threshold: 0.5
      },
      'hey-mycroft': {
        path: 'models/github/dscripka/openWakeWord/hey_mycroft_v0.1.onnx',
        name: 'Hey Mycroft',
        threshold: 0.5
      }
    };
    
    // Fallback embedding and melspectrogram
    this.models.wakeword.embedding = 'models/github/dscripka/openWakeWord/embedding_model.onnx';
    this.models.wakeword.melspectrogram = 'models/github/dscripka/openWakeWord/melspectrogram.onnx';
    
    // Fallback VAD model
    this.models.vad.model = 'models/github/snakers4/silero-vad/silero_vad.onnx';
    this.models.vad.name = 'Silero VAD';
    
    // Fallback Whisper models
    this.models.whisper.available = {
      'whisper-base': {
        path: 'models/huggingface/Xenova/whisper-base',
        name: 'Whisper Base',
        size: 39,
        multilingual: true
      }
    };
  },

  // Get model path helper
  getModelPath(type, model = null) {
    switch(type) {
      case 'wakeword':
        if (model && this.models.wakeword.available[model]) {
          return this.models.wakeword.available[model].path;
        }
        const defaultWakeword = this.models.wakeword.available[this.models.wakeword.default];
        return defaultWakeword ? defaultWakeword.path : null;
      
      case 'embedding':
        return this.models.wakeword.embedding;
      
      case 'melspectrogram':
        return this.models.wakeword.melspectrogram;
      
      case 'vad':
        return this.models.vad.model;
      
      case 'whisper':
        if (model && this.models.whisper.available[model]) {
          return this.models.whisper.available[model].path;
        }
        const defaultWhisper = this.models.whisper.available[this.models.whisper.default];
        return defaultWhisper ? defaultWhisper.path : null;
      
      default:
        throw new Error(`Unknown model type: ${type}`);
    }
  },

  // Get model info
  getModelInfo(type, modelId) {
    switch(type) {
      case 'wakeword':
        return this.models.wakeword.available[modelId] || null;
      case 'whisper':
        return this.models.whisper.available[modelId] || null;
      case 'vad':
        return {
          path: this.models.vad.model,
          name: this.models.vad.name
        };
      default:
        return null;
    }
  },

  // Get all available models of a type
  getAvailableModels(type) {
    switch(type) {
      case 'wakeword':
        return Object.keys(this.models.wakeword.available);
      case 'whisper':
        return Object.keys(this.models.whisper.available);
      case 'vad':
        return this.models.vad.model ? ['silero-vad'] : [];
      default:
        return [];
    }
  },

  // Get setting with fallback
  get(path, defaultValue = null) {
    const keys = path.split('.');
    let value = this;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  },

  // Update setting
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this;
    
    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    target[lastKey] = value;
    
    // Save to localStorage if enabled
    if (this.storage.useLocalStorage) {
      this.save();
    }
  },

  // Load settings from localStorage
  load() {
    if (!this.storage.useLocalStorage) return;
    
    const saved = localStorage.getItem(this.storage.prefix + 'config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge saved settings with defaults (excluding model paths)
        if (parsed.ui) this.ui = { ...this.ui, ...parsed.ui };
        if (parsed.speech) this.speech = { ...this.speech, ...parsed.speech };
        if (parsed.audio) this.audio = { ...this.audio, ...parsed.audio };
        if (parsed.wakeword) this.wakeword = { ...this.wakeword, ...parsed.wakeword };
        if (parsed.vad) this.vad = { ...this.vad, ...parsed.vad };
        if (parsed.development) this.development = { ...this.development, ...parsed.development };
      } catch (e) {
        console.error('Failed to load saved config:', e);
      }
    }
  },

  // Save settings to localStorage
  save() {
    if (!this.storage.useLocalStorage) return;
    
    try {
      // Only save user-modifiable settings (not model paths from registry)
      const toSave = {
        ui: this.ui,
        speech: { language: this.speech.language },
        audio: this.audio,
        wakeword: { 
          threshold: this.wakeword.threshold,
          modelThresholds: this.wakeword.modelThresholds 
        },
        vad: { 
          silenceDuration: this.vad.silenceDuration,
          speechThreshold: this.vad.speechThreshold 
        },
        development: this.development
      };
      
      localStorage.setItem(this.storage.prefix + 'config', JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  },

  // Initialize configuration
  async init() {
    // Load saved settings first
    this.load();
    
    // Load model registry
    await this.loadRegistry();
    
    // Set theme
    if (this.ui.theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    } else {
      document.documentElement.classList.toggle('dark', this.ui.theme === 'dark');
    }
    
    // Log initialization
    if (this.development.debug) {
      console.log('Config initialized:', this);
    }
  }
};

// Initialize on load
if (typeof window !== 'undefined') {
  window.Config = Config;
  
  // Auto-initialize immediately - don't wait for DOM
  // The init function will be called again in main.js to ensure it's complete
  Config.init().catch(error => {
    console.error('Config initialization error:', error);
    // Continue with fallback paths
  });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Config;
}