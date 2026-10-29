/* ===================================================
   Deneme Lab — AI Analyzer Module
   Handles file upload, PDF processing, Gemini API integration
   =================================================== */

class Analyzer {
    constructor() {
        this.uploadedFiles = [];
        this.currentAnalysis = null;
        this.currentQuestions = []; // Store questions for safe reference
        this.bindEvents();
    }

    getEl(id) {
        return document.getElementById(id + 'Ai') || document.getElementById(id);
    }

    bindEvents() {
        const uploadZone = this.getEl('uploadZone');
        const fileInput = this.getEl('fileInput');

        // Click to upload
        uploadZone?.addEventListener('click', () => fileInput?.click());

        // File input change
        fileInput?.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // Drag & Drop - with null safety
        uploadZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone?.classList.add('drag-over');
        });
        uploadZone?.addEventListener('dragleave', () => {
            uploadZone?.classList.remove('drag-over');
        });
        uploadZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone?.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });

        // Clear files
        this.getEl('clearFiles')?.addEventListener('click', () => this.clearFiles());

        // Analyze button
        this.getEl('analyzeBtn')?.addEventListener('click', () => this.startAnalysis());

        // New analysis
        this.getEl('newAnalysisBtn')?.addEventListener('click', () => this.resetToUpload());

        // Add to pool
        this.getEl('addToPoolBtn')?.addEventListener('click', () => {
            if (this.currentAnalysis && window.reviewPool) {
                const wrongQuestions = (this.currentAnalysis.questions || []).filter(q => !q.isCorrect && !q.isBlank);
                wrongQuestions.forEach(q => {
                    window.reviewPool.addToPool(q, this.currentAnalysis);
                });
                app.showToast(`${wrongQuestions.length} yanlış soru tekrar havuzuna eklendi`, 'success');
                app.updateReviewBadge();
            }
        });
    }

    async handleFiles(files) {
        if (!files || files.length === 0) return;

        // Check if we're on the AI analysis page
        const currentPage = window.app?.currentPage;
        if (currentPage !== 'ai-analysis') {
            console.warn('AI Analyzer: Not on AI analysis page, ignoring file upload');
            return;
        }

        // Check if upload zone exists
        const uploadZone = this.getEl('uploadZone');
        if (!uploadZone) {
            console.error('Upload zone element not found');
            if (window.app) {
                window.app.showToast('Yükleme alanı bulunamadı. AI Analizi sayfasında olduğunuzdan emin olun.', 'error');
            }
            return;
        }

        for (const file of files) {
            if (file.type === 'application/pdf') {
                await this.processPDF(file);
            } else if (file.type.startsWith('image/')) {
                await this.processImage(file);
            } else {
                if (window.app) {
                    window.app.showToast(`Desteklenmeyen dosya formatı: ${file.name}`, 'error');
                }
            }
        }

        this.showPreview();
    }

    processImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.uploadedFiles.push({
                    name: file.name,
                    type: 'image',
                    data: e.target.result,
                    mimeType: file.type
                });
                resolve();
            };
            reader.readAsDataURL(file);
        });
    }

    async processPDF(file) {
        // Auto-fill test name from filename (without .pdf extension)
        const testNameInput = this.getEl('testNameInput');
        if (testNameInput && !testNameInput.value) {
            const fileName = file.name.replace(/\.pdf$/i, '');
            testNameInput.value = fileName;
        }

        // Show PDF loading progress
        const uploadZone = this.getEl('uploadZone');
        
        // Check if upload zone exists first
        if (!uploadZone) {
            console.error('Upload zone element not found in DOM');
            if (window.app) {
                window.app.showToast('Yükleme alanı bulunamadı. Lütfen sayfayı yenileyin.', 'error');
            }
            return;
        }
        
        const progressDiv = document.createElement('div');
        progressDiv.id = 'pdfLoadingProgress';
        progressDiv.innerHTML = `
            <div style="text-align:center;padding:24px;">
                <div class="ai-loader" style="margin:0 auto 16px;">
                    <div class="ai-loader-ring"></div>
                    <span class="material-icons-outlined">picture_as_pdf</span>
                </div>
                <h3 id="pdfProgressTitle">PDF Yükleniyor...</h3>
                <p id="pdfProgressSub">Dosya okunuyor</p>
                <div class="progress-bar-container" style="margin-top:12px;">
                    <div class="progress-bar" id="pdfProgressBar" style="width:0%"></div>
                </div>
            </div>`;

        // Check parent element exists
        if (!uploadZone.parentElement) {
            console.error('Upload zone parent element not found');
            return;
        }

        // Double-check uploadZone still exists before classList access
        if (!uploadZone || !uploadZone.classList) {
            console.error('Upload zone became invalid before hiding');
            return;
        }

        uploadZone.classList.add('hidden');
        uploadZone.parentElement.appendChild(progressDiv);

        const pdfTitle = document.getElementById('pdfProgressTitle');
        const pdfSub = document.getElementById('pdfProgressSub');
        const pdfBar = document.getElementById('pdfProgressBar');

        // Check if progress elements exist
        if (!pdfTitle || !pdfSub || !pdfBar) {
            console.error('Progress elements not found');
            if (uploadZone && uploadZone.classList) {
                uploadZone.classList.remove('hidden');
            }
            return;
        }

        try {
            // Set worker source
            if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }

            pdfSub.textContent = 'PDF belgesi yükleniyor...';
            pdfBar.style.width = '10%';

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdf.numPages;

            pdfTitle.textContent = `${numPages} Sayfa Bulundu`;
            pdfBar.style.width = '20%';

            // Use scale 1.5 and JPEG for faster processing
            const RENDER_SCALE = 1.5;
            const JPEG_QUALITY = 0.85;

            for (let i = 1; i <= numPages; i++) {
                const progress = 20 + ((i / numPages) * 75);
                pdfBar.style.width = progress + '%';
                pdfSub.textContent = `Sayfa ${i}/${numPages} işleniyor...`;

                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: RENDER_SCALE });

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: ctx, viewport }).promise;

                // Use JPEG for smaller size (much faster upload to API)
                this.uploadedFiles.push({
                    name: `${file.name} - Sayfa ${i}`,
                    type: 'image',
                    data: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
                    mimeType: 'image/jpeg'
                });

                // Allow UI to breathe between pages
                await new Promise(r => setTimeout(r, 10));
            }

            pdfBar.style.width = '100%';
            pdfSub.textContent = 'Tamamlandı!';
            await new Promise(r => setTimeout(r, 400));

            app.showToast(`PDF başarıyla işlendi (${numPages} sayfa)`, 'success');
        } catch (err) {
            if (window.app) {
                window.app.showToast('PDF işlenirken hata oluştu: ' + err.message, 'error');
            }
            if (uploadZone && uploadZone.classList) {
                uploadZone.classList.remove('hidden');
            }
        } finally {
            if (progressDiv && progressDiv.parentElement) {
                progressDiv.remove();
            }
            if (uploadZone && uploadZone.classList) {
                uploadZone.classList.remove('hidden');
            }
        }
    }

    showPreview() {
        if (this.uploadedFiles.length === 0) return;

        this.getEl('uploadZone')?.classList.add('hidden');
        this.getEl('previewArea')?.classList.remove('hidden');
        this.getEl('analysisResults')?.classList.add('hidden');
        this.getEl('analysisProgress')?.classList.add('hidden');

        const grid = this.getEl('previewGrid');
        if (grid) {
            grid.innerHTML = this.uploadedFiles.map((file, idx) => {
                if (file.type === 'image') {
                    return `
                        <div class="preview-item">
                            <img src="${file.data}" alt="${file.name}">
                            <button class="remove-preview" onclick="analyzer.removeFile(${idx})">
                                <span class="material-icons-outlined">close</span>
                            </button>
                        </div>`;
                }
                return '';
            }).join('');
        }
    }

    removeFile(index) {
        this.uploadedFiles.splice(index, 1);
        if (this.uploadedFiles.length === 0) {
            this.resetToUpload();
        } else {
            this.showPreview();
        }
    }

    clearFiles() {
        this.uploadedFiles = [];
        this.resetToUpload();
    }

    resetToUpload() {
        this.uploadedFiles = [];
        this.currentAnalysis = null;
        this.getEl('uploadZone')?.classList.remove('hidden');
        this.getEl('previewArea')?.classList.add('hidden');
        this.getEl('analysisProgress')?.classList.add('hidden');
        this.getEl('analysisResults')?.classList.add('hidden');
        const fi = this.getEl('fileInput');
        if (fi) fi.value = '';
    }

    async startAnalysis() {
        if (this.uploadedFiles.length === 0) {
            app.showToast('Lütfen bir dosya yükleyin', 'warning');
            return;
        }

        const apiKey = app.settings.apiKey;
        if (!apiKey) {
            app.showToast('Lütfen Ayarlar bölümünden Gemini API anahtarınızı girin', 'warning');
            app.navigateTo('settings');
            return;
        }

        const aiModel = (app.settings.aiModel || '').trim();
        if (!aiModel) {
            app.showToast('Lütfen Ayarlar bölümünden bir AI modeli seçin', 'warning');
            app.navigateTo('settings');
            return;
        }

        // Show progress
        this.getEl('previewArea')?.classList.add('hidden');
        this.getEl('analysisProgress')?.classList.remove('hidden');

        try {
            await this.runAnalysis(apiKey);
        } catch (err) {
            app.showToast('Analiz hatası: ' + err.message, 'error');
            this.getEl('analysisProgress')?.classList.add('hidden');
            this.getEl('previewArea')?.classList.remove('hidden');
        }
    }


    async runAnalysis(apiKey) {
        const steps = ['step1', 'step2', 'step3', 'step4'];
        const progressBar = this.getEl('progressBar');
        const progressTitle = this.getEl('progressTitle');
        const progressSubtitle = this.getEl('progressSubtitle');

        // Step 1: Processing image
        this.updateStep(steps, 0);
        if (progressBar) progressBar.style.width = '15%';
        if (progressTitle) progressTitle.textContent = 'Görüntü İşleniyor...';
        if (progressSubtitle) progressSubtitle.textContent = 'Dosyalar hazırlanıyor';
        await this.delay(800);

        // Step 2: Detecting questions
        this.updateStep(steps, 1);
        if (progressBar) progressBar.style.width = '35%';
        if (progressTitle) progressTitle.textContent = 'Sorular Algılanıyor...';
        if (progressSubtitle) progressSubtitle.textContent = 'Yapay zeka soruları tespit ediyor';

        // Send to Gemini API
        const subject = this.getEl('subjectSelect')?.value || 'auto';
        const testName = this.getEl('testNameInput')?.value || 'İsimsiz Test';

        let allResults = [];

        for (let i = 0; i < this.uploadedFiles.length; i++) {
            const file = this.uploadedFiles[i];
            const progress = 35 + ((i + 1) / this.uploadedFiles.length) * 40;
            if (progressBar) progressBar.style.width = progress + '%';
            if (progressSubtitle) progressSubtitle.textContent = `Sayfa ${i + 1}/${this.uploadedFiles.length} analiz ediliyor`;

            const result = await this.callGeminiAPI(apiKey, file, subject, testName);
            if (result && result.questions) {
                allResults = allResults.concat(result.questions);
            }
        }

        // Step 3: Grading
        this.updateStep(steps, 2);
        if (progressBar) progressBar.style.width = '80%';
        if (progressTitle) progressTitle.textContent = 'Puanlanıyor...';
        if (progressSubtitle) progressSubtitle.textContent = 'Sonuçlar hesaplanıyor';
        await this.delay(600);

        // Step 4: Report
        this.updateStep(steps, 3);
        if (progressBar) progressBar.style.width = '100%';
        if (progressTitle) progressTitle.textContent = 'Rapor Oluşturuluyor...';
        if (progressSubtitle) progressSubtitle.textContent = 'Neredeyse bitti!';
        await this.delay(500);

        // Compile results
        const correctCount = allResults.filter(q => q.isCorrect).length;
        const wrongCount = allResults.filter(q => !q.isCorrect && !q.isBlank).length;
        const blankCount = allResults.filter(q => q.isBlank).length;
        const totalQuestions = allResults.length;
        const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

        const analysis = {
            id: app.generateId(),
            date: new Date().toISOString(),
            title: testName,
            exam: allResults[0]?.exam || 'TYT',
            subject: subject === 'auto' ? (allResults[0]?.subject || 'Genel') : subject,
            questions: allResults.map((q, i) => ({ ...q, number: q.number || i + 1, exam: q.exam || 'TYT', subject: q.subject || (subject === 'auto' ? 'Genel' : subject) })),
            score,
            totalQuestions,
            correctCount,
            wrongCount,
            blankCount,
            imageData: this.uploadedFiles.length > 0 ? this.uploadedFiles[0].data : null
        };

        this.currentAnalysis = analysis;
        app.addAnalysis(analysis);

        // Auto-add wrong questions to review pool
        const wrongQuestions = allResults.filter(q => !q.isCorrect && !q.isBlank);
        if (wrongQuestions.length > 0 && window.reviewPool) {
            wrongQuestions.forEach(q => window.reviewPool.addToPool(q, analysis));
            app.updateReviewBadge();
        }

        // Show results
        this.getEl('analysisProgress')?.classList.add('hidden');
        this.getEl('analysisResults')?.classList.remove('hidden');

        this.displayResults(analysis);
        app.showToast(`Analiz tamamlandı! Puan: ${score}`, 'success');
    }

    async callGeminiAPI(apiKey, file, subject, testName) {
        // Use exactly the model selected by the user (fetched from API)
        const model = (app.settings.aiModel || '').trim();
        if (!model) {
            throw new Error('Model seçilmedi. Ayarlar sayfasından bir model seçin.');
        }

        const subjectHint = subject !== 'auto' ? `Bu test "${subject}" dersine aittir.` : '';

        const prompt = `Bu bir sınav/test fotoğrafıdır. ${subjectHint}

Lütfen bu görüntüyü dikkatli analiz et ve aşağıdakileri yap:
1. Fotoğraftaki her soruyu tespit et
2. Her soru için öğrencinin verdiği cevabı belirle
3. Doğru cevabı belirle
4. Sorunun ait olduğu konuyu belirle
5. Yanlış cevaplar için konuyu açıklayan kısa bir konu anlatımı yaz (en az 2-3 cümle)

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir metin ekleme:
{
  "questions": [
    {
      "number": 1,
      "questionText": "Sorunun kısa özeti",
      "studentAnswer": "Öğrencinin cevabı (A/B/C/D/E veya yazılı cevap)",
      "correctAnswer": "Doğru cevap",
      "isCorrect": false,
      "isBlank": false,
      "topic": "Konu adı",
      "subject": "Ders adı",
      "explanation": "Yanlışsa: Konunun kısa anlatımı. Doğruysa boş bırak.",
      "difficulty": "kolay"
    }
  ]
}

Önemli kurallar:
- "isBlank" değeri, öğrenci soruyu boş bırakmışsa true olmalı
- "isCorrect" değeri, cevap doğruysa true olmalı
- "explanation" alanı yanlış veya boş sorularda mutlaka doldurulmalı
- "difficulty" değeri "kolay", "orta" veya "zor" olmalı
- Her soruyu numaralandır
- JSON dışında hiçbir metin yazma`;

        const base64Data = file.data.split(',')[1];
        const mimeType = file.mimeType || 'image/jpeg';

        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                topP: 0.95,
                maxOutputTokens: 8192
            }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const subtitle = this.getEl('progressSubtitle');
        const MAX_RETRIES = 3;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            if (subtitle) subtitle.textContent = `${model} — deneme ${attempt}/${MAX_RETRIES}`;

            let response;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
            } catch (networkErr) {
                if (attempt < MAX_RETRIES) {
                    if (subtitle) subtitle.textContent = `Bağlantı hatası, tekrar deneniyor... (${attempt}/${MAX_RETRIES})`;
                    await this.delay(2000);
                    continue;
                }
                throw new Error('İnternet bağlantısı hatası: ' + networkErr.message);
            }

            // Rate limited / overloaded → wait and retry
            if (response.status === 429 || response.status === 503) {
                const waitSec = response.status === 503 ? 5 + (attempt * 3) : attempt * 2;
                if (subtitle) subtitle.textContent = `${response.status === 503 ? 'Sunucu yoğun' : 'Çok fazla istek'}, ${waitSec}sn bekleniyor... (${attempt}/${MAX_RETRIES})`;
                await this.delay(waitSec * 1000);
                if (attempt < MAX_RETRIES) continue;
                
                // Son deneme de başarısız
                if (response.status === 503) {
                    throw new Error('Google Gemini servisi şu anda çok yoğun. Lütfen birkaç dakika sonra tekrar deneyin.');
                }
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errMsg = errorData.error?.message || `HTTP ${response.status}`;
                const lower = errMsg.toLowerCase();

                if (lower.includes('no longer available') || lower.includes('not found') || lower.includes('does not exist')) {
                    throw new Error(`"${model}" modeli artık kullanılamıyor. Ayarlar'dan başka bir model seçin.`);
                }
                if (lower.includes('api_key') || lower.includes('invalid key') || response.status === 400 || response.status === 401 || response.status === 403) {
                    throw new Error('API anahtarı geçersiz veya yetkisiz. Ayarlar\'dan anahtarı kontrol edin.');
                }
                throw new Error(errMsg);
            }

            // Success
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                // Could be safety filter or empty response
                const finishReason = data.candidates?.[0]?.finishReason;
                if (finishReason === 'SAFETY') {
                    throw new Error('İçerik güvenlik filtresi tarafından engellendi.');
                }
                throw new Error('API boş yanıt döndürdü. Lütfen tekrar deneyin.');
            }

            // Extract JSON — handle markdown code blocks too
            let jsonStr = text;
            const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlock) jsonStr = codeBlock[1];
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('API yanıtında JSON bulunamadı. Model yanıtı: ' + text.substring(0, 200));

            try {
                return JSON.parse(jsonMatch[0]);
            } catch (parseErr) {
                throw new Error('API yanıtı JSON olarak işlenemedi: ' + parseErr.message);
            }
        }

        throw new Error('Maksimum deneme sayısına ulaşıldı. Lütfen tekrar deneyin.');
    }




    displayResults(analysis) {
        // Score circle
        const scoreCircle = this.getEl('scoreCircle');
        if (scoreCircle) {
            const circumference = 2 * Math.PI * 52;
            const offset = circumference - (analysis.score / 100) * circumference;
            scoreCircle.style.strokeDashoffset = offset;

            // Score color
            if (analysis.score >= 70) {
                scoreCircle.style.stroke = 'var(--color-correct)';
            } else if (analysis.score >= 50) {
                scoreCircle.style.stroke = 'var(--color-blank)';
            } else {
                scoreCircle.style.stroke = 'var(--color-wrong)';
            }
        }

        const scoreText = this.getEl('scoreText');
        if (scoreText) scoreText.textContent = analysis.score;
        const resTitle = this.getEl('resultsTitle');
        if (resTitle) resTitle.textContent = analysis.title || 'Analiz Tamamlandı';
        const cCount = this.getEl('correctCount');
        if (cCount) cCount.textContent = analysis.correctCount;
        const wCount = this.getEl('wrongCount');
        if (wCount) wCount.textContent = analysis.wrongCount;
        const bCount = this.getEl('blankCount');
        if (bCount) bCount.textContent = analysis.blankCount;

        // Questions list
        const list = this.getEl('questionsList');
        if (!list) return;
        this.currentQuestions = analysis.questions || [];

        list.innerHTML = this.currentQuestions.map((q, idx) => {
            let statusClass, statusIcon;
            if (q.isCorrect) {
                statusClass = 'correct';
                statusIcon = 'check_circle';
            } else if (q.isBlank) {
                statusClass = 'blank';
                statusIcon = 'help_outline';
            } else {
                statusClass = 'wrong';
                statusIcon = 'cancel';
            }

            const difficultyLabels = { 'kolay': '🟢 Kolay', 'orta': '🟡 Orta', 'zor': '🔴 Zor' };

            return `
                <div class="question-card" data-question-index="${idx}">
                    <div class="question-status-icon ${statusClass}">
                        <span class="material-icons-outlined">${statusIcon}</span>
                    </div>
                    <div class="question-card-body">
                        <h4>Soru ${q.number} ${q.topic ? `— ${q.topic}` : ''}</h4>
                        <p>${this.escapeHtml(q.questionText || '')}</p>
                        <div class="question-meta">
                            <span><span class="material-icons-outlined">person</span> ${q.isBlank ? 'Boş' : this.escapeHtml(q.studentAnswer || '-')}</span>
                            <span><span class="material-icons-outlined">check</span> ${this.escapeHtml(q.correctAnswer || '-')}</span>
                            <span>${difficultyLabels[q.difficulty] || ''}</span>
                        </div>
                    </div>
                    <div class="question-card-actions">
                        <button class="btn btn-ghost btn-sm draw-btn" data-draw-index="${idx}" title="Üzerine Çiz">
                            <span class="material-icons-outlined">edit</span>
                        </button>
                    </div>
                </div>`;
        }).join('');

        // Event delegation for question cards
        list.onclick = (e) => {
            const drawBtn = e.target.closest('[data-draw-index]');
            if (drawBtn) {
                e.stopPropagation();
                const idx = parseInt(drawBtn.dataset.drawIndex);
                this.openDrawingForQuestion(analysis.id, idx);
                return;
            }
            const card = e.target.closest('[data-question-index]');
            if (card) {
                const idx = parseInt(card.dataset.questionIndex);
                if (this.currentQuestions[idx]) {
                    this.showQuestionDetail(this.currentQuestions[idx]);
                }
            }
        };
    }

    showQuestionDetail(question) {
        const modal = document.getElementById('questionDetailModal');
        document.getElementById('questionDetailTitle').textContent = `Soru ${question.number} Detayı`;

        let statusText, statusColor;
        if (question.isCorrect) {
            statusText = '✓ Doğru';
            statusColor = 'var(--color-correct)';
        } else if (question.isBlank) {
            statusText = '○ Boş';
            statusColor = 'var(--color-blank)';
        } else {
            statusText = '✗ Yanlış';
            statusColor = 'var(--color-wrong)';
        }

        document.getElementById('questionDetailBody').innerHTML = `
            <div class="detail-section">
                <h4><span class="material-icons-outlined">quiz</span> Soru</h4>
                <p>${question.questionText || 'Soru metni mevcut değil'}</p>
            </div>
            <div class="detail-section">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                    <span style="font-weight:700;color:${statusColor}">${statusText}</span>
                    ${question.topic ? `<span style="font-size:0.75rem;padding:2px 8px;background:var(--bg-input);border-radius:99px;">📚 ${question.topic}</span>` : ''}
                    ${question.difficulty ? `<span style="font-size:0.75rem;padding:2px 8px;background:var(--bg-input);border-radius:99px;">${question.difficulty}</span>` : ''}
                </div>
                <div class="detail-answers">
                    <div class="answer-box ${question.isCorrect ? 'correct' : 'student'}">
                        <label>Senin Cevabın</label>
                        <strong>${question.isBlank ? 'Boş bırakıldı' : question.studentAnswer || '-'}</strong>
                    </div>
                    <div class="answer-box correct">
                        <label>Doğru Cevap</label>
                        <strong>${question.correctAnswer || '-'}</strong>
                    </div>
                </div>
            </div>
            ${question.explanation ? `
            <div class="detail-section">
                <h4><span class="material-icons-outlined">auto_stories</span> Konu Anlatımı</h4>
                <div class="detail-explanation">${question.explanation}</div>
            </div>` : ''}
            <div class="detail-section">
                <h4><span class="material-icons-outlined">lightbulb</span> Öneriler</h4>
                <div class="recommendation-item">
                    <span class="material-icons-outlined">menu_book</span>
                    <span>"${question.topic || 'Bu konu'}" konusunu tekrar çalışın</span>
                </div>
                <div class="recommendation-item">
                    <span class="material-icons-outlined">quiz</span>
                    <span>Benzer sorulardan pratik yapın</span>
                </div>
                <div class="recommendation-item">
                    <span class="material-icons-outlined">replay</span>
                    <span>Bu soruyu tekrar havuzuna ekleyip düzenli tekrar edin</span>
                </div>
            </div>`;

        modal.classList.remove('hidden');

        // Use AbortController to avoid listener leaks
        if (this._detailAbort) this._detailAbort.abort();
        this._detailAbort = new AbortController();
        const signal = this._detailAbort.signal;

        const closeDetail = () => {
            modal.classList.add('hidden');
            this._detailAbort.abort();
        };

        document.getElementById('closeQuestionDetail').addEventListener('click', closeDetail, { signal });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeDetail();
        }, { signal });
    }

    openDrawingForQuestion(analysisId, questionIndex) {
        const analysis = app.analyses.find(a => a.id === analysisId) || this.currentAnalysis;
        if (analysis && analysis.imageData && window.canvasTools) {
            window.canvasTools.openDrawingMode(analysis.imageData);
        } else if (this.uploadedFiles.length > 0 && window.canvasTools) {
            window.canvasTools.openDrawingMode(this.uploadedFiles[0].data);
        } else {
            app.showToast('Çizim yapılacak görüntü bulunamadı', 'warning');
        }
    }

    updateStep(steps, activeIndex) {
        steps.forEach((id, i) => {
            const el = this.getEl(id);
            if (!el) return;
            el.classList.remove('active', 'done');
            if (i < activeIndex) el.classList.add('done');
            if (i === activeIndex) el.classList.add('active');
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // HTML escape utility to prevent XSS
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Initialize
const analyzer = new Analyzer();
window.analyzer = analyzer;
