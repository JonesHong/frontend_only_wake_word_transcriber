/**
 * Model Registry Manager v2
 * 支援多平台、多類型的模型管理系統
 */

class ModelRegistry {
    constructor() {
        this.registryPath = './../../models/global_registry.json';
        this.registry = null;
        this.currentModel = null;
        this.viewMode = 'grid';
        this.init();
    }

    async init() {
        await this.loadRegistry();
        this.updateStats();
        this.renderModels();
    }

    async loadRegistry() {
        try {
            const response = await fetch(this.registryPath);
            if (response.ok) {
                this.registry = await response.json();
                console.log('Registry loaded:', this.registry);
            } else {
                throw new Error('Failed to load registry');
            }
        } catch (error) {
            console.error('Error loading registry:', error);
            // Use default registry structure
            this.registry = this.getDefaultRegistry();
        }
    }

    getDefaultRegistry() {
        return {
            version: "1.0.0",
            last_updated: new Date().toISOString().split('T')[0],
            description: "Global model registry",
            model_types: {
                asr: { name: "Automatic Speech Recognition", description: "Speech-to-text models" },
                wakeword: { name: "Wake Word Detection", description: "Keyword spotting models" },
                vad: { name: "Voice Activity Detection", description: "Speech presence detection" },
                tts: { name: "Text-to-Speech", description: "Speech synthesis models" },
                nlp: { name: "Natural Language Processing", description: "Language understanding" }
            },
            sources: {
                huggingface: { base_url: "https://huggingface.co" },
                github: { base_url: "https://github.com" },
                local: { base_path: "./models" }
            },
            models: [],
            statistics: {
                total_models: 0,
                by_type: {},
                by_source: {},
                total_size_mb: 0,
                downloaded_models: 0,
                pending_models: 0
            }
        };
    }

    updateStats() {
        if (!this.registry) return;

        const stats = this.registry.statistics || {};
        const models = this.registry.models || [];

        // Create hidden elements for compatibility if they don't exist
        const createHiddenElement = (id) => {
            if (!document.getElementById(id)) {
                const elem = document.createElement('div');
                elem.id = id;
                elem.style.display = 'none';
                document.body.appendChild(elem);
            }
            return document.getElementById(id);
        };

        // Update main stats (hidden elements for data storage)
        createHiddenElement('totalModels').textContent = models.length;
        createHiddenElement('totalSize').textContent = this.formatSize(stats.total_size_mb || 0);
        createHiddenElement('downloadedCount').textContent = stats.downloaded_models || 0;
        createHiddenElement('pendingCount').textContent = stats.pending_models || 0;

        // Update type breakdown
        const typeCount = Object.keys(stats.by_type || {}).length;
        createHiddenElement('modelTypes').textContent = typeCount;
        
        const typeBreakdown = createHiddenElement('typeBreakdown');
        typeBreakdown.innerHTML = Object.entries(stats.by_type || {})
            .map(([type, count]) => `
                <div class="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>${this.getTypeName(type)}</span>
                    <span class="font-semibold">${count}</span>
                </div>
            `).join('');

        // Update source breakdown
        const sourceCount = Object.keys(stats.by_source || {}).length;
        createHiddenElement('sourcePlatforms').textContent = sourceCount;
        
        const sourceBreakdown = createHiddenElement('sourceBreakdown');
        sourceBreakdown.innerHTML = Object.entries(stats.by_source || {})
            .map(([source, count]) => `
                <div class="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>${this.capitalize(source)}</span>
                    <span class="font-semibold">${count}</span>
                </div>
            `).join('');
        
        // Update floating window stats if it exists
        if (typeof updateFloatingStats === 'function') {
            updateFloatingStats();
        }
    }

