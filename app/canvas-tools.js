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
   DenemeLab — Canvas Drawing Tools
   Full drawing toolkit with pen, highlighter, pixel eraser,
   stroke eraser (line/object removal), zoom controls,
   generous padded workspace for solving outside question
   =================================================== */

class CanvasTools {
    constructor() {
        this.canvas = document.getElementById('drawingCanvas');
        this.bgCanvas = document.getElementById('drawingCanvasBg');
        this.ctx = this.canvas?.getContext('2d', { willReadFrequently: true });
        this.bgCtx = this.bgCanvas?.getContext('2d', { willReadFrequently: true });

        this.tool = 'pen'; // 'pen', 'highlighter', 'eraser', 'stroke-eraser', 'line', 'rect', 'circle', 'triangle'
        this.color = '#FF3B30';
        this.brushSize = 3;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.startX = 0;
        this.startY = 0;

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

        // Zoom state
        this.zoomLevel = 1.0;

        // Vector strokes for stroke-eraser
        this.strokes = [];
        this.currentStroke = null;

        // Photo dragging / moving state
        this.isMovingPhoto = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.initialPhotoX = 0;
        this.initialPhotoY = 0;
        this.dragTotalDx = 0;
        this.dragTotalDy = 0;

        // Undo / Redo history
        this.trianglePoints = [];
        this.triangleBaseSnapshot = null;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;

        this.lastImageData = null;
        this.shapePreviewCanvas = null;

        if (typeof window !== 'undefined' && window.ColorPaletteManager) {
            window.ColorPaletteManager.onChange(() => this.renderPalette());
        }
        this.renderPalette();
        this.bindEvents();
    }

    
    renderPalette() {
        const container = document.getElementById('drawingColorSwatches');
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
            btn.addEventListener('click', () => this.setColor(c));
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
            btn.addEventListener('click', () => this.setColor(c));
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
        input.id = 'drawingCustomColor';
        input.className = 'custom-color-input';
        input.value = this.color || '#FF3B30';
        input.title = 'Özel Renk Seç';
        input.addEventListener('input', (e) => {
            this.setColor(e.target.value);
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

    setColor(color) {
        this.color = color;
        const cur = (this.color || '#FF3B30').toUpperCase();
        document.querySelectorAll('#drawingColorSwatches .color-swatch').forEach(s => {
            s.classList.toggle('active', (s.dataset.color || '').toUpperCase() === cur);
        });
        const input = document.getElementById('drawingCustomColor');
        if (input) input.value = this.color;
    }

    bindEvents() {
        // Tool buttons
        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTool(btn.dataset.tool);
            });
        });

        // Color palette is dynamically managed by this.renderPalette()

