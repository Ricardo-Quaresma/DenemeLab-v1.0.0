/* ===================================================
   DenemeLab — Main Application Logic
   =================================================== */

class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.analyses = []; // Will be loaded from IndexedDB
        this.settings = JSON.parse(localStorage.getItem('testai_settings') || '{}');
        this.db = null; // IndexedDB connection

        this.applyDefaults();
        this.initAsync(); // Use async initialization
    }

    async initAsync() {
        try {
            // Initialize IndexedDB
            await this.initStorage();
            
            // Migrate from localStorage if needed
            await this.migrateFromLocalStorage();
            
            // Load analyses from IndexedDB
            this.analyses = await this.loadAnalysesFromIndexedDB();
            
            // If no IndexedDB data, try localStorage as fallback
            if (this.analyses.length === 0) {
                const oldData = localStorage.getItem('testai_analyses');
                if (oldData) {
                    try {
                        this.analyses = JSON.parse(oldData);
                        // Save to IndexedDB
                        for (const analysis of this.analyses) {
                            await this.saveAnalysisToIndexedDB(analysis);
                        }
                    } catch (e) {
                        console.warn('Failed to load from localStorage:', e);
                    }
                }
            }
            
            // Continue with normal init
            this.init();
            if (typeof window.reviewPool?.migrateAndRepairPool === 'function') {
                window.reviewPool.migrateAndRepairPool();
            }
        } catch (error) {
            console.error('Initialization error:', error);
            // Fallback to localStorage
            this.analyses = JSON.parse(localStorage.getItem('testai_analyses') || '[]');
            this.init();
        }
    }

    applyDefaults() {
        const defaults = {
            theme: 'dark',
            fontSize: 16,
            animations: true,
            apiKey: '',
            aiModel: 'gemini-1.5-flash',
            notifications: true,
            sounds: false,
            sidebarCollapsed: false,
            aiAnalysisEnabled: false,  // AI Analysis varsayılan olarak kapalı
            reviewIntervalWrong: 1,    // Yanlış: 1 gün sonra
            reviewIntervalBlank: 2,    // Boş: 2 gün sonra
            reviewIntervalCorrect: 3,  // Doğru: 3 gün sonra
            reviewMasteredCount: 3,    // 3 kez doğru bilinirse silinsin
            accentColor: '#7c5cfc',    // Default primary color
            penaltyRule: '4',          // 4 Yanlış 1 Doğruyu Götürür (0.25 Net)
            customPenalty: 4           // Özel Yanlış/Doğru Oranı
        };
        this.settings = { ...defaults, ...this.settings };
    }

    // Net score penalty ratio calculation (e.g. 4Y 1D = 0.25, 3Y 1D = 0.333, 0 = 0)
    getPenaltyRatio() {
        const rule = this.settings.penaltyRule || '4';
        if (rule === '0') return 0;
        if (rule === '3') return 1 / 3;
        if (rule === '4') return 0.25;
        if (rule === 'custom') {
            const val = parseFloat(this.settings.customPenalty);
            return (val && val > 0) ? (1 / val) : 0.25;
        }
        const parsed = parseFloat(rule);
        return (parsed && parsed > 0) ? (1 / parsed) : 0.25;
    }

    calculateNet(correct = 0, wrong = 0) {
        const ratio = this.getPenaltyRatio();
        const net = (Number(correct) || 0) - ((Number(wrong) || 0) * ratio);
        return Math.max(0, Math.round(net * 100) / 100);
    }

    // Debounce utility to prevent excessive calls
    debounce(fn, delay = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    init() {
        this.applyTheme(this.settings.theme);
        this.applyFontSize(this.settings.fontSize);
        this.applyAnimations(this.settings.animations);
        this.applySidebarState(this.settings.sidebarCollapsed);
        this.bindNavigation();
        this.bindSettings();
        this.bindSearchAndFilter();
        this.bindKeyboardShortcuts();
        this.bindDynamicButtons();
        this.updateDashboard();
        this.updateReviewBadge();

        // Restore settings UI
        this.restoreSettingsUI();

        // Update storage info if file storage is available
        if (window.fileStorage) {
            setTimeout(() => this.updateStorageInfo(), 100);
        }

        // Check if this is first time use and show welcome modal
        this.checkFirstTimeSetup();

        // Warn on page reload if there's unsaved manual analysis
        window.addEventListener('beforeunload', (e) => {
            if (window.manualAnalyzer && 
                window.manualAnalyzer.questions.length > 0 && 
                window.manualAnalyzer.currentStage !== 'results' &&
                window.manualAnalyzer.currentStage !== 'upload') {
                e.preventDefault();
                e.returnValue = 'Kaydedilmemiş sorular var. Sayfadan çıkmak istediğinize emin misiniz?';
                return e.returnValue;
            }
        });

        // Window resize handler for charts
        window.addEventListener('resize', this.debounce(() => {
            if (this.currentPage === 'dashboard') {
                this.renderPerformanceChart();
                this.renderNetPerformanceChart();
        this.updateDashboardSubjectAvgExamOptions();
        this.renderDashboardSubjectAverages();
            }
        }, 250));

        // Auto theme change listener
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (this.settings.theme === 'auto') {
                this.applyTheme('auto');
            }
        });

        // Info icon tooltips - click to show
        document.body.addEventListener('click', (e) => {
            const infoIcon = e.target.closest('.info-icon');
            if (infoIcon) {
                e.stopPropagation();
                const tooltip = infoIcon.dataset.tooltip;
                if (tooltip) {
                    this.showTooltip(tooltip, infoIcon);
                }
            } else {
                // Close any open tooltips
                const existingTooltip = document.querySelector('.custom-tooltip');
                if (existingTooltip) existingTooltip.remove();
            }
        });
    }

    showTooltip(text, anchorElement) {
        // Remove existing tooltip
        const existing = document.querySelector('.custom-tooltip');
        if (existing) existing.remove();

        // Create new tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'custom-tooltip';
        tooltip.textContent = text;
        document.body.appendChild(tooltip);

        // Position tooltip
        const rect = anchorElement.getBoundingClientRect();
        tooltip.style.position = 'fixed';
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + 8) + 'px';

        // Adjust if goes off screen
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) {
            tooltip.style.left = (window.innerWidth - tooltipRect.width - 20) + 'px';
        }
        if (tooltipRect.bottom > window.innerHeight) {
            tooltip.style.top = (rect.top - tooltipRect.height - 8) + 'px';
        }
    }

    // Bind search and filter once to avoid listener leaks
    bindSearchAndFilter() {
        const searchInput = document.getElementById('resultsSearch');
        const filterSelect = document.getElementById('resultsFilter');
        const examSelect = document.getElementById('resultsExamFilter');

        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => {
                if (this.currentPage === 'results') this.renderResultsHistory();
            }, 200));
        }
        if (filterSelect) {
            const savedScore = localStorage.getItem('testai_filter_results_score');
            if (savedScore && filterSelect.querySelector(`option[value="${savedScore}"]`)) {
                filterSelect.value = savedScore;
            }
            filterSelect.addEventListener('change', () => {
                try { localStorage.setItem('testai_filter_results_score', filterSelect.value); } catch(e){}
                if (this.currentPage === 'results') this.renderResultsHistory();
            });
        }
        if (examSelect) {
            const savedExam = localStorage.getItem('testai_filter_results_exam');
            if (savedExam && examSelect.querySelector(`option[value="${savedExam}"]`)) {
                examSelect.value = savedExam;
            }
            examSelect.addEventListener('change', () => {
                try { localStorage.setItem('testai_filter_results_exam', examSelect.value); } catch(e){}
                if (this.currentPage === 'results') this.renderResultsHistory();
            });
        }

        // Net Performance Chart Filters on Dashboard (Persisted across page reload)
        const netExamFilter = document.getElementById('netChartExamFilter');
        const netSubjectFilter = document.getElementById('netChartSubjectFilter');
        const netLimitFilter = document.getElementById('netChartLimitFilter');

        netExamFilter?.addEventListener('change', () => {
            try { localStorage.setItem('testai_filter_net_chart_exam', netExamFilter.value); } catch(e){}
            this.updateNetChartSubjectOptions();
            this.renderNetPerformanceChart();
        });
        netSubjectFilter?.addEventListener('change', () => {
            try { localStorage.setItem('testai_filter_net_chart_subject', netSubjectFilter.value); } catch(e){}
            this.renderNetPerformanceChart();
        });
        netLimitFilter?.addEventListener('change', () => {
            try { localStorage.setItem('testai_filter_net_chart_limit', netLimitFilter.value); } catch(e){}
            this.renderNetPerformanceChart();
        });

        // Subject Averages Exam Filter (Persisted across page reload)
        document.getElementById('dashboardSubjectAvgExamFilter')?.addEventListener('change', (e) => {
            try { localStorage.setItem('testai_filter_dash_subject_avg_exam', e.target.value); } catch(err){}
            this.renderDashboardSubjectAverages();
        });

        // Click on Average Net stat card to choose exam (Persisted)
        const avgNetCard = document.getElementById('statCardAverageNet');
        if (avgNetCard) {
            avgNetCard.addEventListener('click', () => this.showAvgNetExamModal());
            avgNetCard.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.showAvgNetExamModal();
                }
            });
        }
    }

    // ---- Navigation ----
    bindNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                if (page === 'results' && window.manualAnalyzer && typeof window.manualAnalyzer.closeResultsDetail === 'function') {
                    window.manualAnalyzer.closeResultsDetail();
                }
                this.navigateTo(page);
            });
        });

        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Bind static new analysis button on dashboard
        const newAnalysisBtn = document.getElementById('dashboardNewAnalysisBtn');
        if (newAnalysisBtn) {
            newAnalysisBtn.addEventListener('click', () => this.navigateTo('analysis'));
        }

        // Bind view all results button
        const viewAllResultsBtn = document.getElementById('viewAllResultsBtn');
        if (viewAllResultsBtn) {
            viewAllResultsBtn.addEventListener('click', () => this.navigateTo('results'));
        }

        // Tour Buttons
        document.getElementById('navTourBtn')?.addEventListener('click', () => {
            this.showWelcomeModal(true);
        });
        document.getElementById('dashboardTourBtn')?.addEventListener('click', () => {
            this.showWelcomeModal(true);
        });
    }

    // Bind dynamically generated buttons using event delegation
    bindDynamicButtons() {
        // Event delegation for all dynamic onclick handlers
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('button, .analysis-item, .result-card');
            if (!target) return;

            // Handle navigation to analysis page
            if (target.textContent.includes('İlk Analizini Yap') || 
                target.textContent.includes('Analiz Yap') ||
                target.textContent.includes('Yeni Analiz')) {
                if (target.getAttribute('onclick')?.includes("navigateTo('analysis')")) {
                    e.preventDefault();
                    this.navigateTo('analysis');
                    return;
                }
            }

            // Handle view analysis detail
            const onclickAttr = target.getAttribute('onclick');
            if (onclickAttr?.includes('viewAnalysisDetail')) {
                e.preventDefault();
                const match = onclickAttr.match(/viewAnalysisDetail\('([^']+)'\)/);
                if (match) {
                    this.viewAnalysisDetail(match[1]);
                }
                return;
            }

            // Handle review pool navigation
            if (onclickAttr?.includes("navigateTo('review')")) {
                e.preventDefault();
                this.navigateTo('review');
                return;
            }

            // Handle report navigation
            if (onclickAttr?.includes("navigateTo('report')")) {
                e.preventDefault();
                this.navigateTo('report');
                return;
            }

            // Handle dashboard navigation
            if (onclickAttr?.includes("navigateTo('dashboard')")) {
                e.preventDefault();
                this.navigateTo('dashboard');
                return;
            }
        });
    }

    navigateTo(page) {
        if (page === 'ai-analysis' && !this.settings.aiAnalysisEnabled) {
            page = 'analysis';
        }
        this.currentPage = page;

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (navItem) navItem.classList.add('active');

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const pageEl = document.getElementById(`page-${page}`);
        if (pageEl) pageEl.classList.add('active');

        // Trigger page-specific updates
        if (page === 'dashboard') this.updateDashboard();
        if (page === 'analysis') {
            if (window.manualAnalyzer && window.manualAnalyzer.currentStage === 'results' && !window.manualAnalyzer.editingAnalysisId) {
                window.manualAnalyzer.resetAll();
            }
        }
        if (page === 'results') {
            const historyView = document.getElementById('resultsHistoryView');
            const detailView = document.getElementById('resultsDetailView');
            if (this._openingDetail) {
                if (historyView) historyView.style.display = 'none';
                if (detailView) detailView.style.display = 'block';
            } else {
                if (detailView) detailView.style.display = 'none';
                if (historyView) historyView.style.display = 'block';
                const resultsStage = document.getElementById('manualStage_results');
                if (resultsStage) resultsStage.classList.add('hidden');
                if (window.manualAnalyzer) {
                    window.manualAnalyzer.currentAnalysis = null;
                    if (typeof window.manualAnalyzer.cancelRenameAnalysis === 'function') {
                        window.manualAnalyzer.cancelRenameAnalysis();
                    }
                }
            }
            this.renderResultsHistory();
        }
        if (page === 'report') this.renderStudyReport();
        if (page === 'review') {
            if (typeof window.reviewPool?.migrateAndRepairPool === 'function') {
                window.reviewPool.migrateAndRepairPool();
            }
            if (typeof window.reviewPool?.renderPool === 'function') {
                window.reviewPool.renderPool();
            }
        }
        if (page === 'settings') {
            // Refresh the detail options panel in case manualAnalyzer was initialized after app
            if (window.manualAnalyzer) {
                this.renderExamTypesTags();
                this.renderSubjectsTags();
                this.populateTopicSettingsSelects();
                this.renderTopicsSettingsTags();
            }
            // Check File System Access API support and show warning
            this.checkFileSystemSupport();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateAINavVisibility() {
        const navItem = document.getElementById('navAiAnalysis');
        if (navItem) {
            navItem.style.display = this.settings.aiAnalysisEnabled ? 'flex' : 'none';
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        this.settings.sidebarCollapsed = sidebar.classList.contains('collapsed');
        this.saveSettings();
    }

    applySidebarState(collapsed) {
        if (collapsed) {
            document.getElementById('sidebar').classList.add('collapsed');
        }
    }

    // ---- Theme ----
    applyTheme(theme) {
        if (theme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        this.settings.theme = theme;
    }

    applyFontSize(size) {
        document.documentElement.style.setProperty('--font-size-base', size + 'px');
        this.settings.fontSize = size;
        const el = document.getElementById('fontSizeValue');
        if (el) el.textContent = size + 'px';
    }

    applyAnimations(enabled) {
        document.documentElement.setAttribute('data-animations', enabled ? 'true' : 'false');
        this.settings.animations = enabled;
    }

    applyAccentColor(color) {
        // Convert hex to RGB for CSS variables
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Update CSS custom properties
        document.documentElement.style.setProperty('--accent-primary', color);
        document.documentElement.style.setProperty('--primary-color', color);
        document.documentElement.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
        
        this.settings.accentColor = color;
    }

    // ---- Settings ----
    bindSettings() {
        // Theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.applyTheme(btn.dataset.theme);
                this.saveSettings();
                this.showToast('Tema değiştirildi', 'success');
            });
        });

        // Font size
        document.getElementById('fontDecrease')?.addEventListener('click', () => {
            if (this.settings.fontSize > 12) {
                this.applyFontSize(this.settings.fontSize - 1);
                this.saveSettings();
            }
        });
        document.getElementById('fontIncrease')?.addEventListener('click', () => {
            if (this.settings.fontSize < 24) {
                this.applyFontSize(this.settings.fontSize + 1);
                this.saveSettings();
            }
        });

        // Animations toggle
        document.getElementById('animationsToggle')?.addEventListener('change', (e) => {
            this.applyAnimations(e.target.checked);
            this.saveSettings();
        });

        // API Key — save on button click OR on Enter key OR on blur
        const apiKeyInput = document.getElementById('apiKeyInput');
        const saveApiKeyBtn = document.getElementById('saveApiKey');

        const saveApiKey = async () => {
            const key = (apiKeyInput?.value || '').trim();
            this.settings.apiKey = key;
            this.saveSettings();
            if (key) {
                this.showToast('API anahtarı kaydedildi, modeller yükleniyor...', 'info');
                await this.fetchAvailableModels(key);
            } else {
                this.showToast('API anahtarı kaldırıldı', 'warning');
                this.resetModelSelect();
            }
        };

        saveApiKeyBtn?.addEventListener('click', saveApiKey);
        apiKeyInput?.addEventListener('blur', async () => {
            const key = (apiKeyInput.value || '').trim();
            if (key !== this.settings.apiKey) await saveApiKey();
        });
        apiKeyInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveApiKey();
        });

        // Refresh models button
        document.getElementById('refreshModelsBtn')?.addEventListener('click', () => {
            const key = this.settings.apiKey;
            if (key) this.fetchAvailableModels(key);
        });

        // AI Model change
        document.getElementById('aiModelSelect')?.addEventListener('change', (e) => {
            this.settings.aiModel = e.target.value;
            this.saveSettings();
        });

        document.getElementById('toggleApiKey')?.addEventListener('click', () => {
            const input = document.getElementById('apiKeyInput');
            const icon = document.getElementById('toggleApiKey')?.querySelector('.material-icons-outlined');
            if (input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility_off';
            } else {
                input.type = 'password';
                icon.textContent = 'visibility';
            }
        });

        // AI Model — handled in saveApiKey above

        // AI Analysis Toggle
        document.getElementById('aiAnalysisToggle')?.addEventListener('change', (e) => {
            this.settings.aiAnalysisEnabled = e.target.checked;
            this.saveSettings();
            this.updateAINavVisibility();
            if (!e.target.checked && this.currentPage === 'ai-analysis') {
                this.navigateTo('analysis');
            }
            this.showToast(e.target.checked ? 'Yapay zeka analizi menüye eklendi' : 'Yapay zeka analizi menüden kaldırıldı', 'info');
        });

        // Notification toggles
        document.getElementById('notifReviewToggle')?.addEventListener('change', (e) => {
            this.settings.notifications = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('soundToggle')?.addEventListener('change', (e) => {
            this.settings.sounds = e.target.checked;
            this.saveSettings();
        });

        // File Storage Management
        document.getElementById('selectStorageFolderBtn')?.addEventListener('click', () => this.selectStorageFolder());
        document.getElementById('refreshStorageInfoBtn')?.addEventListener('click', () => this.updateStorageInfo());
        document.getElementById('autoBackupToggle')?.addEventListener('change', (e) => {
            this.settings.autoBackup = e.target.checked;
            this.saveSettings();
        });

        // Data Management
        document.getElementById('exportDataBtn')?.addEventListener('click', () => this.exportData());
        document.getElementById('importDataBtn')?.addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });
        document.getElementById('importFileInput')?.addEventListener('change', (e) => this.importData(e));

        document.getElementById('deleteAllDataBtn')?.addEventListener('click', () => {
            this.showConfirmModal(
                'Tüm Verileri Sil',
                'Bu işlem geri alınamaz. Tüm analiz verileri, tekrar havuzu ve ayarlar kalıcı olarak silinecektir. Devam etmek istiyor musunuz?',
                async () => {
                    const loader = this.showLoadingToast('🗑️ Tüm veritabanı ve dosyalar siliniyor, lütfen bekleyin...');
                    await new Promise(r => setTimeout(r, 40));
                    await this.deleteAllData(loader);
                }
            );
        });

        // Settings Accordion - Only one section open at a time
        this.bindAccordion();

        // Export Report
        document.getElementById('exportReportBtn')?.addEventListener('click', () => this.downloadReport());

        // Report Filters
        document.getElementById('reportExamFilter')?.addEventListener('change', () => {
            if (this.currentPage === 'report') this.renderStudyReport();
        });
        document.getElementById('reportSubjectFilter')?.addEventListener('change', () => {
            if (this.currentPage === 'report') this.renderStudyReport();
        });

        // Detail Options Management (Exams / Subjects / Topics)
        this.bindDetailOptionsSettings();
        
        // Review Interval Settings
        document.getElementById('reviewIntervalWrong')?.addEventListener('change', (e) => {
            const value = parseInt(e.target.value) || 1;
            this.settings.reviewIntervalWrong = Math.max(1, Math.min(30, value));
            e.target.value = this.settings.reviewIntervalWrong;
            this.saveSettings();
            this.showToast('Yanlış cevap aralığı güncellendi', 'success');
        });
        
        document.getElementById('reviewIntervalBlank')?.addEventListener('change', (e) => {
            const value = parseInt(e.target.value) || 2;
            this.settings.reviewIntervalBlank = Math.max(1, Math.min(30, value));
            e.target.value = this.settings.reviewIntervalBlank;
            this.saveSettings();
            this.showToast('Boş cevap aralığı güncellendi', 'success');
        });
        
        document.getElementById('reviewIntervalCorrect')?.addEventListener('change', (e) => {
            const value = parseInt(e.target.value) || 3;
            this.settings.reviewIntervalCorrect = Math.max(1, Math.min(30, value));
            e.target.value = this.settings.reviewIntervalCorrect;
            this.saveSettings();
            this.showToast('Doğru cevap aralığı güncellendi', 'success');
        });
        
        document.getElementById('reviewMasteredCount')?.addEventListener('change', (e) => {
            const value = parseInt(e.target.value) || 3;
            this.settings.reviewMasteredCount = Math.max(1, Math.min(10, value));
            e.target.value = this.settings.reviewMasteredCount;
            this.saveSettings();
            this.showToast('Öğrenildi sayısı güncellendi', 'success');
        });
        
        // Color Palette in Settings
        document.querySelectorAll('.color-palette .color-swatch').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.applyAccentColor(color);
                this.settings.accentColor = color;
                this.saveSettings();
                document.querySelectorAll('.color-palette .color-swatch').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.showToast('Vurgu rengi değiştirildi', 'success');
            });
        });

        // Exam Net Penalty Rule Settings
        const penaltySelect = document.getElementById('penaltyRuleSelect');
        const customPenaltyGroup = document.getElementById('customPenaltyGroup');
        const customPenaltyInput = document.getElementById('customPenaltyInput');

        penaltySelect?.addEventListener('change', (e) => {
            this.settings.penaltyRule = e.target.value;
            if (customPenaltyGroup) {
                customPenaltyGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
            }
            this.saveSettings();
            if (this.currentPage === 'dashboard') this.updateDashboard();
            if (this.currentPage === 'results') this.renderResultsHistory();
            this.showToast('Net hesaplama kuralı güncellendi', 'success');
        });

        customPenaltyInput?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) {
                this.settings.customPenalty = val;
                this.saveSettings();
                if (this.currentPage === 'dashboard') {
                    this.renderNetPerformanceChart();
                }
            }
        });
    }

    bindAccordion() {
        // Settings Accordion: click header to toggle, only one open at a time
        const headers = document.querySelectorAll('.settings-section-header');
        headers.forEach(header => {
            if (header.dataset.accordionBound === '1') return;
            header.dataset.accordionBound = '1';
            header.addEventListener('click', (e) => {
                const section = header.closest('.settings-section');
                if (!section) return;
                const isOpen = section.classList.contains('expanded');
                // Close all sections
                document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('expanded'));
                // If it was closed, open it
                if (!isOpen) {
                    section.classList.add('expanded');
                }
            });
        });
    }

    bindDetailOptionsSettings() {
        // Defer initial render until all scripts (including manual-analysis.js) are loaded
        const initRender = () => {
            this.renderExamTypesTags();
            this.renderSubjectsTags();
            this.renderTopicsSettingsTags();
            this.populateTopicSettingsSelects();
        };

        // If manualAnalyzer is already available, render now; otherwise defer
        if (window.manualAnalyzer) {
            initRender();
        } else {
            window.addEventListener('load', initRender, { once: true });
        }

        // Add exam type
        const addExamBtn = document.getElementById('addExamTypeBtn');
        const newExamInput = document.getElementById('newExamTypeInput');
        const doAddExam = () => {
            const val = (newExamInput?.value || '').trim().toUpperCase();
            if (!val) return;
            const ma = window.manualAnalyzer;
            if (ma && !ma.examTypes.includes(val)) {
                ma.examTypes.push(val);
                this.saveCustomOptions();
                if (newExamInput) newExamInput.value = '';
                this.renderExamTypesTags();
                this.populateTopicSettingsSelects();
                this.showToast(`"${val}" sınav türü eklendi`, 'success');
            } else {
                this.showToast('Bu sınav türü zaten mevcut', 'warning');
            }
        };
        addExamBtn?.addEventListener('click', doAddExam);
        newExamInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAddExam(); });

        // Add subject
        const addSubjectBtn = document.getElementById('addSubjectBtn');
        const newSubjectInput = document.getElementById('newSubjectInput');
        const doAddSubject = () => {
            const val = (newSubjectInput?.value || '').trim();
            if (!val) return;
            const ma = window.manualAnalyzer;
            if (ma && !ma.subjects.includes(val)) {
                ma.subjects.push(val);
                this.saveCustomOptions();
                if (newSubjectInput) newSubjectInput.value = '';
                this.renderSubjectsTags();
                this.populateTopicSettingsSelects();
                this.showToast(`"${val}" dersi eklendi`, 'success');
            } else {
                this.showToast('Bu ders zaten mevcut', 'warning');
            }
        };
        addSubjectBtn?.addEventListener('click', doAddSubject);
        newSubjectInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAddSubject(); });

        // Topic subject/exam selects change
        document.getElementById('topicSettingsSubjectSelect')?.addEventListener('change', () => this.renderTopicsSettingsTags());
        document.getElementById('topicSettingsExamSelect')?.addEventListener('change', () => this.renderTopicsSettingsTags());

        // Add topic
        const addTopicBtn = document.getElementById('addTopicSettingsBtn');
        const newTopicInput = document.getElementById('newTopicInput');
        const doAddTopic = () => {
            const val = (newTopicInput?.value || '').trim();
            if (!val) return;
            const subjectEl = document.getElementById('topicSettingsSubjectSelect');
            const examEl = document.getElementById('topicSettingsExamSelect');
            const subject = subjectEl?.value || '';
            const exam = examEl?.value || 'TYT';
            const ma = window.manualAnalyzer;
            if (ma && subject) {
                if (ma.addCustomTopic(subject, val, exam)) {
                    if (newTopicInput) newTopicInput.value = '';
                    this.renderTopicsSettingsTags();
                    this.showToast(`"${val}" konusu eklendi`, 'success');
                } else {
                    this.showToast('Bu konu zaten mevcut', 'warning');
                }
            }
        };
        addTopicBtn?.addEventListener('click', doAddTopic);
        newTopicInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAddTopic(); });
    }

    saveCustomOptions() {
        // Save custom exam types and subjects via manualAnalyzer
        const ma = window.manualAnalyzer;
        if (!ma) return;
        localStorage.setItem('testai_custom_examTypes', JSON.stringify(ma.examTypes));
        localStorage.setItem('testai_custom_subjects', JSON.stringify(ma.subjects));
    }

    renderExamTypesTags() {
        const container = document.getElementById('examTypesTags');
        if (!container) return;
        const ma = window.manualAnalyzer;
        if (!ma) return;
        container.innerHTML = ma.examTypes.map(exam => {
            return `<span class="option-tag">
                ${exam}
                <button class="option-tag-delete" onclick="app.removeExamType('${exam}')" title="Kaldır">
                    <span class="material-icons-outlined" style="font-size:14px;">close</span>
                </button>
            </span>`;
        }).join('') || '<span style="color:var(--text-tertiary);font-size:0.8rem;">Sınav türü yok</span>';
    }

    renderSubjectsTags() {
        const container = document.getElementById('subjectsTags');
        if (!container) return;
        const ma = window.manualAnalyzer;
        if (!ma) return;
        container.innerHTML = ma.subjects.map(subj => {
            return `<span class="option-tag">
                ${subj}
                <button class="option-tag-delete" onclick="app.removeSubject('${subj}')" title="Kaldır">
                    <span class="material-icons-outlined" style="font-size:14px;">close</span>
                </button>
            </span>`;
        }).join('') || '<span style="color:var(--text-tertiary);font-size:0.8rem;">Ders yok</span>';
    }

    renderTopicsSettingsTags() {
        const container = document.getElementById('topicsTags');
        if (!container) return;
        const ma = window.manualAnalyzer;
        if (!ma) return;
        const subjectEl = document.getElementById('topicSettingsSubjectSelect');
        const examEl = document.getElementById('topicSettingsExamSelect');
        const subject = subjectEl?.value || '';
        const exam = examEl?.value || 'TYT';
        if (!subject) { container.innerHTML = '<span style="color:var(--text-tertiary);font-size:0.8rem;">Ders seç</span>'; return; }
        const customKey = `${exam}_${subject}`;
        const customList = ma.customTopics[customKey] || ma.customTopics[subject] || [];
        const defaultList = ma.getTopicsFor(exam, subject);

        let html = defaultList.map(t => `
            <span class="option-tag">
                ${t}
                <button class="option-tag-delete" onclick="app.removeTopicFromSettings('${subject}', '${t}', '${exam}')" title="Kaldır">
                    <span class="material-icons-outlined" style="font-size:14px;">close</span>
                </button>
            </span>
        `).join('');

        html += customList.map(t => `
            <span class="option-tag custom">
                ${t}
                <button class="option-tag-delete" onclick="app.removeTopicFromSettings('${subject}', '${t}', '${exam}')" title="Kaldır">
                    <span class="material-icons-outlined" style="font-size:14px;">close</span>
                </button>
            </span>
        `).join('');

        container.innerHTML = html || '<span style="color:var(--text-tertiary);font-size:0.8rem;">Bu ders için konu kalmadı</span>';
    }

    populateTopicSettingsSelects() {
        const ma = window.manualAnalyzer;
        if (!ma) return;
        const subjectEl = document.getElementById('topicSettingsSubjectSelect');
        const examEl = document.getElementById('topicSettingsExamSelect');
        if (subjectEl) {
            const curSubj = subjectEl.value;
            subjectEl.innerHTML = ma.subjects.map(s => `<option value="${s}" ${s === curSubj ? 'selected' : ''}>${s}</option>`).join('');
            if (!ma.subjects.includes(curSubj) && ma.subjects.length > 0) {
                subjectEl.value = ma.subjects[0];
            }
        }
        if (examEl) {
            const curExam = examEl.value;
            examEl.innerHTML = ma.examTypes.map(e => `<option value="${e}" ${e === curExam ? 'selected' : ''}>${e}</option>`).join('');
            if (!ma.examTypes.includes(curExam) && ma.examTypes.length > 0) {
                examEl.value = ma.examTypes[0];
            }
        }
    }

    removeExamType(exam) {
        const ma = window.manualAnalyzer;
        if (!ma) return;
        ma.examTypes = ma.examTypes.filter(e => e !== exam);
        this.saveCustomOptions();
        this.renderExamTypesTags();
        this.populateTopicSettingsSelects();
        this.renderTopicsSettingsTags();
        this.showToast(`"${exam}" sınav türü kaldırıldı`, 'info');
    }

    removeSubject(subject) {
        const ma = window.manualAnalyzer;
        if (!ma) return;
        ma.subjects = ma.subjects.filter(s => s !== subject);
        this.saveCustomOptions();
        this.renderSubjectsTags();
        this.populateTopicSettingsSelects();
        this.renderTopicsSettingsTags();
        this.showToast(`"${subject}" dersi kaldırıldı`, 'info');
    }

    removeTopicFromSettings(subject, topic, exam) {
        const ma = window.manualAnalyzer;
        if (!ma) return;
        ma.deleteTopic(subject, topic, exam);
        this.renderTopicsSettingsTags();
        this.showToast(`"${topic}" konusu kaldırıldı`, 'info');
    }

    removeCustomTopicFromSettings(subject, topic, exam) {
        this.removeTopicFromSettings(subject, topic, exam);
    }

    resetExamTypes() {
        const ma = window.manualAnalyzer;
        if (!ma) return;
        ma.resetExamTypes();
        this.renderExamTypesTags();
        this.populateTopicSettingsSelects();
        this.renderTopicsSettingsTags();
        this.showToast('Sınav türleri varsayılana sıfırlandı', 'success');
    }

    resetSubjects() {
        const ma = window.manualAnalyzer;
        if (!ma) return;
        ma.resetSubjects();
        this.renderSubjectsTags();
        this.populateTopicSettingsSelects();
        this.renderTopicsSettingsTags();
        this.showToast('Dersler varsayılana sıfırlandı', 'success');
    }

    resetTopics(subject, exam) {
        const ma = window.manualAnalyzer;
        if (!ma) return;
        const curSubject = subject || document.getElementById('topicSettingsSubjectSelect')?.value;
        const curExam = exam || document.getElementById('topicSettingsExamSelect')?.value || 'TYT';
        if (curSubject) {
            ma.resetTopics(curSubject, curExam);
            this.renderTopicsSettingsTags();
            this.showToast(`"${curSubject}" konuları varsayılana sıfırlandı`, 'success');
        }
    }


    restoreSettingsUI() {
        // Theme buttons
        document.querySelectorAll('.theme-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.theme === this.settings.theme);
        });

        // API Key
        const apiInput = document.getElementById('apiKeyInput');
        if (apiInput) apiInput.value = this.settings.apiKey || '';

        // Model select: load from API if key exists, otherwise reset
        if (this.settings.apiKey) {
            this.fetchAvailableModels(this.settings.apiKey, true); // silent = no toast
        } else {
            this.resetModelSelect();
        }

        // Toggles
        const animToggle = document.getElementById('animationsToggle');
        if (animToggle) animToggle.checked = this.settings.animations;

        const notifToggle = document.getElementById('notifReviewToggle');
        if (notifToggle) notifToggle.checked = this.settings.notifications;

        const soundToggle = document.getElementById('soundToggle');
        if (soundToggle) soundToggle.checked = this.settings.sounds;

        const aiToggle = document.getElementById('aiAnalysisToggle');
        if (aiToggle) aiToggle.checked = !!this.settings.aiAnalysisEnabled;

        // Review Intervals
        const wrongInput = document.getElementById('reviewIntervalWrong');
        if (wrongInput) wrongInput.value = this.settings.reviewIntervalWrong || 1;
        
        const blankInput = document.getElementById('reviewIntervalBlank');
        if (blankInput) blankInput.value = this.settings.reviewIntervalBlank || 2;
        
        const correctInput = document.getElementById('reviewIntervalCorrect');
        if (correctInput) correctInput.value = this.settings.reviewIntervalCorrect || 3;
        
        const masteredInput = document.getElementById('reviewMasteredCount');
        if (masteredInput) masteredInput.value = this.settings.reviewMasteredCount || 3;
        
        // Accent Color
        const accentColor = this.settings.accentColor || '#7c5cfc';
        this.applyAccentColor(accentColor);
        document.querySelectorAll('.color-swatch').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === accentColor);
        });

        // Net Calculation & Penalty Rules
        const penaltySelect = document.getElementById('penaltyRuleSelect');
        const customPenaltyGroup = document.getElementById('customPenaltyGroup');
        const customPenaltyInput = document.getElementById('customPenaltyInput');
        if (penaltySelect) {
            penaltySelect.value = this.settings.penaltyRule || '4';
        }
        if (customPenaltyGroup) {
            customPenaltyGroup.style.display = (this.settings.penaltyRule === 'custom') ? 'block' : 'none';
        }
        if (customPenaltyInput) {
            customPenaltyInput.value = this.settings.customPenalty || 4;
        }

        this.updateAINavVisibility();
    }

    resetModelSelect() {
        const select = document.getElementById('aiModelSelect');
        const desc = document.getElementById('modelSelectDesc');
        const refreshBtn = document.getElementById('refreshModelsBtn');
        if (select) {
            select.innerHTML = '<option value="">— API anahtarı girilmedi —</option>';
            select.disabled = true;
        }
        if (desc) desc.textContent = 'API anahtarını kaydettikten sonra modeller otomatik yüklenir';
        if (refreshBtn) refreshBtn.style.display = 'none';
    }

    async fetchAvailableModels(apiKey, silent = false) {
        const select = document.getElementById('aiModelSelect');
        const desc = document.getElementById('modelSelectDesc');
        const refreshBtn = document.getElementById('refreshModelsBtn');

        if (!select) return;

        // Loading state
        select.disabled = true;
        select.innerHTML = '<option value="">⏳ Modeller yükleniyor...</option>';
        if (desc) desc.textContent = 'API\'den model listesi alınıyor...';
        if (refreshBtn) refreshBtn.style.display = 'none';

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
            );

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `Hata: ${response.status}`);
            }

            const data = await response.json();
            const models = (data.models || [])
                // Only models that support generateContent
                .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                // Sort: newest/best first (by name descending)
                .sort((a, b) => b.name.localeCompare(a.name));

            if (models.length === 0) {
                throw new Error('Bu API anahtarına tanımlı model bulunamadı');
            }

            // Build options
            select.innerHTML = '';
            const savedModel = this.settings.aiModel || '';
            let hasMatch = false;

            models.forEach(m => {
                // model name format: "models/gemini-x.x-flash" → extract short name
                const shortName = m.name.replace('models/', '');
                const displayName = m.displayName || shortName;
                const opt = document.createElement('option');
                opt.value = shortName;
                opt.textContent = displayName;
                if (shortName === savedModel) {
                    opt.selected = true;
                    hasMatch = true;
                }
                select.appendChild(opt);
            });

            // If saved model not in list, select first and save
            if (!hasMatch && select.options.length > 0) {
                select.selectedIndex = 0;
                this.settings.aiModel = select.value;
                this.saveSettings();
            }

            select.disabled = false;
            if (refreshBtn) refreshBtn.style.display = 'inline-flex';
            if (desc) desc.textContent = `${models.length} model yüklendi`;

            // Re-bind change event (select was rebuilt)
            select.onchange = (e) => {
                this.settings.aiModel = e.target.value;
                this.saveSettings();
            };

            if (!silent) this.showToast(`${models.length} model yüklendi ✓`, 'success');

        } catch (err) {
            select.innerHTML = `<option value="">⚠ ${err.message}</option>`;
            select.disabled = true;
            if (refreshBtn) refreshBtn.style.display = 'inline-flex';
            if (desc) desc.textContent = 'Model listesi alınamadı — API anahtarını kontrol et';
            if (!silent) this.showToast('Modeller yüklenemedi: ' + err.message, 'error');
        }
    }



    // ---- Keyboard Shortcuts ----
    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.navigateTo('analysis');
            }
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                // Open drawing mode if there's an image to draw on
                if (window.canvasTools && window.canvasTools.lastImageData) {
                    window.canvasTools.openDrawingMode(window.canvasTools.lastImageData);
                }
            }
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                const current = this.settings.theme;
                const next = current === 'dark' ? 'light' : 'dark';
                this.applyTheme(next);
                document.querySelectorAll('.theme-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.theme === next);
                });
                this.saveSettings();
                this.showToast('Tema değiştirildi', 'success');
            }
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.navigateTo('review');
            }
            if (e.ctrlKey && e.key === ',') {
                e.preventDefault();
                this.navigateTo('settings');
            }
        });
    }

    // ---- Dashboard ----
    async updateDashboard() {
        const totalTests = this.analyses.length;
        let totalCorrect = 0, totalWrong = 0, totalQuestions = 0;
        let totalNet = 0;

        this.analyses.forEach(a => {
            const correct = a.correctCount || 0;
            const wrong = a.wrongCount || 0;
            totalCorrect += correct;
            totalWrong += wrong;
            totalQuestions += (a.totalQuestions || 0);

            const net = (a.net !== undefined && a.net !== null) ? Number(a.net) : this.calculateNet(correct, wrong);
            totalNet += net;
        });

        const successRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
        const averageNet = totalTests > 0 ? (totalNet / totalTests).toFixed(2) : '0.00';
        
        // Load review pool from IndexedDB if available, fallback to localStorage
        let reviewItems = [];
        if (this.db) {
            try {
                reviewItems = await this.loadReviewPoolFromIndexedDB();
            } catch (e) {
                reviewItems = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
            }
        } else {
            reviewItems = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
        }

        const totalTestsEl = document.getElementById('statTotalTests');
        const successRateEl = document.getElementById('statSuccessRate');
        const totalQuestionsEl = document.getElementById('statTotalQuestions');
        const reviewCountEl = document.getElementById('statReviewCount');

        if (totalTestsEl) totalTestsEl.textContent = totalTests;
        if (successRateEl) successRateEl.textContent = `%${successRate}`;
        if (totalQuestionsEl) totalQuestionsEl.textContent = totalQuestions;
        if (reviewCountEl) reviewCountEl.textContent = reviewItems.length;

        // Update Average Net card with exam-filtered value (persisted across reloads)
        this.updateDashboardAverageNetCard();

        // Restore Net Chart filter selections from localStorage
        const netExamFilter = document.getElementById('netChartExamFilter');
        const netLimitFilter = document.getElementById('netChartLimitFilter');
        const savedExam = localStorage.getItem('testai_filter_net_chart_exam');
        const savedLimit = localStorage.getItem('testai_filter_net_chart_limit');

        if (netExamFilter && savedExam && netExamFilter.querySelector(`option[value="${savedExam}"]`)) {
            netExamFilter.value = savedExam;
        }
        if (netLimitFilter && savedLimit && netLimitFilter.querySelector(`option[value="${savedLimit}"]`)) {
            netLimitFilter.value = savedLimit;
        }

        this.renderRecentAnalyses();
        this.renderWeakTopics();
        this.renderPerformanceChart();
        this.updateNetChartSubjectOptions();
        this.renderNetPerformanceChart();
        this.updateDashboardSubjectAvgExamOptions();
        this.renderDashboardSubjectAverages();
    }


    // ---- Average Net Card Exam Filtering & Persistence ----
    calculateAverageNetForExam(examType = 'all') {
        const exam = (examType || 'all').toUpperCase();
        let filtered = [...(this.analyses || [])];

        if (exam !== 'ALL') {
            if (exam === 'AYT') {
                filtered = filtered.filter(a => (a.exam || '').toUpperCase().startsWith('AYT'));
            } else {
                filtered = filtered.filter(a => (a.exam || 'TYT').toUpperCase() === exam);
            }
        }

        if (filtered.length === 0) {
            return { avg: '0.00', count: 0, totalNet: 0 };
        }

        let totalNet = 0;
        filtered.forEach(a => {
            const correct = a.correctCount || 0;
            const wrong = a.wrongCount || 0;
            const net = (a.net !== undefined && a.net !== null) ? Number(a.net) : this.calculateNet(correct, wrong);
            totalNet += net;
        });

        const avg = (totalNet / filtered.length).toFixed(2);
        return { avg, count: filtered.length, totalNet };
    }

    updateDashboardAverageNetCard() {
        const statAverageNetEl = document.getElementById('statAverageNet');
        const badgeEl = document.getElementById('statAverageNetBadge');
        const cardEl = document.getElementById('statCardAverageNet');
        if (!statAverageNetEl) return;

        const savedExam = (localStorage.getItem('testai_stat_avg_net_exam') || 'all').toUpperCase();
        const res = this.calculateAverageNetForExam(savedExam);

        statAverageNetEl.textContent = res.avg;

        let badgeText = 'Tümü';
        if (savedExam === 'TYT') badgeText = 'TYT';
        else if (savedExam === 'AYT') badgeText = 'AYT';
        else if (savedExam === 'AYT-SAYISAL') badgeText = 'AYT Say';
        else if (savedExam === 'AYT-EA') badgeText = 'AYT EA';
        else if (savedExam === 'AYT-SÖZEL') badgeText = 'AYT Söz';
        else if (savedExam !== 'ALL') badgeText = savedExam;

        if (badgeEl) {
            badgeEl.textContent = badgeText;
            badgeEl.title = `${badgeText} (${res.count} deneme)`;
        }

        if (cardEl) {
            cardEl.title = `${badgeText} Ortalama Net: ${res.avg} (${res.count} deneme) — Sınav türünü değiştirmek için tıklayın`;
        }
    }

    showAvgNetExamModal() {
        const modal = document.getElementById('avgNetExamModal');
        const select = document.getElementById('avgNetExamSelect');
        const previewVal = document.getElementById('avgNetExamPreviewVal');
        const cancelBtn = document.getElementById('avgNetExamCancelBtn');
        const confirmBtn = document.getElementById('avgNetExamConfirmBtn');
        if (!modal || !select) return;

        const currentExam = (localStorage.getItem('testai_stat_avg_net_exam') || 'all').toUpperCase();

        const standardExams = ['ALL', 'TYT', 'AYT', 'AYT-SAYISAL', 'AYT-EA', 'AYT-SÖZEL', 'ALES', 'KPSS', 'LGS', 'MSÜ', 'DGS', 'YDT'];
        const examSet = new Set(standardExams);

        (this.analyses || []).forEach(a => {
            if (a.exam && a.exam.trim()) {
                examSet.add(a.exam.trim().toUpperCase());
            }
        });

        try {
            const customExams = JSON.parse(localStorage.getItem('testai_custom_examTypes') || '[]');
            customExams.forEach(e => {
                if (typeof e === 'string' && e.trim()) examSet.add(e.trim().toUpperCase());
                else if (e && e.name && e.name.trim()) examSet.add(e.name.trim().toUpperCase());
            });
        } catch (e) {}

        let optionsHtml = '';
        examSet.forEach(e => {
            let label = e;
            if (e === 'ALL') label = 'Tüm Sınavlar (Genel Ortalama)';
            else if (e === 'AYT') label = 'AYT (Tümü)';
            else if (e === 'AYT-SAYISAL') label = 'AYT - Sayısal';
            else if (e === 'AYT-EA') label = 'AYT - Eşit Ağırlık';
            else if (e === 'AYT-SÖZEL') label = 'AYT - Sözel';

            const stat = this.calculateAverageNetForExam(e);
            const countInfo = stat.count > 0 ? ` (${stat.count} deneme - Ort: ${stat.avg})` : ' (0 deneme)';
            optionsHtml += `<option value="${e}">${this.escapeHtml(label + countInfo)}</option>`;
        });

        select.innerHTML = optionsHtml;
        select.value = examSet.has(currentExam) ? currentExam : 'ALL';

        const updatePreview = () => {
            const val = select.value;
            const stat = this.calculateAverageNetForExam(val);
            if (previewVal) {
                previewVal.textContent = `${stat.avg} Net (${stat.count} deneme)`;
            }
        };

        select.onchange = updatePreview;
        updatePreview();

        modal.classList.remove('hidden');

        const closeModal = () => {
            modal.classList.add('hidden');
        };

        cancelBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        confirmBtn.onclick = () => {
            const chosen = select.value;
            try {
                localStorage.setItem('testai_stat_avg_net_exam', chosen);
            } catch (err) {}
            this.updateDashboardAverageNetCard();
            closeModal();
            let label = chosen;
            if (chosen === 'ALL') label = 'Tüm Sınavlar';
            else if (chosen === 'AYT') label = 'AYT (Tümü)';
            this.showToast(`Ortalama Net gösterimi güncellendi (${label})`, 'success');
        };
    }

    renderRecentAnalyses() {
        const container = document.getElementById('recentAnalysesList');
        if (!container) return;
        if (this.analyses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-outlined">inbox</span>
                    <p>Henüz bir analiz yapılmadı.</p>
                    <button class="btn btn-primary btn-sm" onclick="app.navigateTo('analysis')">İlk Analizini Yap</button>
                </div>`;
            return;
        }

        const recent = [...this.analyses].reverse().slice(0, 5);
        container.innerHTML = recent.map(a => {
            const scoreColor = a.score >= 70 ? 'var(--color-correct)' : a.score >= 50 ? 'var(--color-blank)' : 'var(--color-wrong)';
            const scoreBg = a.score >= 70 ? 'var(--color-correct-bg)' : a.score >= 50 ? 'var(--color-blank-bg)' : 'var(--color-wrong-bg)';
            const netVal = (a.net !== undefined && a.net !== null) ? Number(a.net) : this.calculateNet(a.correctCount, a.wrongCount);
            return `
                <div class="analysis-item" onclick="app.viewAnalysisDetail('${a.id}')">
                    <div class="analysis-item-score" style="background:${scoreBg};color:${scoreColor}">
                        ${a.score}
                    </div>
                    <div class="analysis-item-info">
                        <h4>${a.title || 'İsimsiz Test'}</h4>
                        <span><b style="color:var(--accent-primary);margin-right:4px;">${a.exam || 'TYT'}</b> • ${a.subject || 'Genel'} • <b>${netVal.toFixed(2)} Net</b> • ${this.formatDate(a.date)}</span>
                    </div>
                </div>`;
        }).join('');
    }

    renderWeakTopics() {
        const container = document.getElementById('weakTopicsList');
        if (!container) return;
        const topicStats = {};

        this.analyses.forEach(a => {
            (a.questions || []).forEach(q => {
                if (!q.topic) return;
                if (!topicStats[q.topic]) {
                    topicStats[q.topic] = { correct: 0, total: 0 };
                }
                topicStats[q.topic].total++;
                if (q.isCorrect) topicStats[q.topic].correct++;
            });
        });

        const weakTopics = Object.entries(topicStats)
            .map(([topic, stats]) => ({ topic, rate: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0, total: stats.total }))
            .filter(t => t.rate < 70)
            .sort((a, b) => a.rate - b.rate)
            .slice(0, 6);

        if (weakTopics.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-outlined">school</span>
                    <p>Analiz yapıldıkça zayıf konuların burada görünecek.</p>
                </div>`;
            return;
        }

        container.innerHTML = weakTopics.map(t => {
            const barColor = t.rate < 30 ? 'var(--color-wrong)' : t.rate < 60 ? 'var(--color-blank)' : 'var(--color-blue)';
            return `
                <div class="weak-topic-item">
                    <span class="weak-topic-name">${t.topic}</span>
                    <div class="weak-topic-bar-wrapper">
                        <div class="weak-topic-bar">
                            <div class="weak-topic-bar-fill" style="width:${t.rate}%;background:${barColor}"></div>
                        </div>
                    </div>
                    <span class="weak-topic-rate" style="color:${barColor}">%${t.rate}</span>
                </div>`;
        }).join('');
    }


    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    renderPerformanceChart(hoveredIndex = null) {
        const canvas = document.getElementById('performanceChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (canvas.parentElement) {
            canvas.parentElement.style.position = 'relative';
        }

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 250 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '250px';
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 250;
        const padding = { top: 30, right: 30, bottom: 40, left: 50 };

        ctx.clearRect(0, 0, w, h);

        const scores = this.analyses.map(a => a.score || 0);
        if (scores.length < 2) {
            this.hideChartTooltip(canvas);
            canvas._chartPoints = [];
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim();
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('En az 2 analiz yapıldığında grafik görünecektir.', w / 2, h / 2);
            return;
        }

        const maxScore = 100;
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        // Grid lines
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim();
        const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();

        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'right';

        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            const val = maxScore - (maxScore / 4) * i;
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillText(val.toString(), padding.left - 8, y + 4);
        }

        // Points and lines with full metadata
        const points = scores.map((score, i) => {
            const analysis = this.analyses[i];
            return {
                x: padding.left + (chartW / (scores.length - 1)) * i,
                y: padding.top + chartH - (score / maxScore) * chartH,
                score: score,
                title: analysis ? (analysis.title || `Test ${i + 1}`) : `Test ${i + 1}`,
                exam: analysis ? (analysis.exam || 'TYT') : 'TYT',
                date: analysis ? analysis.date : null,
                analysis: analysis,
                type: 'performance'
            };
        });

        // Store points on canvas for interaction
        canvas._chartPoints = points;

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
        gradient.addColorStop(0, 'rgba(124, 92, 252, 0.2)');
        gradient.addColorStop(1, 'rgba(124, 92, 252, 0)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, h - padding.bottom);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, h - padding.bottom);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = '#7c5cfc';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Points & Hover Highlight
        points.forEach((p, i) => {
            const isHovered = (hoveredIndex === i);

            if (isHovered) {
                // Vertical guideline
                ctx.save();
                ctx.strokeStyle = 'rgba(124, 92, 252, 0.45)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(p.x, padding.top);
                ctx.lineTo(p.x, h - padding.bottom);
                ctx.stroke();
                ctx.restore();

                // Outer glowing halo
                ctx.beginPath();
                ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(124, 92, 252, 0.25)';
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, isHovered ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = '#7c5cfc';
            ctx.fill();
            ctx.strokeStyle = isHovered ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
            ctx.lineWidth = isHovered ? 2.5 : 2;
            ctx.stroke();

            // Label
            ctx.fillStyle = isHovered ? 'var(--text-primary)' : textColor;
            ctx.textAlign = 'center';
            ctx.font = isHovered ? 'bold 10px Inter, sans-serif' : '10px Inter, sans-serif';
            const label = p.title.length > 10 ? p.title.substring(0, 10) + '…' : p.title;
            ctx.fillText(label, p.x, h - padding.bottom + 16);
        });

        // Setup hover interaction
        this.setupChartHoverInteraction(canvas, 'performance', (idx) => this.renderPerformanceChart(idx));
    }

    // Dynamic subject dropdown for Net Chart based on analyses & selected exam
    updateNetChartSubjectOptions() {
        const subjectSelect = document.getElementById('netChartSubjectFilter');
        if (!subjectSelect) return;

        const examSelect = document.getElementById('netChartExamFilter');
        const selectedExam = examSelect ? examSelect.value : 'all';
        const currentSelectedSubject = subjectSelect.value;

        // Gather all subjects available in analyses
        const subjectSet = new Set();
        this.analyses.forEach(a => {
            if (selectedExam !== 'all' && (a.exam || 'TYT').toUpperCase() !== selectedExam.toUpperCase()) {
                return;
            }
            if (a.subject && a.subject !== 'Genel') {
                subjectSet.add(a.subject);
            }
            if (a.subjectBreakdown) {
                Object.keys(a.subjectBreakdown).forEach(s => subjectSet.add(s));
            }
            (a.questions || []).forEach(q => {
                if (q.subject && q.subject !== 'Genel') subjectSet.add(q.subject);
            });
        });

        // Also add standard subjects for selected exam if known
        if (window.manualAnalyzer && typeof window.manualAnalyzer.getSubjectsForExam === 'function') {
            const standardSubjs = window.manualAnalyzer.getSubjectsForExam(selectedExam === 'all' ? 'TYT' : selectedExam);
            (standardSubjs || []).forEach(s => subjectSet.add(s));
        }

        const sortedSubjects = Array.from(subjectSet).sort();
        let html = '<option value="all">Tüm Dersler</option>';
        sortedSubjects.forEach(s => {
            html += `<option value="${s}">${s}</option>`;
        });
        subjectSelect.innerHTML = html;

        // Restore saved selection from localStorage or previous selection if valid
        const savedSubject = localStorage.getItem('testai_filter_net_chart_subject');
        if (savedSubject && (savedSubject === 'all' || sortedSubjects.includes(savedSubject))) {
            subjectSelect.value = savedSubject;
        } else if (sortedSubjects.includes(currentSelectedSubject)) {
            subjectSelect.value = currentSelectedSubject;
        } else {
            subjectSelect.value = 'all';
        }
    }

    // Net Performance Chart with dynamic Alan (Exam) and Ders (Subject) filters
    renderNetPerformanceChart(hoveredIndex = null) {
        const canvas = document.getElementById('netPerformanceChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (canvas.parentElement) {
            canvas.parentElement.style.position = 'relative';
        }

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 250 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '250px';
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 250;
        const padding = { top: 30, right: 30, bottom: 40, left: 50 };

        ctx.clearRect(0, 0, w, h);

        const examFilter = document.getElementById('netChartExamFilter')?.value || 'all';
        const subjectFilter = document.getElementById('netChartSubjectFilter')?.value || 'all';
        const limitFilter = document.getElementById('netChartLimitFilter')?.value || 'all';

        // Filter analyses chronologically (oldest to newest)
        let filteredAnalyses = [...this.analyses];

        if (examFilter !== 'all') {
            filteredAnalyses = filteredAnalyses.filter(a => (a.exam || 'TYT').toUpperCase() === examFilter.toUpperCase());
        }

        // Calculate net for each analysis according to subject filter
        const dataPoints = [];
        filteredAnalyses.forEach(a => {
            let netVal = null;
            let subjectDetails = null;

            if (subjectFilter === 'all') {
                netVal = (a.net !== undefined && a.net !== null) ? Number(a.net) : this.calculateNet(a.correctCount, a.wrongCount);
            } else {
                // Check if analysis has subject breakdown for this specific subject
                if (a.subjectBreakdown && a.subjectBreakdown[subjectFilter]) {
                    const sb = a.subjectBreakdown[subjectFilter];
                    netVal = (sb.net !== undefined && sb.net !== null) ? Number(sb.net) : this.calculateNet(sb.correct, sb.wrong);
                    subjectDetails = {
                        name: subjectFilter,
                        correct: sb.correct || 0,
                        wrong: sb.wrong || 0,
                        blank: sb.blank || 0,
                        cancelled: sb.cancelled || 0,
                        net: netVal
                    };
                } else if (a.subject === subjectFilter) {
                    netVal = (a.net !== undefined && a.net !== null) ? Number(a.net) : this.calculateNet(a.correctCount, a.wrongCount);
                    subjectDetails = {
                        name: subjectFilter,
                        correct: a.correctCount || 0,
                        wrong: a.wrongCount || 0,
                        blank: a.blankCount || 0,
                        cancelled: a.cancelledCount || 0,
                        net: netVal
                    };
                } else {
                    // Check questions tagged with this subject
                    const subjQuestions = (a.questions || []).filter(q => q.subject === subjectFilter);
                    if (subjQuestions.length > 0) {
                        const c = subjQuestions.filter(q => q.isCorrect).length;
                        const wr = subjQuestions.filter(q => !q.isCorrect && !q.isBlank).length;
                        const bl = subjQuestions.filter(q => q.isBlank).length;
                        netVal = this.calculateNet(c, wr);
                        subjectDetails = {
                            name: subjectFilter,
                            correct: c,
                            wrong: wr,
                            blank: bl,
                            cancelled: 0,
                            net: netVal
                        };
                    }
                }
            }

            if (netVal !== null) {
                dataPoints.push({
                    title: a.title || 'Test',
                    exam: a.exam || 'TYT',
                    date: a.date,
                    net: Math.max(0, Math.round(netVal * 100) / 100),
                    analysis: a,
                    subjectDetails: subjectDetails
                });
            }
        });

        // Apply limit if specified
        let pointsToDisplay = dataPoints;
        if (limitFilter !== 'all') {
            const count = parseInt(limitFilter, 10);
            if (!isNaN(count) && count > 0) {
                pointsToDisplay = dataPoints.slice(-count);
            }
        }

        // Update Net Summary Strip (support both netSummary* and netStat* IDs)
        const latestEl = document.getElementById('netSummaryLast') || document.getElementById('netStatLatest');
        const highestEl = document.getElementById('netSummaryMax') || document.getElementById('netStatHighest');
        const averageEl = document.getElementById('netSummaryAvg') || document.getElementById('netStatAverage');
        const trendEl = document.getElementById('netSummaryTrend') || document.getElementById('netStatTrend');

        if (pointsToDisplay.length > 0) {
            const nets = pointsToDisplay.map(p => p.net);
            const latest = nets[nets.length - 1];
            const highest = Math.max(...nets);
            const avg = nets.reduce((sum, n) => sum + n, 0) / nets.length;

            if (latestEl) latestEl.textContent = latest.toFixed(2);
            if (highestEl) highestEl.textContent = highest.toFixed(2);
            if (averageEl) averageEl.textContent = avg.toFixed(2);

            if (trendEl) {
                if (nets.length >= 2) {
                    const prev = nets[nets.length - 2];
                    const diff = latest - prev;
                    const diffSign = diff >= 0 ? '+' : '';
                    trendEl.textContent = `${diffSign}${diff.toFixed(2)} Net`;
                    trendEl.style.color = diff >= 0 ? 'var(--color-teal)' : 'var(--color-wrong)';
                } else {
                    trendEl.textContent = 'Stabil';
                    trendEl.style.color = 'var(--text-secondary)';
                }
            }
        } else {
            if (latestEl) latestEl.textContent = '0.00';
            if (highestEl) highestEl.textContent = '0.00';
            if (averageEl) averageEl.textContent = '0.00';
            if (trendEl) {
                trendEl.textContent = '-';
                trendEl.style.color = 'var(--text-secondary)';
            }
        }

        // Check if enough points for graph
        if (pointsToDisplay.length < 2) {
            this.hideChartTooltip(canvas);
            canvas._chartPoints = [];
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim();
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Filtreye uygun en az 2 test analiz edildiğinde net grafiği çizilecektir.', w / 2, h / 2);
            return;
        }

        const nets = pointsToDisplay.map(p => p.net);
        const maxNet = Math.max(10, Math.ceil(Math.max(...nets) * 1.2));
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        // Grid lines
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim();
        const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();

        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'right';

        const gridSteps = 4;
        for (let i = 0; i <= gridSteps; i++) {
            const y = padding.top + (chartH / gridSteps) * i;
            const val = Math.round((maxNet - (maxNet / gridSteps) * i) * 10) / 10;
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillText(val.toString(), padding.left - 8, y + 4);
        }

        // Coordinates calculation with full metadata
        const points = pointsToDisplay.map((p, i) => ({
            x: padding.left + (chartW / (pointsToDisplay.length - 1)) * i,
            y: padding.top + chartH - (p.net / maxNet) * chartH,
            net: p.net,
            title: p.title,
            exam: p.exam,
            date: p.date,
            analysis: p.analysis,
            subjectDetails: p.subjectDetails,
            type: 'net'
        }));

        // Store points on canvas for interaction
        canvas._chartPoints = points;

        // Gradient area under the line
        const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.01)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, h - padding.bottom);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, h - padding.bottom);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Stroke line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.8;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Draw points and value badges
        points.forEach((p, i) => {
            const isHovered = (hoveredIndex === i);

            // If hovered, draw guideline and glowing ring
            if (isHovered) {
                // Vertical guideline
                ctx.save();
                ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(p.x, padding.top);
                ctx.lineTo(p.x, h - padding.bottom);
                ctx.stroke();
                ctx.restore();

                // Outer pulsing halo
                ctx.beginPath();
                ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, isHovered ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = '#10b981';
            ctx.fill();
            ctx.strokeStyle = isHovered ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
            ctx.lineWidth = isHovered ? 2.5 : 2.5;
            ctx.stroke();

            // Net value label above point
            ctx.fillStyle = isHovered ? '#34d399' : '#10b981';
            ctx.textAlign = 'center';
            ctx.font = isHovered ? 'bold 12px Inter, sans-serif' : 'bold 11px Inter, sans-serif';
            ctx.fillText(p.net.toFixed(1), p.x, p.y - (isHovered ? 12 : 10));

            // Test Title / Exam label on X axis
            ctx.fillStyle = isHovered ? 'var(--text-primary)' : textColor;
            ctx.font = isHovered ? 'bold 10px Inter, sans-serif' : '10px Inter, sans-serif';
            const label = p.title.length > 9 ? p.title.substring(0, 9) + '…' : p.title;
            ctx.fillText(label, p.x, h - padding.bottom + 16);
        });

        // Setup hover interaction
        this.setupChartHoverInteraction(canvas, 'net', (idx) => this.renderNetPerformanceChart(idx));
    }

    // ---- Interactive Chart Hover & Tooltips ----
    setupChartHoverInteraction(canvas, type, renderFn) {
        if (!canvas || canvas._hoverBound) return;
        canvas._hoverBound = true;

        // Hover delay: 500ms intentional pause (filters accidental mouse passage)
        // Switch delay: 80ms fluid transition when moving between points if already open
        const HOVER_DELAY = 500;
        const SWITCH_DELAY = 80;

        const findNearestPoint = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const points = canvas._chartPoints || [];
            let nearest = null;
            let minDist = 24; // 24px comfortable hit target
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const dist = Math.hypot(p.x - mouseX, p.y - mouseY);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { point: p, index: i };
                }
            }
            return nearest;
        };

        canvas.addEventListener('mousemove', (e) => {
            const nearest = findNearestPoint(e);
            if (!nearest) {
                canvas.style.cursor = 'default';
                if (canvas._hoveredIndex !== null && canvas._hoveredIndex !== undefined) {
                    clearTimeout(canvas._hoverTimer);
                    canvas._hoverTimer = null;
                    clearTimeout(canvas._hideTimer);
                    canvas._hideTimer = setTimeout(() => {
                        canvas._hoveredIndex = null;
                        renderFn(null);
                        this.hideChartTooltip(canvas);
                    }, 140);
                }
                return;
            }

            // A point is within hit target
            canvas.style.cursor = 'pointer';
            clearTimeout(canvas._hideTimer);

            if (canvas._hoveredIndex === nearest.index) {
                return; // Same point, keep existing state
            }

            // New point hovered
            clearTimeout(canvas._hoverTimer);
            canvas._hoveredIndex = nearest.index;
            renderFn(nearest.index);

            const tooltip = canvas.parentElement?.querySelector('.chart-tooltip');
            const isTooltipOpen = tooltip && tooltip.classList.contains('visible');
            const delay = isTooltipOpen ? SWITCH_DELAY : HOVER_DELAY;

            canvas._hoverTimer = setTimeout(() => {
                this.showChartTooltip(canvas, nearest.point, type);
            }, delay);
        });

        canvas.addEventListener('mouseleave', () => {
            canvas.style.cursor = 'default';
            clearTimeout(canvas._hoverTimer);
            canvas._hoverTimer = null;
            clearTimeout(canvas._hideTimer);
            canvas._hideTimer = setTimeout(() => {
                canvas._hoveredIndex = null;
                renderFn(null);
                this.hideChartTooltip(canvas);
            }, 180);
        });

        canvas.addEventListener('click', (e) => {
            const nearest = findNearestPoint(e);
            if (nearest && nearest.point && nearest.point.analysis && nearest.point.analysis.id) {
                this.viewAnalysisDetail(nearest.point.analysis.id);
            }
        });
    }

    getOrCreateChartTooltip(canvas, type) {
        const parent = canvas.parentElement;
        if (!parent) return null;
        parent.style.position = 'relative';

        let tooltip = parent.querySelector(`.chart-tooltip[data-chart-type="${type}"]`);
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'chart-tooltip';
            tooltip.dataset.chartType = type;
            parent.appendChild(tooltip);

            // Allow clicking tooltip directly to view analysis
            tooltip.addEventListener('click', () => {
                if (tooltip._currentAnalysisId) {
                    this.viewAnalysisDetail(tooltip._currentAnalysisId);
                }
            });

            // Prevent tooltip from disappearing when mouse hovers over it
            tooltip.addEventListener('mouseenter', () => {
                clearTimeout(canvas._hoverTimer);
                clearTimeout(canvas._hideTimer);
                tooltip.classList.add('visible');
            });

            tooltip.addEventListener('mouseleave', () => {
                this.hideChartTooltip(canvas);
            });
        }
        return tooltip;
    }

    showChartTooltip(canvas, point, type) {
        const tooltip = this.getOrCreateChartTooltip(canvas, type);
        if (!tooltip) return;

        const esc = (s) => (this && typeof this.escapeHtml === 'function')
            ? this.escapeHtml(s)
            : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

        const a = point.analysis || {};
        tooltip._currentAnalysisId = a.id;

        const title = a.title || point.title || 'İsimsiz Test';
        const exam = a.exam || point.exam || 'TYT';

        let dateStr = '';
        if (a.date || point.date) {
            try {
                dateStr = new Date(a.date || point.date).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });
            } catch (e) {
                dateStr = a.date || point.date;
            }
        }

        const c = (a.correctCount !== undefined) ? a.correctCount : ((a.questions && Array.isArray(a.questions)) ? a.questions.filter(q => q.isCorrect).length : 0);
        const w = (a.wrongCount !== undefined) ? a.wrongCount : ((a.questions && Array.isArray(a.questions)) ? a.questions.filter(q => !q.isCorrect && !q.isBlank).length : 0);
        const b = (a.blankCount !== undefined) ? a.blankCount : ((a.questions && Array.isArray(a.questions)) ? a.questions.filter(q => q.isBlank).length : 0);
        const cancel = a.cancelledCount || 0;
        const tot = a.totalQuestions || (c + w + b + cancel);

        const isNetChart = (type === 'net');
        const netVal = (point.net !== undefined && point.net !== null) ? Number(point.net) : ((a.net !== undefined && a.net !== null) ? Number(a.net) : Math.max(0, c - (w * 0.25)));
        const scoreVal = (point.score !== undefined && point.score !== null) ? point.score : (a.score !== undefined ? a.score : 0);

        const mainMetricVal = isNetChart ? `${netVal.toFixed(2)} Net` : `%${scoreVal} Başarı`;
        const subMetricVal = isNetChart ? `Puan: %${scoreVal}` : `Net: ${netVal.toFixed(2)}`;
        const mainColor = isNetChart ? '#10b981' : '#a78bfa';

        let subjectExtraHtml = '';
        if (isNetChart && point.subjectDetails) {
            const sd = point.subjectDetails;
            subjectExtraHtml = `
                <div class="chart-tooltip-subject-extra">
                    <div style="font-weight:700;color:#38bdf8;margin-bottom:2px;display:flex;align-items:center;gap:4px;">
                        <span class="material-icons-outlined" style="font-size:13px;">bookmark</span>
                        ${sd.name}: ${Number(sd.net).toFixed(2)} Net
                    </div>
                    <div style="color:var(--text-secondary,#cbd5e1);font-size:10px;">
                        ${sd.correct} D • ${sd.wrong} Y • ${sd.blank} B${sd.cancelled ? ` • ${sd.cancelled} İptal` : ''}
                    </div>
                </div>
            `;
        }

        tooltip.innerHTML = `
            <div class="chart-tooltip-header">
                <span class="chart-tooltip-title" title="${esc(title)}">${esc(title)}</span>
                <span class="chart-tooltip-badge">${esc(exam)}</span>
            </div>
            ${dateStr ? `
            <div class="chart-tooltip-date">
                <span class="material-icons-outlined" style="font-size:13px;">calendar_today</span>
                ${dateStr}
            </div>` : ''}
            <div class="chart-tooltip-metric-row">
                <span class="chart-tooltip-metric-main" style="color:${mainColor}">${mainMetricVal}</span>
                <span class="chart-tooltip-metric-sub">${subMetricVal}</span>
            </div>
            <div class="chart-tooltip-stats">
                <span class="chart-tooltip-stat-item chart-tooltip-stat-correct" title="Doğru">
                    <strong>✓</strong> ${c} D
                </span>
                <span class="chart-tooltip-stat-item chart-tooltip-stat-wrong" title="Yanlış">
                    <strong>✕</strong> ${w} Y
                </span>
                <span class="chart-tooltip-stat-item chart-tooltip-stat-blank" title="Boş">
                    <strong>○</strong> ${b} B
                </span>
                ${cancel > 0 ? `
                <span class="chart-tooltip-stat-item chart-tooltip-stat-cancelled" title="İptal / Hatalı Soru">
                    <strong>⊘</strong> ${cancel} İptal
                </span>` : ''}
                <span style="margin-left:auto;color:var(--text-tertiary,#94a3b8);font-size:10px;">
                    ${tot} Soru
                </span>
            </div>
            ${subjectExtraHtml}
            <div class="chart-tooltip-hint">
                Detayları açmak için tıklayın <span class="material-icons-outlined" style="font-size:11px;">open_in_new</span>
            </div>
        `;

        // Position tooltip relative to point
        const parentWidth = canvas.parentElement.clientWidth || 800;
        const clampLeft = Math.max(130, Math.min(parentWidth - 130, point.x));
        tooltip.style.left = clampLeft + 'px';

        if (point.y < 115) {
            tooltip.classList.add('position-bottom');
            tooltip.style.top = (point.y + 14) + 'px';
        } else {
            tooltip.classList.remove('position-bottom');
            tooltip.style.top = (point.y - 12) + 'px';
        }

        const arrowOffset = Math.round(point.x - clampLeft);
        tooltip.style.setProperty('--arrow-offset', `${arrowOffset}px`);

        tooltip.classList.add('visible');
    }

    hideChartTooltip(canvas) {
        if (!canvas) return;
        clearTimeout(canvas._hoverTimer);
        canvas._hoverTimer = null;
        const parent = canvas.parentElement;
        if (!parent) return;
        const tooltips = parent.querySelectorAll('.chart-tooltip');
        tooltips.forEach(t => t.classList.remove('visible'));
    }


    // ---- Dashboard Subject Averages Table ----
    updateDashboardSubjectAvgExamOptions() {
        const select = document.getElementById('dashboardSubjectAvgExamFilter');
        if (!select) return;

        const currentVal = select.value || 'all';

        // Standard exams
        const standardExams = ['TYT', 'AYT', 'AYT-SAYISAL', 'AYT-EA', 'AYT-SÖZEL', 'ALES', 'LGS', 'KPSS', 'MSÜ', 'DGS', 'YDT'];
        const examSet = new Set(standardExams);

        // Collect existing exam types from analyses
        (this.analyses || []).forEach(a => {
            if (a.exam && a.exam.trim()) {
                examSet.add(a.exam.trim().toUpperCase());
            }
        });

        // Collect from custom exam types setting if available
        try {
            const customExams = JSON.parse(localStorage.getItem('testai_custom_examTypes') || '[]');
            customExams.forEach(e => {
                if (typeof e === 'string' && e.trim()) examSet.add(e.trim().toUpperCase());
                else if (e && e.name && e.name.trim()) examSet.add(e.name.trim().toUpperCase());
            });
        } catch (err) {}

        let optionsHtml = '<option value="all">Tüm Sınavlar</option>';
        examSet.forEach(e => {
            let label = e;
            if (e === 'AYT') label = 'AYT (Tümü)';
            else if (e === 'AYT-SAYISAL') label = 'AYT - Sayısal';
            else if (e === 'AYT-EA') label = 'AYT - Eşit Ağırlık';
            else if (e === 'AYT-SÖZEL') label = 'AYT - Sözel';
            optionsHtml += `<option value="${this.escapeHtml(e)}">${this.escapeHtml(label)}</option>`;
        });

        select.innerHTML = optionsHtml;

        // Restore user choice from localStorage or previous value if exists
        const savedVal = localStorage.getItem('testai_filter_dash_subject_avg_exam');
        const targetVal = savedVal || currentVal || 'all';
        if (select.querySelector(`option[value="${targetVal}"]`)) {
            select.value = targetVal;
        } else {
            select.value = 'all';
        }
    }

    renderDashboardSubjectAverages() {
        const tbody = document.getElementById('dashboardSubjectAveragesBody');
        const tfoot = document.getElementById('dashboardSubjectAveragesFoot');
        const examSelect = document.getElementById('dashboardSubjectAvgExamFilter');
        if (!tbody) return;

        const selectedExam = (examSelect?.value || 'all').toUpperCase();

        // 1. Filter analyses by selected exam
        let filtered = [...this.analyses];
        if (selectedExam !== 'ALL') {
            if (selectedExam === 'AYT') {
                filtered = filtered.filter(a => (a.exam || '').toUpperCase().startsWith('AYT'));
            } else {
                filtered = filtered.filter(a => (a.exam || 'TYT').toUpperCase() === selectedExam);
            }
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:36px 16px;color:var(--text-tertiary);">
                        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
                            <span class="material-icons-outlined" style="font-size:36px;opacity:0.6;">analytics</span>
                            <span style="font-size:13px;">${selectedExam === 'ALL' ? 'Henüz kaydedilmiş analiz bulunmuyor.' : `"${selectedExam}" sınav türüne ait henüz analiz kaydedilmedi.`}</span>
                        </div>
                    </td>
                </tr>
            `;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        // 2. Aggregate subjects across all matching analyses
        const subjectStats = {};
        let overallTotals = {
            totalQuestions: 0,
            correct: 0,
            wrong: 0,
            blank: 0,
            cancelled: 0,
            net: 0,
            testCount: filtered.length
        };

        filtered.forEach(a => {
            let breakdown = a.subjectBreakdown;

            // Fallback compilation if breakdown is missing
            if (!breakdown || Object.keys(breakdown).length === 0) {
                breakdown = {};
                (a.questions || []).forEach(q => {
                    const s = q.subject || 'Genel';
                    if (!breakdown[s]) {
                        breakdown[s] = { total: 0, correct: 0, wrong: 0, blank: 0, cancelled: 0, net: 0 };
                    }
                    breakdown[s].total++;
                    if (q.isCorrect) breakdown[s].correct++;
                    else if (q.isBlank) breakdown[s].blank++;
                    else breakdown[s].wrong++;
                    breakdown[s].net = Number(Math.max(0, breakdown[s].correct - (breakdown[s].wrong * 0.25)).toFixed(2));
                });
            }

            // Accumulate overall analysis counts
            const aCor = Number(a.correctCount) || 0;
            const aWr = Number(a.wrongCount) || 0;
            const aBlk = Number(a.blankCount) || 0;
            const aCan = Number(a.cancelledCount) || 0;
            const aTot = Number(a.totalQuestions) || (aCor + aWr + aBlk + aCan);
            const aNet = (a.net !== undefined && a.net !== null) ? Number(a.net) : (aCor - (aWr * 0.25));

            overallTotals.totalQuestions += aTot;
            overallTotals.correct += aCor;
            overallTotals.wrong += aWr;
            overallTotals.blank += aBlk;
            overallTotals.cancelled += aCan;
            overallTotals.net += Math.max(0, aNet);

            // Accumulate per subject
            Object.keys(breakdown).forEach(s => {
                const item = breakdown[s] || {};
                if (!subjectStats[s]) {
                    subjectStats[s] = {
                        name: s,
                        totalSum: 0,
                        correctSum: 0,
                        wrongSum: 0,
                        blankSum: 0,
                        cancelledSum: 0,
                        netSum: 0,
                        testCount: 0
                    };
                }
                const sTot = Number(item.total) || 0;
                const sCor = Number(item.correct) || 0;
                const sWr = Number(item.wrong) || 0;
                const sBlk = Number(item.blank) || 0;
                const sCan = Number(item.cancelled) || 0;
                const sNet = (item.net !== undefined && item.net !== null) ? Number(item.net) : Math.max(0, sCor - (sWr * 0.25));

                subjectStats[s].totalSum += sTot;
                subjectStats[s].correctSum += sCor;
                subjectStats[s].wrongSum += sWr;
                subjectStats[s].blankSum += sBlk;
                subjectStats[s].cancelledSum += sCan;
                subjectStats[s].netSum += sNet;
                subjectStats[s].testCount += 1;
            });
        });

        // 3. Sort subjects according to exam canon
        const subjects = Object.keys(subjectStats);
        let sortedSubjects = subjects;
        if (window.manualAnalyzer && typeof window.manualAnalyzer.sortSubjectsByExam === 'function') {
            sortedSubjects = window.manualAnalyzer.sortSubjectsByExam(subjects, selectedExam === 'ALL' ? 'TYT' : selectedExam);
        } else {
            sortedSubjects.sort();
        }

        // Helper for formatting numbers
        const fmtNum = (num, decimals = 1) => {
            if (num === 0) return '0';
            const fixed = Number(num).toFixed(decimals);
            return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
        };

        // 4. Render rows
        const rowsHtml = sortedSubjects.map(s => {
            const st = subjectStats[s];
            const count = st.testCount || 1;

            const avgTotal = st.totalSum / count;
            const avgCorrect = st.correctSum / count;
            const avgWrong = st.wrongSum / count;
            const avgBlank = st.blankSum / count;
            const avgCancel = st.cancelledSum / count;
            const avgNet = Math.max(0, st.netSum / count);

            const validQuestions = Math.max(0, st.totalSum - st.cancelledSum);
            const rate = validQuestions > 0 ? Math.round((st.correctSum / validQuestions) * 100) : 0;
            const rateColor = rate >= 70 ? 'var(--color-correct, #10b981)' : rate >= 50 ? 'var(--color-blank, #f59e0b)' : 'var(--color-wrong, #ef4444)';

            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.2s;" onmouseenter="this.style.background='rgba(255,255,255,0.02)'" onmouseleave="this.style.background='transparent'">
                    <td style="padding:11px 10px;text-align:left;">
                        <strong style="color:var(--text-primary);font-size:13.5px;">${this.escapeHtml(s)}</strong>
                    </td>
                    <td style="padding:11px 10px;text-align:center;font-weight:600;color:var(--text-secondary);">${fmtNum(avgTotal)}</td>
                    <td style="padding:11px 10px;text-align:center;"><span class="text-correct" style="font-weight:700;">${fmtNum(avgCorrect)}</span></td>
                    <td style="padding:11px 10px;text-align:center;"><span class="text-wrong" style="font-weight:700;">${fmtNum(avgWrong)}</span></td>
                    <td style="padding:11px 10px;text-align:center;"><span class="text-blank" style="font-weight:700;">${fmtNum(avgBlank)}</span></td>
                    <td style="padding:11px 10px;text-align:center;">
                        ${avgCancel > 0 ? `<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;font-size:10.5px;padding:2px 6px;">${fmtNum(avgCancel)} İptal</span>` : '<span style="color:var(--text-tertiary);">-</span>'}
                    </td>
                    <td style="padding:11px 10px;text-align:center;">
                        <span style="color:var(--primary-color);font-weight:700;font-size:14px;">${avgNet.toFixed(2)}</span>
                    </td>
                    <td style="padding:11px 10px;text-align:center;">
                        <div style="display:flex;align-items:center;gap:6px;justify-content:center;">
                            <div style="width:70px;height:6px;background:var(--bg-tertiary, rgba(255,255,255,0.1));border-radius:3px;overflow:hidden;">
                                <div style="width:${Math.min(100, rate)}%;height:100%;background:${rateColor};border-radius:3px;"></div>
                            </div>
                            <span style="font-weight:600;font-size:12px;color:${rateColor}">%${rate}</span>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;

        // 5. Render Footer Total / Average Row
        if (tfoot) {
            const numTests = overallTotals.testCount || 1;
            const ovAvgTotal = overallTotals.totalQuestions / numTests;
            const ovAvgCorrect = overallTotals.correct / numTests;
            const ovAvgWrong = overallTotals.wrong / numTests;
            const ovAvgBlank = overallTotals.blank / numTests;
            const ovAvgCancel = overallTotals.cancelled / numTests;
            const ovAvgNet = overallTotals.net / numTests;

            const ovValid = Math.max(0, overallTotals.totalQuestions - overallTotals.cancelled);
            const ovRate = ovValid > 0 ? Math.round((overallTotals.correct / ovValid) * 100) : 0;
            const ovRateColor = ovRate >= 70 ? 'var(--color-correct, #10b981)' : ovRate >= 50 ? 'var(--color-blank, #f59e0b)' : 'var(--color-wrong, #ef4444)';

            tfoot.innerHTML = `
                <tr style="border-top:2px solid var(--border-color);background:rgba(255,255,255,0.03);font-weight:700;">
                    <td style="padding:13px 10px;text-align:left;color:var(--text-primary);">
                        <span style="display:inline-flex;align-items:center;gap:4px;">
                            <span class="material-icons-outlined" style="font-size:16px;color:var(--primary-color);">functions</span>
                            GENEL ORTALAMA
                        </span>
                        <span style="font-size:10.5px;color:var(--text-tertiary);font-weight:normal;margin-left:6px;">(${numTests} Sınav)</span>
                    </td>
                    <td style="padding:13px 10px;text-align:center;color:var(--text-primary);font-weight:700;">${fmtNum(ovAvgTotal)}</td>
                    <td style="padding:13px 10px;text-align:center;"><span class="text-correct" style="font-weight:700;">${fmtNum(ovAvgCorrect)}</span></td>
                    <td style="padding:13px 10px;text-align:center;"><span class="text-wrong" style="font-weight:700;">${fmtNum(ovAvgWrong)}</span></td>
                    <td style="padding:13px 10px;text-align:center;"><span class="text-blank" style="font-weight:700;">${fmtNum(ovAvgBlank)}</span></td>
                    <td style="padding:13px 10px;text-align:center;">
                        ${ovAvgCancel > 0 ? `<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;font-size:10.5px;padding:2px 6px;">${fmtNum(ovAvgCancel)}</span>` : '<span style="color:var(--text-tertiary);">-</span>'}
                    </td>
                    <td style="padding:13px 10px;text-align:center;">
                        <span style="color:var(--primary-color);font-size:14px;font-weight:700;">${ovAvgNet.toFixed(2)} Net</span>
                    </td>
                    <td style="padding:13px 10px;text-align:center;">
                        <div style="display:flex;align-items:center;gap:6px;justify-content:center;">
                            <div style="width:70px;height:7px;background:var(--bg-tertiary, rgba(255,255,255,0.1));border-radius:3.5px;overflow:hidden;">
                                <div style="width:${Math.min(100, ovRate)}%;height:100%;background:${ovRateColor};border-radius:3.5px;"></div>
                            </div>
                            <span style="font-size:12.5px;color:${ovRateColor};font-weight:700;">%${ovRate}</span>
                        </div>
                    </td>
                </tr>
            `;
        }
    }

    // ---- Results History ----
    renderResultsHistory() {
        const container = document.getElementById('resultsHistoryList');
        if (!container) return;
        const searchVal = (document.getElementById('resultsSearch')?.value || '').toLowerCase();
        const filterVal = document.getElementById('resultsFilter')?.value || 'all';
        const examVal = document.getElementById('resultsExamFilter')?.value || 'all';

        let filtered = [...this.analyses].reverse();

        if (searchVal) {
            filtered = filtered.filter(a =>
                (a.title || '').toLowerCase().includes(searchVal) ||
                (a.subject || '').toLowerCase().includes(searchVal) ||
                (a.exam || '').toLowerCase().includes(searchVal)
            );
        }

        if (filterVal !== 'all') {
            filtered = filtered.filter(a => (a.subject || '').toLowerCase() === filterVal.toLowerCase());
        }

        if (examVal !== 'all') {
            filtered = filtered.filter(a => (a.exam || 'TYT').toUpperCase() === examVal.toUpperCase());
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-outlined">assessment</span>
                    <p>Filtre kriterlerine uygun analiz sonucu bulunmuyor.</p>
                </div>`;
            return;
        }

        container.innerHTML = filtered.map(a => {
            const scoreColor = a.score >= 70 ? 'var(--color-correct)' : a.score >= 50 ? 'var(--color-blank)' : 'var(--color-wrong)';
            const scoreBg = a.score >= 70 ? 'var(--color-correct-bg)' : a.score >= 50 ? 'var(--color-blank-bg)' : 'var(--color-wrong-bg)';
            const netVal = (a.net !== undefined && a.net !== null) ? Number(a.net) : this.calculateNet(a.correctCount, a.wrongCount);
            return `
                <div class="result-history-card" onclick="app.viewAnalysisDetail('${a.id}')">
                    <div class="result-history-score" style="background:${scoreBg};color:${scoreColor}">${a.score}</div>
                    <div class="result-history-info">
                        <h3><span class="badge" style="background:rgba(124, 92, 252, 0.15);color:var(--accent-primary);margin-right:6px;font-weight:700;">${a.exam || 'TYT'}</span>${a.title || 'İsimsiz Test'}</h3>
                        <p>${a.subject || 'Genel'} • ${this.formatDate(a.date)}</p>
                    </div>
                    <div class="result-history-stats">
                        <div class="stat"><b class="text-correct">${a.correctCount || 0}</b>Doğru</div>
                        <div class="stat"><b class="text-wrong">${a.wrongCount || 0}</b>Yanlış</div>
                        <div class="stat"><b class="text-blank">${a.blankCount || 0}</b>Boş</div>
                        <div class="stat"><b style="color:var(--color-teal);">${netVal.toFixed(2)}</b>Net</div>
                    </div>
                    <div class="result-history-actions">
                        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); app.promptCorrectCount('${a.id}')" title="Ders bazında doğru ve netleri düzenle">
                            <span class="material-icons-outlined">fact_check</span> Ders Doğruları / Net
                        </button>
                        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); app.editAnalysis('${a.id}')" title="Analizi ve Soruları Düzenle">
                            <span class="material-icons-outlined">edit</span> Düzenle
                        </button>
                        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); app.deleteAnalysis('${a.id}')" title="Sil">
                            <span class="material-icons-outlined">delete_outline</span>
                        </button>
                    </div>
                </div>`;
        }).join('');
    }

    viewAnalysisDetail(id) {
        if (!id) {
            this.showToast('Geçersiz analiz ID', 'warning');
            return;
        }
        if (window.manualAnalyzer) {
            window.manualAnalyzer.viewAnalysisResults(id);
        }
    }

    promptCorrectCount(id) {
        if (!id) return;
        const analysis = this.analyses.find(a => a.id === id);
        if (!analysis) {
            this.showToast('Analiz bulunamadı', 'warning');
            return;
        }
        // Direct route to the lesson-by-lesson breakdown editor in manual analyzer
        if (window.manualAnalyzer) {
            window.manualAnalyzer.viewAnalysisResults(id);
            setTimeout(() => {
                window.manualAnalyzer.toggleCorrectCountForm(true);
            }, 120);
        }
    }

    editAnalysis(id, questionIndex = 0) {
        if (!id) {
            this.showToast('Geçersiz analiz ID', 'warning');
            return;
        }
        
        const loader = this.showLoadingToast('📖 Analiz ve sayfalar yükleniyor, lütfen bekleyin...');
        
        if (window.manualAnalyzer) {
            window.manualAnalyzer.editAnalysis(id, questionIndex, loader);
        }
    }

    deleteAnalysis(id) {
        if (!id) {
            this.showToast('Geçersiz analiz ID', 'warning');
            return;
        }
        this.showConfirmModal(
            'Analizi Sil',
            'Bu analiz kalıcı olarak silinecektir. Bu teste ait tekrar havuzundaki sorular da silinecektir. Devam etmek istiyor musunuz?',
            async () => {
                // Immediate toast notification upon button click
                const loader = this.showLoadingToast('🗑️ Analiz ve ilişkili tüm veriler siliniyor, lütfen bekleyin...');
                await new Promise(r => setTimeout(r, 40));

                try {
                    this.analyses = this.analyses.filter(a => a.id !== id);
                    
                    // Delete from IndexedDB
                    if (this.db) {
                        await this.deleteAnalysisFromIndexedDB(id);
                    }
                    this.saveAnalyses();

                    // Delete from File Storage if configured
                    if (window.fileStorage && window.fileStorage.isConfigured()) {
                        try {
                            await window.fileStorage.deleteAnalysis(id);
                        } catch (err) {
                            if (err.name !== 'NotFoundError') {
                                console.warn('File Storage deletion failed:', err);
                            }
                        }
                    }

                    // Also remove associated review pool items for this analysis
                    if (this.db) {
                        const pool = await this.loadReviewPoolFromIndexedDB();
                        const filtered = pool.filter(item => {
                            return !item.id.startsWith(id + '_q') && item.testId !== id;
                        });
                        await this.saveReviewPoolToIndexedDB(filtered);
                        
                        if (window.reviewPool) {
                            window.reviewPool.pool = filtered;
                            window.reviewPool.renderPool();
                        }
                    } else {
                        const pool = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
                        const filtered = pool.filter(item => {
                            return !item.id.startsWith(id + '_q') && item.testId !== id;
                        });
                        localStorage.setItem('testai_reviewPool', JSON.stringify(filtered));
                        if (window.reviewPool) {
                            window.reviewPool.pool = filtered;
                            window.reviewPool.renderPool();
                        }
                    }
                    
                    this.updateReviewBadge();
                    this.renderResultsHistory();
                    loader.success('✅ Analiz, tekrar soruları ve dosyalar silindi');
                } catch(err) {
                    console.error('Delete error:', err);
                    loader.error('Silme hatası: ' + err.message);
                }
            }
        );
    }

    // ---- Study Report ----
    renderStudyReport() {
        const container = document.getElementById('reportContent');

        if (this.analyses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-outlined">description</span>
                    <p>Rapor oluşturmak için önce bir analiz yapın.</p>
                    <button class="btn btn-primary btn-sm" onclick="app.navigateTo('analysis')">Analiz Yap</button>
                </div>`;
            return;
        }

        // Get filter values
        const examFilter = document.getElementById('reportExamFilter')?.value || 'all';
        const subjectFilter = document.getElementById('reportSubjectFilter')?.value || 'all';

        let filteredQuestions = [];
        const subjectData = {};
        const topicData = {};
        const allWrongQuestions = [];
        const matchingTests = new Set();

        this.analyses.forEach(analysis => {
            const aExam = analysis.exam || 'Diğer';
            const aSubject = analysis.subject || 'Genel';

            // Filter and aggregate cropped questions within analysis
            (analysis.questions || []).forEach(q => {
                // Skip parent questions that have stems (they shouldn't be counted)
                if (!q.isStem && q.stemCount > 0) {
                    return;
                }
                
                // Get exam and subject from question, fallback to analysis
                const qExam = q.exam || aExam;
                const qSubject = q.subject || aSubject;
                
                // Apply filters
                let includeQuestion = true;
                if (examFilter !== 'all' && qExam !== examFilter) {
                    includeQuestion = false;
                }
                if (subjectFilter !== 'all' && qSubject !== subjectFilter) {
                    includeQuestion = false;
                }
                
                if (includeQuestion) {
                    filteredQuestions.push({
                        ...q,
                        testTitle: analysis.title,
                        testId: analysis.id,
                        exam: qExam,
                        subject: qSubject
                    });

                    // Subject-level aggregation
                    if (!subjectData[qSubject]) {
                        subjectData[qSubject] = { correct: 0, wrong: 0, blank: 0, total: 0, topics: {}, tests: new Set() };
                    }
                    subjectData[qSubject].total++;
                    if (q.isCorrect || q.status === 'correct') {
                        subjectData[qSubject].correct++;
                    } else if (q.isBlank || q.status === 'blank') {
                        subjectData[qSubject].blank++;
                    } else {
                        subjectData[qSubject].wrong++;
                    }
                    subjectData[qSubject].tests.add(analysis.title || 'İsimsiz Test');
                    matchingTests.add(analysis.title || 'İsimsiz Test');

                    // Topic-level aggregation within subject
                    const topic = q.topic || 'Genel';
                    if (!subjectData[qSubject].topics[topic]) {
                        subjectData[qSubject].topics[topic] = { correct: 0, wrong: 0, blank: 0, total: 0, questions: [] };
                    }
                    subjectData[qSubject].topics[topic].total++;
                    if (q.isCorrect || q.status === 'correct') {
                        subjectData[qSubject].topics[topic].correct++;
                    } else if (q.isBlank || q.status === 'blank') {
                        subjectData[qSubject].topics[topic].blank++;
                    } else {
                        subjectData[qSubject].topics[topic].wrong++;
                        subjectData[qSubject].topics[topic].questions.push(q);
                    }

                    // Global topic data
                    if (!topicData[topic]) {
                        topicData[topic] = { correct: 0, wrong: 0, blank: 0, total: 0, questions: [] };
                    }
                    topicData[topic].total++;
                    if (q.isCorrect || q.status === 'correct') {
                        topicData[topic].correct++;
                    } else if (q.isBlank || q.status === 'blank') {
                        topicData[topic].blank++;
                    } else {
                        topicData[topic].wrong++;
                        topicData[topic].questions.push(q);
                        allWrongQuestions.push(q);
                    }
                }
            });

            // Account for uncropped/manually entered counts (especially correctCount):
            let includeAnalysisExtra = true;
            if (examFilter !== 'all' && aExam !== examFilter) {
                includeAnalysisExtra = false;
            }
            if (subjectFilter !== 'all' && aSubject !== subjectFilter) {
                includeAnalysisExtra = false;
            }

            if (includeAnalysisExtra) {
                const visibleQuestions = (analysis.questions || []).filter(q => q.isStem || !q.stemCount);
                const croppedCorrect = visibleQuestions.filter(q => q.isCorrect || q.status === 'correct').length;
                const croppedWrong = visibleQuestions.filter(q => !q.isCorrect && !q.isBlank && q.status !== 'correct' && q.status !== 'blank').length;
                const croppedBlank = visibleQuestions.filter(q => q.isBlank || q.status === 'blank').length;

                const manualCorrect = analysis.correctCount !== undefined ? Number(analysis.correctCount) : 0;
                const manualWrong = analysis.wrongCount !== undefined ? Number(analysis.wrongCount) : 0;
                const manualBlank = analysis.blankCount !== undefined ? Number(analysis.blankCount) : 0;

                const extraCorrect = Math.max(0, manualCorrect - croppedCorrect);
                const extraWrong = Math.max(0, manualWrong - croppedWrong);
                const extraBlank = Math.max(0, manualBlank - croppedBlank);

                if (extraCorrect > 0 || extraWrong > 0 || extraBlank > 0) {
                    if (!subjectData[aSubject]) {
                        subjectData[aSubject] = { correct: 0, wrong: 0, blank: 0, total: 0, topics: {}, tests: new Set() };
                    }
                    subjectData[aSubject].correct += extraCorrect;
                    subjectData[aSubject].wrong += extraWrong;
                    subjectData[aSubject].blank += extraBlank;
                    subjectData[aSubject].total += (extraCorrect + extraWrong + extraBlank);
                    subjectData[aSubject].tests.add(analysis.title || 'İsimsiz Test');
                    matchingTests.add(analysis.title || 'İsimsiz Test');
                }
            }
        });

        const totalQ = Object.values(subjectData).reduce((s, d) => s + d.total, 0);
        if (totalQ === 0 && filteredQuestions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-outlined">filter_alt</span>
                    <p>Seçili filtrelere uygun soru veya analiz bulunamadı.</p>
                </div>`;
            return;
        }

        // Convert Set to array for test count
        Object.keys(subjectData).forEach(subject => {
            subjectData[subject].testCount = subjectData[subject].tests.size;
            delete subjectData[subject].tests;
        });

        const testCount = matchingTests.size > 0 ? matchingTests.size : new Set(filteredQuestions.map(q => q.testTitle)).size;

        // Generate report
        this.renderFilteredReport(subjectData, topicData, allWrongQuestions, filteredQuestions, testCount);
    }

    renderFilteredReport(subjectData, topicData, allWrongQuestions, filteredQuestions, customTestCount) {
        const container = document.getElementById('reportContent');
        
        // Overall stats
        const totalQ = Object.values(subjectData).reduce((s, d) => s + d.total, 0);
        const totalCorrect = Object.values(subjectData).reduce((s, d) => s + d.correct, 0);
        const totalWrong = Object.values(subjectData).reduce((s, d) => s + d.wrong, 0);
        const totalBlank = Object.values(subjectData).reduce((s, d) => s + d.blank, 0);
        const overallRate = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
        
        // Count unique tests
        const testCount = customTestCount !== undefined ? customTestCount : new Set(filteredQuestions.map(q => q.testTitle)).size;

        let html = `<div class="report-container">`;

        // Summary section
        html += `
            <div class="report-section">
                <h3><span class="material-icons-outlined">summarize</span> Genel Özet</h3>
                <div class="report-topic-card">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;text-align:center;">
                        <div><div style="font-size:2rem;font-weight:800;color:var(--accent-primary)">${testCount}</div><div style="font-size:0.75rem;color:var(--text-secondary)">Toplam Test</div></div>
                        <div><div style="font-size:2rem;font-weight:800;color:var(--color-correct)">%${overallRate}</div><div style="font-size:0.75rem;color:var(--text-secondary)">Başarı Oranı</div></div>
                        <div><div style="font-size:2rem;font-weight:800;color:var(--color-correct)">${totalCorrect}</div><div style="font-size:0.75rem;color:var(--text-secondary)">Doğru</div></div>
                        <div><div style="font-size:2rem;font-weight:800;color:var(--color-wrong)">${totalWrong}</div><div style="font-size:0.75rem;color:var(--text-secondary)">Yanlış</div></div>
                        <div><div style="font-size:2rem;font-weight:800;color:var(--color-blank)">${totalBlank}</div><div style="font-size:0.75rem;color:var(--text-secondary)">Boş</div></div>
                    </div>
                </div>
            </div>`;

        // Subject breakdown
        if (Object.keys(subjectData).length > 0) {
            html += `
                <div class="report-section">
                    <h3><span class="material-icons-outlined">school</span> Ders Bazında Detay</h3>`;

            Object.entries(subjectData).sort((a, b) => {
                const rateA = a[1].total > 0 ? (a[1].correct / a[1].total) : 0;
                const rateB = b[1].total > 0 ? (b[1].correct / b[1].total) : 0;
                return rateA - rateB; // Weakest first
            }).forEach(([subject, data]) => {
                const rate = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                const badgeColor = rate < 50 ? 'var(--color-wrong)' : rate < 70 ? 'var(--color-blank)' : 'var(--color-correct)';
                const badgeBg = rate < 50 ? 'var(--color-wrong-bg)' : rate < 70 ? 'var(--color-blank-bg)' : 'var(--color-correct-bg)';

                html += `
                    <div class="report-topic-card">
                        <div class="report-topic-header">
                            <h4>${subject}</h4>
                            <span class="report-topic-badge" style="background:${badgeBg};color:${badgeColor}">%${rate} başarı</span>
                        </div>
                        <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px;">
                            ${data.correct} doğru, ${data.wrong} yanlış, ${data.blank} boş — toplam ${data.total} soru
                        </div>
                    </div>`;
            });

            html += `</div>`;
        }

        // Topic breakdown for all subjects
        const sortedTopics = Object.entries(topicData)
            .map(([name, data]) => ({
                name,
                ...data,
                successRate: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0
            }))
            .sort((a, b) => a.successRate - b.successRate);

        if (sortedTopics.length > 0) {
            const weakTopics = sortedTopics.filter(t => t.successRate < 70);

            if (weakTopics.length > 0) {
                html += `
                    <div class="report-section">
                        <h3><span class="material-icons-outlined">warning_amber</span> Zayıf Konular</h3>`;

                weakTopics.slice(0, 5).forEach(topic => {
                    const badgeColor = topic.successRate < 30 ? 'var(--color-wrong)' : topic.successRate < 60 ? 'var(--color-blank)' : 'var(--color-blue)';
                    const badgeBg = topic.successRate < 30 ? 'var(--color-wrong-bg)' : topic.successRate < 60 ? 'var(--color-blank-bg)' : 'var(--color-blue-bg)';

                    html += `
                        <div class="report-topic-card">
                            <div class="report-topic-header">
                                <h4>${topic.name}</h4>
                                <span class="report-topic-badge" style="background:${badgeBg};color:${badgeColor}">%${topic.successRate} başarı</span>
                            </div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:12px;">
                                ${topic.correct} doğru, ${topic.wrong} yanlış, ${topic.blank} boş — toplam ${topic.total} soru
                            </div>
                            <div class="report-recommendations">
                                <div class="recommendation-item">
                                    <span class="material-icons-outlined">menu_book</span>
                                    <span>"${topic.name}" konusunu ders kitabından tekrar edin</span>
                                </div>
                                <div class="recommendation-item">
                                    <span class="material-icons-outlined">quiz</span>
                                    <span>Bu konudan en az ${Math.max(10, topic.wrong * 3)} adet soru çözün</span>
                                </div>
                            </div>
                        </div>`;
                });

                html += `</div>`;
            }

            // Strong topics
            const strongTopics = sortedTopics.filter(t => t.successRate >= 70);
            if (strongTopics.length > 0) {
                html += `
                    <div class="report-section">
                        <h3><span class="material-icons-outlined">emoji_events</span> Güçlü Konular</h3>`;

                strongTopics.forEach(topic => {
                    html += `
                        <div class="report-topic-card">
                            <div class="report-topic-header">
                                <h4>${topic.name}</h4>
                                <span class="report-topic-badge" style="background:var(--color-correct-bg);color:var(--color-correct)">%${topic.successRate} başarı</span>
                            </div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);">
                                ${topic.correct} doğru, ${topic.wrong} yanlış — toplam ${topic.total} soru
                            </div>
                        </div>`;
                });
                html += `</div>`;
            }
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    async downloadReport() {
        const reportEl = document.getElementById('reportContent');
        if (!reportEl || reportEl.querySelector('.empty-state')) {
            this.showToast('İndirilecek rapor bulunamadı', 'warning');
            return;
        }

        const reportLoader = this.showLoadingToast('📄 Rapor hazırlanıyor ve indiriliyor...');
        await new Promise(r => setTimeout(r, 40));

        // Create a text-based report
        let text = '=== DenemeLab — Sınav ve Deneme Raporu ===\n\n';
        text += `Oluşturulma Tarihi: ${new Date().toLocaleDateString('tr-TR')}\n\n`;

        this.analyses.forEach(a => {
            text += `--- ${a.title || 'İsimsiz Test'} ---\n`;
            text += `Ders: ${a.subject || 'Genel'} | Puan: ${a.score} | Doğru: ${a.correctCount} | Yanlış: ${a.wrongCount} | Boş: ${a.blankCount}\n`;
            (a.questions || []).forEach(q => {
                const status = q.isCorrect ? '✓' : q.isBlank ? '○' : '✗';
                text += `  ${status} Soru ${q.number}: ${q.questionText || ''}\n`;
                if (!q.isCorrect && !q.isBlank && q.explanation) {
                    text += `    Açıklama: ${q.explanation}\n`;
                }
            });
            text += '\n';
        });

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Deneme_Lab_Rapor_${new Date().toISOString().split('T')[0]}.txt`;
        link.click();
        URL.revokeObjectURL(url);

        if (typeof reportLoader !== 'undefined' && reportLoader) {
            reportLoader.success('✅ Rapor başarıyla indirildi');
        } else {
            this.showToast('Rapor indirildi', 'success');
        }
    }

    // ---- Data Management ----
    async exportData() {
        // Check if JSZip is available
        if (typeof JSZip === 'undefined') {
            this.showToast('ZIP kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.', 'error');
            return;
        }

        // Instant visual feedback on button and screen
        const btn = document.getElementById('exportDataBtn');
        const origHtml = btn ? btn.innerHTML : null;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-outlined spinning" style="font-size:16px;vertical-align:middle;margin-right:6px;">sync</span> İndiriliyor...';
        }

        const loader = this.showLoadingToast('📦 Yedek paketi hazırlanıyor ve indiriliyor, lütfen bekleyin...');
        await new Promise(r => setTimeout(r, 40)); // Allow DOM paint immediately

        try {
            const zip = new JSZip();
            const dateStr = new Date().toISOString().split('T')[0];

            // --- 1. Load all data ---
            let reviewPool = [];
            if (this.db) {
                try {
                    reviewPool = await this.loadReviewPoolFromIndexedDB();
                } catch (error) {
                    console.warn('Failed to load review pool from IndexedDB:', error);
                    reviewPool = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
                }
            } else {
                reviewPool = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
            }

            // Custom options
            const customExamTypes = JSON.parse(localStorage.getItem('testai_custom_examTypes') || '[]');
            const customSubjects = JSON.parse(localStorage.getItem('testai_custom_subjects') || '[]');
            const customTopics = window.manualAnalyzer ? window.manualAnalyzer.customTopics : JSON.parse(localStorage.getItem('testai_custom_topics') || '{}');
            const customErrors = JSON.parse(localStorage.getItem('testai_custom_errors') || '[]');
            const deletedTopics = JSON.parse(localStorage.getItem('testai_deleted_default_topics') || '{}');

            // --- 2. Build metadata-only analyses (with full lesson correct, wrong, blank, cancelled, and net counts) ---
            const analysesMeta = this.analyses.map(a => {
                const c = Number(a.correctCount) || 0;
                const w = Number(a.wrongCount) || 0;
                const b = Number(a.blankCount) || 0;
                const cancel = Number(a.cancelledCount) || 0;
                const tot = Number(a.totalQuestions) || (c + w + b + cancel);
                const netVal = (a.net !== undefined && a.net !== null)
                    ? Number(a.net)
                    : Number(this.calculateNet(c, w).toFixed(2));

                // Ensure subjectBreakdown has full ders ders numbers
                let breakdown = a.subjectBreakdown ? JSON.parse(JSON.stringify(a.subjectBreakdown)) : {};
                if (Object.keys(breakdown).length === 0 && Array.isArray(a.questions) && a.questions.length > 0) {
                    a.questions.forEach(q => {
                        const s = q.subject || 'Genel';
                        if (!breakdown[s]) {
                            breakdown[s] = { total: 0, correct: 0, wrong: 0, blank: 0, cancelled: 0, net: 0 };
                        }
                        breakdown[s].total++;
                        if (q.isCorrect) breakdown[s].correct++;
                        else if (q.isBlank) breakdown[s].blank++;
                        else breakdown[s].wrong++;
                        breakdown[s].net = Number(Math.max(0, breakdown[s].correct - (breakdown[s].wrong * 0.25)).toFixed(2));
                    });
                }

                return {
                    id: a.id,
                    title: a.title,
                    subject: a.subject,
                    exam: a.exam,
                    date: a.date,
                    score: a.score,
                    totalQuestions: tot,
                    correctCount: c,
                    wrongCount: w,
                    blankCount: b,
                    cancelledCount: cancel,
                    net: netVal,
                    subjectBreakdown: breakdown,
                    notes: a.notes,
                    imageDataPath: a.imageData ? `analyses/${a.id}/cover.png` : null,
                    originalPages: a.originalPages ? a.originalPages.map((p, pIdx) => ({
                        name: p.name || `Sayfa ${pIdx + 1}`,
                        width: p.width,
                        height: p.height,
                        pagePath: `analyses/${a.id}/pages/page_${pIdx + 1}.png`
                    })) : undefined,
                    rawQuestions: a.rawQuestions ? a.rawQuestions.map((rq, rqIdx) => ({
                        ...rq,
                        image: undefined,
                        imagePath: rq.image ? `analyses/${a.id}/questions/raw_${rq.id || rq.number || rqIdx}.png` : null
                    })) : undefined,
                    questions: (a.questions || []).map(q => ({
                        id: q.id,
                        number: q.number,
                        subject: q.subject,
                        topic: q.topic,
                        exam: q.exam,
                        status: q.status || (q.isCorrect ? 'correct' : q.isBlank ? 'blank' : 'wrong'),
                        isCorrect: q.isCorrect,
                        isBlank: q.isBlank,
                        answer: q.answer,
                        correctAnswer: q.correctAnswer,
                        note: q.note,
                        errors: q.errors,
                        isStem: q.isStem,
                        stemCount: q.stemCount,
                        stemIndex: q.stemIndex,
                        parentQuestionNumber: q.parentQuestionNumber,
                        stemNumber: q.stemNumber,
                        pageIndex: q.pageIndex,
                        box: q.box,
                        imagePath: q.image ? `analyses/${a.id}/questions/q_${q.id || q.number}.png` : null
                    }))
                };
            });

            // Review pool metadata (strip embedded images)
            const reviewPoolMeta = reviewPool.map(item => ({
                ...item,
                image: undefined,   // will be saved separately
                imagePath: item.image ? `review_pool/${item.id}.png` : null
            }));

            // --- 3. Main database JSON ---
            const dbJson = {
                version: '2.0',
                exportDate: new Date().toISOString(),
                exportApp: 'Deneme Lab',
                analyses: analysesMeta,
                reviewPool: reviewPoolMeta,
                settings: this.settings,
                customExamTypes,
                customSubjects,
                customTopics,
                customErrors,
                deletedTopics
            };
            zip.file('database.json', JSON.stringify(dbJson, null, 2));

            // --- 4. Export analysis images ---
            let imageCount = 0;
            for (const analysis of this.analyses) {
                const analysisFolder = `analyses/${analysis.id}/`;

                // Cover image
                if (analysis.imageData && typeof analysis.imageData === 'string' && analysis.imageData.startsWith('data:')) {
                    try {
                        const base64 = analysis.imageData.split(',')[1];
                        if (base64) {
                            zip.file(`${analysisFolder}cover.png`, base64, { base64: true });
                            imageCount++;
                        }
                    } catch (e) {
                        console.warn(`Failed to export cover image for ${analysis.id}:`, e);
                    }
                }

                // Original pages (test photos/documents)
                if (analysis.originalPages && analysis.originalPages.length > 0) {
                    const pagesFolder = analysisFolder + 'pages/';
                    for (let i = 0; i < analysis.originalPages.length; i++) {
                        const page = analysis.originalPages[i];
                        const dataUrl = page.data || page;
                        if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
                            try {
                                const base64 = dataUrl.split(',')[1];
                                if (base64) {
                                    zip.file(`${pagesFolder}page_${i + 1}.png`, base64, { base64: true });
                                    imageCount++;
                                }
                            } catch (e) {
                                console.warn(`Failed to export page ${i+1} of ${analysis.id}:`, e);
                            }
                        }
                    }
                }

                // Raw questions images
                if (analysis.rawQuestions && analysis.rawQuestions.length > 0) {
                    const qFolder = analysisFolder + 'questions/';
                    for (let i = 0; i < analysis.rawQuestions.length; i++) {
                        const rq = analysis.rawQuestions[i];
                        if (rq.image && typeof rq.image === 'string' && rq.image.startsWith('data:')) {
                            try {
                                const base64 = rq.image.split(',')[1];
                                const rqId = rq.id || rq.number || i;
                                const path = `${qFolder}raw_${rqId}.png`;
                                if (base64 && !zip.file(path)) {
                                    zip.file(path, base64, { base64: true });
                                    imageCount++;
                                }
                            } catch (e) {
                                console.warn(`Failed to export raw question image for ${analysis.id}:`, e);
                            }
                        }
                    }
                }

                // Question images (cropped question photos)
                if (analysis.questions && analysis.questions.length > 0) {
                    const qFolder = analysisFolder + 'questions/';
                    for (const question of analysis.questions) {
                        if (question.image && typeof question.image === 'string' && question.image.startsWith('data:')) {
                            try {
                                const base64 = question.image.split(',')[1];
                                const qId = question.id || question.number;
                                if (base64 && qId !== undefined) {
                                    zip.file(`${qFolder}q_${qId}.png`, base64, { base64: true });
                                    imageCount++;
                                }
                            } catch (e) {
                                console.warn(`Failed to export question image for ${analysis.id}:`, e);
                            }
                        }
                    }
                }

                // Per-analysis net and breakdown JSON & readable text
                const analysisNetVal = (analysis.net !== undefined && analysis.net !== null)
                    ? Number(analysis.net)
                    : Number(this.calculateNet(analysis.correctCount, analysis.wrongCount).toFixed(2));

                const analysisNetJson = {
                    id: analysis.id,
                    title: analysis.title,
                    exam: analysis.exam,
                    date: analysis.date,
                    totalQuestions: analysis.totalQuestions || 0,
                    correctCount: analysis.correctCount || 0,
                    wrongCount: analysis.wrongCount || 0,
                    blankCount: analysis.blankCount || 0,
                    cancelledCount: analysis.cancelledCount || 0,
                    net: analysisNetVal,
                    score: analysis.score || 0,
                    subjectBreakdown: analysis.subjectBreakdown || {}
                };
                zip.file(`${analysisFolder}netler.json`, JSON.stringify(analysisNetJson, null, 2));

                // Per-analysis readable breakdown text
                let singleReport = [
                    `DENEME / SINAV: ${analysis.title || 'İsimsiz Test'} (${analysis.exam || 'TYT'})`,
                    `Tarih         : ${analysis.date ? new Date(analysis.date).toLocaleDateString('tr-TR') : '-'}`,
                    `Genel Sonuç   : ${analysisNetJson.totalQuestions} Soru | ${analysisNetJson.correctCount} Doğru | ${analysisNetJson.wrongCount} Yanlış | ${analysisNetJson.blankCount} Boş | ${analysisNetJson.cancelledCount} İptal | Net: ${analysisNetVal.toFixed(2)} (Puan: ${analysis.score || 0})`,
                    '--------------------------------------------------------------------------------',
                    'DERS                 TOPLAM SORU    DOĞRU    YANLIŞ    BOŞ    İPTAL      NET',
                    '--------------------------------------------------------------------------------'
                ];
                const sbd = analysis.subjectBreakdown || {};
                Object.keys(sbd).forEach(s => {
                    const it = sbd[s] || {};
                    const pad = (str, len, alignRight = false) => {
                        str = String(str);
                        if (str.length >= len) return str;
                        const sp = ' '.repeat(len - str.length);
                        return alignRight ? sp + str : str + sp;
                    };
                    const sTot = it.total || 0;
                    const sCor = it.correct || 0;
                    const sWr = it.wrong || 0;
                    const sBlk = it.blank || 0;
                    const sCan = it.cancelled || 0;
                    const sN = (it.net !== undefined && it.net !== null) ? Number(it.net) : Math.max(0, sCor - (sWr * 0.25));
                    singleReport.push(`${pad(s, 20)}${pad(sTot, 12, true)}${pad(sCor, 9, true)}${pad(sWr, 9, true)}${pad(sBlk, 8, true)}${pad(sCan, 8, true)}${pad(sN.toFixed(2) + ' Net', 12, true)}`);
                });
                singleReport.push('--------------------------------------------------------------------------------');
                zip.file(`${analysisFolder}ders_sonuclari.txt`, singleReport.join('\n'));
            }

            // --- 5. Export review pool images ---
            for (const item of reviewPool) {
                if (item.image && typeof item.image === 'string' && item.image.startsWith('data:')) {
                    try {
                        const base64 = item.image.split(',')[1];
                        if (base64 && item.id) {
                            zip.file(`review_pool/${item.id}.png`, base64, { base64: true });
                            imageCount++;
                        }
                    } catch (e) {
                        console.warn(`Failed to export review pool image ${item.id}:`, e);
                    }
                }
            }

            // --- 6. Export Summary Text & CSV Reports ---
            // 6a. sonuclar_ve_netler.txt (Human-readable complete report)
            let textReport = [
                '================================================================================',
                '                 DENEME LAB — SINAV VE DERS NETLERİ RAPORU                      ',
                '================================================================================',
                `Dışa Aktarma Tarihi : ${new Date().toLocaleString('tr-TR')}`,
                `Toplam Deneme/Sınav  : ${this.analyses.length}`,
                `Toplam Soru Görseli  : ${imageCount}`,
                `Tekrar Havuzu        : ${reviewPool.length} soru`,
                '================================================================================\n'
            ];

            const padStr = (str, len, alignRight = false) => {
                str = String(str);
                if (str.length >= len) return str;
                const sp = ' '.repeat(len - str.length);
                return alignRight ? sp + str : str + sp;
            };

            this.analyses.forEach((a, idx) => {
                const aNet = (a.net !== undefined && a.net !== null) ? Number(a.net) : this.calculateNet(a.correctCount, a.wrongCount);
                const aDate = a.date ? new Date(a.date).toLocaleDateString('tr-TR') : '-';
                const aExam = a.exam || 'TYT';
                const aTotal = a.totalQuestions || ((a.correctCount || 0) + (a.wrongCount || 0) + (a.blankCount || 0) + (a.cancelledCount || 0));

                textReport.push(`[${idx + 1}] DENEME: ${a.title || 'İsimsiz Test'} (${aExam})`);
                textReport.push(`    Tarih : ${aDate}`);
                textReport.push(`    Puan  : ${a.score || 0}`);
                textReport.push(`    GENEL : Toplam ${aTotal} Soru | ${a.correctCount || 0} Doğru | ${a.wrongCount || 0} Yanlış | ${a.blankCount || 0} Boş | ${a.cancelledCount || 0} İptal | Net: ${aNet.toFixed(2)}`);
                textReport.push('    ----------------------------------------------------------------------------');
                textReport.push('    DERS                 TOPLAM SORU    DOĞRU    YANLIŞ    BOŞ    İPTAL      NET');
                textReport.push('    ----------------------------------------------------------------------------');

                const bd = a.subjectBreakdown || {};
                const subjects = Object.keys(bd);
                if (subjects.length > 0) {
                    subjects.forEach(s => {
                        const item = bd[s] || {};
                        const sTotal = item.total || 0;
                        const sCorrect = item.correct || 0;
                        const sWrong = item.wrong || 0;
                        const sBlank = item.blank || 0;
                        const sCancel = item.cancelled || 0;
                        const sNet = (item.net !== undefined && item.net !== null) ? Number(item.net) : Math.max(0, sCorrect - (sWrong * 0.25));

                        textReport.push(`    ${padStr(s, 20)}${padStr(sTotal, 12, true)}${padStr(sCorrect, 9, true)}${padStr(sWrong, 9, true)}${padStr(sBlank, 8, true)}${padStr(sCancel, 8, true)}${padStr(sNet.toFixed(2) + ' Net', 12, true)}`);
                    });
                } else {
                    textReport.push('    (Ders bazında detay bulunamadı)');
                }
                textReport.push('    ----------------------------------------------------------------------------\n');
            });

            zip.file('sonuclar_ve_netler.txt', textReport.join('\n'));

            // 6b. deneme_sonuclari_ve_netler.csv (Excel-compatible with UTF-8 BOM & semicolon separator)
            let csvRows = [
                ['Deneme Adı', 'Sınav Türü', 'Tarih', 'Ders', 'Toplam Soru', 'Doğru', 'Yanlış', 'Boş', 'İptal', 'Net', 'Başarı Oranı (%)', 'Deneme Toplam Net', 'Puan'].join(';')
            ];

            this.analyses.forEach(a => {
                const aTitle = `"${(a.title || 'İsimsiz Test').replace(/"/g, '""')}"`;
                const aExam = a.exam || 'TYT';
                const aDate = a.date ? new Date(a.date).toLocaleDateString('tr-TR') : '-';
                const aNet = (a.net !== undefined && a.net !== null) ? Number(a.net).toFixed(2) : this.calculateNet(a.correctCount, a.wrongCount).toFixed(2);
                const aScore = a.score || 0;

                const bd = a.subjectBreakdown || {};
                const subjects = Object.keys(bd);
                if (subjects.length > 0) {
                    subjects.forEach(s => {
                        const item = bd[s] || {};
                        const sTotal = item.total || 0;
                        const sCorrect = item.correct || 0;
                        const sWrong = item.wrong || 0;
                        const sBlank = item.blank || 0;
                        const sCancel = item.cancelled || 0;
                        const sNet = (item.net !== undefined && item.net !== null) ? Number(item.net).toFixed(2) : Math.max(0, sCorrect - (sWrong * 0.25)).toFixed(2);
                        const validTotal = Math.max(0, sTotal - sCancel);
                        const rate = validTotal > 0 ? Math.round((sCorrect / validTotal) * 100) : 0;

                        csvRows.push([
                            aTitle,
                            aExam,
                            aDate,
                            `"${s.replace(/"/g, '""')}"`,
                            sTotal,
                            sCorrect,
                            sWrong,
                            sBlank,
                            sCancel,
                            sNet,
                            `%${rate}`,
                            aNet,
                            aScore
                        ].join(';'));
                    });
                } else {
                    csvRows.push([
                        aTitle,
                        aExam,
                        aDate,
                        'Genel',
                        a.totalQuestions || 0,
                        a.correctCount || 0,
                        a.wrongCount || 0,
                        a.blankCount || 0,
                        a.cancelledCount || 0,
                        aNet,
                        '-',
                        aNet,
                        aScore
                    ].join(';'));
                }
            });

            zip.file('deneme_sonuclari_ve_netler.csv', '\uFEFF' + csvRows.join('\r\n'));

            // 6c. Export README
            const readmeText = [
                'Deneme Lab - Tam Yedek ve Sonuç Dosyası',
                '='.repeat(45),
                '',
                `Dışa aktarma tarihi: ${new Date().toLocaleString('tr-TR')}`,
                `Analiz sayısı      : ${this.analyses.length}`,
                `Toplam görsel      : ${imageCount}`,
                `Tekrar havuzu      : ${reviewPool.length} soru`,
                '',
                'Dosya Yapısı:',
                '  database.json               → Tüm sistem verileri (meta, havuz, ayarlar, ders doğru/yanlış/boş sayıları)',
                '  sonuclar_ve_netler.txt      → Tüm denemelerin ders bazında doğru, yanlış, boş, iptal ve net tablosu (Okunabilir)',
                '  deneme_sonuclari_ve_netler.csv → Excel ile doğrudan açılabilir detaylı sonuç ve net tablosu',
                '  analyses/[id]/netler.json   → Bu analize ait ders bazında doğru/yanlış/boş sayıları (JSON)',
                '  analyses/[id]/ders_sonuclari.txt → Bu analize ait ders net dökümü (Metin)',
                '  analyses/[id]/cover.png     → Kapak görseli',
                '  analyses/[id]/pages/        → Orijinal test sayfaları / taranan belgeler (PNG)',
                '  analyses/[id]/questions/    → Kesilen ve etiketlenen soru fotoğrafları (PNG)',
                '  review_pool/                → Tekrar havuzundaki soru görselleri (PNG)',
                '',
                'Bu ZIP dosyasını Deneme Lab içe aktarma bölümünden yükleyerek tüm verilerinizi ve ders netlerinizi eksiksiz geri yükleyebilirsiniz.'
            ].join('\n');
            zip.file('README.txt', readmeText);

            // --- 7. Generate and download ZIP ---
            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            }, (metadata) => {
                // Progress feedback every 20%
                if (metadata.percent % 20 < 1) {
                    console.log(`ZIP progress: ${Math.round(metadata.percent)}%`);
                }
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Deneme_Lab_Yedek_${dateStr}.zip`;
            link.click();
            URL.revokeObjectURL(url);

            if (btn && origHtml) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
            loader.success(`✅ ZIP indirildi! ${this.analyses.length} analiz, ${imageCount} görsel`);

        } catch (err) {
            console.error('Export failed:', err);
            if (btn && origHtml) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
            loader.error('Dışa aktarma başarısız: ' + err.message);
        }
    }

    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        // Reset input so same file can be re-selected
        event.target.value = '';

        if (file.name.endsWith('.zip')) {
            await this._importFromZip(file);
        } else {
            await this._importFromJson(file);
        }
    }

    async _importFromZip(file) {
        if (typeof JSZip === 'undefined') {
            this.showToast('ZIP kütüphanesi yüklenemedi.', 'error');
            return;
        }
        const initialLoader = this.showLoadingToast('📦 ZIP dosyası inceleniyor, lütfen bekleyin...');
        await new Promise(r => setTimeout(r, 40));
        try {
            const zip = await JSZip.loadAsync(file);

            // Read database.json
            const dbFile = zip.file('database.json');
            if (!dbFile) throw new Error('Geçersiz ZIP: database.json bulunamadı');
            const dbText = await dbFile.async('string');
            const data = JSON.parse(dbText);
            if (!data.version) throw new Error('Geçersiz dosya formatı');

            if (typeof initialLoader !== 'undefined' && initialLoader) initialLoader.close(200);
            this.showConfirmModal(
                'Verileri İçe Aktar (ZIP)',
                'Mevcut veriler içe aktarılan verilerle birleştirilecektir. Devam etmek istiyor musunuz?',
                async () => {
                    const loader = this.showLoadingToast('⏳ Veriler ve görseller içe aktarılıyor, lütfen bekleyin...');
                    await new Promise(r => setTimeout(r, 40));
                    try {
                        let importedAnalyses = 0;
                        let importedImages = 0;

                        // Import analyses
                        if (data.analyses && data.analyses.length > 0) {
                            const existingIds = new Set(this.analyses.map(a => a.id));

                            for (const analysisMeta of data.analyses) {
                                if (existingIds.has(analysisMeta.id)) continue;

                                const fullAnalysis = {
                                    ...analysisMeta,
                                    correctCount: Number(analysisMeta.correctCount) || 0,
                                    wrongCount: Number(analysisMeta.wrongCount) || 0,
                                    blankCount: Number(analysisMeta.blankCount) || 0,
                                    cancelledCount: Number(analysisMeta.cancelledCount) || 0,
                                    totalQuestions: Number(analysisMeta.totalQuestions) || ((Number(analysisMeta.correctCount) || 0) + (Number(analysisMeta.wrongCount) || 0) + (Number(analysisMeta.blankCount) || 0) + (Number(analysisMeta.cancelledCount) || 0)),
                                    net: analysisMeta.net !== undefined ? Number(analysisMeta.net) : this.calculateNet(analysisMeta.correctCount, analysisMeta.wrongCount),
                                    subjectBreakdown: analysisMeta.subjectBreakdown || {}
                                };

                                // Restore cover image
                                if (analysisMeta.imageDataPath) {
                                    const coverFile = zip.file(analysisMeta.imageDataPath);
                                    if (coverFile) {
                                        try {
                                            const b64 = await coverFile.async('base64');
                                            fullAnalysis.imageData = 'data:image/png;base64,' + b64;
                                            delete fullAnalysis.imageDataPath;
                                            importedImages++;
                                        } catch (e) {
                                            console.warn('Failed to restore cover image');
                                        }
                                    }
                                }

                                // Restore question images from ZIP
                                if (fullAnalysis.questions) {
                                    for (const q of fullAnalysis.questions) {
                                        if (q.imagePath) {
                                            const imgFile = zip.file(q.imagePath);
                                            if (imgFile) {
                                                try {
                                                    const base64 = await imgFile.async('base64');
                                                    q.image = 'data:image/png;base64,' + base64;
                                                    delete q.imagePath;
                                                    importedImages++;
                                                } catch (e) {
                                                    console.warn('Failed to restore question image:', q.imagePath);
                                                }
                                            }
                                        }
                                    }
                                }

                                // Restore raw questions images
                                if (fullAnalysis.rawQuestions) {
                                    for (const rq of fullAnalysis.rawQuestions) {
                                        if (rq.imagePath) {
                                            const imgFile = zip.file(rq.imagePath);
                                            if (imgFile) {
                                                try {
                                                    const base64 = await imgFile.async('base64');
                                                    rq.image = 'data:image/png;base64,' + base64;
                                                    delete rq.imagePath;
                                                    importedImages++;
                                                } catch (e) {
                                                    console.warn('Failed to restore raw question image:', rq.imagePath);
                                                }
                                            }
                                        }
                                    }
                                }

                                // Restore original pages
                                if (analysisMeta.originalPages && Array.isArray(analysisMeta.originalPages)) {
                                    const pages = [];
                                    for (let i = 0; i < analysisMeta.originalPages.length; i++) {
                                        const pMeta = analysisMeta.originalPages[i];
                                        const pagePath = pMeta.pagePath || `analyses/${analysisMeta.id}/pages/page_${i + 1}.png`;
                                        const pf = zip.file(pagePath);
                                        if (pf) {
                                            try {
                                                const b64 = await pf.async('base64');
                                                pages.push({
                                                    name: pMeta.name || `Sayfa ${i + 1}`,
                                                    width: pMeta.width,
                                                    height: pMeta.height,
                                                    data: 'data:image/png;base64,' + b64
                                                });
                                                importedImages++;
                                            } catch (e) {
                                                console.warn('Failed to restore page:', pagePath);
                                            }
                                        }
                                    }
                                    if (pages.length > 0) fullAnalysis.originalPages = pages;
                                } else {
                                    // Fallback legacy loop
                                    const pagesFolder = `analyses/${analysisMeta.id}/pages/`;
                                    const pages = [];
                                    let pi = 1;
                                    while (true) {
                                        const pf = zip.file(`${pagesFolder}page_${pi}.png`);
                                        if (!pf) break;
                                        try {
                                            const b64 = await pf.async('base64');
                                            pages.push({ data: 'data:image/png;base64,' + b64 });
                                            importedImages++;
                                            pi++;
                                        } catch { break; }
                                    }
                                    if (pages.length > 0) fullAnalysis.originalPages = pages;
                                }

                                if (!fullAnalysis.imageData && fullAnalysis.questions && fullAnalysis.questions[0]?.image) {
                                    fullAnalysis.imageData = fullAnalysis.questions[0].image;
                                }

                                this.analyses.push(fullAnalysis);
                                if (this.db) await this.saveAnalysisToIndexedDB(fullAnalysis);
                                importedAnalyses++;
                            }
                            this.saveAnalyses();
                        }

                        // Import review pool
                        if (data.reviewPool && data.reviewPool.length > 0) {
                            const existing = this.db
                                ? await this.loadReviewPoolFromIndexedDB()
                                : JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
                            const existingIds = new Set(existing.map(r => r.id));
                            const newItems = [];

                            for (const item of data.reviewPool) {
                                if (existingIds.has(item.id)) continue;
                                const fullItem = { ...item };
                                // Restore review pool image
                                if (item.imagePath) {
                                    const imgFile = zip.file(item.imagePath);
                                    if (imgFile) {
                                        try {
                                            const b64 = await imgFile.async('base64');
                                            fullItem.image = 'data:image/png;base64,' + b64;
                                            delete fullItem.imagePath;
                                            importedImages++;
                                        } catch (e) {
                                            console.warn('Failed to restore review pool image:', item.id);
                                        }
                                    }
                                }
                                newItems.push(fullItem);
                            }

                            const merged = [...existing, ...newItems];
                            if (this.db) {
                                await this.saveReviewPoolToIndexedDB(merged);
                            } else {
                                localStorage.setItem('testai_reviewPool', JSON.stringify(merged));
                            }
                        }

                        // Import custom options
                        if (data.customExamTypes) {
                            localStorage.setItem('testai_custom_examTypes', JSON.stringify(data.customExamTypes));
                            if (window.manualAnalyzer) {
                                data.customExamTypes.forEach(t => { if (!window.manualAnalyzer.examTypes.includes(t)) window.manualAnalyzer.examTypes.push(t); });
                            }
                        }
                        if (data.customSubjects) {
                            localStorage.setItem('testai_custom_subjects', JSON.stringify(data.customSubjects));
                            if (window.manualAnalyzer) {
                                data.customSubjects.forEach(s => { if (!window.manualAnalyzer.subjects.includes(s)) window.manualAnalyzer.subjects.push(s); });
                            }
                        }
                        if (data.customTopics) {
                            const existingTopics = JSON.parse(localStorage.getItem('testai_custom_topics') || '{}');
                            const mergedTopics = { ...existingTopics, ...data.customTopics };
                            localStorage.setItem('testai_custom_topics', JSON.stringify(mergedTopics));
                            if (window.manualAnalyzer) {
                                window.manualAnalyzer.customTopics = mergedTopics;
                            }
                        }
                        if (data.customErrors) {
                            const existingErrors = JSON.parse(localStorage.getItem('testai_custom_errors') || '[]');
                            const mergedErrors = Array.from(new Set([...existingErrors, ...data.customErrors]));
                            localStorage.setItem('testai_custom_errors', JSON.stringify(mergedErrors));
                            if (window.manualAnalyzer) {
                                window.manualAnalyzer.customErrors = mergedErrors;
                            }
                        }
                        if (data.deletedTopics) {
                            const existingDel = JSON.parse(localStorage.getItem('testai_deleted_default_topics') || '{}');
                            const mergedDel = { ...existingDel, ...data.deletedTopics };
                            localStorage.setItem('testai_deleted_default_topics', JSON.stringify(mergedDel));
                        }

                        this.updateDashboard();
                        this.updateReviewBadge();
                        if (window.reviewPool) window.reviewPool.renderPool();
                        if (loader) {
                            loader.success(`✅ ${importedAnalyses} analiz, ${importedImages} görsel içe aktarıldı!`);
                        } else {
                            this.showToast(`✅ ${importedAnalyses} analiz, ${importedImages} görsel içe aktarıldı`, 'success');
                        }
                    } catch (innerErr) {
                        console.error('ZIP import error:', innerErr);
                        if (loader) {
                            loader.error('ZIP içe aktarma hatası: ' + innerErr.message);
                        } else {
                            this.showToast('ZIP içe aktarma hatası: ' + innerErr.message, 'error');
                        }
                    }
                }
            );
        } catch (err) {
            console.error('ZIP load error:', err);
            this.showToast('ZIP dosyası okunamadı: ' + err.message, 'error');
        }
    }

    async _importFromJson(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.version) throw new Error('Geçersiz dosya formatı');

                this.showConfirmModal(
                    'Verileri İçe Aktar (JSON)',
                    'Mevcut veriler içe aktarılan verilerle birleştirilecektir. Devam etmek istiyor musunuz?',
                    async () => {
                        const loader = this.showLoadingToast('📥 JSON verileri aktarılıyor, lütfen bekleyin...');
                        await new Promise(r => setTimeout(r, 40));
                        try {
                        if (data.analyses) {
                            const existingIds = new Set(this.analyses.map(a => a.id));
                            const newAnalyses = data.analyses.filter(a => !existingIds.has(a.id));
                            this.analyses = [...this.analyses, ...newAnalyses];
                            this.saveAnalyses();
                        }

                        if (data.reviewPool) {
                            if (this.db) {
                                // Use IndexedDB
                                const existing = await this.loadReviewPoolFromIndexedDB();
                                const existingIds = new Set(existing.map(r => r.id));
                                const newItems = data.reviewPool.filter(r => !existingIds.has(r.id));
                                await this.saveReviewPoolToIndexedDB([...existing, ...newItems]);
                            } else {
                                // Fallback to localStorage
                                const existing = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
                                const existingIds = new Set(existing.map(r => r.id));
                                const newItems = data.reviewPool.filter(r => !existingIds.has(r.id));
                                localStorage.setItem('testai_reviewPool', JSON.stringify([...existing, ...newItems]));
                            }
                        }

                        // Import custom options
                        if (data.customExamTypes) {
                            localStorage.setItem('testai_custom_examTypes', JSON.stringify(data.customExamTypes));
                            if (window.manualAnalyzer) {
                                data.customExamTypes.forEach(t => { if (!window.manualAnalyzer.examTypes.includes(t)) window.manualAnalyzer.examTypes.push(t); });
                            }
                        }
                        if (data.customSubjects) {
                            localStorage.setItem('testai_custom_subjects', JSON.stringify(data.customSubjects));
                            if (window.manualAnalyzer) {
                                data.customSubjects.forEach(s => { if (!window.manualAnalyzer.subjects.includes(s)) window.manualAnalyzer.subjects.push(s); });
                            }
                        }
                        if (data.customTopics) {
                            const existingTopics = JSON.parse(localStorage.getItem('testai_custom_topics') || '{}');
                            const mergedTopics = { ...existingTopics, ...data.customTopics };
                            localStorage.setItem('testai_custom_topics', JSON.stringify(mergedTopics));
                            if (window.manualAnalyzer) window.manualAnalyzer.customTopics = mergedTopics;
                        }
                        if (data.customErrors) {
                            const existingErrors = JSON.parse(localStorage.getItem('testai_custom_errors') || '[]');
                            const mergedErrors = Array.from(new Set([...existingErrors, ...data.customErrors]));
                            localStorage.setItem('testai_custom_errors', JSON.stringify(mergedErrors));
                            if (window.manualAnalyzer) window.manualAnalyzer.customErrors = mergedErrors;
                        }
                        if (data.deletedTopics) {
                            const existingDel = JSON.parse(localStorage.getItem('testai_deleted_default_topics') || '{}');
                            const mergedDel = { ...existingDel, ...data.deletedTopics };
                            localStorage.setItem('testai_deleted_default_topics', JSON.stringify(mergedDel));
                        }

                        this.updateDashboard();
                        this.updateReviewBadge();
                        if (typeof loader !== 'undefined' && loader) {
                            loader.success('✅ Veriler başarıyla içe aktarıldı');
                        } else {
                            this.showToast('Veriler başarıyla içe aktarıldı', 'success');
                        }
                        } catch (impErr) {
                            if (typeof loader !== 'undefined' && loader) {
                                loader.error('İçe aktarma hatası: ' + impErr.message);
                            } else {
                                this.showToast('İçe aktarma hatası: ' + impErr.message, 'error');
                            }
                        }
                    }
                );
            } catch (err) {
                this.showToast('Dosya okunamadı: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    async deleteAllData(loader = null) {
        // Clear localStorage first
        localStorage.removeItem('testai_analyses');
        localStorage.removeItem('testai_reviewPool');
        localStorage.removeItem('testai_settings');

        // Close any open IndexedDB connections
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        // Close FileStorageManager's database if it exists
        if (window.fileStorageManager && window.fileStorageManager.db) {
            window.fileStorageManager.db.close();
            window.fileStorageManager.db = null;
        }

        // Wait a moment for connections to fully close
        await new Promise(resolve => setTimeout(resolve, 100));

        // Clear IndexedDB databases
        try {
            const knownDBNames = ['TestAI_DB', 'TestAI_Handles', 'TestAI'];
            
            for (const dbName of knownDBNames) {
                await new Promise((resolve) => {
                    const deleteRequest = window.indexedDB.deleteDatabase(dbName);
                    
                    deleteRequest.onsuccess = () => {
                        console.log(`✓ Database ${dbName} deleted successfully`);
                        resolve();
                    };
                    
                    deleteRequest.onerror = (event) => {
                        console.warn(`✗ Error deleting database ${dbName}:`, event);
                        resolve(); // Continue anyway
                    };
                    
                    deleteRequest.onblocked = () => {
                        console.warn(`⚠ Database ${dbName} deletion blocked - will retry after page reload`);
                        // The database will be deleted when the page is closed/reloaded
                        resolve();
                    };
                    
                    // Timeout fallback
                    setTimeout(() => {
                        console.log(`⏱ Timeout waiting for ${dbName} deletion`);
                        resolve();
                    }, 2000);
                });
            }

            // Try to get all databases (modern browsers)
            if ('databases' in indexedDB) {
                const databases = await window.indexedDB.databases();
                for (const db of databases) {
                    if (db.name && (db.name.startsWith('TestAI_') || db.name === 'TestAI')) {
                        await new Promise((resolve) => {
                            const deleteRequest = window.indexedDB.deleteDatabase(db.name);
                            deleteRequest.onsuccess = () => {
                                console.log(`✓ Database ${db.name} deleted`);
                                resolve();
                            };
                            deleteRequest.onerror = () => resolve();
                            deleteRequest.onblocked = () => resolve();
                            setTimeout(resolve, 2000);
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error clearing IndexedDB:', error);
        }

        // Reset application state
        this.analyses = [];
        this.settings = {};
        this.applyDefaults();

        this.applyTheme(this.settings.theme);
        this.restoreSettingsUI();
        this.updateDashboard();
        this.updateReviewBadge();

        if (loader) {
            loader.success('✅ Tüm veriler kalıcı olarak silindi.');
        } else {
            this.showToast('Tüm veriler kalıcı olarak silindi. Sayfayı yenilemek veritabanı temizliğini tamamlar.', 'success');
        }
        this.navigateTo('dashboard');
        
        // Optionally reload the page after a short delay to ensure complete cleanup
        setTimeout(() => {
            if (confirm('Veritabanı tamamen temizlenmesi için sayfayı yenilemek ister misiniz?')) {
                window.location.reload();
            }
        }, 1500);
    }

    // ---- Review Badge ----
    async updateReviewBadge() {
        let pool = [];
        
        // Try IndexedDB first, fallback to localStorage
        if (this.db) {
            try {
                pool = await this.loadReviewPoolFromIndexedDB();
            } catch (error) {
                console.warn('Failed to load review pool from IndexedDB:', error);
                pool = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
            }
        } else {
            pool = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
        }
        
        const now = new Date();
        const dueCount = pool.filter(item => new Date(item.nextReviewDate) <= now).length;
        const badge = document.getElementById('reviewBadge');
        if (badge) {
            badge.textContent = dueCount;
            badge.style.display = dueCount > 0 ? 'inline-block' : 'none';
        }
    }

    // ---- Helpers ----
    saveSettings() {
        try {
            localStorage.setItem('testai_settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Settings save error:', error);
            this.showToast('Ayarlar kaydedilemedi', 'warning');
        }
    }

    // Check storage size and warn if approaching limit
    checkStorageSize() {
        try {
            const analysesSize = new Blob([JSON.stringify(this.analyses)]).size;
            const totalSize = analysesSize;
            const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
            const quota = 10; // localStorage typically has 5-10MB limit
            
            if (sizeMB > quota * 0.8) {
                console.warn(`Storage is ${sizeMB}MB (${Math.round((sizeMB / quota) * 100)}% of ${quota}MB)`);
                return { warning: true, sizeMB, quota };
            }
            return { warning: false, sizeMB, quota };
        } catch (error) {
            return { warning: false, sizeMB: 0, quota: 10 };
        }
    }

    // ---- IndexedDB Storage (for large data) ----
    async initStorage() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TestAI_DB', 2); // Version 2 for reviewPool store
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('analyses')) {
                    db.createObjectStore('analyses', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('reviewPool')) {
                    db.createObjectStore('reviewPool', { keyPath: 'id' });
                }
            };
        });
    }

    async migrateFromLocalStorage() {
        try {
            let migratedAny = false;
            
            // Migrate analyses from localStorage to IndexedDB
            const oldAnalyses = localStorage.getItem('testai_analyses');
            if (oldAnalyses && !localStorage.getItem('testai_analyses_migrated')) {
                const analyses = JSON.parse(oldAnalyses);
                console.log('📦 Migrating', analyses.length, 'analyses to IndexedDB...');
                
                for (const analysis of analyses) {
                    await this.saveAnalysisToIndexedDB(analysis);
                }
                
                // Mark as migrated but don't delete localStorage data yet (backup)
                localStorage.setItem('testai_analyses_migrated', 'true');
                console.log('✅ Analyses migration complete!');
                migratedAny = true;
            }

            // Migrate reviewPool from localStorage to IndexedDB
            const oldReviewPool = localStorage.getItem('testai_reviewPool');
            if (oldReviewPool && !localStorage.getItem('testai_reviewPool_migrated')) {
                const reviewItems = JSON.parse(oldReviewPool);
                console.log('📦 Migrating', reviewItems.length, 'review items to IndexedDB...');
                
                for (const item of reviewItems) {
                    await this.saveReviewItemToIndexedDB(item);
                }
                
                localStorage.setItem('testai_reviewPool_migrated', 'true');
                console.log('✅ ReviewPool migration complete!');
                migratedAny = true;
            }
            
            if (migratedAny) {
                // Show toast to inform user
                setTimeout(() => {
                    this.showToast('Verileriniz IndexedDB\'ye taşındı. Artık daha büyük dosyalar destekleniyor! 🎉', 'success');
                }, 1000);
            }
        } catch (error) {
            console.warn('Migration failed:', error);
            this.showToast('Veri taşıma sırasında sorun oluştu. localStorage yedekleri korundu.', 'warning');
        }
    }

    async saveAnalysisToIndexedDB(analysis) {
        if (!this.db) await this.initStorage();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['analyses'], 'readwrite');
            const store = transaction.objectStore('analyses');
            const request = store.put(analysis);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async loadAnalysesFromIndexedDB() {
        if (!this.db) await this.initStorage();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['analyses'], 'readonly');
            const store = transaction.objectStore('analyses');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteAnalysisFromIndexedDB(id) {
        if (!this.db) await this.initStorage();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['analyses'], 'readwrite');
            const store = transaction.objectStore('analyses');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ReviewPool IndexedDB methods
    async saveReviewItemToIndexedDB(item) {
        if (!this.db) await this.initStorage();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['reviewPool'], 'readwrite');
            const store = transaction.objectStore('reviewPool');
            const request = store.put(item);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async loadReviewPoolFromIndexedDB() {
        if (!this.db) await this.initStorage();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['reviewPool'], 'readonly');
            const store = transaction.objectStore('reviewPool');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteReviewItemFromIndexedDB(id) {
        if (!this.db) await this.initStorage();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['reviewPool'], 'readwrite');
            const store = transaction.objectStore('reviewPool');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async saveReviewPoolToIndexedDB(poolArray) {
        if (!this.db) await this.initStorage();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['reviewPool'], 'readwrite');
            const store = transaction.objectStore('reviewPool');
            
            // Clear existing data first
            const clearRequest = store.clear();
            
            clearRequest.onsuccess = () => {
                // Add all items
                const promises = poolArray.map(item => {
                    return new Promise((res, rej) => {
                        const req = store.put(item);
                        req.onsuccess = () => res();
                        req.onerror = () => rej(req.error);
                    });
                });
                
                Promise.all(promises).then(resolve).catch(reject);
            };
            
            clearRequest.onerror = () => reject(clearRequest.error);
        });
    }

    saveAnalyses() {
        // Save all analyses to IndexedDB asynchronously in a single batch transaction
        if (this.db && this.analyses.length > 0) {
            try {
                const transaction = this.db.transaction(['analyses'], 'readwrite');
                const store = transaction.objectStore('analyses');
                for (const analysis of this.analyses) {
                    store.put(analysis);
                }
            } catch (error) {
                console.error('IndexedDB batch save error:', error);
            }
        }
        
        // Also try localStorage as backup (only metadata, without images)
        try {
            const lightAnalyses = this.analyses.map(a => ({
                id: a.id,
                title: a.title,
                subject: a.subject,
                date: a.date,
                score: a.score,
                correctCount: a.correctCount,
                wrongCount: a.wrongCount,
                blankCount: a.blankCount,
                totalQuestions: a.totalQuestions,
                exam: a.exam,
                questionCount: (a.questions || []).length
            }));
            localStorage.setItem('denemelab_analyses_meta', JSON.stringify(lightAnalyses));
            localStorage.setItem('testai_analyses_meta', JSON.stringify(lightAnalyses));
        } catch (error) {
            console.warn('localStorage backup failed (this is OK):', error);
        }
    }

    async addAnalysis(analysis) {
        this.analyses.push(analysis);
        try {
            if (this.db) {
                await this.saveAnalysisToIndexedDB(analysis);
            }
            this.saveAnalyses(); // Also save metadata to localStorage
        } catch (error) {
            // Remove from array if save failed
            this.analyses.pop();
            console.error('Analysis save failed:', error);
            throw error;
        }
        this.updateDashboard();
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ---- Toast Notifications ----
    showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toastContainer');
        if (!container) return null;

        const icons = {
            success: 'check_circle',
            error: 'error',
            warning: 'warning',
            info: 'info',
            loading: 'sync'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const isSpinning = type === 'loading' ? 'spinning' : '';
        toast.innerHTML = `
            <span class="material-icons-outlined ${isSpinning}">${icons[type] || 'info'}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <span class="material-icons-outlined">close</span>
            </button>`;

        container.appendChild(toast);

        let timeoutId = null;
        if (duration > 0) {
            timeoutId = setTimeout(() => {
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        const controller = {
            element: toast,
            update(newMessage, newType = type) {
                const iconEl = toast.querySelector('.material-icons-outlined:first-child');
                const msgEl = toast.querySelector('.toast-message');
                if (msgEl) msgEl.textContent = newMessage;
                if (iconEl) {
                    iconEl.textContent = icons[newType] || 'info';
                    iconEl.className = `material-icons-outlined ${newType === 'loading' ? 'spinning' : ''}`;
                }
                toast.className = `toast ${newType}`;
            },
            close(delay = 0) {
                if (timeoutId) clearTimeout(timeoutId);
                if (delay > 0) {
                    setTimeout(() => {
                        toast.classList.add('removing');
                        setTimeout(() => toast.remove(), 300);
                    }, delay);
                } else {
                    toast.classList.add('removing');
                    setTimeout(() => toast.remove(), 300);
                }
            },
            success(msg, autoCloseDelay = 3500) {
                this.update(msg, 'success');
                this.close(autoCloseDelay);
            },
            error(msg, autoCloseDelay = 5000) {
                this.update(msg, 'error');
                this.close(autoCloseDelay);
            }
        };

        return controller;
    }

    showLoadingToast(message, duration = 0) {
        return this.showToast(message, 'loading', duration);
    }

    // ---- File Storage Management ----
    checkFileSystemSupport() {
        const statusItem = document.getElementById('storageStatusItem');
        const statusDesc = document.getElementById('storageStatusDesc');
        const statusBadge = document.getElementById('storageStatusBadge');
        
        if (!window.fileStorage || !window.fileStorage.isSupported) {
            const isFileProtocol = window.location.protocol === 'file:';
            const hasAPI = 'showDirectoryPicker' in window;
            
            if (isFileProtocol) {
                statusDesc.innerHTML = '⚠️ HTTP server gerekli. <strong>DenemeLab_Baslat.bat</strong> çalıştırın.';
                statusBadge.textContent = 'HTTP Server Gerekli';
                statusBadge.style.background = 'var(--color-wrong-bg)';
                statusBadge.style.color = 'var(--color-wrong)';
            } else if (!hasAPI) {
                statusDesc.innerHTML = '⚠️ File System Access API yok. <a href="brave://flags" target="_blank" style="color:var(--accent-primary);text-decoration:underline;">brave://flags</a> adresinde "File System Access API" aktifleştirin VEYA Chrome/Edge kullanın. Detay: <strong>BRAVE_AYARLARI.md</strong>';
                statusBadge.textContent = 'API Kapalı';
                statusBadge.style.background = 'var(--color-wrong-bg)';
                statusBadge.style.color = 'var(--color-wrong)';
            }
        } else if (window.fileStorage.isConfigured()) {
            // Already configured - show info
            this.updateStorageInfo();
        } else {
            // Supported but not configured - show helpful message
            statusDesc.innerHTML = '💡 <strong>Önerilen:</strong> "Deneme Lab" klasörünü seçin. Tüm verileriniz güvenli bir şekilde kaydedilecek.';
            statusBadge.textContent = 'Yapılandırılmadı';
            statusBadge.style.background = 'var(--color-blank-bg)';
            statusBadge.style.color = 'var(--color-blank)';
        }
    }

    async selectStorageFolder() {
        console.log('selectStorageFolder called');
        console.log('window.fileStorage:', window.fileStorage);
        console.log('window.fileStorage.isSupported:', window.fileStorage?.isSupported);
        
        if (!window.fileStorage) {
            this.showToast('FileStorageManager yüklenmedi. Sayfayı yenileyin.', 'error');
            return;
        }
        
        if (!window.fileStorage.isSupported) {
            // Check why it's not supported
            const isHTTPS = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
            const hasAPI = 'showDirectoryPicker' in window;
            const isFileProtocol = window.location.protocol === 'file:';
            
            let errorMsg = 'File System Access API desteklenmiyor. ';
            
            if (isFileProtocol) {
                errorMsg = '⚠️ File System Access API için HTTP server gerekli.\n\n' +
                          '📁 Çözüm: START_SERVER.bat dosyasını çalıştırın ve http://localhost:8000 adresini açın.\n\n' +
                          'Detaylar için README_SERVER.md dosyasına bakın.';
            } else if (!isHTTPS) {
                errorMsg = '⚠️ File System Access API için HTTPS gerekli. Localhost kullanın.';
            } else if (!hasAPI) {
                errorMsg += 'Lütfen Brave, Chrome veya Edge\'in güncel sürümünü kullanın.';
            } else {
                errorMsg += 'Tarayıcı ayarlarınızı kontrol edin.';
            }
            
            this.showToast(errorMsg, 'error', 8000);
            console.error('File System Access API not supported. Diagnostics:', {
                userAgent: navigator.userAgent,
                protocol: window.location.protocol,
                hostname: window.location.hostname,
                isSecureContext: window.isSecureContext,
                hasShowDirectoryPicker: hasAPI,
                typeofShowDirectoryPicker: typeof window.showDirectoryPicker
            });
            console.info('💡 Çözüm Adımları:');
            console.info('1️⃣ Brave kullanıyorsanız: brave://flags adresinde "File System Access API" yi aktifleştirin');
            console.info('2️⃣ VEYA Chrome/Edge kullanın (varsayılan olarak aktif)');
            console.info('3️⃣ Detaylar için BRAVE_AYARLARI.md dosyasına bakın');
            console.info('');
            console.info('👉 Hızlı Test: Console\'da şunu çalıştırın:');
            console.info('   \'showDirectoryPicker\' in window');
            return;
        }

        try {
            const handle = await window.fileStorage.selectStorageDirectory();
            if (handle) {
                this.showToast('Depolama klasörü başarıyla seçildi!', 'success');
                await this.updateStorageInfo();
                
                // Mevcut analizleri dosya sistemine kaydet
                await this.migrateToFileStorage();
            }
        } catch (err) {
            if (err.message.includes('iptal')) {
                this.showToast(err.message, 'info');
            } else {
                this.showToast('Klasör seçimi başarısız: ' + err.message, 'error');
            }
        }
    }

    async updateStorageInfo() {
        if (!window.fileStorage) return;

        const statusItem = document.getElementById('storageStatusItem');
        const statusDesc = document.getElementById('storageStatusDesc');
        const statusBadge = document.getElementById('storageStatusBadge');
        const infoItem = document.getElementById('storageInfoItem');
        const infoDesc = document.getElementById('storageInfoDesc');

        if (window.fileStorage.isConfigured()) {
            const info = await window.fileStorage.getStorageInfo();
            
            if (info) {
                if (statusDesc) statusDesc.textContent = `Depolama klasörü: ${info.path}`;
                if (statusBadge) {
                    statusBadge.textContent = 'Aktif (Bağlı)';
                    statusBadge.style.background = 'var(--color-correct-bg)';
                    statusBadge.style.color = 'var(--color-correct)';
                }
                if (infoItem) {
                    infoItem.style.display = '';
                    if (infoDesc) infoDesc.textContent = `${info.totalAnalyses} analiz, ${info.totalFiles} dosya`;
                }
            }
        } else {
            if (statusDesc) statusDesc.textContent = 'Hedef Klasör: Deneme Lab (Proje Klasörü Otomatik Seçili)';
            if (statusBadge) {
                statusBadge.textContent = 'Deneme_Lab Seçili';
                statusBadge.style.background = 'rgba(124, 92, 252, 0.15)';
                statusBadge.style.color = 'var(--accent-primary)';
            }
            if (infoItem) {
                infoItem.style.display = '';
                if (infoDesc) infoDesc.textContent = 'Otomatik yedekleme ve analizler Deneme Lab klasörüne kaydedilir.';
            }
        }
    }

    async migrateToFileStorage() {
        if (!window.fileStorage || !window.fileStorage.isConfigured()) return;

        this.showToast('Mevcut analizler dosya sistemine aktarılıyor...', 'info');

        let migratedCount = 0;
        for (const analysis of this.analyses) {
            try {
                // Save analysis to file system
                await window.fileStorage.saveAnalysis(
                    analysis.id,
                    analysis,
                    [], // pages - will be reconstructed from questions
                    analysis.questions || []
                );
                migratedCount++;
            } catch (err) {
                console.error(`Failed to migrate analysis ${analysis.id}:`, err);
            }
        }

        this.showToast(`${migratedCount} analiz dosya sistemine aktarıldı`, 'success');
        await this.updateStorageInfo();
    }

    // ---- First Time Setup / 8-Step Interactive Welcome Tour ----
    checkFirstTimeSetup() {
        const hasSeenWelcome = localStorage.getItem('testai_welcome_seen');
        if (!hasSeenWelcome) {
            setTimeout(() => this.showWelcomeModal(false), 500); // Smooth entrance delay
        }
    }

    showWelcomeModal(force = false) {
        const modal = document.getElementById('welcomeModal');
        if (!modal) return;

        const slides = document.querySelectorAll('#welcomeTourSlides .welcome-slide');
        this.totalTourSteps = slides.length || 8;
        this.currentTourStep = 1;

        modal.classList.remove('hidden');
        modal.classList.remove('minimized');
        const minIcon = document.getElementById('welcomeMinimizeIcon');
        if (minIcon) minIcon.textContent = 'unfold_less';
        const minBtn = document.getElementById('welcomeMinimizeBtn');
        if (minBtn) minBtn.title = 'Sayfayı İncele (Pencereyi Küçült / Büyüt)';

        // Navigate to the first slide's page (dashboard)
        this.goToWelcomeStep(1);

        // Keyboard navigation (Arrow keys + Escape)
        if (!this._tourKeyHandler) {
            this._tourKeyHandler = (e) => {
                const tourModal = document.getElementById('welcomeModal');
                if (!tourModal || tourModal.classList.contains('hidden')) return;

                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.nextWelcomeStep();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.prevWelcomeStep();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeWelcomeTour();
                }
            };
            window.addEventListener('keydown', this._tourKeyHandler);
        }

        // Bind interactive controls once
        if (!this._tourControlsBound) {
            this._tourControlsBound = true;

            document.getElementById('welcomePrevBtn')?.addEventListener('click', () => this.prevWelcomeStep());
            document.getElementById('welcomeNextBtn')?.addEventListener('click', () => this.nextWelcomeStep());
            document.getElementById('welcomeFinishBtn')?.addEventListener('click', () => this.closeWelcomeTour());
            document.getElementById('welcomeSkipBtn')?.addEventListener('click', () => this.closeWelcomeTour());
            document.getElementById('welcomeMinimizeBtn')?.addEventListener('click', () => this.toggleMinimizeTour());

            // Tour dots click delegation
            document.getElementById('welcomeTourDots')?.addEventListener('click', (e) => {
                const dot = e.target.closest('.tour-dot');
                if (!dot) return;
                const step = parseInt(dot.dataset.step, 10);
                if (step) this.goToWelcomeStep(step);
            });

            // Peek buttons delegation inside tour slides
            document.getElementById('welcomeTourSlides')?.addEventListener('click', (e) => {
                const peekBtn = e.target.closest('.tour-peek-btn');
                if (peekBtn) {
                    this.toggleMinimizeTour();
                }
            });

            // Directory selection button handlers
            const bindFolderBtn = (id) => {
                document.getElementById(id)?.addEventListener('click', async () => {
                    if (!window.fileStorage) {
                        this.showToast('Dosya sistemi desteği bulunamadı', 'error');
                        return;
                    }
                    try {
                        await window.fileStorage.selectDirectory();
                        await this.updateStorageInfo();
                        this.showToast('✅ Deneme Lab klasörü başarıyla seçildi!', 'success');
                    } catch (err) {
                        if (err.name !== 'AbortError') {
                            this.showToast('Klasör seçimi iptal edildi', 'warning');
                        }
                    }
                });
            };
            bindFolderBtn('welcomeSelectFolderBtn');
            bindFolderBtn('tourSelectFolderBtn');
        }
    }

    toggleMinimizeTour() {
        const modal = document.getElementById('welcomeModal');
        if (!modal) return;

        const isMin = modal.classList.toggle('minimized');
        const minIcon = document.getElementById('welcomeMinimizeIcon');
        const minBtn = document.getElementById('welcomeMinimizeBtn');

        if (minIcon) minIcon.textContent = isMin ? 'open_in_full' : 'unfold_less';
        if (minBtn) minBtn.title = isMin ? 'Rehberi Tam Boyuta Getir' : 'Sayfayı İncele (Pencereyi Küçült)';

        if (isMin) {
            this.showToast('🔍 Rehber küçültüldü. Arka plandaki sayfayı özgürce inceleyebilirsiniz.', 'info', 3000);
        }
    }

    goToWelcomeStep(step) {
        const slides = document.querySelectorAll('#welcomeTourSlides .welcome-slide');
        const total = slides.length || this.totalTourSteps || 8;
        this.totalTourSteps = total;
        this.currentTourStep = Math.max(1, Math.min(total, step));

        // Live page navigation: switch app screen to match the slide's target page
        const activeSlide = document.querySelector(`#welcomeTourSlides .welcome-slide[data-step="${this.currentTourStep}"]`);
        if (activeSlide && activeSlide.dataset.page) {
            const targetPage = activeSlide.dataset.page;
            if (typeof this.navigateTo === 'function') {
                this.navigateTo(targetPage);
            }
        }

        this.updateWelcomeTourUI();
    }

    nextWelcomeStep() {
        const total = this.totalTourSteps || 8;
        if (this.currentTourStep < total) {
            this.goToWelcomeStep(this.currentTourStep + 1);
        } else {
            this.closeWelcomeTour();
        }
    }

    prevWelcomeStep() {
        if (this.currentTourStep > 1) {
            this.goToWelcomeStep(this.currentTourStep - 1);
        }
    }

    updateWelcomeTourUI() {
        const step = this.currentTourStep || 1;
        const slides = document.querySelectorAll('#welcomeTourSlides .welcome-slide');
        const total = slides.length || this.totalTourSteps || 8;
        this.totalTourSteps = total;

        // Step text indicator
        const stepIndicator = document.getElementById('tourStepIndicator');
        if (stepIndicator) {
            stepIndicator.textContent = `Adım ${step} / ${total}`;
        }

        // Active slide display & active class
        let currentPageTitle = 'Ana Sayfa';
        slides.forEach(slide => {
            const slideStep = parseInt(slide.dataset.step, 10);
            const isActive = (slideStep === step);
            slide.classList.toggle('active', isActive);
            // Explicitly set display so inline style cannot override class
            slide.style.display = isActive ? 'block' : 'none';
            if (isActive && slide.dataset.pageTitle) {
                currentPageTitle = slide.dataset.pageTitle;
            }
        });

        // Update header page indicator badge
        const pageIndicatorText = document.getElementById('tourPageIndicatorText');
        if (pageIndicatorText) {
            pageIndicatorText.textContent = `Ekran: ${currentPageTitle}`;
        }

        // Render / sync tour dots dynamically
        const dotsContainer = document.getElementById('welcomeTourDots');
        if (dotsContainer) {
            if (dotsContainer.children.length !== total) {
                dotsContainer.innerHTML = '';
                for (let i = 1; i <= total; i++) {
                    const dot = document.createElement('span');
                    dot.className = `tour-dot ${i === step ? 'active' : ''}`;
                    dot.dataset.step = i;
                    dot.title = `Adım ${i}`;
                    dotsContainer.appendChild(dot);
                }
            } else {
                Array.from(dotsContainer.children).forEach((dot, idx) => {
                    const dotStep = idx + 1;
                    dot.classList.toggle('active', dotStep === step);
                });
            }
        }

        // Buttons display
        const prevBtn = document.getElementById('welcomePrevBtn');
        const nextBtn = document.getElementById('welcomeNextBtn');
        const finishBtn = document.getElementById('welcomeFinishBtn');

        if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-flex' : 'none';
        if (nextBtn) nextBtn.style.display = step < total ? 'inline-flex' : 'none';
        if (finishBtn) finishBtn.style.display = step === total ? 'inline-flex' : 'none';

        // Scroll modal content to top on slide change
        const slidesContainer = document.getElementById('welcomeTourSlides');
        if (slidesContainer) {
            slidesContainer.scrollTop = 0;
        }
    }

    closeWelcomeTour() {
        const modal = document.getElementById('welcomeModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('minimized');
        }
        localStorage.setItem('testai_welcome_seen', 'true');
        this.showToast('Tanıtım rehberi tamamlandı. Başarılar dileriz! 🚀', 'success');
        
        // Return to dashboard
        this.navigateTo('dashboard');
    }

    // ---- Confirm Modal ----
    showConfirmModal(title, message, onConfirm) {
        const modal = document.getElementById('confirmModal');
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        modal.classList.remove('hidden');

        // Use AbortController to clean up event listeners properly
        if (this._modalAbort) this._modalAbort.abort();
        this._modalAbort = new AbortController();
        const signal = this._modalAbort.signal;

        const closeModal = () => {
            modal.classList.add('hidden');
            this._modalAbort.abort();
        };

        document.getElementById('modalCancelBtn').addEventListener('click', closeModal, { signal });
        document.getElementById('modalConfirmBtn').addEventListener('click', () => {
            closeModal();
            onConfirm();
        }, { signal });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        }, { signal });
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new App();
    });
} else {
    // DOM already loaded
    window.app = new App();
}