    renderModels() {
        const container = document.getElementById('modelsContainer');
        const models = this.getFilteredModels();

        if (models.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #9ca3af;">
                    <p style="font-size: 1.2em; margin-bottom: 10px;">沒有找到符合條件的模型</p>
                    <p>請調整篩選條件或新增模型</p>
                </div>
            `;
            return;
        }

        container.innerHTML = models.map(model => this.createModelCard(model)).join('');
    }

    createModelCard(model) {
        const typeColors = {
            asr: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
            wakeword: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
            vad: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
            tts: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
            nlp: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
        };
        
        const typeClass = typeColors[model.type] || 'bg-gray-100 text-gray-700';
        const statusClass = model.status?.downloaded 
            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' 
            : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
        const statusText = model.status?.downloaded ? '已下載' : '待下載';
        const statusIcon = model.status?.downloaded ? 'fa-check-circle' : 'fa-clock';

        return `
            <div class="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-purple-500 dark:hover:border-purple-400 hover:shadow-lg transition-all cursor-pointer relative" onclick="modelRegistry.showDetails('${model.id}')">
                <span class="absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-semibold uppercase ${typeClass}">
                    ${model.type}
                </span>
                
                <div class="mb-3">
                    <div class="text-lg font-semibold text-gray-800 dark:text-white mb-1">${model.name}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                        ${this.getSourceIcon(model.source.platform)}
                        <span class="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
                            ${model.source.platform}/${model.source.author || 'unknown'}
                        </span>
                    </div>
                </div>

                <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">
                    ${model.description || '無描述'}
                </p>

                <div class="grid grid-cols-2 gap-2 mb-3 text-xs">
                    ${model.specs?.size_mb ? `
                        <div class="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <i class="fas fa-database text-gray-400"></i>
                            <span>${model.specs.size_mb} MB</span>
                        </div>
                    ` : ''}
                    ${model.specs?.format ? `
                        <div class="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <i class="fas fa-file-archive text-gray-400"></i>
                            <span>${model.specs.format.toUpperCase()}</span>
                        </div>
                    ` : ''}
                    ${model.performance?.speed_multiplier ? `
                        <div class="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <i class="fas fa-bolt text-gray-400"></i>
                            <span>${model.performance.speed_multiplier}x</span>
                        </div>
                    ` : ''}
                    <div class="flex items-center gap-1.5">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                            <i class="fas ${statusIcon} text-xs"></i>
                            ${statusText}
                        </span>
                    </div>
                </div>

                ${model.tags && model.tags.length > 0 ? `
                    <div class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        ${model.tags.slice(0, 4).map(tag => `
                            <span class="px-2 py-0.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full text-xs text-gray-600 dark:text-gray-400">
                                ${tag}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    getFilteredModels() {
        if (!this.registry || !this.registry.models) return [];

        const typeFilter = document.getElementById('typeFilter').value;
        const sourceFilter = document.getElementById('sourceFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const searchInput = document.getElementById('searchInput').value.toLowerCase();

        return this.registry.models.filter(model => {
            // Type filter
            if (typeFilter && model.type !== typeFilter) return false;

            // Source filter
            if (sourceFilter && model.source.platform !== sourceFilter) return false;

            // Status filter
            if (statusFilter) {
                const isDownloaded = model.status?.downloaded === true;
                if (statusFilter === 'downloaded' && !isDownloaded) return false;
                if (statusFilter === 'pending' && isDownloaded) return false;
            }

            // Search filter
            if (searchInput) {
                const searchableText = `
                    ${model.name} 
                    ${model.id} 
                    ${model.description} 
                    ${model.source.author} 
                    ${model.tags?.join(' ')}
                `.toLowerCase();
                if (!searchableText.includes(searchInput)) return false;
            }

            return true;
        });
    }

    showDetails(modelId) {
        const model = this.registry.models.find(m => m.id === modelId);
        if (!model) return;

        this.currentModel = model;
        document.getElementById('detailsTitle').textContent = model.name;
        
        // Create formatted HTML content instead of raw JSON
        const detailsHTML = `
            <div class="space-y-4">
                <!-- Basic Info -->
                <div>
                    <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-2">基本資訊</h3>
                    <div class="bg-white dark:bg-gray-800 rounded p-3 space-y-1">
                        <div><span class="font-medium">ID:</span> ${model.id}</div>
                        <div><span class="font-medium">類型:</span> ${model.type.toUpperCase()}</div>
                        <div><span class="font-medium">描述:</span> ${model.description || 'N/A'}</div>
                    </div>
                </div>

                <!-- Source Info -->
                <div>
                    <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-2">來源資訊</h3>
                    <div class="bg-white dark:bg-gray-800 rounded p-3 space-y-1">
                        <div><span class="font-medium">平台:</span> ${model.source.platform}</div>
                        <div><span class="font-medium">作者:</span> ${model.source.author || 'N/A'}</div>
                        <div><span class="font-medium">倉庫:</span> ${model.source.repository || 'N/A'}</div>
                        <div><span class="font-medium">URL:</span> <a href="${model.source.url}" target="_blank" class="text-blue-500 hover:underline">${model.source.url}</a></div>
                        <div><span class="font-medium">本地路徑:</span> ${model.local_path}</div>
                    </div>
                </div>

                <!-- Files Info -->
                ${model.files ? `
                <div>
                    <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-2">檔案資訊</h3>
                    <div class="bg-white dark:bg-gray-800 rounded p-3">
                        ${model.files.required && model.files.required.length > 0 ? `
                        <div class="mb-3">
                            <h4 class="font-medium text-green-600 dark:text-green-400 mb-1">必要檔案 (${model.files.required.length})</h4>
                            <ul class="list-disc list-inside text-sm space-y-0.5 text-gray-600 dark:text-gray-400">
                                ${model.files.required.map(file => `<li>${file}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}
                        ${model.files.optional && model.files.optional.length > 0 ? `
                        <div>
                            <h4 class="font-medium text-yellow-600 dark:text-yellow-400 mb-1">可選檔案 (${model.files.optional.length})</h4>
                            <ul class="list-disc list-inside text-sm space-y-0.5 text-gray-600 dark:text-gray-400">
                                ${model.files.optional.map(file => `<li>${file}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- Specs -->
                ${model.specs ? `
                <div>
                    <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-2">規格</h3>
                    <div class="bg-white dark:bg-gray-800 rounded p-3 grid grid-cols-2 gap-2">
                        ${model.specs.size_mb ? `<div><span class="font-medium">大小:</span> ${model.specs.size_mb} MB</div>` : ''}
                        ${model.specs.format ? `<div><span class="font-medium">格式:</span> ${model.specs.format.toUpperCase()}</div>` : ''}
                        ${model.specs.parameters ? `<div><span class="font-medium">參數:</span> ${model.specs.parameters}</div>` : ''}
                        ${model.specs.quantized !== undefined ? `<div><span class="font-medium">量化:</span> ${model.specs.quantized ? '是' : '否'}</div>` : ''}
                        ${model.specs.threshold !== undefined ? `<div><span class="font-medium">閾值:</span> ${model.specs.threshold}</div>` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- Performance -->
                ${model.performance ? `
                <div>
                    <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-2">效能</h3>
                    <div class="bg-white dark:bg-gray-800 rounded p-3 grid grid-cols-2 gap-2">
                        ${model.performance.wer !== undefined ? `<div><span class="font-medium">WER:</span> ${model.performance.wer}%</div>` : ''}
                        ${model.performance.speed_multiplier ? `<div><span class="font-medium">速度:</span> ${model.performance.speed_multiplier}x</div>` : ''}
                        ${model.performance.accuracy !== undefined ? `<div><span class="font-medium">準確度:</span> ${(model.performance.accuracy * 100).toFixed(1)}%</div>` : ''}
                        ${model.performance.latency_ms !== undefined ? `<div><span class="font-medium">延遲:</span> ${model.performance.latency_ms}ms</div>` : ''}
                        ${model.performance.gpu_required !== undefined ? `<div><span class="font-medium">需要 GPU:</span> ${model.performance.gpu_required ? '是' : '否'}</div>` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- Features -->
                ${model.features ? `
                <div>
                    <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-2">功能特性</h3>
                    <div class="bg-white dark:bg-gray-800 rounded p-3 grid grid-cols-2 gap-2">
                        ${model.features.multilingual !== undefined ? `<div><span class="font-medium">多語言:</span> ${model.features.multilingual ? '是' : '否'}</div>` : ''}
                        ${model.features.languages ? `<div><span class="font-medium">語言:</span> ${model.features.languages.join(', ')}</div>` : ''}
                        ${model.features.sample_rate ? `<div><span class="font-medium">採樣率:</span> ${model.features.sample_rate} Hz</div>` : ''}
                        ${model.features.wake_phrase ? `<div><span class="font-medium">喚醒詞:</span> "${model.features.wake_phrase}"</div>` : ''}
                        ${model.features.chunk_size ? `<div><span class="font-medium">區塊大小:</span> ${model.features.chunk_size}</div>` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- Status -->
                <div>
                    <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-2">狀態</h3>
                    <div class="bg-white dark:bg-gray-800 rounded p-3 space-y-1">
                        <div><span class="font-medium">下載狀態:</span> 
                            <span class="${model.status?.downloaded ? 'text-green-600' : 'text-orange-600'}">
                                ${model.status?.downloaded ? '已下載' : '未下載'}
                            </span>
                        </div>
                        ${model.status?.download_date ? `<div><span class="font-medium">下載日期:</span> ${model.status.download_date}</div>` : ''}
                        ${model.status?.verified !== undefined ? `<div><span class="font-medium">已驗證:</span> ${model.status.verified ? '是' : '否'}</div>` : ''}
                    </div>
                </div>

                <!-- Tags -->
                ${model.tags && model.tags.length > 0 ? `
                <div>
                    <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-2">標籤</h3>
                    <div class="flex flex-wrap gap-2">
                        ${model.tags.map(tag => `
                            <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm">
                                ${tag}
                            </span>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Raw JSON (collapsible) -->
                <details class="mt-4">
                    <summary class="cursor-pointer font-semibold text-gray-800 dark:text-gray-200 hover:text-purple-600 dark:hover:text-purple-400">
                        檢視原始 JSON
                    </summary>
                    <pre class="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">${JSON.stringify(model, null, 2)}</pre>
                </details>
            </div>
        `;
        
        document.getElementById('detailsContent').innerHTML = detailsHTML;
        this.showModal('detailsModal');
    }

    showAddModal() {
        this.currentModel = null;
        document.getElementById('modalTitle').textContent = '新增模型';
        document.getElementById('modelForm').reset();
        this.showModal('modelModal');
    }

    editModel() {
        if (!this.currentModel) return;

        document.getElementById('modalTitle').textContent = '編輯模型';
        document.getElementById('modelId').value = this.currentModel.id;
        document.getElementById('modelName').value = this.currentModel.name;
        document.getElementById('modelType').value = this.currentModel.type;
        document.getElementById('sourcePlatform').value = this.currentModel.source?.platform || '';
        document.getElementById('sourceAuthor').value = this.currentModel.source?.author || '';
        document.getElementById('sourceRepo').value = this.currentModel.source?.repository || '';
        document.getElementById('sourceUrl').value = this.currentModel.source?.url || '';
        document.getElementById('localPath').value = this.currentModel.local_path || '';
        document.getElementById('modelDescription').value = this.currentModel.description || '';
        document.getElementById('modelSize').value = this.currentModel.specs?.size_mb || '';
        document.getElementById('modelFormat').value = this.currentModel.specs?.format || 'onnx';
        document.getElementById('downloadStatus').value = this.currentModel.status?.downloaded ? 'true' : 'false';
        document.getElementById('modelTags').value = this.currentModel.tags?.join(', ') || '';

        this.closeModal('detailsModal');
        this.showModal('modelModal');
    }

    saveModel(event) {
        event.preventDefault();

        const formData = {
            id: document.getElementById('modelId').value,
            name: document.getElementById('modelName').value,
            type: document.getElementById('modelType').value,
            source: {
                platform: document.getElementById('sourcePlatform').value,
                author: document.getElementById('sourceAuthor').value,
                repository: document.getElementById('sourceRepo').value,
                url: document.getElementById('sourceUrl').value
            },
            local_path: document.getElementById('localPath').value,
            description: document.getElementById('modelDescription').value,
            specs: {
                size_mb: parseFloat(document.getElementById('modelSize').value) || 0,
                format: document.getElementById('modelFormat').value
            },
            status: {
                downloaded: document.getElementById('downloadStatus').value === 'true',
                verified: false,
                download_date: document.getElementById('downloadStatus').value === 'true' ? 
                    new Date().toISOString().split('T')[0] : null
            },
            tags: document.getElementById('modelTags').value
                .split(',')
                .map(t => t.trim())
                .filter(t => t)
        };

        // Update or add model
        if (this.currentModel) {
            const index = this.registry.models.findIndex(m => m.id === this.currentModel.id);
            if (index !== -1) {
                this.registry.models[index] = { ...this.registry.models[index], ...formData };
            }
        } else {
            this.registry.models.push(formData);
        }

        this.updateStatistics();
        this.saveRegistry();
        this.renderModels();
        this.updateStats();
        this.closeModal('modelModal');

        alert('模型已儲存！');
    }

    deleteModel() {
        if (!this.currentModel) return;

        if (confirm(`確定要刪除模型 "${this.currentModel.name}" 嗎？`)) {
            const index = this.registry.models.findIndex(m => m.id === this.currentModel.id);
            if (index !== -1) {
                this.registry.models.splice(index, 1);
                this.updateStatistics();
                this.saveRegistry();
                this.renderModels();
                this.updateStats();
                this.closeModal('detailsModal');
                alert('模型已刪除！');
            }
        }
    }

    updateStatistics() {
        const models = this.registry.models;
        
        // Calculate statistics
        const stats = {
            total_models: models.length,
            by_type: {},
            by_source: {},
            total_size_mb: 0,
            downloaded_models: 0,
            pending_models: 0
        };

        models.forEach(model => {
            // By type
            stats.by_type[model.type] = (stats.by_type[model.type] || 0) + 1;

            // By source
            const platform = model.source?.platform || 'unknown';
            stats.by_source[platform] = (stats.by_source[platform] || 0) + 1;

            // Size
            stats.total_size_mb += model.specs?.size_mb || 0;

            // Download status
            if (model.status?.downloaded) {
                stats.downloaded_models++;
            } else {
                stats.pending_models++;
            }
        });

        this.registry.statistics = stats;
        this.registry.last_updated = new Date().toISOString().split('T')[0];
    }

    saveRegistry() {
        const dataStr = JSON.stringify(this.registry, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', 'global_registry.json');
        linkElement.click();
    }

    exportRegistry() {
        this.saveRegistry();
    }

    importRegistry() {
        const jsonInput = document.getElementById('importJson').value;
        
        try {
            const data = JSON.parse(jsonInput);
            this.registry = data;
            this.updateStats();
            this.renderModels();
            this.closeModal('importModal');
            alert('註冊表已成功匯入！');
        } catch (error) {
            alert('JSON 格式錯誤：' + error.message);
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }
    }

    setView(mode) {
        this.viewMode = mode;
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.toLowerCase() === mode);
        });

        const container = document.getElementById('modelsContainer');
        if (mode === 'list') {
            container.style.gridTemplateColumns = '1fr';
        } else {
            container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(350px, 1fr))';
        }
    }

    // Helper methods
    formatSize(mb) {
        if (mb < 1024) return `${mb} MB`;
        return `${(mb / 1024).toFixed(1)} GB`;
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    getTypeName(type) {
        const typeNames = {
            asr: 'ASR',
            wakeword: '喚醒詞',
            vad: 'VAD',
            tts: 'TTS',
            nlp: 'NLP'
        };
        return typeNames[type] || type.toUpperCase();
    }

    getSourceIcon(platform) {
        const icons = {
            huggingface: '<span class="text-yellow-500 font-bold text-sm">🤗</span>',
            github: '<i class="fab fa-github text-gray-600 dark:text-gray-400"></i>',
            local: '<i class="fas fa-folder text-blue-500"></i>'
        };
        return icons[platform] || '<i class="fas fa-folder-open text-gray-500"></i>';
    }
}

// Global instance and functions
let modelRegistry;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    modelRegistry = new ModelRegistry();
});

// Global functions for HTML event handlers
function showAddModal() {
    modelRegistry.showAddModal();
}

function loadRegistry() {
    location.reload();
}

function exportRegistry() {
    modelRegistry.exportRegistry();
}

function showImportModal() {
    modelRegistry.showModal('importModal');
}

function importRegistry() {
    modelRegistry.importRegistry();
}

function applyFilters() {
    modelRegistry.renderModels();
}

function setView(mode) {
    modelRegistry.setView(mode);
}

function closeModal(modalId) {
    modelRegistry.closeModal(modalId);
}

function editModel() {
    modelRegistry.editModel();
}

function deleteModel() {
    modelRegistry.deleteModel();
}

function saveModel(event) {
    modelRegistry.saveModel(event);
}