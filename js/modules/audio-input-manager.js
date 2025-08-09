/**
 * AudioInputManager - 智能音訊輸入管理器
 * 負責音訊設備初始化、參數檢測和格式轉換需求判斷
 */
export class AudioInputManager {
    constructor() {
        this.stream = null;
        this.actualSpec = null;
        this.needsConversion = false;
        this.audioContext = null;
        this.sourceNode = null;
        this.processorNode = null;
    }

    /**
     * 初始化音訊輸入
     * @returns {Promise<Object>} 音訊輸入資訊
     */
    async initializeAudioInput() {
        try {
            // 請求音訊輸入，優先使用 16kHz 單聲道
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: { ideal: 16000, min: 8000, max: 48000 },
                    channelCount: { ideal: 1, max: 2 },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            this.stream = stream;
            
            // 取得實際的音訊參數
            const track = stream.getAudioTracks()[0];
            const actualSpec = track.getSettings();
            this.actualSpec = actualSpec;

            // 判斷是否需要格式轉換
            this.needsConversion = this.determineConversionNeeds(actualSpec);

            // 創建 AudioContext
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: actualSpec.sampleRate || 48000
            });

            console.log('音訊輸入初始化成功:', {
                actualSampleRate: actualSpec.sampleRate,
                actualChannels: actualSpec.channelCount,
                needsConversion: this.needsConversion,
                conversionDetails: this.getConversionDetails()
            });

            return {
                stream: this.stream,
                actualSpec: this.actualSpec,
                needsConversion: this.needsConversion,
                conversionDetails: this.getConversionDetails()
            };

        } catch (error) {
            console.error('音訊輸入初始化失敗:', error);
            throw new Error(`無法存取麥克風: ${error.message}`);
        }
    }

    /**
     * 判斷是否需要格式轉換
     * @param {Object} spec - 實際音訊規格
     * @returns {boolean}
     */
    determineConversionNeeds(spec) {
        const targetSampleRate = 16000;
        const targetChannels = 1;
        
        return (spec.sampleRate !== targetSampleRate) || 
               (spec.channelCount && spec.channelCount !== targetChannels);
    }

    /**
     * 取得轉換詳情
     * @returns {Object}
     */
    getConversionDetails() {
        if (!this.actualSpec) return null;

        return {
            source: {
                sampleRate: this.actualSpec.sampleRate || 'unknown',
                channels: this.actualSpec.channelCount || 'unknown'
            },
            target: {
                sampleRate: 16000,
                channels: 1
            },
            operations: {
                resample: this.actualSpec.sampleRate !== 16000,
                channelMerge: this.actualSpec.channelCount > 1,
                formatConvert: true // 總是需要 Float32 -> Int16
            }
        };
    }

    /**
     * 連接音訊處理管道
     * @param {AudioWorkletNode} processorNode - AudioWorklet 處理節點
     * @returns {Promise<void>}
     */
    async connectAudioPipeline(processorNode) {
        if (!this.stream || !this.audioContext) {
            throw new Error('請先呼叫 initializeAudioInput()');
        }

        try {
            // 創建來源節點
            this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
            this.processorNode = processorNode;

            // 連接管道：麥克風 -> 處理器
            this.sourceNode.connect(this.processorNode);

            console.log('音訊管道已連接');
        } catch (error) {
            console.error('連接音訊管道失敗:', error);
            throw error;
        }
    }

    /**
     * 取得音訊診斷資訊
     * @returns {Object}
     */
    getDiagnostics() {
        const diagnostics = {
            supported: {
                getUserMedia: !!navigator.mediaDevices?.getUserMedia,
                audioContext: !!(window.AudioContext || window.webkitAudioContext),
                audioWorklet: !!window.AudioWorkletNode,
                getSettings: !!MediaStreamTrack.prototype.getSettings
            },
            stream: {
                active: this.stream?.active || false,
                tracks: this.stream?.getAudioTracks().length || 0
            },
            audioContext: {
                state: this.audioContext?.state || 'not created',
                sampleRate: this.audioContext?.sampleRate || null,
                baseLatency: this.audioContext?.baseLatency || null,
                outputLatency: this.audioContext?.outputLatency || null
            },
            actualSpec: this.actualSpec,
            conversionNeeded: this.needsConversion,
            conversionDetails: this.getConversionDetails()
        };

        return diagnostics;
    }

    /**
     * 停止音訊輸入
     */
    async stop() {
        try {
            // 斷開連接
            if (this.sourceNode) {
                this.sourceNode.disconnect();
                this.sourceNode = null;
            }

            if (this.processorNode) {
                this.processorNode.disconnect();
                this.processorNode = null;
            }

            // 停止音訊串流
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            // 關閉 AudioContext
            if (this.audioContext && this.audioContext.state !== 'closed') {
                await this.audioContext.close();
                this.audioContext = null;
            }

            this.actualSpec = null;
            this.needsConversion = false;

            console.log('音訊輸入已停止');
        } catch (error) {
            console.error('停止音訊輸入時發生錯誤:', error);
        }
    }

    /**
     * 檢查瀏覽器相容性
     * @returns {Object}
     */
    static checkBrowserCompatibility() {
        const compatibility = {
            supported: true,
            issues: [],
            warnings: []
        };

        // 檢查必要的 API
        if (!navigator.mediaDevices?.getUserMedia) {
            compatibility.supported = false;
            compatibility.issues.push('瀏覽器不支援 getUserMedia API');
        }

        if (!(window.AudioContext || window.webkitAudioContext)) {
            compatibility.supported = false;
            compatibility.issues.push('瀏覽器不支援 Web Audio API');
        }

        if (!window.AudioWorkletNode) {
            compatibility.supported = false;
            compatibility.issues.push('瀏覽器不支援 AudioWorklet');
        }

        // 檢查可選的 API
        if (!MediaStreamTrack.prototype.getSettings) {
            compatibility.warnings.push('瀏覽器不支援 getSettings()，將使用預設參數');
        }

        // 檢查 HTTPS
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            compatibility.warnings.push('需要 HTTPS 或 localhost 才能存取麥克風');
        }

        return compatibility;
    }

    /**
     * 取得支援的音訊限制
     * @returns {Promise<Object>}
     */
    static async getSupportedConstraints() {
        const supported = navigator.mediaDevices.getSupportedConstraints();
        
        // 嘗試列舉設備以取得更多資訊
        let devices = [];
        try {
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            devices = allDevices.filter(device => device.kind === 'audioinput');
        } catch (error) {
            console.warn('無法列舉音訊設備:', error);
        }

        return {
            constraints: supported,
            devices: devices.map(device => ({
                deviceId: device.deviceId,
                label: device.label || 'Unknown device',
                groupId: device.groupId
            }))
        };
    }
}