        // Brush size
        document.getElementById('brushSize')?.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            const valEl = document.getElementById('sizeValue');
            if (valEl) valEl.textContent = this.brushSize;
        });

        // Zoom buttons in drawing toolbar
        document.getElementById('drawZoomInBtn')?.addEventListener('click', () => this.setZoom(this.zoomLevel + 0.2));
        document.getElementById('drawZoomOutBtn')?.addEventListener('click', () => this.setZoom(this.zoomLevel - 0.2));
        document.getElementById('drawZoomResetBtn')?.addEventListener('click', () => this.setZoom(1.0));

        // Undo/Redo
        document.getElementById('undoBtn')?.addEventListener('click', () => this.undo());
        document.getElementById('redoBtn')?.addEventListener('click', () => this.redo());

        // Clear canvas
        document.getElementById('clearCanvasBtn')?.addEventListener('click', () => {
            if (window.app) {
                app.showConfirmModal(
                    'Çizimi Temizle',
                    'Tüm çizimler silinecektir. Devam etmek istiyor musunuz?',
                    () => this.clearCanvas()
                );
            } else {
                if (confirm('Tüm çizimler silinecektir. Devam etmek istiyor musunuz?')) {
                    this.clearCanvas();
                }
            }
        });

        // Save drawing
        document.getElementById('saveDrawingBtn')?.addEventListener('click', () => this.saveDrawing());

        // Close drawing
        document.getElementById('closeDrawingBtn')?.addEventListener('click', () => this.closeDrawingMode());

        // Canvas events
        if (this.canvas) {
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

        // Keyboard shortcuts inside drawing mode
        document.addEventListener('keydown', (e) => {
            const overlay = document.getElementById('drawingOverlay');
            if (overlay && !overlay.classList.contains('hidden')) {
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
                    this.closeDrawingMode();
                }

                // Tool shortcuts
                if (!e.ctrlKey && !e.altKey && !['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) {
                    switch (e.key.toLowerCase()) {
                        case 'p': this.setTool('pen'); break;
                        case 'e': this.setTool('eraser'); break;
                        case 's': this.setTool('stroke-eraser'); break;
                        case 'h': this.setTool('highlighter'); break;
                        case 'm': this.setTool('move'); break;
                        case 'l': this.setTool('line'); break;
                        case 'a': this.setTool('arrow'); break;
                        case 'r': this.setTool('rect'); break;
                        case 'c': this.setTool('circle'); break;
                        case 't': this.setTool('triangle'); break;
                        case '+':
                        case '=': this.setZoom(this.zoomLevel + 0.2); break;
                        case '-': this.setZoom(this.zoomLevel - 0.2); break;
                        case '0': this.setZoom(1.0); break;
                    }
                }
            }
        });
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

    setTool(tool) {
        this.cancelTriangleCreation();
        this.tool = tool;
        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        // Update cursor
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
        this.updateZoomDisplay();

        if (!this.lastImageElement) return;

        const wrapper = document.getElementById('drawingCanvasWrapper');
        const viewW = wrapper ? Math.max(900, wrapper.clientWidth) : 1000;
        const viewH = wrapper ? Math.max(600, wrapper.clientHeight) : 700;

        // Scale ONLY the question photo
        const photoW = Math.round(this.baseImgW * this.zoomLevel);
        const photoH = Math.round(this.baseImgH * this.zoomLevel);

        // Drawing workspace ALWAYS fills the screen (gently expands only if photo is larger than screen)
        const newTotalW = Math.max(viewW, photoW + 160);
        const newTotalH = Math.max(viewH, photoH + 160);

        let photoX, photoY;
        if (this.photoW > 0 && this.photoH > 0 && level !== 1.0) {
            // Keep the photo centered around its current visual center point
            const centerX = this.photoX + this.photoW / 2;
            const centerY = this.photoY + this.photoH / 2;
            photoX = Math.round(centerX - photoW / 2);
            photoY = Math.round(centerY - photoH / 2);
        } else {
            // Center the photo on reset (100%) or initial load
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

            const inner = document.getElementById('drawingCanvasInner');
            if (inner) {
                inner.style.width = this.totalW + 'px';
                inner.style.height = this.totalH + 'px';
                inner.style.transform = 'none';
            }

            this.redrawCanvasFromStrokes();
        }

        // Update photo element directly - browser renders full-res PNG with crystal clarity at any zoom
        const qImg = document.getElementById('drawingQuestionImg');
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

    updateZoomDisplay() {
        const valEl = document.getElementById('drawZoomValue');
        if (valEl) valEl.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }

    openDrawingMode(imageData, onSaveCallback = null) {
        this.lastImageData = imageData;
        this.onSaveCallback = onSaveCallback;
        this.zoomLevel = 1.0;
        this.updateZoomDisplay();
        this.strokes = [];

        const overlay = document.getElementById('drawingOverlay');
        overlay?.classList.remove('hidden');
        this.renderPalette();

        // Update save button tooltip
        const saveBtn = document.getElementById('saveDrawingBtn');
        if (saveBtn) {
            saveBtn.title = onSaveCallback ? 'Çizimi Soruya Kaydet' : 'Çizimi İndir / Kaydet';
        }

        const img = new Image();

        img.onerror = (err) => {
            console.error('❌ Failed to load image in drawing mode:', err);
            console.error('Image data length:', imageData?.length || 0);
            console.error('Image data preview:', imageData?.substring(0, 100));

            // Close drawing mode and show error
            this.closeDrawingMode();
            if (window.app) {
                window.app.showToast('Görsel yüklenemedi. Lütfen tekrar deneyin.', 'error');
            }
        };

        img.onload = () => {
            console.log('✅ Drawing mode image loaded:', img.naturalWidth, 'x', img.naturalHeight);
            this.lastImageElement = img;
            const wrapper = document.getElementById('drawingCanvasWrapper');
            const viewW = wrapper ? Math.max(900, wrapper.clientWidth) : 1000;
            const viewH = wrapper ? Math.max(600, wrapper.clientHeight) : 700;

            // Determine natural image dimensions
            const naturalW = img.naturalWidth || img.width;
            const naturalH = img.naturalHeight || img.height;

            // Base photo size at 100% zoom: significantly larger display for crystal-clear readability
            const maxQuestionW = Math.max(viewW - 120, 1100);
            const maxQuestionH = Math.max(viewH - 80, 850);

            let baseScale = 1.0;
            if (naturalW > maxQuestionW || naturalH > maxQuestionH) {
                baseScale = Math.min(maxQuestionW / naturalW, maxQuestionH / naturalH);
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

            const inner = document.getElementById('drawingCanvasInner');
            if (inner) {
                inner.style.width = this.totalW + 'px';
                inner.style.height = this.totalH + 'px';
                inner.style.transform = 'none';
            }

            // Disable smoothing for crisp zoom - no pixelation
            this.bgCtx.imageSmoothingEnabled = false;
            this.ctx.imageSmoothingEnabled = false;

            // Clear drawing canvas
            this.ctx.clearRect(0, 0, this.totalW, this.totalH);
            this.undoStack = [];
            this.redoStack = [];
            this.saveState();

            // Set the image source for the drawingQuestionImg element
            const qImg = document.getElementById('drawingQuestionImg');
            if (qImg) {
                qImg.src = imageData;
                console.log('🖼️ Set drawingQuestionImg.src');
            }

            // Set zoom to 1.0 which updates photo position, dimensions, image element and background
            this.setZoom(1.0);
        };

        // Validate imageData before setting src
        if (!imageData || typeof imageData !== 'string') {
            console.error('❌ Invalid imageData:', typeof imageData);
            this.closeDrawingMode();
            if (window.app) {
                window.app.showToast('Geçersiz görsel verisi', 'error');
            }
            return;
        }

        img.src = imageData;
    }

    renderBackgroundWorkspace() {
        const ctx = this.bgCtx;
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        // Dark modern desk workspace background covering the full screen
        ctx.fillStyle = '#161922';
        ctx.fillRect(0, 0, this.totalW, this.totalH);

        // Subtle scratchpad grid dots / lines on the workspace
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

        // Card shadow under question
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;

        // White question card background
        ctx.fillStyle = '#ffffff';
        this.roundRect(ctx, this.photoX, this.photoY, this.photoW, this.photoH, 8, true, false);

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw image directly onto background canvas
        if (this.lastImageElement) {
            console.log('🖼️ Drawing image to background:', {
                imgWidth: this.lastImageElement.naturalWidth,
                imgHeight: this.lastImageElement.naturalHeight,
                photoX: this.photoX,
                photoY: this.photoY,
                photoW: this.photoW,
                photoH: this.photoH
            });
            ctx.drawImage(this.lastImageElement, this.photoX, this.photoY, this.photoW, this.photoH);
        } else {
            console.warn('⚠️ No lastImageElement to draw!');
        }

        // Subtle card border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        this.roundRect(ctx, this.photoX, this.photoY, this.photoW, this.photoH, 8, false, true);

        // Notice: Text prompt removed as requested!
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

    closeDrawingMode() {
        document.getElementById('drawingOverlay')?.classList.add('hidden');
        const qImg = document.getElementById('drawingQuestionImg');
        if (qImg) qImg.style.display = 'none';
        if (this.canvas) this.canvas.style.transform = 'none';
        this.isMovingPhoto = false;
        this.onSaveCallback = null;
    }

    // ---- Drawing Events ----
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

            this.photoX = this.initialPhotoX + dx;
            this.photoY = this.initialPhotoY + dy;

            const qImg = document.getElementById('drawingQuestionImg');
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

        this.ctx.closePath();
        this.saveState();
    }

    // ---- Stroke Eraser Logic ----
    handleStrokeEraseAt(x, y) {
        if (!this.strokes || this.strokes.length === 0) return;

        const eraseRadius = Math.max(14, this.brushSize * 3);
        let removedAny = false;

        this.strokes = this.strokes.filter(stroke => {
            const hit = this.isPointNearStroke(x, y, stroke, eraseRadius);
            if (hit) {
                removedAny = true;
                return false; // Remove stroke
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

    // ---- Unified Shape Drawing & Previews ----
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

    // ---- Undo/Redo ----
    saveState() {
        if (!this.ctx || !this.canvas) return;
        const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const strokesCopy = JSON.parse(JSON.stringify(this.strokes));

        this.undoStack.push({
            imgData,
            strokes: strokesCopy
        });

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

    // ---- Save ----
    saveDrawing() {
        if (!this.canvas) return;

        const loader = window.app && typeof window.app.showLoadingToast === 'function'
            ? window.app.showLoadingToast('🎨 Çizim kaydediliyor ve işleniyor, lütfen bekleyin...')
            : null;

        // Determine destination dimensions: exactly the question image's natural dimensions
        const origW = (this.lastImageElement && (this.lastImageElement.naturalWidth || this.lastImageElement.width)) || (this.photoW > 0 ? this.photoW : this.canvas.width);
        const origH = (this.lastImageElement && (this.lastImageElement.naturalHeight || this.lastImageElement.height)) || (this.photoH > 0 ? this.photoH : this.canvas.height);

        const merged = document.createElement('canvas');
        merged.width = origW;
        merged.height = origH;
        const mCtx = merged.getContext('2d', { willReadFrequently: true });
        mCtx.imageSmoothingEnabled = true;

        // 1. Draw clean question image at natural resolution (NEVER include bgCanvas desk or grid!)
        if (this.lastImageElement) {
            mCtx.drawImage(this.lastImageElement, 0, 0, origW, origH);
        }

        // 2. Draw user annotations scaled and mapped accurately to the question photo
        if (this.photoW > 0 && this.photoH > 0) {
            const scaleX = origW / this.photoW;
            const scaleY = origH / this.photoH;

            mCtx.save();
            mCtx.beginPath();
            mCtx.rect(0, 0, origW, origH);
            mCtx.clip();

            mCtx.scale(scaleX, scaleY);
            mCtx.drawImage(this.canvas, -this.photoX, -this.photoY);
            mCtx.restore();
        } else {
            mCtx.drawImage(this.canvas, 0, 0, origW, origH);
        }

        const dataUrl = merged.toDataURL('image/png');
        // Release export canvas memory
        merged.width = 0;
        merged.height = 0;

        if (typeof this.onSaveCallback === 'function') {
            const cb = this.onSaveCallback;
            this.closeDrawingMode();
            cb(dataUrl);
            if (loader) loader.success('✅ Çizim başarıyla soruya kaydedildi!');
            else if (window.app) app.showToast('Çizim başarıyla soruya kaydedildi!', 'success');
            return;
        }

        // Download
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `Deneme_Lab_Cizim_${Date.now()}.png`;
        link.click();

        if (loader) loader.success('✅ Çizim başarıyla kaydedildi!');
        else if (window.app) app.showToast('Çizim kaydedildi', 'success');
    }
}

// Global initialization
const canvasTools = new CanvasTools();
window.canvasTools = canvasTools;
