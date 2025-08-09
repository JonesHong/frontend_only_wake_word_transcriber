/**
 * AudioCompatibilityManager - 音訊相容性診斷與管理工具
 * 提供完整的音訊能力檢測、診斷報告和轉換策略建議
 */
export class AudioCompatibilityManager {
    constructor() {
        this.capabilities = null;
        this.diagnosticReport = null;
        this.conversionStrategy = null;
    }

    /**
     * 執行完整的音訊能力診斷
     * @returns {Promise<Object>} 診斷結果
     */
    async diagnoseAudioCapabilities() {
        const startTime = performance.now();
        
        const diagnostics = {
            timestamp: new Date().toISOString(),
            browser: this.getBrowserInfo(),
            apiSupport: await this.checkAPISupport(),
            audioDevices: await this.checkAudioDevices(),
            audioFormats: await this.checkAudioFormats(),
            performance: await this.checkPerformance(),
            recommendations: []
        };

        // 生成建議
        diagnostics.recommendations = this.generateRecommendations(diagnostics);
        
        // 計算診斷時間
        diagnostics.diagnosticTime = performance.now() - startTime;
        
        this.diagnosticReport = diagnostics;
        return diagnostics;
    }

    /**
     * 取得瀏覽器資訊
     * @returns {Object}
     */
    getBrowserInfo() {
        const ua = navigator.userAgent;
        const browser = {
            userAgent: ua,
            platform: navigator.platform,
            language: navigator.language,
            onLine: navigator.onLine,
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
            deviceMemory: navigator.deviceMemory || 'unknown'
        };

        // 簡單的瀏覽器識別
        if (ua.includes('Chrome')) {
            browser.name = 'Chrome';
            browser.version = ua.match(/Chrome\/(\d+)/)?.[1];
        } else if (ua.includes('Firefox')) {
            browser.name = 'Firefox';
            browser.version = ua.match(/Firefox\/(\d+)/)?.[1];
        } else if (ua.includes('Safari')) {
            browser.name = 'Safari';
            browser.version = ua.match(/Version\/(\d+)/)?.[1];
        } else if (ua.includes('Edge')) {
            browser.name = 'Edge';
            browser.version = ua.match(/Edge\/(\d+)/)?.[1];
        }

        return browser;
    }

    /**
     * 檢查 API 支援情況
     * @returns {Promise<Object>}
     */
    async checkAPISupport() {
        const support = {
            // 基礎 API
            getUserMedia: !!navigator.mediaDevices?.getUserMedia,
            enumerateDevices: !!navigator.mediaDevices?.enumerateDevices,
            mediaRecorder: typeof MediaRecorder !== 'undefined',
            
            // Web Audio API
            audioContext: !!(window.AudioContext || window.webkitAudioContext),
            audioWorklet: !!window.AudioWorkletNode,
            analyserNode: !!window.AnalyserNode,
            
            // 進階功能
            webSpeechAPI: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
            getSettings: !!MediaStreamTrack.prototype.getSettings,
            getCapabilities: !!MediaStreamTrack.prototype.getCapabilities,
            getSupportedConstraints: !!navigator.mediaDevices?.getSupportedConstraints,
            
            // 效能相關
            requestIdleCallback: !!window.requestIdleCallback,
            webWorker: typeof Worker !== 'undefined',
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            webAssembly: typeof WebAssembly !== 'undefined',
            
            // 安全相關
            secureContext: window.isSecureContext,
            permissions: !!navigator.permissions
        };

        // 檢查權限狀態
        if (support.permissions) {
            try {
                const micPermission = await navigator.permissions.query({ name: 'microphone' });
                support.microphonePermission = micPermission.state;
            } catch (e) {
                support.microphonePermission = 'unknown';
            }
        }

        return support;
    }

    /**
     * 檢查音訊設備
     * @returns {Promise<Object>}
     */
    async checkAudioDevices() {
        const devices = {
            available: false,
            inputs: [],
            outputs: [],
            defaultInput: null,
            defaultOutput: null
        };

        try {
            // 首先請求權限
            await navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    stream.getTracks().forEach(track => track.stop());
                })
                .catch(() => {});

            // 列舉設備
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            
            devices.inputs = allDevices
                .filter(d => d.kind === 'audioinput')
                .map(d => ({
                    deviceId: d.deviceId,
                    label: d.label || `麥克風 ${d.deviceId.slice(0, 8)}`,
                    groupId: d.groupId
                }));

            devices.outputs = allDevices
                .filter(d => d.kind === 'audiooutput')
                .map(d => ({
                    deviceId: d.deviceId,
                    label: d.label || `揚聲器 ${d.deviceId.slice(0, 8)}`,
                    groupId: d.groupId
                }));

