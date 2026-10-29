/* Global Color Palette Manager with Persistence */
if (typeof window !== 'undefined' && !window.ColorPaletteManager) {
    window.ColorPaletteManager = {
        DEFAULT_COLORS: ['#FF3B30', '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FFCC00', '#FFFFFF', '#1C1C1E'],
        STORAGE_KEY: 'testai_pinned_colors',

        getPinnedColors() {
            try {
                const raw = localStorage.getItem(this.STORAGE_KEY);
                if (!raw) return [];
                const arr = JSON.parse(raw);
                return Array.isArray(arr) ? arr.filter(c => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c)) : [];
            } catch (e) {
                return [];
            }
        },

        pinColor(hex) {
            if (!hex || typeof hex !== 'string') return false;
            hex = hex.toUpperCase();
            if (this.DEFAULT_COLORS.includes(hex)) return false;
            const pinned = this.getPinnedColors();
            if (pinned.includes(hex)) return false;
            pinned.push(hex);
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(pinned));
            } catch (e) {}
            this.notifyChange();
            return true;
        },

        unpinColor(hex) {
            if (!hex) return false;
            hex = hex.toUpperCase();
            let pinned = this.getPinnedColors();
            const initialLen = pinned.length;
            pinned = pinned.filter(c => c !== hex);
            if (pinned.length !== initialLen) {
                try {
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(pinned));
                } catch (e) {}
                this.notifyChange();
                return true;
            }
            return false;
        },

        listeners: [],
        onChange(fn) {
            if (typeof fn === 'function') this.listeners.push(fn);
        },
        notifyChange() {
            this.listeners.forEach(fn => {
                try { fn(); } catch (e) {}
            });
        }
    };
}

/* ===================================================
   DenemeLab — Spaced Repetition Review Pool
   SM-2 based algorithm for reviewing wrong questions
   with Integrated Fullscreen Drawing Workstation
   =================================================== */

class ReviewPool {
    constructor() {
        this.pool = []; // Will be loaded async
        this.currentSession = [];
        this.currentIndex = 0;

        // Embedded Drawing Canvas in Review Session
        this.canvas = null;
        this.bgCanvas = null;
        this.ctx = null;
        this.bgCtx = null;

        this.tool = 'pen'; // 'pen', 'highlighter', 'eraser', 'stroke-eraser'
        this.color = '#FF3B30';
        this.brushSize = 3;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.zoomLevel = 1.0;
        this.selectedOption = null;

        // Photo display and positioning properties
        this.baseImgW = 0;
        this.baseImgH = 0;
        this.photoX = 0;
        this.photoY = 0;
        this.photoW = 0;
        this.photoH = 0;
        this.totalW = 0;
        this.totalH = 0;
        this.lastImageElement = null;
        // Photo dragging / moving state
        this.isMovingPhoto = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.initialPhotoX = 0;
        this.initialPhotoY = 0;
        this.dragTotalDx = 0;
        this.dragTotalDy = 0;

        this.strokes = [];
        this.currentStroke = null;
        this.shapePreviewCanvas = null;
        this.startX = 0;
        this.startY = 0;
        this.savedZoomLevel = 1.0;
        this.savedPhotoX = null;
        this.savedPhotoY = null;
        this.trianglePoints = [];
        this.triangleBaseSnapshot = null;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 40;

        if (typeof window !== 'undefined' && window.ColorPaletteManager) {
            window.ColorPaletteManager.onChange(() => this.renderPalette());
        }
        this.renderPalette();
        this.bindEvents();
        this.loadPoolAsync(); // Load data asynchronously
    }