            devices.available = devices.inputs.length > 0;
            devices.defaultInput = devices.inputs.find(d => d.deviceId === 'default') || devices.inputs[0];
            devices.defaultOutput = devices.outputs.find(d => d.deviceId === 'default') || devices.outputs[0];

        } catch (error) {
            devices.error = error.message;
        }

        return devices;
    }

    /**
     * 檢查支援的音訊格式
     * @returns {Promise<Object>}
     */
    async checkAudioFormats() {
        const formats = {
            constraints: {},
            actualCapabilities: {},
            supportedCodecs: []
        };

        // 取得支援的約束
        if (navigator.mediaDevices?.getSupportedConstraints) {
            formats.constraints = navigator.mediaDevices.getSupportedConstraints();
        }

        // 嘗試取得實際能力
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const track = stream.getAudioTracks()[0];
            
            if (track.getCapabilities) {
                formats.actualCapabilities = track.getCapabilities();
            }
            
            if (track.getSettings) {
                formats.currentSettings = track.getSettings();
            }
            
            track.stop();
        } catch (error) {
            formats.error = error.message;
        }

        // 檢查 MediaRecorder 支援的編碼
        if (typeof MediaRecorder !== 'undefined') {
            const codecs = [
                'audio/webm',
                'audio/webm;codecs=opus',
                'audio/webm;codecs=vp8',
                'audio/ogg;codecs=opus',
                'audio/wav',
                'audio/mp4'
            ];

            for (const codec of codecs) {
                if (MediaRecorder.isTypeSupported(codec)) {
                    formats.supportedCodecs.push(codec);
                }
            }
        }

        return formats;
    }

    /**
     * 檢查效能指標
     * @returns {Promise<Object>}
     */
    async checkPerformance() {
        const perf = {
            audioLatency: null,
            processingCapability: null,
            memoryUsage: null
        };

        // 測試 AudioContext 延遲
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            perf.audioLatency = {
                baseLatency: audioContext.baseLatency || 'not supported',
                outputLatency: audioContext.outputLatency || 'not supported',
                sampleRate: audioContext.sampleRate
            };
            audioContext.close();
        } catch (error) {
            perf.audioLatency = { error: error.message };
        }

        // 測試處理能力
        const testStart = performance.now();
        const testArray = new Float32Array(16000); // 1秒的 16kHz 音訊
        for (let i = 0; i < testArray.length; i++) {
            testArray[i] = Math.sin(2 * Math.PI * 440 * i / 16000);
        }
        perf.processingCapability = {
            processingTime: performance.now() - testStart,
            samplesProcessed: testArray.length
        };

        // 記憶體使用情況
        if (performance.memory) {
            perf.memoryUsage = {
                usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB',
                totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1048576) + ' MB',
                jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1048576) + ' MB'
            };
        }

        return perf;
    }

    /**
     * 生成轉換策略
     * @param {Object} sourceSpec - 來源音訊規格
     * @returns {Object} 轉換策略
     */
    generateConversionStrategy(sourceSpec) {
        const targetSpec = {
            sampleRate: 16000,
            channels: 1,
            format: 'int16'
        };

        const strategy = {
            source: sourceSpec,
            target: targetSpec,
            operations: [],
            estimatedLatency: 0,
            complexity: 'low'
        };

        // 判斷需要的操作
        if (sourceSpec.sampleRate !== targetSpec.sampleRate) {
            strategy.operations.push({
                type: 'resample',
                from: sourceSpec.sampleRate,
                to: targetSpec.sampleRate,
                method: 'linear', // 或 'sinc' 為高品質
                latency: 5
            });
            strategy.estimatedLatency += 5;
        }

        if (sourceSpec.channels > targetSpec.channels) {
            strategy.operations.push({
                type: 'channelMerge',
                from: sourceSpec.channels,
                to: targetSpec.channels,
                method: 'average',
                latency: 1
            });
            strategy.estimatedLatency += 1;
        }

        if (sourceSpec.format !== targetSpec.format) {
            strategy.operations.push({
                type: 'formatConvert',
                from: sourceSpec.format || 'float32',
                to: targetSpec.format,
                latency: 2
            });
            strategy.estimatedLatency += 2;
        }

        // 判斷複雜度
        if (strategy.operations.length === 0) {
            strategy.complexity = 'none';
        } else if (strategy.operations.length === 1) {
            strategy.complexity = 'low';
        } else if (strategy.operations.length === 2) {
            strategy.complexity = 'medium';
        } else {
            strategy.complexity = 'high';
        }

        // 建議
        strategy.recommendation = this.getStrategyRecommendation(strategy);

        this.conversionStrategy = strategy;
        return strategy;
    }

    /**
     * 生成建議
     * @param {Object} diagnostics - 診斷結果
     * @returns {Array} 建議列表
     */
    generateRecommendations(diagnostics) {
        const recommendations = [];
        const api = diagnostics.apiSupport;

        // API 支援建議
        if (!api.audioWorklet) {
            recommendations.push({
                level: 'critical',
                category: 'compatibility',
                message: '瀏覽器不支援 AudioWorklet，建議升級到最新版本',
                impact: 'high'
            });
        }

        if (!api.getSettings) {
            recommendations.push({
                level: 'warning',
                category: 'compatibility',
                message: '瀏覽器不支援 getSettings API，將使用預設音訊參數',
                impact: 'medium'
            });
        }

        if (!api.secureContext) {
            recommendations.push({
                level: 'critical',
                category: 'security',
                message: '需要 HTTPS 連線才能存取麥克風',
                impact: 'high'
            });
        }

        // 設備建議
        if (!diagnostics.audioDevices.available) {
            recommendations.push({
                level: 'critical',
                category: 'device',
                message: '未檢測到音訊輸入設備',
                impact: 'high'
            });
        }

        // 效能建議
        if (diagnostics.performance.audioLatency?.baseLatency > 0.05) {
            recommendations.push({
                level: 'info',
                category: 'performance',
                message: '音訊延遲較高，可能影響即時性',
                impact: 'low'
            });
        }

        // 瀏覽器特定建議
        if (diagnostics.browser.name === 'Safari') {
            recommendations.push({
                level: 'info',
                category: 'compatibility',
                message: 'Safari 對 Web Audio API 的支援有限，建議使用 Chrome 或 Edge',
                impact: 'medium'
            });
        }

        return recommendations;
    }

    /**
     * 取得策略建議
     * @param {Object} strategy - 轉換策略
     * @returns {string}
     */
    getStrategyRecommendation(strategy) {
        if (strategy.complexity === 'none') {
            return '音訊格式完全相容，無需轉換';
        } else if (strategy.complexity === 'low') {
            return '需要簡單轉換，效能影響極小';
        } else if (strategy.complexity === 'medium') {
            return '需要中等複雜度轉換，建議使用 AudioWorklet';
        } else {
            return '需要複雜轉換，強烈建議使用 AudioWorklet 以避免效能問題';
        }
    }

    /**
     * 生成診斷報告 HTML
     * @returns {string}
     */
    generateDiagnosticHTML() {
        if (!this.diagnosticReport) {
            return '<p>請先執行診斷</p>';
        }

        const report = this.diagnosticReport;
        const api = report.apiSupport;

        return `
            <div class="diagnostic-report">
                <h3>音訊診斷報告</h3>
                <p class="timestamp">生成時間: ${new Date(report.timestamp).toLocaleString()}</p>
                
                <section class="browser-info">
                    <h4>瀏覽器資訊</h4>
                    <ul>
                        <li>瀏覽器: ${report.browser.name || 'Unknown'} ${report.browser.version || ''}</li>
                        <li>平台: ${report.browser.platform}</li>
                        <li>安全上下文: ${api.secureContext ? '✅ 是' : '❌ 否'}</li>
                    </ul>
                </section>

                <section class="api-support">
                    <h4>API 支援情況</h4>
                    <ul>
                        <li>getUserMedia: ${api.getUserMedia ? '✅' : '❌'}</li>
                        <li>AudioWorklet: ${api.audioWorklet ? '✅' : '❌'}</li>
                        <li>Web Speech API: ${api.webSpeechAPI ? '✅' : '❌'}</li>
                        <li>WebAssembly: ${api.webAssembly ? '✅' : '❌'}</li>
                        <li>麥克風權限: ${api.microphonePermission || 'unknown'}</li>
                    </ul>
                </section>

                <section class="audio-devices">
                    <h4>音訊設備</h4>
                    <ul>
                        <li>輸入設備: ${report.audioDevices.inputs.length} 個</li>
                        <li>輸出設備: ${report.audioDevices.outputs.length} 個</li>
                        <li>預設輸入: ${report.audioDevices.defaultInput?.label || '無'}</li>
                    </ul>
                </section>

                <section class="recommendations">
                    <h4>建議</h4>
                    ${report.recommendations.length > 0 ? 
                        report.recommendations.map(r => `
                            <div class="recommendation ${r.level}">
                                <strong>${r.level.toUpperCase()}</strong>: ${r.message}
                            </div>
                        `).join('') : 
                        '<p>✅ 系統完全相容，無需調整</p>'
                    }
                </section>

                <p class="diagnostic-time">診斷耗時: ${report.diagnosticTime.toFixed(2)} ms</p>
            </div>
        `;
    }

    /**
     * 導出診斷報告
     * @returns {Object}
     */
    exportReport() {
        return {
            diagnostics: this.diagnosticReport,
            strategy: this.conversionStrategy,
            timestamp: new Date().toISOString()
        };
    }
}