    async loadPoolAsync() {
        console.log('🔄 Loading review pool...');
        
        // Try IndexedDB first, fallback to localStorage
        if (window.app && window.app.db) {
            try {
                this.pool = await window.app.loadReviewPoolFromIndexedDB();
                console.log('✅ ReviewPool loaded from IndexedDB:', this.pool.length, 'items');
            } catch (error) {
                console.warn('⚠️ IndexedDB load failed, using localStorage:', error);
                this.pool = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
                console.log('✅ ReviewPool loaded from localStorage:', this.pool.length, 'items');
            }
        } else {
            console.log('⏳ Waiting for app.db...');
            // Wait for app to initialize
            await new Promise(resolve => {
                const checkDb = setInterval(() => {
                    if (window.app && window.app.db) {
                        clearInterval(checkDb);
                        resolve();
                    }
                }, 100);
                
                // Timeout after 5 seconds
                setTimeout(() => {
                    clearInterval(checkDb);
                    resolve();
                }, 5000);
            });
            
            // Try again
            if (window.app && window.app.db) {
                try {
                    this.pool = await window.app.loadReviewPoolFromIndexedDB();
                    console.log('✅ ReviewPool loaded from IndexedDB (after wait):', this.pool.length, 'items');
                } catch (error) {
                    console.warn('⚠️ IndexedDB still failed, using localStorage:', error);
                    this.pool = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
                }
            } else {
                // Final fallback to localStorage
                this.pool = JSON.parse(localStorage.getItem('testai_reviewPool') || '[]');
                console.log('✅ ReviewPool loaded from localStorage (fallback):', this.pool.length, 'items');
            }
        }
        
        // Auto-migrate and repair pool items to restore real Exam and Subject
        this.migrateAndRepairPool();
        
        // Update UI if on review page
        if (window.app && window.app.currentPage === 'review') {
            console.log('🎨 Rendering review pool...');
            this.renderPool();
        }
        if (window.app) {
            await window.app.updateReviewBadge();
        }
    }

    
    renderPalette() {
        const container = document.getElementById('reviewColorSwatches');
        if (!container || typeof window === 'undefined' || !window.ColorPaletteManager) return;

        container.innerHTML = '';
        const pinned = window.ColorPaletteManager.getPinnedColors();
        const cur = (this.color || '#FF3B30').toUpperCase();

        // 1. Default colors
        window.ColorPaletteManager.DEFAULT_COLORS.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `color-swatch ${cur === c ? 'active' : ''}`;
            btn.dataset.color = c;
            btn.style.background = c;
            if (c === '#FFFFFF') btn.style.border = '1px solid rgba(255,255,255,0.4)';
            btn.title = c;
            btn.addEventListener('click', () => this.setReviewColor(c));
            container.appendChild(btn);
        });

        // 2. Divider if pinned exist
        if (pinned.length > 0) {
            const div = document.createElement('div');
            div.className = 'color-swatch-divider';
            container.appendChild(div);
        }

        // 3. Pinned colors
        pinned.forEach(c => {
            const wrapper = document.createElement('div');
            wrapper.className = 'color-swatch-wrapper';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `color-swatch ${cur === c ? 'active' : ''}`;
            btn.dataset.color = c;
            btn.style.background = c;
            btn.title = `${c} (Sağ tık veya × ile kaldır)`;
            btn.addEventListener('click', () => this.setReviewColor(c));
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                window.ColorPaletteManager.unpinColor(c);
            });

            const removeBtn = document.createElement('span');
            removeBtn.className = 'color-swatch-remove';
            removeBtn.textContent = '×';
            removeBtn.title = 'Rengi Kaldır';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.ColorPaletteManager.unpinColor(c);
            });

            wrapper.appendChild(btn);
            wrapper.appendChild(removeBtn);
            container.appendChild(wrapper);
        });

        // 4. Color Picker input
        const input = document.createElement('input');
        input.type = 'color';
        input.id = 'reviewCustomColor';
        input.className = 'custom-color-input';
        input.value = this.color || '#FF3B30';
        input.title = 'Özel Renk Seç';
        input.addEventListener('input', (e) => {
            this.setReviewColor(e.target.value);
        });
        container.appendChild(input);

        // 5. Pin / Add Button
        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'btn-pin-color';
        pinBtn.title = 'Seçili Rengi Palete Sabitle (+)';
        pinBtn.innerHTML = '<span class="material-icons-outlined">add</span>';
        pinBtn.addEventListener('click', () => {
            window.ColorPaletteManager.pinColor(this.color);
        });
        container.appendChild(pinBtn);
    }

    setReviewColor(color) {
        this.color = color;
        const cur = (this.color || '#FF3B30').toUpperCase();
        document.querySelectorAll('#reviewColorSwatches .color-swatch').forEach(s => {
            s.classList.toggle('active', (s.dataset.color || '').toUpperCase() === cur);
        });
        const input = document.getElementById('reviewCustomColor');
        if (input) input.value = this.color;
    }

    bindEvents() {
        // Pool page buttons
        document.getElementById('startReviewBtn')?.addEventListener('click', () => this.startSession());
        document.getElementById('closeReviewSession')?.addEventListener('click', () => this.closeSession());
        document.getElementById('showAnswerBtn')?.addEventListener('click', () => this.showAnswer());

        // Review Option Selection (A, B, C, D, E, Boş)
        document.querySelectorAll('[data-review-opt]').forEach(btn => {
            btn.addEventListener('click', () => {
                const opt = btn.dataset.reviewOpt;
                if (this.selectedOption === opt) {
                    this.selectedOption = null;
                    btn.classList.remove('active');
                } else {
                    this.selectedOption = opt;
                    document.querySelectorAll('[data-review-opt]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        });

        // SM-2 Rating buttons (Removed - auto-determined from user choice)
        document.getElementById('reviewConfirmBtn')?.addEventListener('click', () => this.confirmAnswer());
        
        // Navigation buttons (Prev only, confirm for next)
        document.getElementById('reviewPrevBtn')?.addEventListener('click', () => this.prevQuestion());

        // Filters: Alan -> Ders -> Konu -> Durum
        document.getElementById('reviewExamFilter')?.addEventListener('change', () => {
            this.populateSubjectFilter();
            this.populateTopicFilter();
            this.renderPool();
        });
        document.getElementById('reviewSubjectFilter')?.addEventListener('change', () => {
            this.populateTopicFilter();
            this.renderPool();
        });
        document.getElementById('reviewTopicFilter')?.addEventListener('change', () => this.renderPool());
        document.getElementById('reviewStatusFilter')?.addEventListener('change', () => this.renderPool());

        // Review Drawing Toolbar Events
        document.querySelectorAll('[data-review-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setReviewTool(btn.dataset.reviewTool);
            });
        });

        // Review Color Palette dynamically managed by this.renderPalette()

        // Brush Size
        document.getElementById('reviewBrushSize')?.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            const sizeVal = document.getElementById('reviewSizeValue');
            if (sizeVal) sizeVal.textContent = this.brushSize;
        });

        // Undo / Redo / Clear in Review
        document.getElementById('reviewUndoBtn')?.addEventListener('click', () => this.undo());
        document.getElementById('reviewRedoBtn')?.addEventListener('click', () => this.redo());
        document.getElementById('reviewClearBtn')?.addEventListener('click', () => this.clearCanvas());

        // Zoom controls
        document.getElementById('reviewZoomInBtn')?.addEventListener('click', () => this.setZoom(this.zoomLevel + 0.2));
        document.getElementById('reviewZoomOutBtn')?.addEventListener('click', () => this.setZoom(this.zoomLevel - 0.2));
        document.getElementById('reviewZoomResetBtn')?.addEventListener('click', () => {
            this.savedZoomLevel = 1.0;
            this.savedPhotoX = null;
            this.savedPhotoY = null;
            this.photoW = 0;
            this.photoH = 0;
            this.setZoom(1.0);
        });

        // Keyboard shortcuts inside review session
        document.addEventListener('keydown', (e) => {
            const reviewSession = document.getElementById('reviewSession');
            if (reviewSession && !reviewSession.classList.contains('hidden')) {
                if (e.ctrlKey && e.key === 'z') {
                    e.preventDefault();
                    this.undo();
                }
                if (e.ctrlKey && e.key === 'y') {
                    e.preventDefault();
                    this.redo();
                }
                if (e.key === 'Escape') {
                    if (this.tool === 'triangle' && this.trianglePoints && this.trianglePoints.length > 0) {
                        e.preventDefault();
                        this.cancelTriangleCreation();
                        return;
                    }
                }
                if (!e.ctrlKey && !e.altKey && !['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) {
                    switch (e.key.toLowerCase()) {
                        case 'p': this.setReviewTool('pen'); break;
                        case 'h': this.setReviewTool('highlighter'); break;
                        case 'e': this.setReviewTool('eraser'); break;
                        case 's': this.setReviewTool('stroke-eraser'); break;
                        case 'm': this.setReviewTool('move'); break;
                        case 'l': this.setReviewTool('line'); break;
                        case 'a': this.setReviewTool('arrow'); break;
                        case 'r': this.setReviewTool('rect'); break;
                        case 'c': this.setReviewTool('circle'); break;
                        case 't': this.setReviewTool('triangle'); break;
                    }
                }
            }
        });
    }

    initCanvasElements() {
        this.canvas = document.getElementById('reviewCanvas');
        this.bgCanvas = document.getElementById('reviewCanvasBg');
        if (this.canvas) this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        if (this.bgCanvas) this.bgCtx = this.bgCanvas.getContext('2d', { willReadFrequently: true });

        if (this.canvas && !this._eventsBound) {
            this._eventsBound = true;

            this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
            this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
            this.canvas.addEventListener('contextmenu', (e) => {
                if (this.tool === 'triangle' && this.trianglePoints && this.trianglePoints.length > 0) {
                    e.preventDefault();
                    this.cancelTriangleCreation();
                }
            });

            // Touch support
            this.canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                this.onMouseDown(touch);
            }, { passive: false });
            this.canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                this.onMouseMove(touch);
            }, { passive: false });
            this.canvas.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.onMouseUp({});
            });
        }
    }

    getCanvasCoords(e) {
        if (!this.canvas) return { x: 0, y: 0 };
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

        return {
            x: (clientX - rect.left) * (this.canvas.width / rect.width),
            y: (clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    isShapeTool(tool) {
        return ['line', 'dashed-line', 'arrow', 'double-arrow', 'dashed-arrow', 'rect', 'dashed-rect', 'circle', 'triangle', 'right-triangle'].includes(tool);
    }

    setReviewTool(tool) {
        this.cancelTriangleCreation();
        this.tool = tool;
        document.querySelectorAll('[data-review-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.reviewTool === tool);
        });

        if (this.canvas) {
            if (tool === 'eraser') {
                this.canvas.style.cursor = 'cell';
            } else if (tool === 'stroke-eraser') {
                this.canvas.style.cursor = 'crosshair';
            } else if (tool === 'move') {
                this.canvas.style.cursor = 'grab';
            } else if (this.isShapeTool(tool)) {
                this.canvas.style.cursor = 'crosshair';
            } else {
                this.canvas.style.cursor = 'crosshair';
            }
        }
    }

    setZoom(level) {
        this.zoomLevel = Math.max(0.4, Math.min(3.0, Math.round(level * 100) / 100));
        this.savedZoomLevel = this.zoomLevel;
        const valEl = document.getElementById('reviewZoomValue');
        if (valEl) valEl.textContent = `${Math.round(this.zoomLevel * 100)}%`;

        if (!this.lastImageElement) return;

        const viewport = document.getElementById('reviewCanvasViewport');
        const viewW = viewport ? Math.max(800, viewport.clientWidth) : 900;
        const viewH = viewport ? Math.max(500, viewport.clientHeight) : 600;

        // Scale ONLY the question photo
        const photoW = Math.round(this.baseImgW * this.zoomLevel);
        const photoH = Math.round(this.baseImgH * this.zoomLevel);

        // Drawing workspace ALWAYS fills the screen (gently expands only if photo is larger than screen)
        const newTotalW = Math.max(viewW, photoW + 160);
        const newTotalH = Math.max(viewH, photoH + 160);

        let photoX, photoY;
        if (this.savedPhotoX !== null && this.savedPhotoY !== null) {
            // User had previously moved the photo to a custom position
            if (this.photoW > 0 && this.photoH > 0 && (photoW !== this.photoW || photoH !== this.photoH)) {
                // If zooming, zoom around center of previous position
                const centerX = this.photoX + this.photoW / 2;
                const centerY = this.photoY + this.photoH / 2;
                photoX = Math.round(centerX - photoW / 2);
                photoY = Math.round(centerY - photoH / 2);
            } else {
                photoX = this.savedPhotoX;
                photoY = this.savedPhotoY;
            }
            this.savedPhotoX = photoX;
            this.savedPhotoY = photoY;
        } else if (this.photoW > 0 && this.photoH > 0 && (photoW !== this.photoW || photoH !== this.photoH)) {
            // Center-preserving zoom when no custom drag position set
            const centerX = this.photoX + this.photoW / 2;
            const centerY = this.photoY + this.photoH / 2;
            photoX = Math.round(centerX - photoW / 2);
            photoY = Math.round(centerY - photoH / 2);
        } else {
            // Default center placement
            photoX = Math.round((newTotalW - photoW) / 2);
            photoY = Math.round((newTotalH - photoH) / 2);
        }

        this.photoX = photoX;
        this.photoY = photoY;
        this.photoW = photoW;
        this.photoH = photoH;

        const sizeChanged = (newTotalW !== this.totalW || newTotalH !== this.totalH);
        this.totalW = newTotalW;
        this.totalH = newTotalH;

        if (sizeChanged) {
            this.bgCanvas.width = this.totalW;
            this.bgCanvas.height = this.totalH;
            this.canvas.width = this.totalW;
            this.canvas.height = this.totalH;

            this.bgCanvas.style.width = this.totalW + 'px';
            this.bgCanvas.style.height = this.totalH + 'px';
            this.canvas.style.width = this.totalW + 'px';
            this.canvas.style.height = this.totalH + 'px';

            const inner = document.getElementById('reviewCanvasInner');
            if (inner) {
                inner.style.width = this.totalW + 'px';
                inner.style.height = this.totalH + 'px';
                inner.style.transform = 'none';
            }

            this.redrawCanvasFromStrokes();
        }

        // Update photo element directly - browser renders full-res PNG with crystal clarity at any zoom
        const qImg = document.getElementById('reviewQuestionImg');
        if (qImg) {
            qImg.style.width = photoW + 'px';
            qImg.style.height = photoH + 'px';
            qImg.style.left = photoX + 'px';
            qImg.style.top = photoY + 'px';
            qImg.style.display = 'block';
        }

        // Redraw desk background and card backing (without any text)
        this.renderBackgroundWorkspace();
    }

    // ---- Canvas Drawing Events ----
    onMouseDown(e) {
        if (this.tool === 'move') {
            this.isMovingPhoto = true;
            if (this.canvas) this.canvas.style.cursor = 'grabbing';
            const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            this.dragStartX = clientX;
            this.dragStartY = clientY;
            this.initialPhotoX = this.photoX;
            this.initialPhotoY = this.photoY;
            this.dragTotalDx = 0;
            this.dragTotalDy = 0;
            return;
        }

        const { x, y } = this.getCanvasCoords(e);

        // 3-Point Triangle Tool: Click 1 -> Click 2 (line) -> Click 3 (triangle)
        if (this.tool === 'triangle') {
            if (!this.trianglePoints || this.trianglePoints.length === 0) {
                this.triangleBaseSnapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
                this.trianglePoints = [{ x, y }];
                this.ctx.save();
                this.ctx.fillStyle = this.color;
                this.ctx.beginPath();
                this.ctx.arc(x, y, Math.max(3, this.brushSize * 0.8), 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            } else if (this.trianglePoints.length === 1) {
                const p1 = this.trianglePoints[0];
                if (Math.hypot(x - p1.x, y - p1.y) > 3) {
                    this.trianglePoints.push({ x, y });
                    if (this.triangleBaseSnapshot) {
                        this.ctx.putImageData(this.triangleBaseSnapshot, 0, 0);
                    }
                    this.drawTriangleLinePreview(this.ctx, p1, { x, y }, this.color, this.brushSize);
                }
            } else if (this.trianglePoints.length === 2) {
                const p1 = this.trianglePoints[0];
                const p2 = this.trianglePoints[1];
                if (Math.hypot(x - p2.x, y - p2.y) > 3) {
                    if (this.triangleBaseSnapshot) {
                        this.ctx.putImageData(this.triangleBaseSnapshot, 0, 0);
                    }
                    const strokeObj = {
                        id: Date.now() + Math.random(),
                        tool: 'triangle',
                        color: this.color,
                        size: this.brushSize,
                        p1: { x: p1.x, y: p1.y },
                        p2: { x: p2.x, y: p2.y },
                        p3: { x, y },
                        x1: p1.x,
                        y1: p1.y,
                        x2: x,
                        y2: y
                    };
                    this.drawTriangle3P(this.ctx, strokeObj.p1, strokeObj.p2, strokeObj.p3, this.color, this.brushSize, false);
                    this.strokes.push(strokeObj);
                    this.saveState();
                    this.trianglePoints = [];
                    this.triangleBaseSnapshot = null;
                }
            }
            return;
        }

        this.isDrawing = true;
        this.lastX = x;
        this.lastY = y;
        this.startX = x;
        this.startY = y;

        if (this.tool === 'stroke-eraser') {
            this.handleStrokeEraseAt(x, y);
            return;
        }

        if (this.tool === 'pen') {
            this.currentStroke = {
                id: Date.now() + Math.random(),
                tool: 'pen',
                color: this.color,
                size: this.brushSize,
                points: [{ x, y }]
            };
            this.ctx.save();
            this.ctx.fillStyle = this.color;
            this.ctx.beginPath();
            this.ctx.arc(x, y, Math.max(1, this.brushSize / 2), 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        } else if (this.tool === 'highlighter') {
            this.currentStroke = {
                id: Date.now() + Math.random(),
                tool: 'highlighter',
                color: this.color,
                size: this.brushSize,
                points: [{ x, y }]
            };
            this.highlighterSnapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        } else if (this.tool === 'eraser') {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
        }

        // For shapes, save current state for preview
        if (this.isShapeTool(this.tool)) {
            this.shapePreviewCanvas = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    onMouseMove(e) {
        if (this.tool === 'move') {
            if (!this.isMovingPhoto) return;
            const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            const dx = clientX - this.dragStartX;
            const dy = clientY - this.dragStartY;
            this.dragTotalDx = dx;
            this.dragTotalDy = dy;

            this.photoX = this.initialPhotoX + dx;
            this.photoY = this.initialPhotoY + dy;

            const qImg = document.getElementById('reviewQuestionImg');
            if (qImg) {
                qImg.style.left = this.photoX + 'px';
                qImg.style.top = this.photoY + 'px';
            }

            this.renderBackgroundWorkspace();
            return;
        }

        // 3-Point Triangle dynamic preview during mouse move
        if (this.tool === 'triangle' && this.trianglePoints && this.trianglePoints.length > 0) {
            const { x, y } = this.getCanvasCoords(e);
            if (this.triangleBaseSnapshot) {
                this.ctx.putImageData(this.triangleBaseSnapshot, 0, 0);
            }
            if (this.trianglePoints.length === 1) {
                this.drawTriangleLinePreview(this.ctx, this.trianglePoints[0], { x, y }, this.color, this.brushSize);
            } else if (this.trianglePoints.length === 2) {
                this.drawTriangle3P(this.ctx, this.trianglePoints[0], this.trianglePoints[1], { x, y }, this.color, this.brushSize, true);
            }
            return;
        }

        if (!this.isDrawing) return;

        const { x, y } = this.getCanvasCoords(e);

        if (this.tool === 'stroke-eraser') {
            this.handleStrokeEraseAt(x, y);
            this.lastX = x;
            this.lastY = y;
            return;
        }

        if (this.tool === 'pen') {
            this.drawPen(x, y);
        } else if (this.tool === 'highlighter') {
            this.drawHighlighter(x, y);
        } else if (this.tool === 'eraser') {
            this.drawEraser(x, y);
        } else if (this.isShapeTool(this.tool)) {
            this.previewShape(this.tool, x, y);
        }

        this.lastX = x;
        this.lastY = y;
    }

    onMouseUp(e) {
        if (this.tool === 'move') {
            if (this.isMovingPhoto) {
                this.isMovingPhoto = false;
                if (this.canvas) {
                    this.canvas.style.cursor = 'grab';
                }
                this.savedPhotoX = this.photoX;
                this.savedPhotoY = this.photoY;
            }
            return;
        }

        if (!this.isDrawing) return;
        this.isDrawing = false;

        const { x, y } = this.getCanvasCoords(e);
        const finalX = x || this.lastX;
        const finalY = y || this.lastY;

        if (this.tool === 'stroke-eraser' || this.tool === 'triangle') {
            return;
        }

        if (this.tool === 'pen' && this.currentStroke && this.currentStroke.points.length > 2) {
            const pts = this.currentStroke.points;
            const len = pts.length;
            const prevMidX = (pts[len - 2].x + pts[len - 1].x) / 2;
            const prevMidY = (pts[len - 2].y + pts[len - 1].y) / 2;
            this.ctx.save();
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.brushSize;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.globalAlpha = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(prevMidX, prevMidY);
            this.ctx.lineTo(pts[len - 1].x, pts[len - 1].y);
            this.ctx.stroke();
            this.ctx.restore();
        }
        if (this.tool === 'highlighter') {
            this.highlighterSnapshot = null;
        }

        // Finalize shapes
        if (this.isShapeTool(this.tool)) {
            if (this.shapePreviewCanvas) {
                this.ctx.putImageData(this.shapePreviewCanvas, 0, 0);
            }

            const strokeObj = {
                id: Date.now() + Math.random(),
                tool: this.tool,
                color: this.color,
                size: this.brushSize,
                x1: this.startX,
                y1: this.startY,
                x2: finalX,
                y2: finalY
            };

            this.drawShape(this.tool, this.startX, this.startY, finalX, finalY, this.color, this.brushSize, false);
            this.strokes.push(strokeObj);
        } else if (this.currentStroke && this.currentStroke.points.length > 1) {
            this.strokes.push(this.currentStroke);
            this.currentStroke = null;
        }

        this.ctx?.closePath();
        this.saveState();
    }


    cancelTriangleCreation() {
        if (this.trianglePoints && this.trianglePoints.length > 0) {
            if (this.triangleBaseSnapshot && this.ctx) {
                this.ctx.putImageData(this.triangleBaseSnapshot, 0, 0);
            }
            this.trianglePoints = [];
            this.triangleBaseSnapshot = null;
        }
    }

    drawTriangleLinePreview(ctx, p1, p2, color, size) {
        ctx.save();
        ctx.strokeStyle = color || this.color;
        ctx.fillStyle = color || this.color;
        ctx.lineWidth = size || this.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.75;
        ctx.globalCompositeOperation = 'source-over';

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        [p1, p2].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(3, (size || this.brushSize) * 0.8), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    drawTriangle3P(ctx, p1, p2, p3, color, size, isPreview = false) {
        ctx.save();
        ctx.strokeStyle = color || this.color;
        ctx.fillStyle = color || this.color;
        ctx.lineWidth = size || this.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = isPreview ? 0.75 : 1;
        ctx.globalCompositeOperation = 'source-over';

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.stroke();

        if (isPreview) {
            [p1, p2, p3].forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(3, (size || this.brushSize) * 0.8), 0, Math.PI * 2);
                ctx.fill();
            });
        }
        ctx.restore();
    }

    // ---- Drawing Tools ----
    drawSmoothCurve(ctx, points) {
        if (!points || points.length === 0) return;
        if (points.length === 1) {
            ctx.beginPath();
            ctx.arc(points[0].x, points[0].y, Math.max(1, (this.brushSize || 3) / 2), 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        if (points.length === 2) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            return;
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        let midX = (points[0].x + points[1].x) / 2;
        let midY = (points[0].y + points[1].y) / 2;
        ctx.lineTo(midX, midY);

        for (let i = 1; i < points.length - 1; i++) {
            const nextMidX = (points[i].x + points[i + 1].x) / 2;
            const nextMidY = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, nextMidX, nextMidY);
        }

        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    }

    drawPen(x, y) {
        if (!this.currentStroke) return;
        const pts = this.currentStroke.points;
        pts.push({ x, y });
        const len = pts.length;

        this.ctx.save();
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.globalAlpha = 1;
        this.ctx.globalCompositeOperation = 'source-over';

        if (len === 2) {
            this.ctx.beginPath();
            this.ctx.moveTo(pts[0].x, pts[0].y);
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            this.ctx.lineTo(midX, midY);
            this.ctx.stroke();
        } else if (len > 2) {
            const pPrev = pts[len - 2];
            const pCurr = pts[len - 1];
            const pBefore = pts[len - 3];

            const prevMidX = (pBefore.x + pPrev.x) / 2;
            const prevMidY = (pBefore.y + pPrev.y) / 2;
            const currMidX = (pPrev.x + pCurr.x) / 2;
            const currMidY = (pPrev.y + pCurr.y) / 2;

            this.ctx.beginPath();
            this.ctx.moveTo(prevMidX, prevMidY);
            this.ctx.quadraticCurveTo(pPrev.x, pPrev.y, currMidX, currMidY);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawHighlighter(x, y) {
        if (!this.currentStroke) return;
        const pts = this.currentStroke.points;
        pts.push({ x, y });

        if (this.highlighterSnapshot) {
            this.ctx.putImageData(this.highlighterSnapshot, 0, 0);
        }

        if (pts.length > 1) {
            this.ctx.save();
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.brushSize * 4;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.globalAlpha = 0.35;
            this.ctx.globalCompositeOperation = 'source-over';

            this.drawSmoothCurve(this.ctx, pts);
            this.ctx.stroke();
            this.ctx.restore();
        }
    }

    drawEraser(x, y) {
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.lineWidth = this.brushSize * 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.ctx.globalCompositeOperation = 'source-over';
    }

    // ---- Shape Drawing & Previews ----
    previewShape(tool, x, y) {
        if (this.shapePreviewCanvas) {
            this.ctx.putImageData(this.shapePreviewCanvas, 0, 0);
        }
        this.drawShape(tool, this.startX, this.startY, x, y, this.color, this.brushSize, true);
    }

    drawShape(tool, x1, y1, x2, y2, color, size, isPreview = false) {
        const ctx = this.ctx;
        if (!ctx) return;

        ctx.save();
        ctx.strokeStyle = color || this.color;
        ctx.fillStyle = color || this.color;
        ctx.lineWidth = size || this.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = isPreview ? 0.65 : 1;
        ctx.globalCompositeOperation = 'source-over';

        const dashLen = Math.max(6, (size || this.brushSize) * 2.5);
        const gapLen = Math.max(4, (size || this.brushSize) * 1.8);

        switch (tool) {
            case 'line':
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                break;

            case 'dashed-line':
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([dashLen, gapLen]);
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                ctx.restore();
                break;

            case 'arrow':
                this.renderArrow(ctx, x1, y1, x2, y2, size || this.brushSize, false, false);
                break;

            case 'double-arrow':
                this.renderArrow(ctx, x1, y1, x2, y2, size || this.brushSize, true, false);
                break;

            case 'dashed-arrow':
                this.renderArrow(ctx, x1, y1, x2, y2, size || this.brushSize, false, true);
                break;

            case 'rect':
                ctx.beginPath();
                ctx.rect(x1, y1, x2 - x1, y2 - y1);
                ctx.stroke();
                break;

            case 'dashed-rect':
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([dashLen, gapLen]);
                ctx.rect(x1, y1, x2 - x1, y2 - y1);
                ctx.stroke();
                ctx.restore();
                break;

            case 'circle': {
                const rx = Math.abs(x2 - x1) / 2;
                const ry = Math.abs(y2 - y1) / 2;
                const cx = Math.min(x1, x2) + rx;
                const cy = Math.min(y1, y2) + ry;
                if (rx > 0 && ry > 0) {
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                    ctx.stroke();
                }
                break;
            }

            case 'triangle': {
                const dx = x2 - x1;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.lineTo(x1 - dx, y2);
                ctx.closePath();
                ctx.stroke();
                break;
            }

            case 'right-triangle': {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x1, y2);
                ctx.lineTo(x2, y2);
                ctx.closePath();
                ctx.stroke();

                // Small right-angle corner indicator
                const w = Math.abs(x2 - x1);
                const h = Math.abs(y2 - y1);
                const sq = Math.min(Math.max(8, (size || 3) * 2.5), Math.min(w, h) * 0.25);
                if (sq >= 5) {
                    const sgnX = x2 >= x1 ? 1 : -1;
                    const sgnY = y1 <= y2 ? -1 : 1;
                    ctx.beginPath();
                    ctx.moveTo(x1, y2 + sgnY * sq);
                    ctx.lineTo(x1 + sgnX * sq, y2 + sgnY * sq);
                    ctx.lineTo(x1 + sgnX * sq, y2);
                    ctx.stroke();
                }
                break;
            }

            case 'star': {
                const cx = (x1 + x2) / 2;
                const cy = (y1 + y2) / 2;
                const rOuter = Math.hypot(x2 - x1, y2 - y1) / 2;
                const rInner = rOuter * 0.42;
                if (rOuter > 2) {
                    ctx.beginPath();
                    for (let i = 0; i < 10; i++) {
                        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
                        const r = i % 2 === 0 ? rOuter : rInner;
                        const px = cx + Math.cos(angle) * r;
                        const py = cy + Math.sin(angle) * r;
                        if (i === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
                break;
            }
        }

        ctx.restore();
    }

    renderArrow(ctx, x1, y1, x2, y2, size, doubleEnded = false, dashed = false) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) return;

        const angle = Math.atan2(dy, dx);
        const arrowHeadLen = Math.min(Math.max(12, (size || 3) * 3.8), dist * 0.45);
        const arrowWingAngle = Math.PI / 7;

        // Draw shaft
        ctx.save();
        if (dashed) {
            const dashLen = Math.max(6, (size || 3) * 2.5);
            const gapLen = Math.max(4, (size || 3) * 1.8);
            ctx.setLineDash([dashLen, gapLen]);
        }

        const startOffset = doubleEnded ? arrowHeadLen * 0.6 : 0;
        const endOffset = arrowHeadLen * 0.6;
        const sx = x1 + Math.cos(angle) * startOffset;
        const sy = y1 + Math.sin(angle) * startOffset;
        const ex = x2 - Math.cos(angle) * endOffset;
        const ey = y2 - Math.sin(angle) * endOffset;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.restore();

        const drawHead = (tipX, tipY, tipAngle) => {
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            const leftX = tipX - arrowHeadLen * Math.cos(tipAngle - arrowWingAngle);
            const leftY = tipY - arrowHeadLen * Math.sin(tipAngle - arrowWingAngle);
            const rightX = tipX - arrowHeadLen * Math.cos(tipAngle + arrowWingAngle);
            const rightY = tipY - arrowHeadLen * Math.sin(tipAngle + arrowWingAngle);
            const backX = tipX - (arrowHeadLen * 0.72) * Math.cos(tipAngle);
            const backY = tipY - (arrowHeadLen * 0.72) * Math.sin(tipAngle);

            ctx.lineTo(leftX, leftY);
            ctx.lineTo(backX, backY);
            ctx.lineTo(rightX, rightY);
            ctx.closePath();
            ctx.fill();
        };

        drawHead(x2, y2, angle);
        if (doubleEnded) {
            drawHead(x1, y1, angle + Math.PI);
        }
    }

    // Backwards-compatible aliases
    drawLine(x1, y1, x2, y2) { this.drawShape('line', x1, y1, x2, y2, this.color, this.brushSize, false); }
    drawRect(x1, y1, x2, y2) { this.drawShape('rect', x1, y1, x2, y2, this.color, this.brushSize, false); }
    drawCircle(x1, y1, x2, y2) { this.drawShape('circle', x1, y1, x2, y2, this.color, this.brushSize, false); }
    drawTriangle(x1, y1, x2, y2) { this.drawShape('triangle', x1, y1, x2, y2, this.color, this.brushSize, false); }
    previewLine(x, y) { this.previewShape('line', x, y); }
    previewRect(x, y) { this.previewShape('rect', x, y); }
    previewCircle(x, y) { this.previewShape('circle', x, y); }
    previewTriangle(x, y) { this.previewShape('triangle', x, y); }

    // ---- Stroke Eraser Logic ----
    handleStrokeEraseAt(x, y) {
        if (!this.strokes || this.strokes.length === 0) return;

        const eraseRadius = Math.max(14, this.brushSize * 3);
        let removedAny = false;

        this.strokes = this.strokes.filter(stroke => {
            const hit = this.isPointNearStroke(x, y, stroke, eraseRadius);
            if (hit) {
                removedAny = true;
                return false;
            }
            return true;
        });

        if (removedAny) {
            this.redrawCanvasFromStrokes();
            this.saveState();
        }
    }

    isPointNearStroke(px, py, stroke, threshold) {
        if (stroke.tool === 'pen' || stroke.tool === 'highlighter') {
            const pts = stroke.points || [];
            const r = threshold + (stroke.size || 3);
            for (let i = 0; i < pts.length; i++) {
                const dx = pts[i].x - px;
                const dy = pts[i].y - py;
                if (dx * dx + dy * dy <= r * r) return true;
                if (i > 0) {
                    if (this.distanceToSegment(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= r) {
                        return true;
                    }
                }
            }
            return false;
        }

        const r = threshold + (stroke.size || 3);
        if (['line', 'dashed-line', 'arrow', 'double-arrow', 'dashed-arrow'].includes(stroke.tool)) {
            return this.distanceToSegment(px, py, stroke.x1, stroke.y1, stroke.x2, stroke.y2) <= r;
        }

        if (stroke.tool === 'rect' || stroke.tool === 'dashed-rect') {
            const minX = Math.min(stroke.x1, stroke.x2);
            const maxX = Math.max(stroke.x1, stroke.x2);
            const minY = Math.min(stroke.y1, stroke.y2);
            const maxY = Math.max(stroke.y1, stroke.y2);

            return (
                this.distanceToSegment(px, py, minX, minY, maxX, minY) <= r ||
                this.distanceToSegment(px, py, maxX, minY, maxX, maxY) <= r ||
                this.distanceToSegment(px, py, maxX, maxY, minX, maxY) <= r ||
                this.distanceToSegment(px, py, minX, maxY, minX, minY) <= r
            );
        }

        if (stroke.tool === 'circle') {
            const rx = Math.abs(stroke.x2 - stroke.x1) / 2;
            const ry = Math.abs(stroke.y2 - stroke.y1) / 2;
            const cx = Math.min(stroke.x1, stroke.x2) + rx;
            const cy = Math.min(stroke.y1, stroke.y2) + ry;
            if (rx <= 0 || ry <= 0) return false;

            const dx = px - cx;
            const dy = py - cy;
            const distToCenter = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const rAtAngle = (rx * ry) / Math.hypot(ry * Math.cos(angle), rx * Math.sin(angle));
            return Math.abs(distToCenter - rAtAngle) <= r;
        }

        if (stroke.tool === 'triangle') {
            if (stroke.p1 && stroke.p2 && stroke.p3) {
                return (
                    this.distanceToSegment(px, py, stroke.p1.x, stroke.p1.y, stroke.p2.x, stroke.p2.y) <= r ||
                    this.distanceToSegment(px, py, stroke.p2.x, stroke.p2.y, stroke.p3.x, stroke.p3.y) <= r ||
                    this.distanceToSegment(px, py, stroke.p3.x, stroke.p3.y, stroke.p1.x, stroke.p1.y) <= r
                );
            }
            const dx = stroke.x2 - stroke.x1;
            const x3 = stroke.x1 - dx;
            const y3 = stroke.y2;
            return (
                this.distanceToSegment(px, py, stroke.x1, stroke.y1, stroke.x2, stroke.y2) <= r ||
                this.distanceToSegment(px, py, stroke.x2, stroke.y2, x3, y3) <= r ||
                this.distanceToSegment(px, py, x3, y3, stroke.x1, stroke.y1) <= r
            );
        }

        if (stroke.tool === 'right-triangle') {
            return (
                this.distanceToSegment(px, py, stroke.x1, stroke.y1, stroke.x1, stroke.y2) <= r ||
                this.distanceToSegment(px, py, stroke.x1, stroke.y2, stroke.x2, stroke.y2) <= r ||
                this.distanceToSegment(px, py, stroke.x2, stroke.y2, stroke.x1, stroke.y1) <= r
            );
        }

        if (stroke.tool === 'star') {
            const cx = (stroke.x1 + stroke.x2) / 2;
            const cy = (stroke.y1 + stroke.y2) / 2;
            const rOuter = Math.hypot(stroke.x2 - stroke.x1, stroke.y2 - stroke.y1) / 2;
            const distToCenter = Math.hypot(px - cx, py - cy);
            return distToCenter <= rOuter + r && distToCenter >= (rOuter * 0.42 - r);
        }

        return false;
    }

    distanceToSegment(px, py, x1, y1, x2, y2) {
        const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * (x2 - x1);
        const projY = y1 + t * (y2 - y1);
        return Math.hypot(px - projX, py - projY);
    }

    redrawCanvasFromStrokes() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.strokes.forEach(s => {
            this.ctx.save();
            this.ctx.strokeStyle = s.color || '#FF3B30';
            this.ctx.lineWidth = s.tool === 'highlighter' ? (s.size * 4) : s.size;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.globalAlpha = s.tool === 'highlighter' ? 0.3 : 1;
            this.ctx.globalCompositeOperation = 'source-over';

            if (s.tool === 'pen' || s.tool === 'highlighter') {
                const pts = s.points || [];
                if (pts.length > 0) {
                    this.ctx.save();
                    this.ctx.strokeStyle = s.color || '#FF3B30';
                    this.ctx.lineWidth = s.tool === 'highlighter' ? (s.size * 4) : s.size;
                    this.ctx.lineCap = 'round';
                    this.ctx.lineJoin = 'round';
                    this.ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
                    this.ctx.globalCompositeOperation = 'source-over';

                    this.drawSmoothCurve(this.ctx, pts);
                    this.ctx.stroke();
                    this.ctx.restore();
                }
            } else if (this.isShapeTool(s.tool)) {
                if (s.tool === 'triangle' && s.p1 && s.p2 && s.p3) {
                    this.drawTriangle3P(this.ctx, s.p1, s.p2, s.p3, s.color, s.size, false);
                } else {
                    this.drawShape(s.tool, s.x1, s.y1, s.x2, s.y2, s.color, s.size, false);
                }
            }
            this.ctx.restore();
        });
    }

    // ---- Undo / Redo ----
    saveState() {
        if (!this.ctx || !this.canvas) return;
        const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const strokesCopy = JSON.parse(JSON.stringify(this.strokes));

        this.undoStack.push({ imgData, strokes: strokesCopy });
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length <= 1) return;
        const current = this.undoStack.pop();
        this.redoStack.push(current);

        const prev = this.undoStack[this.undoStack.length - 1];
        if (prev) {
            this.ctx.putImageData(prev.imgData, 0, 0);
            this.strokes = JSON.parse(JSON.stringify(prev.strokes || []));
        }
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const state = this.redoStack.pop();
        this.undoStack.push(state);

        this.ctx.putImageData(state.imgData, 0, 0);
        this.strokes = JSON.parse(JSON.stringify(state.strokes || []));
    }

    clearCanvas() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.strokes = [];
        this.saveState();
    }

    // ---- Pool Management ----
    addToPool(question, analysis, shouldSave = true) {
        const existingId = `${analysis.id}_q${question.number}`;
        const existing = this.pool.find(item => item.id === existingId);
        if (existing) {
            existing.testTitle = analysis.title || existing.testTitle;
            existing.exam = question.exam || analysis.exam || existing.exam || 'TYT';
            existing.subject = question.subject || existing.subject || analysis.subject || 'Genel';
            existing.topic = question.topic || existing.topic || 'Genel';
            existing.correctAnswer = question.correctAnswer || existing.correctAnswer;
            existing.explanation = question.explanation || existing.explanation;
            existing.image = question.image || existing.image;
            existing.isStem = question.isStem !== undefined ? question.isStem : existing.isStem;
            existing.parentQuestionNumber = question.parentQuestionNumber || existing.parentQuestionNumber;
            existing.stemNumber = question.stemNumber || existing.stemNumber;
            if (shouldSave) this.savePool();
            return;
        }

        const item = {
            id: existingId,
            testId: analysis.id,
            testTitle: analysis.title || 'İsimsiz Test',
            exam: question.exam || analysis.exam || 'TYT',
            subject: question.subject || analysis.subject || 'Genel',
            questionNumber: question.number,
            questionText: question.questionText || '',
            studentAnswer: question.studentAnswer || '',
            correctAnswer: question.correctAnswer || '',
            topic: question.topic || 'Genel',
            explanation: question.explanation || '',
            difficulty: question.difficulty || 'orta',
            image: question.image || analysis.imageData || null,
            isStem: question.isStem || false,
            parentQuestionNumber: question.parentQuestionNumber || null,
            stemNumber: question.stemNumber || null,
            addedDate: new Date().toISOString(),
            nextReviewDate: new Date().toISOString(), // Due immediately
            interval: 0,
            repetitions: 0,
            easeFactor: 2.5,
            status: 'due'
        };

        this.pool.push(item);
        if (shouldSave) this.savePool();
    }

    removeFromPool(id) {
        this.pool = this.pool.filter(item => item.id !== id);
        this.savePool();
        this.renderPool();
        if (window.app) app.updateReviewBadge();
    }

    openSingleQuestion(id) {
        // Tek soru için mini session başlat
        const item = this.pool.find(i => i.id === id);
        if (!item) return;
        
        // Session oluştur (sadece bu soru)
        this.currentSession = [item];
        this.currentIndex = 0;
        
        // Çözüm ekranını aç
        this.initCanvasElements();
        document.getElementById('reviewSession')?.classList.remove('hidden');
        this.showCard();
    }

    async savePool() {
        // Try IndexedDB first (via app), fallback to localStorage
        if (window.app && window.app.db) {
            try {
                await window.app.saveReviewPoolToIndexedDB(this.pool);
            } catch (error) {
                console.warn('IndexedDB save failed, using localStorage:', error);
                localStorage.setItem('testai_reviewPool', JSON.stringify(this.pool));
            }
        } else {
            // Fallback to localStorage
            localStorage.setItem('testai_reviewPool', JSON.stringify(this.pool));
        }
    }

    // ---- Basitleştirilmiş Review Sistemi ----
    // status: 'wrong', 'blank', 'correct'
    updateSimpleReview(item, status) {
        const intervals = {
            wrong: (window.app && window.app.settings.reviewIntervalWrong) || 1,
            blank: (window.app && window.app.settings.reviewIntervalBlank) || 2,
            correct: (window.app && window.app.settings.reviewIntervalCorrect) || 3
        };
        
        item.interval = intervals[status];
        item.repetitions = (item.repetitions || 0) + 1;
        item.lastStatus = status;
        
        // Track correct count for mastered status
        if (status === 'correct') {
            item.correctCount = (item.correctCount || 0) + 1;
        }
        
        const next = new Date();
        next.setDate(next.getDate() + item.interval);
        item.nextReviewDate = next.toISOString();
        item.lastReviewDate = new Date().toISOString();
        
        // Öğrenildi kriterleri: X kez doğru bilinirse SİL
        const masteredThreshold = (window.app && window.app.settings.reviewMasteredCount) || 3;
        if ((item.correctCount || 0) >= masteredThreshold) {
            item.status = 'mastered';
            // Havuzdan tamamen sil
            this.pool = this.pool.filter(i => i.id !== item.id);
            if (window.app) {
                window.app.showToast(`✅ Bu soru ${masteredThreshold} kez doğru bilindiği için tekrar havuzundan silindi!`, 'success');
            }
        } else if (new Date(item.nextReviewDate) <= new Date()) {
            item.status = 'due';
        } else {
            item.status = 'upcoming';
        }

        this.savePool();
    }

    // ---- Utility Functions ----
    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ---- Auto-Migration and Repair for Question Exam and Subject ----
    migrateAndRepairPool() {
        if (!this.pool || this.pool.length === 0) return;
        let modified = false;

        const analyses = window.app?.analyses || [];
        const analysesMap = new Map();
        analyses.forEach(a => analysesMap.set(a.id, a));

        const knownSubjects = [
            'Geometri', 'Fizik', 'Kimya', 'Biyoloji', 'Türkçe',
            'Edebiyat', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'İngilizce', 'Matematik'
        ];

        this.pool.forEach(item => {
            let matchedQ = null;
            let matchedAnalysis = analysesMap.get(item.testId);

            if (matchedAnalysis && matchedAnalysis.questions) {
                matchedQ = matchedAnalysis.questions.find(q => q.number === item.questionNumber);
            }
            if (!matchedQ && matchedAnalysis && matchedAnalysis.rawQuestions) {
                matchedQ = matchedAnalysis.rawQuestions.find(q => q.number === item.questionNumber);
            }

            // 1. Repair exam if missing or generic
            if (!item.exam || item.exam === 'Diğer' || item.exam === 'Genel') {
                if (matchedQ?.exam) {
                    item.exam = matchedQ.exam;
                    modified = true;
                } else if (matchedAnalysis?.exam) {
                    item.exam = matchedAnalysis.exam;
                    modified = true;
                } else {
                    const text = `${item.questionText || ''} ${item.testTitle || ''}`;
                    const examMatch = text.match(/\b(TYT|AYT|YDT|LGS|KPSS|ALES|DGS|MSÜ)\b/i);
                    if (examMatch) {
                        item.exam = examMatch[1].toUpperCase();
                        modified = true;
                    } else {
                        item.exam = 'TYT';
                        modified = true;
                    }
                }
            }

            // 2. Repair subject: if question in analysis has a specific subject, use it!
            if (matchedQ?.subject && matchedQ.subject !== item.subject) {
                item.subject = matchedQ.subject;
                modified = true;
            } else if (item.subject === 'Matematik' || !item.subject || item.subject === 'Genel') {
                // Check if questionText or testTitle reveals the true subject
                const text = `${item.questionText || ''} ${item.testTitle || ''}`;
                for (const subj of knownSubjects) {
                    if (subj === 'Matematik') continue;
                    const regex = new RegExp(`\\b${subj}\\b`, 'i');
                    if (regex.test(text)) {
                        item.subject = subj;
                        modified = true;
                        break;
                    }
                }
            }

            // 3. Repair topic if matchedQ has a better topic
            if (matchedQ?.topic && (!item.topic || item.topic === 'Genel' || item.topic === '')) {
                item.topic = matchedQ.topic;
                modified = true;
            }
        });

        if (modified) {
            console.log('✅ ReviewPool items repaired with correct Exam and Subject data');
            this.savePool();
        }
    }

    // ---- Filter Helper Functions ----
    populateExamFilter() {
        const select = document.getElementById('reviewExamFilter');
        if (!select) return;

        const poolExams = [...new Set(this.pool.map(i => i.exam).filter(Boolean))];
        const standardOrder = ['TYT', 'AYT', 'YDT', 'LGS', 'KPSS', 'ALES', 'DGS', 'MSÜ', 'Genel'];
        let exams = standardOrder.filter(e => poolExams.includes(e));
        poolExams.forEach(e => {
            if (!exams.includes(e)) exams.push(e);
        });

        if (exams.length === 0) {
            exams = ['TYT', 'AYT', 'YDT', 'LGS', 'KPSS', 'MSÜ'];
        }

        const currentVal = select.value || 'all';

        select.innerHTML = `<option value="all">Tüm Alanlar</option>` +
            exams.map(e => `<option value="${e}" ${e === currentVal ? 'selected' : ''}>${e}</option>`).join('');
    }

    populateSubjectFilter() {
        const examSelect = document.getElementById('reviewExamFilter');
        const subjectSelect = document.getElementById('reviewSubjectFilter');
        if (!subjectSelect) return;

        const selectedExam = examSelect?.value || 'all';
        const currentVal = subjectSelect.value || 'all';

        let poolItems = this.pool;
        if (selectedExam !== 'all') {
            poolItems = poolItems.filter(i => (i.exam || 'TYT') === selectedExam);
        }

        let subjects = [...new Set(poolItems.map(i => i.subject).filter(Boolean))];

        if (subjects.length === 0 && window.manualAnalyzer) {
            subjects = window.manualAnalyzer.getSubjectsForExam(selectedExam);
        }

        subjectSelect.innerHTML = `<option value="all">Tüm Dersler</option>` +
            subjects.map(s => `<option value="${s}" ${s === currentVal ? 'selected' : ''}>${s}</option>`).join('');
    }

    populateTopicFilter() {
        const examSelect = document.getElementById('reviewExamFilter');
        const subjectSelect = document.getElementById('reviewSubjectFilter');
        const topicSelect = document.getElementById('reviewTopicFilter');
        if (!topicSelect) return;

        const selectedExam = examSelect?.value || 'all';
        const selectedSubject = subjectSelect?.value || 'all';
        const currentVal = topicSelect.value || 'all';

        let poolItems = this.pool;
        if (selectedExam !== 'all') {
            poolItems = poolItems.filter(i => (i.exam || 'TYT') === selectedExam);
        }
        if (selectedSubject !== 'all') {
            poolItems = poolItems.filter(i => i.subject === selectedSubject);
        }

        let topics = [...new Set(poolItems.map(i => i.topic).filter(Boolean))];

        if (topics.length === 0 && selectedSubject !== 'all' && window.manualAnalyzer) {
            topics = window.manualAnalyzer.getTopicsFor(selectedExam, selectedSubject);
        }

        topicSelect.innerHTML = `<option value="all">Tüm Konular</option>` +
            topics.map(t => `<option value="${t}" ${t === currentVal ? 'selected' : ''}>${t}</option>`).join('');
    }

    // ---- Edit Question Details Modal (Alan, Ders, Konu) ----
    openEditModal(id) {
        const item = this.pool.find(i => i.id === id);
        if (!item) return;

        document.getElementById('reviewEditModal')?.remove();

        const standardExams = (window.manualAnalyzer?.examTypes) || ['TYT', 'AYT', 'YDT', 'LGS', 'KPSS', 'ALES', 'DGS', 'MSÜ', 'Genel'];
        const currentExam = item.exam || 'TYT';

        const getSubjects = (exam) => {
            if (window.manualAnalyzer) return window.manualAnalyzer.getSubjectsForExam(exam);
            return ['Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji', 'Türkçe', 'Edebiyat', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'İngilizce', 'Diğer'];
        };

        const currentSubject = item.subject || 'Matematik';
        const subjects = getSubjects(currentExam);

        const modal = document.createElement('div');
        modal.id = 'reviewEditModal';
        modal.className = 'modal-backdrop active';
        modal.innerHTML = `
            <div class="modal-box" style="max-width: 480px; width: 90%;">
                <div class="modal-header">
                    <h3>Soru Bilgilerini Düzenle</h3>
                    <button class="btn btn-ghost btn-icon btn-sm" id="closeReviewEditModalBtn">
                        <span class="material-icons-outlined">close</span>
                    </button>
                </div>
                <div class="modal-body" style="display:flex; flex-direction:column; gap:16px; padding:20px;">
                    <div class="form-group">
                        <label for="editItemExam" style="display:block; margin-bottom:6px; font-weight:600; font-size:0.875rem;">Alan (Sınav Türü)</label>
                        <select id="editItemExam" class="filter-select" style="width:100%; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary);">
                            ${standardExams.map(e => `<option value="${e}" ${e === currentExam ? 'selected' : ''}>${e}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editItemSubject" style="display:block; margin-bottom:6px; font-weight:600; font-size:0.875rem;">Ders</label>
                        <select id="editItemSubject" class="filter-select" style="width:100%; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary);">
                            ${subjects.map(s => `<option value="${s}" ${s === currentSubject ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editItemTopic" style="display:block; margin-bottom:6px; font-weight:600; font-size:0.875rem;">Konu</label>
                        <input type="text" id="editItemTopic" class="form-input" value="${this.escapeHtml(item.topic || '')}" placeholder="Örn: Fonksiyonlar, Paragraf, Newton Yasaları" style="width:100%; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary);">
                    </div>
                </div>
                <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; padding:12px 20px; border-top:1px solid var(--border-color);">
                    <button class="btn btn-secondary" id="cancelReviewEditBtn">İptal</button>
                    <button class="btn btn-primary" id="saveReviewEditBtn">
                        <span class="material-icons-outlined">check</span> Kaydet
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const examSel = modal.querySelector('#editItemExam');
        const subjSel = modal.querySelector('#editItemSubject');
        examSel.addEventListener('change', () => {
            const newSubjects = getSubjects(examSel.value);
            const curSubj = subjSel.value;
            subjSel.innerHTML = newSubjects.map(s => `<option value="${s}" ${s === curSubj ? 'selected' : ''}>${s}</option>`).join('');
            if (!newSubjects.includes(curSubj) && newSubjects.length > 0) {
                subjSel.value = newSubjects[0];
            }
        });

        const closeModal = () => modal.remove();
        modal.querySelector('#closeReviewEditModalBtn').onclick = closeModal;
        modal.querySelector('#cancelReviewEditBtn').onclick = closeModal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };

        modal.querySelector('#saveReviewEditBtn').onclick = () => {
            const newExam = examSel.value;
            const newSubj = subjSel.value;
            const newTopic = modal.querySelector('#editItemTopic').value.trim() || 'Genel';

            item.exam = newExam;
            item.subject = newSubj;
            item.topic = newTopic;

            // Sync with analysis if linked
            if (item.testId && window.app?.analyses) {
                const analysis = window.app.analyses.find(a => a.id === item.testId);
                if (analysis && analysis.questions) {
                    const q = analysis.questions.find(q => q.number === item.questionNumber);
                    if (q) {
                        q.exam = newExam;
                        q.subject = newSubj;
                        q.topic = newTopic;
                    }
                    if (analysis.rawQuestions) {
                        const rawQ = analysis.rawQuestions.find(q => q.number === item.questionNumber);
                        if (rawQ) {
                            rawQ.exam = newExam;
                            rawQ.subject = newSubj;
                            rawQ.topic = newTopic;
                        }
                    }
                    window.app.saveAnalyses();
                }
            }

            this.savePool();
            this.renderPool();
            closeModal();
            if (window.app) window.app.showToast('Soru bilgileri başarıyla güncellendi!', 'success');
        };
    }
    
    // ---- Navigation Functions ----
    prevQuestion() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.showCurrentQuestion();
        } else {
            if (window.app) window.app.showToast('Bu ilk soru', 'info');
        }
    }
    
    nextQuestion() {
        // Deprecated - use confirmAnswer instead
        this.confirmAnswer();
    }

    // ---- Tekrar Havuzu Liste Render ----
    renderPool() {
        // Auto-repair if any item has missing exam
        if (this.pool.some(i => !i.exam)) {
            this.migrateAndRepairPool();
        }

        // Populate cascade filters: Alan -> Ders -> Konu
        this.populateExamFilter();
        this.populateSubjectFilter();
        this.populateTopicFilter();
        
        const container = document.getElementById('reviewPoolList');
        const examFilter = document.getElementById('reviewExamFilter')?.value || 'all';
        const subjectFilter = document.getElementById('reviewSubjectFilter')?.value || 'all';
        const topicFilter = document.getElementById('reviewTopicFilter')?.value || 'all';
        const statusFilter = document.getElementById('reviewStatusFilter')?.value || 'all';

        const now = new Date();
        // Durum güncelle (sadece due/upcoming ayarı, mastered zaten updateSimpleReview'de belirlendi)
        this.pool.forEach(item => {
            if (item.status !== 'mastered') {
                if (new Date(item.nextReviewDate) <= now) {
                    item.status = 'due';
                } else {
                    item.status = 'upcoming';
                }
            }
        });

        const dueCount = this.pool.filter(i => i.status === 'due').length;
        const upcomingCount = this.pool.filter(i => i.status === 'upcoming').length;
        const masteredCount = this.pool.filter(i => i.status === 'mastered').length;

        const dueEl = document.getElementById('reviewDueToday');
        const upcEl = document.getElementById('reviewUpcoming');
        const masEl = document.getElementById('reviewMastered');

        if (dueEl) dueEl.textContent = dueCount;
        if (upcEl) upcEl.textContent = upcomingCount;
        if (masEl) masEl.textContent = masteredCount;

        let filtered = [...this.pool];
        
        // Apply cascade filters: Alan -> Ders -> Konu -> Durum
        if (examFilter !== 'all') {
            filtered = filtered.filter(i => (i.exam || 'TYT') === examFilter);
        }
        if (subjectFilter !== 'all') {
            filtered = filtered.filter(i => i.subject === subjectFilter);
        }
        if (topicFilter !== 'all') {
            filtered = filtered.filter(i => i.topic === topicFilter);
        }
        if (statusFilter !== 'all') {
            filtered = filtered.filter(i => i.status === statusFilter);
        }

        filtered.sort((a, b) => {
            const order = { due: 0, upcoming: 1, mastered: 2 };
            if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
            return new Date(a.nextReviewDate) - new Date(b.nextReviewDate);
        });

        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-outlined">replay_circle_filled</span>
                    <p>${this.pool.length === 0 ? 'Tekrar havuzu boş. Yanlış sorular otomatik olarak buraya eklenir.' : 'Filtreye uygun soru bulunamadı.'}</p>
                </div>`;
        } else {
            container.innerHTML = filtered.map(item => {
                const nextDate = new Date(item.nextReviewDate);
                const isOverdue = nextDate <= now && item.status !== 'mastered';
                const dateText = this.formatRelativeDate(nextDate);
                const repsText = item.repetitions > 0 ? `${item.repetitions}x tekrar` : 'Hiç tekrar edilmedi';
                const intervalText = item.interval > 0 ? `${item.interval} günlük aralık` : 'Yeni';

                const statusLabels = { due: '⏰ Tekrar Zamanı', upcoming: '🗓️ Yaklaşan', mastered: '✅ Öğrenildi' };
                const statusLabel = statusLabels[item.status] || item.status;
                const examText = item.exam || 'TYT';
                const subjectText = item.subject || 'Ders';
                const topicText = item.topic || 'Genel';

                return `
                    <div class="review-item review-item--${item.status}" onclick="reviewPool.openSingleQuestion('${item.id}')" style="cursor: pointer;">
                        <div class="review-item-status ${item.status}"></div>
                        <div class="review-item-main">
                            ${item.image ? `<div class="review-item-thumb"><img src="${item.image}" alt="Soru" loading="lazy" decoding="async"></div>` : '<div class="review-item-thumb review-item-thumb--no-img"><span class="material-icons-outlined">quiz</span></div>'}
                            <div class="review-item-info">
                                <div class="review-item-header">
                                    <h4>Soru ${item.questionNumber}</h4>
                                    <div class="review-item-badges">
                                        <span class="badge badge-exam">${this.escapeHtml(examText)}</span>
                                        <span class="badge badge-subject">${this.escapeHtml(subjectText)}</span>
                                        <span class="badge badge-topic">📚 ${this.escapeHtml(topicText)}</span>
                                    </div>
                                </div>
                                <p class="review-item-test-subtitle">${this.escapeHtml(item.testTitle || '')}</p>
                                <div class="review-item-stats">
                                    <span class="review-stat-chip ${item.status}">${statusLabel}</span>
                                    <span class="review-stat-chip neutral">${repsText}</span>
                                    <span class="review-stat-chip neutral">${item.interval > 0 ? intervalText : 'Yeni'}</span>
                                </div>
                            </div>
                        </div>
                        <div class="review-item-right">
                            <b class="review-item-date ${isOverdue ? 'overdue' : ''}">${isOverdue ? '⏰ Hemen!' : dateText}</b>
                            <div class="review-item-actions" onclick="event.stopPropagation()">
                                <button class="btn btn-ghost btn-sm" onclick="reviewPool.openEditModal('${item.id}')" title="Alan, Ders ve Konuyu Düzenle">
                                    <span class="material-icons-outlined">edit</span>
                                </button>
                                <button class="btn btn-ghost btn-sm text-danger" onclick="reviewPool.removeFromPool('${item.id}')" title="Havuzdan Çıkar">
                                    <span class="material-icons-outlined">delete_outline</span>
                                </button>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }

        const startBtn = document.getElementById('startReviewBtn');
        if (startBtn) {
            // Calculate filtered count for button text
            const filteredDueCount = filtered.filter(i => i.status === 'due').length;
            const filteredTotalCount = filtered.length;
            
            startBtn.disabled = this.pool.length === 0;
            startBtn.innerHTML = `
                <span class="material-icons-outlined">play_arrow</span>
                ${filteredDueCount > 0 ? `Tekrar Oturumu Başlat (${filteredDueCount})` : (filteredTotalCount > 0 ? `Tüm Havuzu Tekrar Et (${filteredTotalCount})` : 'Tekrar Oturumu Başlat')}`;
        }
    }

    // ---- Review Session (Drawing Mode Always Open by Default) ----
    startSession() {
        const now = new Date();
        
        // Get filter values
        const examFilter = document.getElementById('reviewExamFilter')?.value || 'all';
        const subjectFilter = document.getElementById('reviewSubjectFilter')?.value || 'all';
        const topicFilter = document.getElementById('reviewTopicFilter')?.value || 'all';
        const statusFilter = document.getElementById('reviewStatusFilter')?.value || 'all';
        
        // Start with due items
        let candidates = this.pool.filter(i => new Date(i.nextReviewDate) <= now && i.status !== 'mastered');

        if (candidates.length === 0) {
            // If none due, allow reviewing any questions in pool
            candidates = [...this.pool];
        }
        
        // Apply filters: Alan -> Ders -> Konu -> Durum
        if (examFilter !== 'all') {
            candidates = candidates.filter(i => (i.exam || 'TYT') === examFilter);
        }
        if (subjectFilter !== 'all') {
            candidates = candidates.filter(i => i.subject === subjectFilter);
        }
        if (topicFilter !== 'all') {
            candidates = candidates.filter(i => i.topic === topicFilter);
        }
        if (statusFilter !== 'all') {
            candidates = candidates.filter(i => i.status === statusFilter);
        }
        
        this.currentSession = candidates;

        if (this.currentSession.length === 0) {
            if (window.app) app.showToast('Seçili filtrelere uygun soru bulunamadı', 'info');
            return;
        }

        const loader = window.app && typeof window.app.showLoadingToast === 'function'
            ? window.app.showLoadingToast('📚 Tekrar soruları hazırlanıyor, lütfen bekleyin...')
            : null;

        this.currentSession.sort(() => Math.random() - 0.5);
        this.currentIndex = 0;

        this.initCanvasElements();
        document.getElementById('reviewSession')?.classList.remove('hidden');

        this.showCard();
        if (loader) loader.close(300);
    }

    showCard() {
        if (this.currentIndex >= this.currentSession.length) {
            this.endSession();
            return;
        }

        const item = this.currentSession[this.currentIndex];

        // Update progress badge
        const progressEl = document.getElementById('reviewProgressText');
        if (progressEl) progressEl.textContent = `${this.currentIndex + 1} / ${this.currentSession.length}`;

        // Populate side panel details
        const examEl = document.getElementById('reviewCardExam');
        const subjEl = document.getElementById('reviewCardSubject');
        const topicEl = document.getElementById('reviewCardTopic');
        const titleEl = document.getElementById('reviewCardTitle');
        const testSubEl = document.getElementById('reviewCardTestTitle');
        const errorEl = document.getElementById('reviewCardError');
        const studentAnsEl = document.getElementById('reviewCardStudentAnswer');
        const noteBox = document.getElementById('reviewCardNoteBox');
        const noteEl = document.getElementById('reviewCardNote');

        if (examEl) {
            examEl.textContent = item.exam || 'TYT';
            examEl.style.display = 'inline-flex';
        }
        if (subjEl) subjEl.textContent = item.subject || 'Ders';
        if (topicEl) topicEl.textContent = `📚 ${item.topic || 'Genel Konu'}`;
        
        // Display title with stem info if applicable
        let displayTitle;
        if (item.isStem && item.parentQuestionNumber && item.stemNumber) {
            displayTitle = `Soru ${item.parentQuestionNumber} + ${item.stemNumber}. kök`;
        } else {
            displayTitle = `Soru ${item.questionNumber}`;
        }
        if (titleEl) titleEl.textContent = displayTitle;
        if (testSubEl) testSubEl.textContent = item.testTitle || 'İsimsiz Test';

        const errorReason = item.explanation ? (item.explanation.match(/Hata Sebebi:\s*([^—\n]+)/)?.[1] || item.explanation) : 'Dikkatsizlik / Bilgi Hatası';
        if (errorEl) errorEl.textContent = errorReason;

        if (studentAnsEl) studentAnsEl.textContent = item.studentAnswer || 'Yanlış';

        if (item.questionText && item.questionText !== item.testTitle) {
            if (noteBox) noteBox.classList.remove('hidden');
            if (noteEl) noteEl.textContent = item.questionText;
        } else {
            if (noteBox) noteBox.classList.add('hidden');
        }

        // Reset choice buttons & feedback
        this.selectedOption = null;
        document.querySelectorAll('[data-review-opt]').forEach(b => {
            b.classList.remove('active', 'is-correct-opt', 'is-wrong-opt');
            b.disabled = false;
        });
        const feedbackEl = document.getElementById('reviewChoiceFeedback');
        if (feedbackEl) {
            feedbackEl.className = 'user-choice-feedback hidden';
            feedbackEl.innerHTML = '';
        }

        // Reset answer reveal state
        document.getElementById('showAnswerBtn')?.classList.remove('hidden');
        document.getElementById('reviewRevealedAnswer')?.classList.add('hidden');
        document.getElementById('reviewCardActions')?.classList.add('hidden');

        // Set revealed answer texts
        const correctAnsEl = document.getElementById('reviewCorrectAnswerText');
        const explanationEl = document.getElementById('reviewExplanationText');

        if (correctAnsEl) {
            correctAnsEl.textContent = item.correctAnswer ? `${item.correctAnswer} ${['A', 'B', 'C', 'D', 'E'].includes(item.correctAnswer) ? 'Şıkkı' : ''}` : 'Belirtilmedi';
        }
        if (explanationEl) {
            explanationEl.textContent = item.explanation || 'Bu soru için ek açıklama girilmemiş.';
        }

        // Rating butonlarına dinamik hint güncelle (basitleştirilmiş sistem)
        const intervals = {
            wrong: (window.app && window.app.settings.reviewIntervalWrong) || 1,
            blank: (window.app && window.app.settings.reviewIntervalBlank) || 2,
            correct: (window.app && window.app.settings.reviewIntervalCorrect) || 3
        };
        
        const wrongHint = document.getElementById('ratingHintWrong');
        const blankHint = document.getElementById('ratingHintBlank');
        const correctHint = document.getElementById('ratingHintCorrect');
        
        if (wrongHint) wrongHint.textContent = `${intervals.wrong} gün sonra`;
        if (blankHint) blankHint.textContent = `${intervals.blank} gün sonra`;
        if (correctHint) correctHint.textContent = `${intervals.correct} gün sonra`;

        // Load question image into embedded drawing canvas
        this.loadQuestionToCanvas(item);
    }

    loadQuestionToCanvas(item) {
        this.renderPalette();
        this.initCanvasElements();
        if (!this.canvas || !this.bgCanvas) return;
        this.currentItem = item;

        this.strokes = [];
        this.undoStack = [];
        this.redoStack = [];

        // Check if this is a stem question - need to show parent + stem together
        const isStem = item.isStem && item.parentQuestionNumber;
        
        if (isStem) {
            // Find parent question from pool (same test, matching parent question number)
            const parentItem = this.pool.find(p => 
                p.testId === item.testId && 
                p.questionNumber === item.parentQuestionNumber &&
                !p.isStem
            );
            
            if (parentItem && parentItem.image && item.image) {
                // Load both parent and stem images
                const parentImg = new Image();
                const stemImg = new Image();
                let parentLoaded = false;
                let stemLoaded = false;
                
                const renderBothImages = () => {
                    if (!parentLoaded || !stemLoaded) return;
                    
                    const viewport = document.getElementById('reviewCanvasViewport');
                    const viewW = viewport ? Math.max(800, viewport.clientWidth) : 900;
                    const viewH = viewport ? Math.max(500, viewport.clientHeight) : 600;

                    // Calculate combined dimensions
                    const parentNaturalW = parentImg.naturalWidth || parentImg.width;
                    const parentNaturalH = parentImg.naturalHeight || parentImg.height;
                    const stemNaturalW = stemImg.naturalWidth || stemImg.width;
                    const stemNaturalH = stemImg.naturalHeight || stemImg.height;

                    // Create combined canvas
                    const combinedCanvas = document.createElement('canvas');
                    const maxWidth = Math.max(parentNaturalW, stemNaturalW);
                    const combinedHeight = parentNaturalH + stemNaturalH + 20; // 20px gap
                    combinedCanvas.width = maxWidth;
                    combinedCanvas.height = combinedHeight;
                    
                    const combinedCtx = combinedCanvas.getContext('2d', { willReadFrequently: true });
                    combinedCtx.fillStyle = '#ffffff';
                    combinedCtx.fillRect(0, 0, maxWidth, combinedHeight);
                    
                    // Draw parent question on top
                    combinedCtx.drawImage(parentImg, (maxWidth - parentNaturalW) / 2, 0);
                    
                    // Draw separator line
                    combinedCtx.strokeStyle = '#3a3a3c';
                    combinedCtx.lineWidth = 2;
                    combinedCtx.beginPath();
                    combinedCtx.moveTo(20, parentNaturalH + 10);
                    combinedCtx.lineTo(maxWidth - 20, parentNaturalH + 10);
                    combinedCtx.stroke();
                    
                    // Draw stem below
                    combinedCtx.drawImage(stemImg, (maxWidth - stemNaturalW) / 2, parentNaturalH + 20);

                    // Now use combined canvas as the image
                    const combinedImg = new Image();
                    combinedImg.onload = () => {
                        this.lastImageElement = combinedImg;
                        
                        const naturalW = combinedImg.naturalWidth || combinedImg.width;
                        const naturalH = combinedImg.naturalHeight || combinedImg.height;

                        const maxW = Math.max(viewW - 120, 1100);
                        const maxH = Math.max(viewH - 80, 850);
                        let baseScale = 1.0;
                        if (naturalW > maxW || naturalH > maxH) {
                            baseScale = Math.min(maxW / naturalW, maxH / naturalH);
                        } else if (naturalW < 750 && naturalH < 650) {
                            baseScale = Math.min(950 / naturalW, 750 / naturalH, 1.5);
                        }

                        this.baseImgW = Math.round(naturalW * baseScale);
                        this.baseImgH = Math.round(naturalH * baseScale);

                        this.totalW = viewW;
                        this.totalH = viewH;

                        this.bgCanvas.width = this.totalW;
                        this.bgCanvas.height = this.totalH;
                        this.canvas.width = this.totalW;
                        this.canvas.height = this.totalH;

                        this.bgCanvas.style.width = this.totalW + 'px';
                        this.bgCanvas.style.height = this.totalH + 'px';
                        this.canvas.style.width = this.totalW + 'px';
                        this.canvas.style.height = this.totalH + 'px';

                        const inner = document.getElementById('reviewCanvasInner');
                        if (inner) {
                            inner.style.width = this.totalW + 'px';
                            inner.style.height = this.totalH + 'px';
                            inner.style.transform = 'none';
                        }

                        this.bgCtx.imageSmoothingEnabled = false;
                        this.ctx.imageSmoothingEnabled = false;

                        this.photoW = 0;
                        this.photoH = 0;

                        this.ctx.clearRect(0, 0, this.totalW, this.totalH);
                        this.saveState();

                        const targetZoom = this.savedZoomLevel || 1.0;
                        this.setZoom(targetZoom);
                    };
                    combinedImg.src = combinedCanvas.toDataURL('image/png');
                };
                
                parentImg.onload = () => {
                    parentLoaded = true;
                    renderBothImages();
                };
                parentImg.onerror = () => {
                    console.error('Failed to load parent image for stem question');
                    // Fall back to showing just the stem
                    stemLoaded = false;
                    parentLoaded = false;
                };
                
                stemImg.onload = () => {
                    stemLoaded = true;
                    renderBothImages();
                };
                stemImg.onerror = () => {
                    console.error('Failed to load stem image');
                    stemLoaded = false;
                    parentLoaded = false;
                };
                
                parentImg.src = parentItem.image;
                stemImg.src = item.image;
                return;
            }
        }

        // Standard single image rendering (no stem or parent not found)
        if (item.image) {
            const img = new Image();
            img.onload = () => {
                this.lastImageElement = img;
                const viewport = document.getElementById('reviewCanvasViewport');
                const viewW = viewport ? Math.max(800, viewport.clientWidth) : 900;
                const viewH = viewport ? Math.max(500, viewport.clientHeight) : 600;

                // Determine natural image dimensions - preserve pristine quality without lossy stretching
                const naturalW = img.naturalWidth || img.width;
                const naturalH = img.naturalHeight || img.height;

                // Base photo size at 100% zoom: significantly larger display for crystal-clear readability
                const maxW = Math.max(viewW - 120, 1100);
                const maxH = Math.max(viewH - 80, 850);
                let baseScale = 1.0;
                if (naturalW > maxW || naturalH > maxH) {
                    baseScale = Math.min(maxW / naturalW, maxH / naturalH);
                } else if (naturalW < 750 && naturalH < 650) {
                    baseScale = Math.min(950 / naturalW, 750 / naturalH, 1.5);
                }

                this.baseImgW = Math.round(naturalW * baseScale);
                this.baseImgH = Math.round(naturalH * baseScale);

                // Workspace ALWAYS covers the full screen
                this.totalW = viewW;
                this.totalH = viewH;

                this.bgCanvas.width = this.totalW;
                this.bgCanvas.height = this.totalH;
                this.canvas.width = this.totalW;
                this.canvas.height = this.totalH;

                this.bgCanvas.style.width = this.totalW + 'px';
                this.bgCanvas.style.height = this.totalH + 'px';
                this.canvas.style.width = this.totalW + 'px';
                this.canvas.style.height = this.totalH + 'px';

                const inner = document.getElementById('reviewCanvasInner');
                if (inner) {
                    inner.style.width = this.totalW + 'px';
                    inner.style.height = this.totalH + 'px';
                    inner.style.transform = 'none';
                }

                const qImg = document.getElementById('reviewQuestionImg');
                if (qImg) {
                    qImg.src = item.image;
                }

                // Disable smoothing for crisp zoom - no pixelation
                this.bgCtx.imageSmoothingEnabled = false;
                this.ctx.imageSmoothingEnabled = false;

                // Reset photo dimensions for this new question so setZoom positions it properly
                this.photoW = 0;
                this.photoH = 0;

                this.ctx.clearRect(0, 0, this.totalW, this.totalH);
                this.saveState();

                // Apply preserved zoom level and position (does not reset across questions)
                const targetZoom = this.savedZoomLevel || 1.0;
                this.setZoom(targetZoom);
            };
            
            img.onerror = () => {
                console.error('Failed to load question image:', item.image);
                // Clear canvas and show error
                if (this.bgCtx) {
                    this.bgCtx.fillStyle = '#2a2a2c';
                    this.bgCtx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
                    this.bgCtx.fillStyle = '#ffffff';
                    this.bgCtx.font = '16px system-ui';
                    this.bgCtx.textAlign = 'center';
                    this.bgCtx.fillText('Görsel yüklenemedi', this.bgCanvas.width / 2, this.bgCanvas.height / 2);
                }
            };
            
            img.src = item.image;
        } else {
            this.lastImageElement = null;
            const qImg = document.getElementById('reviewQuestionImg');
            if (qImg) qImg.style.display = 'none';

            const viewport = document.getElementById('reviewCanvasViewport');
            const viewW = viewport ? Math.max(800, viewport.clientWidth) : 900;
            const viewH = viewport ? Math.max(500, viewport.clientHeight) : 600;

            this.totalW = viewW;
            this.totalH = viewH;

            this.bgCanvas.width = this.totalW;
            this.bgCanvas.height = this.totalH;
            this.canvas.width = this.totalW;
            this.canvas.height = this.totalH;

            this.bgCanvas.style.width = this.totalW + 'px';
            this.bgCanvas.style.height = this.totalH + 'px';
            this.canvas.style.width = this.totalW + 'px';
            this.canvas.style.height = this.totalH + 'px';

            const inner = document.getElementById('reviewCanvasInner');
            if (inner) {
                inner.style.width = this.totalW + 'px';
                inner.style.height = this.totalH + 'px';
                inner.style.transform = 'none';
            }

            this.bgCtx.imageSmoothingEnabled = false;
            this.ctx.imageSmoothingEnabled = false;

            this.renderTextQuestionWorkspace(this.totalW, this.totalH, item);
            this.ctx.clearRect(0, 0, this.totalW, this.totalH);
            this.saveState();
        }
    }

    renderBackgroundWorkspace() {
        const ctx = this.bgCtx;
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        // Dark workspace desk covering the full screen
        ctx.fillStyle = '#161922';
        ctx.fillRect(0, 0, this.totalW, this.totalH);

        // Grid lines on workspace
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        const gridSize = 24;
        for (let x = 0; x < this.totalW; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.totalH);
            ctx.stroke();
        }
        for (let y = 0; y < this.totalH; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.totalW, y);
            ctx.stroke();
        }

        // Shadow under question
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;

        // White question card
        ctx.fillStyle = '#ffffff';
        this.roundRect(ctx, this.photoX, this.photoY, this.photoW, this.photoH, 8, true, false);

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Draw image directly onto background canvas
        if (this.lastImageElement) {
            ctx.drawImage(this.lastImageElement, this.photoX, this.photoY, this.photoW, this.photoH);
        }

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        this.roundRect(ctx, this.photoX, this.photoY, this.photoW, this.photoH, 8, false, true);

        // Notice: Helper text removed completely as requested!
    }

    renderTextQuestionWorkspace(totalW, totalH, item) {
        const ctx = this.bgCtx;
        if (!ctx) return;

        ctx.fillStyle = '#161922';
        ctx.fillRect(0, 0, totalW, totalH);

        const cardW = 680;
        const cardH = 340;
        const cardX = (totalW - cardW) / 2;
        const cardY = 80;

        ctx.fillStyle = '#1e2230';
        this.roundRect(ctx, cardX, cardY, cardW, cardH, 12, true, false);

        ctx.strokeStyle = 'rgba(124, 92, 252, 0.4)';
        ctx.lineWidth = 2;
        this.roundRect(ctx, cardX, cardY, cardW, cardH, 12, false, true);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillText(`Soru ${item.questionNumber} — ${item.topic || 'Genel'}`, cardX + 24, cardY + 44);

        ctx.fillStyle = '#a0aec0';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText(item.questionText || item.testTitle || 'Görsel bulunmuyor, soruyu çizim alanında çözebilirsiniz.', cardX + 24, cardY + 90);
    }

    roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    showAnswer() {
        const item = this.currentSession[this.currentIndex];
        document.getElementById('showAnswerBtn')?.classList.add('hidden');
        document.getElementById('reviewRevealedAnswer')?.classList.remove('hidden');
        document.getElementById('reviewCardActions')?.classList.remove('hidden');

        // Evaluate user's selected choice (A, B, C, D, E, Boş) against item.correctAnswer
        const feedbackEl = document.getElementById('reviewChoiceFeedback');
        const correctAns = (item?.correctAnswer || '').trim().toUpperCase();
        const selected = this.selectedOption ? this.selectedOption.trim() : null;

        // Disable buttons after answer reveal and highlight correct/wrong
        document.querySelectorAll('[data-review-opt]').forEach(btn => {
            btn.disabled = true;
            const opt = btn.dataset.reviewOpt;
            if (correctAns && opt.toUpperCase() === correctAns) {
                btn.classList.add('is-correct-opt');
            } else if (selected && selected !== 'Boş' && opt === selected && opt.toUpperCase() !== correctAns) {
                btn.classList.add('is-wrong-opt');
            }
        });

        if (feedbackEl) {
            feedbackEl.classList.remove('hidden');
            if (!selected) {
                feedbackEl.innerHTML = `
                    <div class="user-choice-badge unselected">
                        <span class="material-icons-outlined">help_outline</span>
                        <span>Herhangi bir şık işaretlemeden cevabı açtınız.${correctAns ? ` Doğru Cevap: <strong>${correctAns}</strong>` : ''}</span>
                    </div>`;
            } else if (selected === 'Boş') {
                feedbackEl.innerHTML = `
                    <div class="user-choice-badge blank">
                        <span class="material-icons-outlined">radio_button_unchecked</span>
                        <span>Bu soruyu <strong>Boş</strong> bıraktınız.${correctAns ? ` Doğru Cevap: <strong>${correctAns}</strong>` : ''}</span>
                    </div>`;
            } else if (correctAns && selected.toUpperCase() === correctAns) {
                feedbackEl.innerHTML = `
                    <div class="user-choice-badge correct">
                        <span class="material-icons-outlined">check_circle</span>
                        <span>🎉 <strong>Tebrikler!</strong> Doğru cevap verdiniz: <strong>${selected}</strong></span>
                    </div>`;
            } else if (correctAns && selected.toUpperCase() !== correctAns) {
                feedbackEl.innerHTML = `
                    <div class="user-choice-badge wrong">
                        <span class="material-icons-outlined">cancel</span>
                        <span>❌ <strong>Yanlış!</strong> Seçtiğiniz Şık: <strong>${selected}</strong> — Doğru Cevap: <strong>${correctAns}</strong></span>
                    </div>`;
            } else {
                feedbackEl.innerHTML = `
                    <div class="user-choice-badge info">
                        <span class="material-icons-outlined">info</span>
                        <span>Seçiminiz: <strong>${selected}</strong> (Bu soru için doğru cevap belirtilmemiş)</span>
                    </div>`;
            }
        }
    }

    confirmAnswer() {
        const item = this.currentSession[this.currentIndex];
        const poolItem = this.pool.find(i => i.id === item.id);
        
        if (!poolItem) {
            this.currentIndex++;
            this.showCard();
            return;
        }
        
        // Determine status from selected option
        const selected = this.selectedOption;
        const correctAns = item.correctAnswer;
        
        let status;
        if (!selected) {
            // No option selected - treat as blank
            status = 'blank';
        } else if (selected === 'Boş') {
            status = 'blank';
        } else if (correctAns && selected.toUpperCase() === correctAns.toUpperCase()) {
            status = 'correct';
        } else {
            status = 'wrong';
        }
        
        // Update review
        this.updateSimpleReview(poolItem, status);
        
        // Show feedback
        const ratingIcons = {
            wrong: '❌',
            blank: '➖',
            correct: '✅'
        };
        const ratingLabels = {
            wrong: 'Yanlış',
            blank: 'Boş',
            correct: 'Doğru'
        };
        
        if (window.app) {
            const interval = poolItem.interval || 1;
            window.app.showToast(`${ratingIcons[status]} ${ratingLabels[status]} — ${interval} gün sonra tekrar`, 'info');
        }
        
        this.currentIndex++;
        this.showCard();
    }

    rateCard(rating) {
        // Deprecated - replaced by confirmAnswer
        this.confirmAnswer();
    }

    endSession() {
        document.getElementById('reviewSession')?.classList.add('hidden');
        const qImg = document.getElementById('reviewQuestionImg');
        if (qImg) qImg.style.display = 'none';
        if (this.canvas) this.canvas.style.transform = 'none';
        this.isMovingPhoto = false;
        if (window.app) app.showToast(`Tekrar oturumu tamamlandı! ${this.currentSession.length} soru çalışıldı.`, 'success');

        this.currentSession = [];
        this.currentIndex = 0;

        this.renderPool();
        if (window.app) app.updateReviewBadge();
    }

    closeSession() {
        const cleanup = () => {
            document.getElementById('reviewSession')?.classList.add('hidden');
            const qImg = document.getElementById('reviewQuestionImg');
            if (qImg) qImg.style.display = 'none';
            if (this.canvas) this.canvas.style.transform = 'none';
            this.isMovingPhoto = false;
            this.renderPool();
            if (window.app) app.updateReviewBadge();
        };

        if (window.app) {
            app.showConfirmModal(
                'Oturumu Kapat',
                'Devam eden tekrar oturumunu kapatmak istiyor musunuz? İlerlemeniz kaydedilecektir.',
                cleanup
            );
        } else {
            cleanup();
        }
    }

    // ---- Helpers ----
    formatRelativeDate(date) {
        const now = new Date();
        const diff = date - now;
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        if (days <= 0) return 'Şimdi';
        if (days === 1) return 'Yarın';
        if (days < 7) return `${days} gün sonra`;
        if (days < 30) return `${Math.ceil(days / 7)} hafta sonra`;
        return `${Math.ceil(days / 30)} ay sonra`;
    }
}

// Global initialization
const reviewPool = new ReviewPool();
window.reviewPool = reviewPool;
