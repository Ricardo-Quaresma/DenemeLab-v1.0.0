/* ===================================================
   DenemeLab — Manual Question Analyzer & Cropping Tool
   Interactive question crop, button-chip labeling,
   drawing mode integration, custom topics/errors
   =================================================== */

class ManualAnalyzer {
    constructor() {
        this.uploadedFiles = [];
        this.pages = []; // { name, data, width, height }
        this.currentPageIndex = 0;
        this.questions = []; // extracted questions
        this.activeQuestionIndex = 0;
        this.currentStage = 'upload'; // 'upload', 'crop', 'label', 'results'
        this.currentAnalysis = null;
        this.editingAnalysisId = null; // ID of analysis being edited (null when new)

        // Auto-save support
        this.autoSaveTimer = null;
        this.lastAutoSave = null;

        // Zoom & Canvas state for crop workspace
        this.zoomLevel = 1.0;
        this.isSelecting = false;
        this.selectionStart = { x: 0, y: 0 };
        this.currentSelection = null; // { x, y, width, height } in original image coordinates

        // Custom topics and errors stored in localStorage
        this.customTopics = this.loadCustomTopics();
        this.customErrors = this.loadCustomErrors();

        // Standard topic database classified strictly by Exam (TYT vs AYT vs YDT)
        this.examTopics = {
            'TYT': {
                'Matematik': [
                    'Temel Kavramlar', 'Sayı Basamakları', 'Bölme-Bölünebilme', 'OBEB-OKEK',
                    'Rasyonel Sayılar', 'Basit Eşitsizlikler', 'Mutlak Değer', 'Üslü Sayılar',
                    'Köklü Sayılar', 'Çarpanlara Ayırma', 'Oran-Orantı', 'Sayı-Kesir Problemleri',
                    'Yaş Problemleri', 'İşçi Problemleri', 'Hız Problemleri', 'Yüzde-Kâr-Zarar Problemleri',
                    'Karışım Problemleri', 'Grafik Problemleri', 'Kümeler', 'Mantık',
                    'Fonksiyonlar', 'Sayma ve Olasılık', 'İstatistik'
                ],
                'Geometri': [
                    'Doğruda Açılar', 'Üçgende Açılar', 'Özel Üçgenler (Dik-İkizkenar-Eşkenar)',
                    'Üçgende Açıortay-Kenarortay', 'Üçgende Eşlik ve Benzerlik', 'Üçgende Alan',
                    'Çokgenler ve Dörtgenler', 'Yamuk', 'Paralelkenar', 'Eşkenar Dörtgen',
                    'Dikdörtgen ve Kare', 'Deltoid'
                ],
                'Fizik': [
                    'Fizik Bilimine Giriş', 'Madde ve Özellikleri', 'Sıvıların Kaldırma Kuvveti',
                    'Basınç', 'Isı ve Sıcaklık', 'Hareket ve Kuvvet', 'Newton\'ın Hareket Yasaları',
                    'İş-Güç-Enerji', 'Elektrostatik', 'Elektrik Akımı ve Devreler', 'Manyetizma',
                    'Optik (Aydınlanma-Gölge)', 'Aynalar', 'Kırılma ve Mercekler', 'Renk', 'Dalgalar'
                ],
                'Kimya': [
                    'Kimya Bilimi', 'Atom ve Periyodik Sistem', 'Kimyasal Türler Arası Etkileşimler',
                    'Maddenin Halleri', 'Doğa ve Kimya', 'Kimyanın Temel Kanunları', 'Mol Kavramı',
                    'Kimyasal Hesaplamalar', 'Karışımlar', 'Asitler-Bazlar ve Tuzlar', 'Kimya Her Yerde'
                ],
                'Biyoloji': [
                    'Canlıların Ortak Özellikleri', 'Canlıların Temel Bileşenleri', 'Hücre ve Organelleri',
                    'Hücre Zarından Madde Geçişleri', 'Canlıların Çeşitliliği ve Sınıflandırılması',
                    'Hücre Bölünmeleri (Mitoz-Mayoz)', 'Kalıtım ve Genetik', 'Ekosistem Ekolojisi', 'Çevre Sorunları'
                ],
                'Türkçe': [
                    'Sözcükte Anlam', 'Cümlede Anlam', 'Paragrafta Anlam ve Yapı', 'Paragrafta Ana Düşünce',
                    'Ses Bilgisi', 'Yazım Kuralları', 'Noktalama İşaretleri', 'Sözcük Türleri (İsim-Sıfat-Zamir)',
                    'Zarf-Edat-Bağlaç-Ünlem', 'Fiiller ve Fiilimsiler', 'Ekler ve Sözcükte Yapı',
                    'Cümlenin Ögeleri', 'Fiil Çatısı', 'Cümle Türleri', 'Anlatım Bozuklukları'
                ],
                'Tarih': [
                    'Tarih Bilimine Giriş', 'İlk Çağ Medeniyetleri', 'Türk Dünyası', 'İslam Tarihi',
                    'İlk Türk-İslam Devletleri', 'Osmanlı Kuruluş ve Yükselme', 'Osmanlı Kültür ve Medeniyeti',
                    '20. Yüzyıl Başlarında Osmanlı', 'Kurtuluş Savaşı', 'Atatürkçülük ve İnkılaplar'
                ],
                'Coğrafya': [
                    'Doğa ve İnsan', 'Coğrafi Konum', 'Harita Bilgisi', 'Dünyanın Şekli ve Hareketleri',
                    'İklim Bilgisi', 'Türkiye\'nin İklimi', 'İç ve Dış Kuvvetler', 'Nüfus ve Yerleşme',
                    'Doğal Afetler', 'Bölge Kavramı'
                ],
                'Felsefe': [
                    'Felsefenin Alanı', 'Bilgi Felsefesi', 'Varlık Felsefesi', 'Ahlak Felsefesi',
                    'Sanat Felsefesi', 'Din Felsefesi', 'Siyaset Felsefesi', 'Bilim Felsefesi'
                ],
                'Din Kültürü': [
                    'İnanç', 'İbadet', 'Ahlak ve Değerler', 'Din ve Hayat', 'Vahiy ve Akıl', 'Kur\'an\'da Kavramlar'
                ],
                'Diğer': ['Genel Soru', 'Deneme Sorusu', 'Yorum Sorusu', 'Mantık ve Muhakeme']
            },
            'AYT': {
                'Matematik': [
                    'Polinomlar', 'İkinci Dereceden Denklemler', 'Karmaşık Sayılar', 'Parabol',
                    'İkinci Dereceden Eşitsizlikler', 'Fonksiyonlarda Uygulamalar', 'Trigonometri',
                    'Logaritma', 'Diziler', 'Limit ve Süreklilik', 'Türev ve Uygulamaları',
                    'İntegral ve Uygulamaları', 'Permütasyon-Kombinasyon-Binom-Olasılık'
                ],
                'Geometri': [
                    'Çemberde Açılar', 'Çemberde Uzunluk', 'Dairede Çevre ve Alan',
                    'Katı Cisimler (Prizma-Piramit-Koni-Küre)', 'Noktanın ve Doğrunun Analitiği',
                    'Çemberin Analitiği', 'Dönüşümlerle Geometri'
                ],
                'Fizik': [
                    'Vektörler', 'Bağıl Hareket', 'Newton\'ın Hareket Yasaları (İleri)',
                    'Bir Boyutta Sabit İvmeli Hareket', 'İki Boyutta Hareket (Atışlar)', 'İş-Güç-Enerji',
                    'İtme ve Çizgisel Momentum', 'Tork ve Denge', 'Kütle ve Ağırlık Merkezi', 'Basit Makineler',
                    'Elektriksel Kuvvet ve Potansiyel', 'Düzgün Elektrik Alan ve Sığaçlar',
                    'Manyetizma ve İndüksiyon', 'Alternatif Akım ve Transformatörler',
                    'Çembersel Hareket', 'Basit Harmonik Hareket', 'Dalga Mekaniği',
                    'Atom Fiziğine Giriş ve Radyoaktivite', 'Modern Fizik ve Teknolojideki Uygulamaları'
                ],
                'Kimya': [
                    'Modern Atom Teorisi', 'Gazlar', 'Sıvı Çözeltiler ve Koligatif Özellikler',
                    'Kimyasal Tepkimelerde Enerji', 'Kimyasal Tepkimelerde Hız', 'Kimyasal Denge',
                    'Asit-Baz Dengesi (Sulu Çözeltiler)', 'Çözünürlük Dengesi (KÇÇ)',
                    'Kimya ve Elektrik (Elektrokimya)', 'Karbon Kimyasına Giriş',
                    'Organik Kimya (Hidrokarbonlar-Fonksiyonel Gruplar)'
                ],
                'Biyoloji': [
                    'Sinir ve Endokrin Sistem', 'Duyu Organları', 'Destek ve Hareket Sistemi',
                    'Sindirim Sistemi', 'Dolaşım ve Bağışıklık Sistemi', 'Solunum Sistemi',
                    'Boşaltım Sistemi', 'Üreme Sistemi ve Embriyonik Gelişim', 'Komünite ve Popülasyon Ekolojisi',
                    'Nükleik Asitler (DNA-RNA)', 'Protein Sentezi', 'Biyoteknoloji',
                    'Fotosentez ve Kemosentez', 'Hücresel Solunum', 'Bitki Biyolojisi', 'Canlılar ve Çevre'
                ],
                'Edebiyat': [
                    'Şiir Bilgisi', 'Edebi Sanatlar', 'İslamiyet Öncesi Türk Edebiyatı',
                    'Geçiş Dönemi Eserleri', 'Halk Edebiyatı', 'Divan Edebiyatı', 'Tanzimat Edebiyatı',
                    'Servet-i Fünun ve Fecr-i Ati', 'Milli Edebiyat', 'Cumhuriyet Dönemi Şiir',
                    'Cumhuriyet Dönemi Roman ve Hikaye', 'Tiyatro ve Öğretici Metinler', 'Edebi Akımlar'
                ],
                'Tarih': [
                    'İlk Çağ Uygarlıkları', 'Türk Dünyası', 'İslam Medeniyeti', 'Osmanlı Siyaseti',
                    '19. ve 20. Yüzyıl Osmanlı Devleti', '1. Dünya Savaşı', 'Kurtuluş Savaşı',
                    'Atatürkçülük ve Dış Politika', '2. Dünya Savaşı ve Soğuk Savaş', 'Küreselleşen Dünya'
                ],
                'Coğrafya': [
                    'Biyoçeşitlilik ve Ekosistemler', 'Nüfus Politikaları', 'Şehirler ve Etki Alanları',
                    'Türkiye\'de Tarım ve Hayvancılık', 'Türkiye\'de Madenler ve Enerji Kaynakları',
                    'Türkiye\'de Sanayi ve Ticaret', 'Jeopolitik Konum', 'Çevre Sorunları ve Küresel Örgütler'
                ],
                'Felsefe': [
                    'Klasik ve Sembolik Mantık', 'Psikolojiye Giriş ve Süreçler', 'Sosyoloji ve Toplumsal Yapı'
                ],
                'Din Kültürü': [
                    'İnanç', 'İbadet', 'Ahlak ve Değerler', 'Tasavvuf ve Yorumlar', 'Güncel Dini Konular'
                ],
                'Diğer': ['Genel Soru', 'Deneme Sorusu', 'Yorum Sorusu']
            },
            'YDT': {
                'İngilizce': [
                    'Vocabulary', 'Grammar', 'Reading Comprehension', 'Sentence Completion',
                    'Cloze Test', 'Translation', 'Dialogue', 'Restatement', 'Paragraph Completion', 'Irrelevant Sentence'
                ],
                'Diğer': ['Genel YDT Sorusu', 'Deneme Sorusu']
            }
        };

        // Standard error reasons
        this.defaultErrors = [
            'Dikkatsizlik',
            'Formül / Bilgi Hatası',
            'Konu Eksikliği',
            'İşlem / Hesap Hatası',
            'Soru Kökünü Yanlış Okuma',
            'Süre Baskısı / Yetişmedi',
            'Şık / Çeldiriciye Düşme',
            'Kavram Yanılgısı',
            'Çözüm Yolunu Bulamama',
            'İşaretleme Hatası'
        ];

        // Standard exams - load from localStorage if customized
        const savedExamTypes = JSON.parse(localStorage.getItem('testai_custom_examTypes') || 'null');
        this.examTypes = savedExamTypes || ['TYT', 'AYT', 'YDT', 'LGS', 'KPSS', 'ALES', 'DGS', 'MSÜ', 'Genel'];

        // Standard subjects - load from localStorage if customized
        const savedSubjects = JSON.parse(localStorage.getItem('testai_custom_subjects') || 'null');
        this.subjects = savedSubjects || [
            'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji',
            'Türkçe', 'Edebiyat', 'Tarih', 'Coğrafya', 'Felsefe',
            'Din Kültürü', 'İngilizce', 'Diğer'
        ];

        // Deleted default topics
        const savedDeletedTopics = JSON.parse(localStorage.getItem('testai_deleted_default_topics') || '{}');
        this.deletedDefaultTopics = savedDeletedTopics || {};

        // Active selected exam area (TYT, AYT, ALES, KPSS, LGS, YDT, DGS, MSÜ, Genel...)
        this.selectedExam = 'TYT';

        this.init();
    }

    getFullExamType() {
        if ((this.selectedExam || '').toUpperCase() === 'AYT') {
            return `AYT-${this.aytSubfield || 'SAYISAL'}`;
        }
        return this.selectedExam || 'TYT';
    }

    getStandardSubjectsForExam(exam) {
        const e = (exam || (this.getFullExamType ? this.getFullExamType() : this.selectedExam) || 'TYT').toUpperCase().trim();

        if (e === 'AYT-SAYISAL') {
            return ['Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji'];
        }
        if (e === 'AYT-EA') {
            return ['Edebiyat', 'Tarih', 'Coğrafya', 'Matematik', 'Geometri'];
        }
        if (e === 'AYT-SÖZEL') {
            return ['Edebiyat', 'Tarih-1', 'Coğrafya-1', 'Tarih-2', 'Coğrafya-2', 'Felsefe', 'Din Kültürü'];
        }
        if (e.startsWith('AYT')) {
            const sub = this.aytSubfield || 'SAYISAL';
            if (sub === 'SAYISAL') return ['Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji'];
            if (sub === 'EA') return ['Edebiyat', 'Tarih', 'Coğrafya', 'Matematik', 'Geometri'];
            if (sub === 'SÖZEL') return ['Edebiyat', 'Tarih-1', 'Coğrafya-1', 'Tarih-2', 'Coğrafya-2', 'Felsefe', 'Din Kültürü'];
            return ['Edebiyat', 'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü'];
        }
        if (e === 'TYT' || e === 'MSÜ') {
            return ['Türkçe', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji'];
        }
        if (e === 'LGS') {
            return ['Türkçe', 'Matematik', 'Fen Bilimleri', 'İnkılap Tarihi', 'Din Kültürü', 'İngilizce'];
        }
        if (e === 'KPSS') {
            return ['Türkçe', 'Matematik', 'Tarih', 'Coğrafya', 'Vatandaşlık'];
        }
        if (e === 'ALES' || e === 'DGS') {
            return ['Türkçe', 'Matematik'];
        }
        if (e === 'YDT') {
            return ['İngilizce'];
        }

        return ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya'];
    }

    setExamType(exam) {
        if (!exam) return;
        let cleanExam = exam.trim().toUpperCase();

        let detectedSubfield = null;
        if (cleanExam.startsWith('AYT-')) {
            const parts = cleanExam.split('-');
            cleanExam = 'AYT';
            detectedSubfield = parts[1];
        } else if (cleanExam.includes('SAYISAL') || cleanExam.includes('SAY')) {
            cleanExam = 'AYT';
            detectedSubfield = 'SAYISAL';
        } else if (cleanExam.includes('EŞİT') || cleanExam.includes('ESIT') || cleanExam.includes('EA')) {
            cleanExam = 'AYT';
            detectedSubfield = 'EA';
        } else if (cleanExam.includes('SÖZEL') || cleanExam.includes('SOZEL') || cleanExam.includes('SÖZ')) {
            cleanExam = 'AYT';
            detectedSubfield = 'SÖZEL';
        }

        this.selectedExam = cleanExam;
        if (detectedSubfield) {
            this.aytSubfield = detectedSubfield;
        } else if (this.selectedExam === 'AYT' && !this.aytSubfield) {
            this.aytSubfield = 'SAYISAL';
        }

        const isAYT = this.selectedExam === 'AYT';

        // AYT seçildiğinde alt alan seçimini göster
        const aytSubfieldSection = document.getElementById('aytSubfieldSection');
        if (aytSubfieldSection) {
            aytSubfieldSection.style.display = isAYT ? 'block' : 'none';
        }

        // Kırpma/Etiketleme ekranındaki hızlı hap butonları
        const aytQuickPills = document.getElementById('aytQuickPillsBar');
        if (aytQuickPills) {
            aytQuickPills.style.display = isAYT ? 'inline-flex' : 'none';
        }

        // Aktif alt alan butonlarını/kartlarını güncelle
        if (isAYT) {
            const currentSub = this.aytSubfield || 'SAYISAL';
            document.querySelectorAll('.ayt-subfield-card, .ayt-subfield-btn, .ayt-quick-pill').forEach(el => {
                el.classList.toggle('active', el.dataset.subfield === currentSub);
            });
        }

        // Sınav kartları gridini güncelle
        document.querySelectorAll('.exam-cards-grid .exam-card').forEach(card => {
            const cardExam = (card.dataset.exam || '').toUpperCase();
            card.classList.toggle('active', cardExam === this.selectedExam);
        });

        // Banner üzerindeki alan yazısını güncelle
        const bannerText = document.getElementById('currentExamDisplayText');
        if (bannerText) {
            if (isAYT && this.aytSubfield) {
                const subfieldNames = { 'SAYISAL': 'Sayısal', 'EA': 'Eşit Ağırlık', 'SÖZEL': 'Sözel' };
                bannerText.textContent = `AYT - ${subfieldNames[this.aytSubfield] || this.aytSubfield}`;
            } else {
                bannerText.textContent = this.selectedExam;
            }
        }

        // Başlık placeholder güncelle
        const titleInput = document.getElementById('manualTestTitleInput');
        if (titleInput && (!titleInput.value || titleInput.value.includes('Deneme'))) {
            if (isAYT) {
                const subfieldNames = { 'SAYISAL': 'Sayısal', 'EA': 'Eşit Ağırlık', 'SÖZEL': 'Sözel' };
                titleInput.placeholder = `Örn: AYT ${subfieldNames[this.aytSubfield] || ''} Deneme 1`;
            } else {
                titleInput.placeholder = `Örn: ${this.selectedExam} Deneme 1`;
            }
        }

        // Mevcut soruların sınav alanını güncelle
        const fullExam = this.getFullExamType();
        this.questions.forEach(q => {
            q.exam = fullExam;
        });

        // Etiketleme aşamasındaysa ders ve konu chip'lerini güncelle
        const curQ = this.questions[this.activeQuestionIndex];
        if (curQ && this.currentStage === 'label') {
            this.renderSubjectChips(curQ);
            this.renderTopicChips(curQ);
        }
    }

    setAYTSubfield(subfield) {
        if (!subfield) return;
        this.selectedExam = 'AYT';
        this.aytSubfield = subfield.toUpperCase();

        // Kartlar ve butonların active durumunu anında güncelle
        document.querySelectorAll('.ayt-subfield-card, .ayt-subfield-btn, .ayt-quick-pill').forEach(el => {
            el.classList.toggle('active', el.dataset.subfield === this.aytSubfield);
        });

        // Sınav kartında AYT'yi aktif yap
        document.querySelectorAll('.exam-cards-grid .exam-card').forEach(card => {
            const cardExam = (card.dataset.exam || '').toUpperCase();
            card.classList.toggle('active', cardExam === 'AYT');
        });

        // Alt alan bölümünü görünür yap
        const aytSubfieldSection = document.getElementById('aytSubfieldSection');
        if (aytSubfieldSection) aytSubfieldSection.style.display = 'block';

        const aytQuickPills = document.getElementById('aytQuickPillsBar');
        if (aytQuickPills) aytQuickPills.style.display = 'inline-flex';

        // Banner güncelle
        const subfieldNames = { 'SAYISAL': 'Sayısal', 'EA': 'Eşit Ağırlık', 'SÖZEL': 'Sözel' };
        const subLabel = subfieldNames[this.aytSubfield] || this.aytSubfield;

        const bannerText = document.getElementById('currentExamDisplayText');
        if (bannerText) {
            bannerText.textContent = `AYT - ${subLabel}`;
        }

        // Başlık placeholder'ı güncelle
        const titleInput = document.getElementById('manualTestTitleInput');
        if (titleInput && (!titleInput.value || titleInput.value.includes('Deneme'))) {
            titleInput.placeholder = `Örn: AYT ${subLabel} Deneme 1`;
        }

        // Tüm soruların alanını güncelle
        const fullExam = this.getFullExamType();
        this.questions.forEach(q => {
            q.exam = fullExam;
        });

        // Etiketleme aşamasındaysa dersleri ve konuları yenile
        const curQ = this.questions[this.activeQuestionIndex];
        if (curQ && this.currentStage === 'label') {
            this.renderSubjectChips(curQ);
            this.renderTopicChips(curQ);
        }

        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast(`AYT Alanı: ${subLabel} seçildi`, 'info');
        }
    }

    initExamSelectionUI() {
        this.selectedExam = this.selectedExam || 'TYT';

        document.querySelectorAll('.exam-cards-grid .exam-card').forEach(card => {
            card.onclick = () => {
                const exam = card.dataset.exam;
                if (exam) {
                    this.setExamType(exam);
                    const customInput = document.getElementById('manualCustomExamInput');
                    if (customInput) customInput.value = '';
                }
            };
        });

        const customInput = document.getElementById('manualCustomExamInput');
        if (customInput) {
            customInput.oninput = (e) => {
                const val = (e.target.value || '').trim();
                if (val) {
                    this.setExamType(val);
                }
            };
        }

        this.setExamType(this.selectedExam);
    }

    promptChangeExam() {
        const standardList = ['TYT', 'AYT - Sayısal', 'AYT - Eşit Ağırlık', 'AYT - Sözel', 'ALES', 'KPSS', 'LGS', 'YDT', 'DGS', 'MSÜ', 'Genel'];
        const currentDesc = this.selectedExam === 'AYT' ? `AYT - ${this.aytSubfield || 'SAYISAL'}` : (this.selectedExam || 'TYT');
        const input = prompt(`Sınav alanını seçin veya yazın (${standardList.join(', ')}):`, currentDesc);
        if (input && input.trim()) {
            this.setExamType(input.trim());
            if (window.app) window.app.showToast(`Alan "${this.getFullExamType()}" olarak güncellendi`, 'success');
        }
    }

    init() {
        this.bindEvents();
        this.loadAutoSave();
    }

    // ---- Auto-save functionality ----
    triggerAutoSave() {
        // Clear existing timer
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        // Auto-save after 3 seconds of inactivity
        this.autoSaveTimer = setTimeout(() => {
            this.performAutoSave();
        }, 3000);
    }

    performAutoSave() {
        // Auto-save disabled for large images (IndexedDB stores final analysis)
        // sessionStorage cannot handle large data, causes quota errors
        return;
    }

    loadAutoSave() {
        try {
            const saved = sessionStorage.getItem('testai_autosave');
            if (!saved) return;

            const data = JSON.parse(saved);

            // Only restore if less than 1 hour old
            const age = Date.now() - data.timestamp;
            if (age > 3600000) {
                sessionStorage.removeItem('testai_autosave');
                return;
            }

            // Ask user if they want to restore
            if (data.questions && data.questions.length > 0) {
                const ageMin = Math.floor(age / 60000);
                // showConfirmModal only takes 3 args (title, message, onConfirm)
                // Cancellation is handled by the modal's own cancel button which closes without callback
                app.showConfirmModal(
                    'Kaydedilmemiş Çalışma Bulundu',
                    `${ageMin} dakika önce ${data.questions.length} soruluk bir analiz başlatmıştınız. Kaldığınız yerden devam etmek ister misiniz?`,
                    () => {
                        this.restoreAutoSave(data);
                    }
                );
                // Always remove the autosave regardless of user choice (it's old data)
                sessionStorage.removeItem('testai_autosave');
            }
        } catch (error) {
            console.warn('Auto-save restore failed:', error);
            sessionStorage.removeItem('testai_autosave');
        }
    }

    restoreAutoSave(data) {
        try {
            this.questions = data.questions || [];
            this.pages = (data.pages || []).map((p, idx) => {
                const img = new Image();
                img.src = p.data;
                return {
                    name: p.name,
                    data: p.data,
                    width: 800, // Will be recalculated
                    height: 1200,
                    imgElement: img
                };
            });
            this.currentPageIndex = data.currentPageIndex || 0;
            this.activeQuestionIndex = data.activeQuestionIndex || 0;

            const titleInput = document.getElementById('manualTestTitleInput');
            if (titleInput && data.testTitle) {
                titleInput.value = data.testTitle;
            }

            app.navigateTo('analysis');

            if (data.stage === 'crop' && this.pages.length > 0) {
                this.setStage('crop');
            } else if (data.stage === 'label' && this.questions.length > 0) {
                this.setStage('label');
            }

            app.showToast('Önceki çalışmanız geri yüklendi', 'success');
            sessionStorage.removeItem('testai_autosave');
        } catch (error) {
            console.error('Restore error:', error);
            app.showToast('Geri yükleme hatası', 'error');
        }
    }

    clearAutoSave() {
        sessionStorage.removeItem('testai_autosave');
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    // ---- Storage for Custom Topics & Errors ----
    loadCustomTopics() {
        try {
            return JSON.parse(localStorage.getItem('testai_custom_topics') || '{}');
        } catch {
            return {};
        }
    }

    saveCustomTopics() {
        localStorage.setItem('testai_custom_topics', JSON.stringify(this.customTopics));
    }

    loadCustomErrors() {
        try {
            return JSON.parse(localStorage.getItem('testai_custom_errors') || '[]');
        } catch {
            return [];
        }
    }

    saveCustomErrors() {
        localStorage.setItem('testai_custom_errors', JSON.stringify(this.customErrors));
    }

    addCustomTopic(subject, topic, exam = null) {
        const clean = (topic || '').trim();
        if (!clean) return false;
        const key = exam ? `${exam}_${subject}` : subject;
        if (!this.customTopics[key]) {
            this.customTopics[key] = [];
        }
        if (!this.customTopics[key].includes(clean)) {
            this.customTopics[key].push(clean);
            this.saveCustomTopics();
            return true;
        }
        return false;
    }

    deleteCustomTopic(subject, topic, exam = null) {
        if (exam) {
            const key = `${exam}_${subject}`;
            if (this.customTopics[key]) {
                this.customTopics[key] = this.customTopics[key].filter(t => t !== topic);
            }
        }
        if (this.customTopics[subject]) {
            this.customTopics[subject] = this.customTopics[subject].filter(t => t !== topic);
        }
        this.saveCustomTopics();
    }

    deleteTopic(subject, topic, exam = 'TYT') {
        const e = (exam || 'TYT').toUpperCase();
        const customKey = `${e}_${subject}`;
        let foundInCustom = false;
        if (this.customTopics[customKey]?.includes(topic)) {
            this.customTopics[customKey] = this.customTopics[customKey].filter(t => t !== topic);
            foundInCustom = true;
        }
        if (this.customTopics[subject]?.includes(topic)) {
            this.customTopics[subject] = this.customTopics[subject].filter(t => t !== topic);
            foundInCustom = true;
        }
        if (foundInCustom) {
            this.saveCustomTopics();
        } else {
            // Built-in / default topic
            if (!this.deletedDefaultTopics) this.deletedDefaultTopics = {};
            if (!this.deletedDefaultTopics[customKey]) this.deletedDefaultTopics[customKey] = [];
            if (!this.deletedDefaultTopics[customKey].includes(topic)) {
                this.deletedDefaultTopics[customKey].push(topic);
                localStorage.setItem('testai_deleted_default_topics', JSON.stringify(this.deletedDefaultTopics));
            }
        }
    }

    resetExamTypes() {
        this.examTypes = ['TYT', 'AYT', 'YDT', 'LGS', 'KPSS', 'ALES', 'DGS', 'MSÜ', 'Genel'];
        localStorage.removeItem('testai_custom_examTypes');
    }

    resetSubjects() {
        this.subjects = [
            'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji',
            'Türkçe', 'Edebiyat', 'Tarih', 'Coğrafya', 'Felsefe',
            'Din Kültürü', 'İngilizce', 'Diğer'
        ];
        localStorage.removeItem('testai_custom_subjects');
    }

    resetTopics(subject, exam = 'TYT') {
        const e = (exam || 'TYT').toUpperCase();
        const key = `${e}_${subject}`;
        if (this.deletedDefaultTopics && this.deletedDefaultTopics[key]) {
            delete this.deletedDefaultTopics[key];
            localStorage.setItem('testai_deleted_default_topics', JSON.stringify(this.deletedDefaultTopics));
        }
    }

    closeAnalysis() {
        const detailView = document.getElementById('resultsDetailView');
        const isResultsOpen = (this.currentStage === 'results') || (detailView && detailView.style.display === 'block');

        if (isResultsOpen) {
            this.closeResultsDetail();
            return;
        }

        if (this.questions.length > 0) {
            app.showConfirmModal(
                'Analizi Kapat',
                'Soru analizi ekranından çıkmak istediğinize emin misiniz? Kaydedilmemiş veriler silinecektir.',
                () => {
                    this.resetAll();
                    app.navigateTo('dashboard');
                }
            );
        } else {
            this.resetAll();
            app.navigateTo('dashboard');
        }
    }

    closeResultsDetail() {
        const historyView = document.getElementById('resultsHistoryView');
        const detailView = document.getElementById('resultsDetailView');
        if (detailView) detailView.style.display = 'none';
        if (historyView) historyView.style.display = 'block';

        const resultsStage = document.getElementById('manualStage_results');
        if (resultsStage) resultsStage.classList.add('hidden');

        this.currentAnalysis = null;
        this.editingAnalysisId = null;
        this.currentStage = 'upload';

        if (typeof this.cancelRenameAnalysis === 'function') {
            this.cancelRenameAnalysis();
        }

        if (window.app) {
            window.app.navigateTo('results');
            window.app.renderResultsHistory();
        }
    }

    addCustomError(errorReason) {
        const clean = (errorReason || '').trim();
        if (!clean) return false;
        if (!this.customErrors.includes(clean) && !this.defaultErrors.includes(clean)) {
            this.customErrors.push(clean);
            this.saveCustomErrors();
            return true;
        }
        return false;
    }

    deleteCustomError(errorReason) {
        this.customErrors = this.customErrors.filter(e => e !== errorReason);
        this.saveCustomErrors();
    }

    // ---- Event Bindings ----
    bindEvents() {
        const dropZone = document.getElementById('manualUploadZone');
        const fileInput = document.getElementById('manualFileInput');

        dropZone?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // Drag & Drop
        dropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });

        // Stage transitions
        document.getElementById('manualStartCropBtn')?.addEventListener('click', () => this.startCropping());
        document.getElementById('manualClearFilesBtn')?.addEventListener('click', () => this.resetAll());
        document.getElementById('manualBackToUploadBtn')?.addEventListener('click', () => this.setStage('upload'));
        document.getElementById('manualFinishCropBtn')?.addEventListener('click', () => this.startLabeling());
        document.getElementById('manualBackToCropBtn')?.addEventListener('click', () => {
            const activeQ = this.questions[this.activeQuestionIndex];
            if (activeQ) {
                this.currentPageIndex = activeQ.pageIndex;
            }
            this.setStage('crop');
        });

        // Page navigation in crop workspace
        document.getElementById('cropPrevPageBtn')?.addEventListener('click', () => this.changePage(-1));
        document.getElementById('cropNextPageBtn')?.addEventListener('click', () => this.changePage(1));

        // Zoom controls
        document.getElementById('cropZoomInBtn')?.addEventListener('click', () => this.setZoom(this.zoomLevel + 0.2));
        document.getElementById('cropZoomOutBtn')?.addEventListener('click', () => this.setZoom(this.zoomLevel - 0.2));
        document.getElementById('cropZoomResetBtn')?.addEventListener('click', () => this.setZoom(1.0));

        // Shortcut: Add full page as question
        document.getElementById('cropAddFullPageBtn')?.addEventListener('click', () => this.addFullPageAsQuestion());

        // Save / Next analysis button
        document.getElementById('manualSaveAnalysisBtn')?.addEventListener('click', () => {
            // If on last question, save. Otherwise, go to next question
            const isLastQuestion = this.activeQuestionIndex === this.questions.length - 1;
            if (isLastQuestion) {
                this.saveAnalysis();
            } else {
                this.changeActiveQuestion(1); // Go to next question
            }
        });
        document.getElementById('manualNewAnalysisBtn')?.addEventListener('click', () => {
            this.closeResultsDetail();
            this.resetAll();
            window.app.navigateTo('analysis');
        });
        document.getElementById('manualEditAnalysisBtn')?.addEventListener('click', () => {
            if (this.currentAnalysis) {
                // Show loading toast immediately when button clicked
                const pageCount = this.currentAnalysis.originalPages?.length || 0;
                if (pageCount > 0 && window.app) {
                    window.app.showToast(`${pageCount} sayfa yükleniyor...`, 'info');
                }
                this.editAnalysis(this.currentAnalysis.id);
            }
        });

        // Pool / report navigation from results
        document.getElementById('manualGoReportBtn')?.addEventListener('click', () => app.navigateTo('report'));
        document.getElementById('manualGoReviewBtn')?.addEventListener('click', () => app.navigateTo('review'));

        // Label navigation
        document.getElementById('labelPrevQBtn')?.addEventListener('click', () => this.changeActiveQuestion(-1));
        document.getElementById('labelNextQBtn')?.addEventListener('click', () => this.changeActiveQuestion(1));

        // Shared stem button
        document.getElementById('cropAddSharedStemBtn')?.addEventListener('click', () => this.addSharedStemQuestion());
    }

    // ---- File Processing ----
    async handleFiles(files) {
        if (!files || files.length === 0) return;

        const isPdf = Array.from(files).some(f => f.type === 'application/pdf');
        const toastMsg = isPdf 
            ? '📄 PDF yükleniyor ve sayfalar taranıyor, lütfen bekleyin...' 
            : '🖼️ Görseller yükleniyor ve hazırlanıyor, lütfen bekleyin...';
        const loader = window.app && typeof window.app.showLoadingToast === 'function' ? window.app.showLoadingToast(toastMsg) : null;
        await new Promise(r => setTimeout(r, 40));

        const progressContainer = document.getElementById('manualUploadProgress');
        const progressBar = document.getElementById('manualUploadBar');
        const progressText = document.getElementById('manualUploadText');
        const uploadContent = document.getElementById('manualUploadContent');

        if (progressContainer) progressContainer.classList.remove('hidden');
        if (uploadContent) uploadContent.classList.add('hidden');

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (progressText) progressText.textContent = `${file.name} işleniyor...`;
                if (progressBar) progressBar.style.width = `${((i + 1) / files.length) * 100}%`;

                if (file.type === 'application/pdf') {
                    await this.processPDF(file);
                } else if (file.type.startsWith('image/')) {
                    await this.processImage(file);
                } else {
                    app.showToast(`Desteklenmeyen dosya: ${file.name}`, 'warning');
                }
            }

            if (this.pages.length === 0) {
                app.showToast('Görüntü yüklenemedi', 'error');
                this.resetAll();
                return;
            }

            this.renderUploadedPreview();
            if (loader) loader.success(`✅ ${this.pages.length} sayfa/görsel hazırlandı!`);
            else app.showToast(`${this.pages.length} sayfa/görsel hazırlandı!`, 'success');
        } catch (err) {
            if (loader) loader.error('Dosya işleme hatası: ' + err.message);
            else app.showToast('Dosya işleme hatası: ' + err.message, 'error');
        } finally {
            if (progressContainer) progressContainer.classList.add('hidden');
            if (uploadContent) uploadContent.classList.remove('hidden');
        }
    }

    processImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const maxDim = 2200;
                    let width = img.naturalWidth || img.width;
                    let height = img.naturalHeight || img.height;

                    let needsResize = false;
                    if (width > maxDim || height > maxDim) {
                        const scale = maxDim / Math.max(width, height);
                        width = Math.round(width * scale);
                        height = Math.round(height * scale);
                        needsResize = true;
                    }

                    if (!needsResize && file.size < 1024 * 1024 && !file.type.includes('png')) {
                        this.pages.push({
                            name: file.name,
                            data: e.target.result,
                            width: width,
                            height: height,
                            imgElement: img
                        });
                        resolve();
                        return;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);

                    const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.90);
                    canvas.width = 0;
                    canvas.height = 0;
                    const optImg = new Image();
                    optImg.onload = () => {
                        this.pages.push({
                            name: file.name,
                            data: optimizedDataUrl,
                            width: width,
                            height: height,
                            imgElement: optImg
                        });
                        resolve();
                    };
                    optImg.src = optimizedDataUrl;
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async processPDF(file) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF kütüphanesi yüklenemedi');
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Store filename and auto-fill test title
        const fileName = file.name.replace(/\.pdf$/i, ''); // Remove .pdf extension
        const titleInput = document.getElementById('manualTestTitleInput');
        if (titleInput && !titleInput.value) {
            titleInput.value = fileName;
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        // Get progress UI elements
        const progressText = document.getElementById('manualUploadText');
        const progressBar = document.getElementById('manualUploadBar');

        for (let i = 1; i <= numPages; i++) {
            // Update progress
            const percentage = Math.round((i / numPages) * 100);
            if (progressText) {
                progressText.textContent = `Sayfa ${i}/${numPages} yükleniyor - ${percentage}%`;
            }
            if (progressBar) {
                progressBar.style.width = `${percentage}%`;
            }

            const page = await pdf.getPage(i);
            // High quality 2.0x render scale for sharp question text & formulas
            const viewport = page.getViewport({ scale: 2.0 });

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            await page.render({ canvasContext: ctx, viewport }).promise;

            // Use JPEG 0.90 for crystal clear formulas/text with 90% smaller memory usage than PNG
            const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
            const pageWidth = canvas.width;
            const pageHeight = canvas.height;
            // Immediately release off-screen GPU buffer
            canvas.width = 0;
            canvas.height = 0;

            const img = new Image();
            await new Promise((res) => {
                img.onload = res;
                img.src = dataUrl;
            });

            this.pages.push({
                name: `${file.name} (Sayfa ${i})`,
                data: dataUrl,
                width: pageWidth,
                height: pageHeight,
                imgElement: img
            });
        }

        // Reset progress UI after completion
        if (progressText) {
            progressText.textContent = 'Dosyalar işleniyor...';
        }
        if (progressBar) {
            progressBar.style.width = '0%';
        }
    }

    renderUploadedPreview() {
        const previewArea = document.getElementById('manualPreviewArea');
        const grid = document.getElementById('manualFilesGrid');
        const pageCountEl = document.getElementById('manualTotalPagesCount');
        const uploadZone = document.getElementById('manualUploadZone');

        if (this.pages.length === 0) {
            previewArea?.classList.add('hidden');
            uploadZone?.classList.remove('hidden');
            return;
        }

        uploadZone?.classList.add('hidden');
        previewArea?.classList.remove('hidden');
        if (pageCountEl) pageCountEl.textContent = `${this.pages.length} Sayfa / Görsel`;

        // Initialize exam selection cards for the uploaded document
        this.initExamSelectionUI();

        if (grid) {
            grid.innerHTML = this.pages.map((p, idx) => `
                <div class="manual-preview-card">
                    <img src="${p.data}" alt="${p.name}" loading="lazy" decoding="async">
                    <div class="preview-badge">Sayfa ${idx + 1}</div>
                    <button class="remove-page-btn" onclick="manualAnalyzer.removePage(${idx})" title="Sayfayı Kaldır">
                        <span class="material-icons-outlined">close</span>
                    </button>
                </div>
            `).join('');
        }
    }

    removePage(index) {
        this.pages.splice(index, 1);
        if (this.pages.length === 0) {
            this.resetAll();
        } else {
            this.renderUploadedPreview();
        }
    }

    resetAll() {
        this.uploadedFiles = [];
        this.pages = [];
        this.questions = [];
        this.currentPageIndex = 0;
        this.activeQuestionIndex = 0;
        this.currentSelection = null;
        this.currentAnalysis = null;
        this.editingAnalysisId = null;
        this.selectedExam = 'TYT';

        // Clear auto-save when resetting
        this.clearAutoSave();

        // Reset file input & uploads UI
        const fileInput = document.getElementById('manualFileInput');
        if (fileInput) fileInput.value = '';

        const customExamInput = document.getElementById('manualCustomExamInput');
        if (customExamInput) customExamInput.value = '';

        const previewArea = document.getElementById('manualPreviewArea');
        const uploadZone = document.getElementById('manualUploadZone');
        const uploadContent = document.getElementById('manualUploadContent');
        const uploadProgress = document.getElementById('manualUploadProgress');
        const filesGrid = document.getElementById('manualFilesGrid');
        const titleInput = document.getElementById('manualTestTitleInput');

        previewArea?.classList.add('hidden');
        if (filesGrid) filesGrid.innerHTML = '';
        uploadZone?.classList.remove('hidden');
        uploadContent?.classList.remove('hidden');
        uploadProgress?.classList.add('hidden');
        if (titleInput) titleInput.value = '';

        // Reset Crop Workspace & Canvases
        const cropTray = document.getElementById('cropExtractedList');
        if (cropTray) cropTray.innerHTML = '';
        const countBadge = document.getElementById('cropExtractedCount');
        if (countBadge) countBadge.textContent = '0 Soru';
        const finishCropBtn = document.getElementById('manualFinishCropBtn');
        if (finishCropBtn) finishCropBtn.disabled = true;

        const bgCanvas = document.getElementById('cropBgCanvas');
        const overlayCanvas = document.getElementById('cropOverlayCanvas');
        if (bgCanvas) {
            const ctx = bgCanvas.getContext('2d');
            ctx?.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        }
        if (overlayCanvas) {
            const ctx = overlayCanvas.getContext('2d');
            ctx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        const cropPopup = document.getElementById('cropConfirmPopup');
        if (cropPopup) cropPopup.classList.add('hidden');

        this.setStage('upload');
    }

    // ---- Stage Controller ----
    setStage(stage) {
        this.currentStage = stage;

        const stages = ['upload', 'crop', 'label', 'results'];
        stages.forEach(s => {
            const el = document.getElementById(`manualStage_${s}`);
            if (el) el.classList.toggle('hidden', s !== stage);
        });

        const historyView = document.getElementById('resultsHistoryView');
        const detailView = document.getElementById('resultsDetailView');

        if (stage === 'crop') {
            if (detailView) detailView.style.display = 'none';
            this.initCropWorkspace();
        } else if (stage === 'label') {
            if (detailView) detailView.style.display = 'none';
            this.renderLabelWorkspace();
        } else if (stage === 'results') {
            if (historyView) historyView.style.display = 'none';
            if (detailView) detailView.style.display = 'block';
            this.renderResultsWorkspace();
        } else {
            if (detailView) detailView.style.display = 'none';
        }
    }

    // ===================================================
    // STAGE 2: QUESTION SELECTION / CROPPING
    // ===================================================

    startCropping() {
        if (this.pages.length === 0) {
            app.showToast('Lütfen önce soru sayfası yükleyin', 'warning');
            return;
        }
        this.currentPageIndex = 0;
        this.setStage('crop');
    }

    initCropWorkspace() {
        this.updatePageIndicator();
        this.renderCropCanvas();
        this.renderCroppedThumbnails();
        this.setupCropInteractions();
    }

    updatePageIndicator() {
        const ind = document.getElementById('cropPageIndicator');
        const prevBtn = document.getElementById('cropPrevPageBtn');
        const nextBtn = document.getElementById('cropNextPageBtn');

        if (ind) ind.textContent = `Sayfa ${this.currentPageIndex + 1} / ${this.pages.length}`;
        if (prevBtn) prevBtn.disabled = this.currentPageIndex <= 0;
        if (nextBtn) nextBtn.disabled = this.currentPageIndex >= this.pages.length - 1;
    }

    changePage(delta) {
        const newIdx = this.currentPageIndex + delta;
        if (newIdx >= 0 && newIdx < this.pages.length) {
            this.currentPageIndex = newIdx;
            this.currentSelection = null;
            this.hideCropConfirmPopup();
            this.updatePageIndicator();
            this.renderCropCanvas();
        }
    }

    setZoom(level) {
        this.zoomLevel = Math.max(0.4, Math.min(2.5, level));
        const valEl = document.getElementById('cropZoomValue');
        if (valEl) valEl.textContent = `${Math.round(this.zoomLevel * 100)}%`;

        const wrapper = document.getElementById('cropCanvasViewport');
        if (wrapper) {
            wrapper.style.transform = `scale(${this.zoomLevel})`;
            wrapper.style.transformOrigin = 'top center';
        }
    }

    renderCropCanvas() {
        const page = this.pages[this.currentPageIndex];
        if (!page) return;

        const bgCanvas = document.getElementById('cropBgCanvas');
        const overlayCanvas = document.getElementById('cropOverlayCanvas');
        if (!bgCanvas || !overlayCanvas) return;

        console.log('📐 Rendering crop canvas:', {
            pageWidth: page.width,
            pageHeight: page.height,
            hasImgElement: !!page.imgElement,
            imgNaturalWidth: page.imgElement?.naturalWidth,
            imgNaturalHeight: page.imgElement?.naturalHeight
        });

        // Set dimensions to match actual image size
        bgCanvas.width = page.width;
        bgCanvas.height = page.height;
        overlayCanvas.width = page.width;
        overlayCanvas.height = page.height;

        const ctx = bgCanvas.getContext('2d');
        ctx.clearRect(0, 0, page.width, page.height);

        // Draw page image - use imgElement if available, otherwise create from data
        if (page.imgElement) {
            ctx.drawImage(page.imgElement, 0, 0, page.width, page.height);
            this.drawExistingQuestionsOverlay();
        } else if (page.data) {
            // Load image from data URL
            const img = new Image();
            img.onload = () => {
                page.imgElement = img; // Cache for future use
                // Update page dimensions to match actual image
                page.width = img.naturalWidth || img.width;
                page.height = img.naturalHeight || img.height;

                // Re-render with correct dimensions
                bgCanvas.width = page.width;
                bgCanvas.height = page.height;
                overlayCanvas.width = page.width;
                overlayCanvas.height = page.height;

                ctx.drawImage(img, 0, 0, page.width, page.height);
                this.drawExistingQuestionsOverlay();

                console.log('✅ Image loaded, updated dimensions:', page.width, 'x', page.height);
            };
            img.onerror = () => {
                console.error('Failed to load page image');
            };
            img.src = page.data;
        }
    }

    drawExistingQuestionsOverlay() {
        const overlayCanvas = document.getElementById('cropOverlayCanvas');
        if (!overlayCanvas) return;
        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        // Draw already cropped questions for this page
        const pageQuestions = this.questions.filter(q => q.pageIndex === this.currentPageIndex && q.box);
        pageQuestions.forEach(q => {
            const { x, y, width, height } = q.box;

            // Translucent fill
            ctx.fillStyle = 'rgba(52, 211, 153, 0.12)';
            ctx.fillRect(x, y, width, height);

            // Green border
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 6]);
            ctx.strokeRect(x, y, width, height);
            ctx.setLineDash([]);

            // Badge with question number
            const badgeText = `Soru ${q.number}`;
            ctx.font = 'bold 16px Inter, sans-serif';
            const textMetrics = ctx.measureText(badgeText);
            const badgeW = textMetrics.width + 20;
            const badgeH = 28;

            ctx.fillStyle = '#34d399';
            ctx.beginPath();
            ctx.roundRect(x, Math.max(0, y - badgeH - 4), badgeW, badgeH, 6);
            ctx.fill();

            ctx.fillStyle = '#0a0a14';
            ctx.fillText(badgeText, x + 10, Math.max(0, y - badgeH - 4) + 19);
        });

        // Draw active selection box if any
        if (this.currentSelection) {
            const { x, y, width, height } = this.currentSelection;

            // Vibrant purple selection
            ctx.fillStyle = 'rgba(124, 92, 252, 0.2)';
            ctx.fillRect(x, y, width, height);

            ctx.strokeStyle = '#7c5cfc';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(x, y, width, height);
            ctx.setLineDash([]);

            // Corner handles
            const handleSize = 10;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#7c5cfc';
            ctx.lineWidth = 2;

            const corners = [
                [x, y], [x + width, y],
                [x, y + height], [x + width, y + height]
            ];
            corners.forEach(([cx, cy]) => {
                ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
                ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
            });

            // Dimension label
            const dimText = `${Math.round(width)} × ${Math.round(height)} px`;
            ctx.font = '13px Inter, sans-serif';
            const dimW = ctx.measureText(dimText).width + 16;
            ctx.fillStyle = 'rgba(18, 18, 31, 0.85)';
            ctx.fillRect(x + 4, y + 4, dimW, 22);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(dimText, x + 12, y + 19);
        }
    }

    setupCropInteractions() {
        const overlayCanvas = document.getElementById('cropOverlayCanvas');
        if (!overlayCanvas || overlayCanvas._hasCropListeners) return;
        overlayCanvas._hasCropListeners = true;

        const getCanvasCoords = (e) => {
            const rect = overlayCanvas.getBoundingClientRect();
            const scaleX = overlayCanvas.width / rect.width;
            const scaleY = overlayCanvas.height / rect.height;

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY,
                screenX: clientX,
                screenY: clientY
            };
        };

        const onDown = (e) => {
            if (e.button && e.button !== 0) return;
            const coords = getCanvasCoords(e);
            this.isSelecting = true;
            this.selectionStart = { x: coords.x, y: coords.y };
            this.currentSelection = null;
            this.hideCropConfirmPopup();
            this.drawExistingQuestionsOverlay();
        };

        const onMove = (e) => {
            if (!this.isSelecting) return;
            const coords = getCanvasCoords(e);

            const x = Math.min(this.selectionStart.x, coords.x);
            const y = Math.min(this.selectionStart.y, coords.y);
            const width = Math.abs(coords.x - this.selectionStart.x);
            const height = Math.abs(coords.y - this.selectionStart.y);

            this.currentSelection = { x, y, width, height };
            this.drawExistingQuestionsOverlay();
        };

        const onUp = (e) => {
            if (!this.isSelecting) return;
            this.isSelecting = false;

            if (this.currentSelection && this.currentSelection.width > 25 && this.currentSelection.height > 25) {
                // Show confirmation popup right below selection
                this.showCropConfirmPopup(this.currentSelection);
            } else {
                this.currentSelection = null;
                this.drawExistingQuestionsOverlay();
                this.hideCropConfirmPopup();
            }
        };

        overlayCanvas.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        // Touch support
        overlayCanvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                e.preventDefault();
                onDown(e);
            }
        }, { passive: false });

        overlayCanvas.addEventListener('touchmove', (e) => {
            if (this.isSelecting) {
                e.preventDefault();
                onMove(e);
            }
        }, { passive: false });

        overlayCanvas.addEventListener('touchend', (e) => {
            if (this.isSelecting) {
                e.preventDefault();
                onUp(e);
            }
        }, { passive: false });
    }

    showCropConfirmPopup(selection) {
        const popup = document.getElementById('cropConfirmPopup');
        const overlayCanvas = document.getElementById('cropOverlayCanvas');
        if (!popup || !overlayCanvas) return;

        const rect = overlayCanvas.getBoundingClientRect();
        const scaleX = rect.width / overlayCanvas.width;
        const scaleY = rect.height / overlayCanvas.height;

        // Position popup near bottom edge of selection box
        const screenBoxX = rect.left + selection.x * scaleX;
        const screenBoxY = rect.top + (selection.y + selection.height) * scaleY;

        popup.style.left = `${Math.max(10, Math.min(window.innerWidth - 240, screenBoxX))}px`;
        popup.style.top = `${Math.min(window.innerHeight - 80, screenBoxY + 8)}px`;
        popup.classList.remove('hidden');

        // Update button text
        const confirmBtn = document.getElementById('cropConfirmAddBtn');
        if (confirmBtn) {
            confirmBtn.innerHTML = `
                <span class="material-icons-outlined">content_cut</span>
                Soru ${this.questions.length + 1} Olarak Ekle
            `;
            confirmBtn.onclick = () => this.confirmCropSelection();
        }

        const cancelBtn = document.getElementById('cropConfirmCancelBtn');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                this.currentSelection = null;
                this.drawExistingQuestionsOverlay();
                this.hideCropConfirmPopup();
            };
        }
    }

    hideCropConfirmPopup() {
        const popup = document.getElementById('cropConfirmPopup');
        if (popup) popup.classList.add('hidden');
    }

    confirmCropSelection() {
        if (!this.currentSelection) return;

        const page = this.pages[this.currentPageIndex];
        if (!page) return;

        const { x, y, width, height } = this.currentSelection;

        // Crop with offscreen canvas using high-DPI smoothing
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = width;
        cropCanvas.height = height;
        const ctx = cropCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw cropped section from original page image
        ctx.drawImage(page.imgElement || page.data, x, y, width, height, 0, 0, width, height);
        // Lossless PNG for maximum text clarity and sharp formulas
        const cropDataUrl = cropCanvas.toDataURL('image/jpeg', 0.85);

        // Inherit previous question exam/subject/topic/errorReason/status if set, else default
        const lastQ = this.questions[this.questions.length - 1];
        // Use the FIRST question's settings as the template for all subsequent questions
        const templateQ = this.questions[0] || lastQ;
        let initialExam = 'TYT';
        let initialSubject = 'Matematik';
        const titleText = (document.getElementById('manualTestTitleInput')?.value || '').trim();
        if (titleText) {
            const examMatch = titleText.match(/\b(TYT|AYT|YDT|LGS|KPSS|ALES|DGS|MSÜ)\b/i);
            if (examMatch) initialExam = examMatch[1].toUpperCase();
            for (const subj of (this.subjects || [])) {
                if (new RegExp(`\\b${subj}\\b`, 'i').test(titleText)) {
                    initialSubject = subj;
                    break;
                }
            }
        }
        const defaultExam = this.getFullExamType ? this.getFullExamType() : (this.selectedExam || (templateQ ? templateQ.exam : initialExam));
        const defaultSubject = templateQ ? templateQ.subject : initialSubject;
        const defaultTopic = templateQ ? templateQ.topic : '';
        const defaultErrorReason = templateQ ? templateQ.errorReason : 'Konu Eksikliği';
        const defaultStatus = lastQ ? lastQ.status : 'wrong'; // Use last question's status
        const defaultCorrectAnswer = lastQ ? lastQ.correctAnswer : '';

        const newQuestion = {
            id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            number: this.questions.length + 1,
            image: cropDataUrl,
            pageIndex: this.currentPageIndex,
            box: { x, y, width, height },
            exam: defaultExam,
            subject: defaultSubject,
            topic: defaultTopic,
            status: defaultStatus, // Inherit from last question
            correctAnswer: defaultCorrectAnswer, // Inherit from last question
            errorReason: defaultErrorReason,
            note: ''
        };

        this.questions.push(newQuestion);
        this.currentSelection = null;
        this.hideCropConfirmPopup();
        this.drawExistingQuestionsOverlay();
        this.renderCroppedThumbnails();

        app.showToast(`Soru ${newQuestion.number} başarıyla eklendi!`, 'success');
    }

    addSharedStemQuestion() {
        if (!this.currentSelection) return;

        const page = this.pages[this.currentPageIndex];
        if (!page) return;

        if (this.questions.length === 0) {
            app.showToast('İlk soruyu normal "Soruyu Ekle" butonuyla ekleyin', 'warning');
            return;
        }

        // Show dialog to select which question this is a stem for
        this.showStemSelectionDialog();
    }

    showStemSelectionDialog() {
        // Create modal overlay with strong backdrop
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay stem-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(8, 8, 18, 0.88);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(8px);
        `;

        const dialog = document.createElement('div');
        dialog.className = 'stem-selection-dialog';
        dialog.style.cssText = `
            background: #181828;
            color: #ffffff;
            border: 2px solid var(--accent-primary, #7c5cfc);
            border-radius: 16px;
            padding: 24px;
            max-width: 460px;
            width: 92%;
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(124, 92, 252, 0.35);
            position: relative;
            z-index: 10001;
            opacity: 1;
        `;

        const title = document.createElement('h3');
        title.innerHTML = `
            <span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;background:rgba(124,92,252,0.2);margin-right:10px;">
                <span class="material-icons-outlined" style="color:var(--accent-primary, #7c5cfc);font-size:22px;">link</span>
            </span>
            <span>Ortak Kök / Paragraf Bağlama</span>
        `;
        title.style.cssText = `
            margin: 0 0 10px 0;
            color: #ffffff;
            font-size: 18px;
            font-weight: 700;
            display: flex;
            align-items: center;
        `;

        const subtitle = document.createElement('p');
        subtitle.textContent = 'Bu kestiğiniz soru hangi ortak metne / paragrafa ait? Bağlamak istediğiniz ana soruyu seçin:';
        subtitle.style.cssText = `
            margin: 0 0 18px 0;
            color: #94a3b8;
            font-size: 13.5px;
            line-height: 1.5;
        `;

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 280px;
            overflow-y: auto;
            margin-bottom: 18px;
            padding-right: 4px;
        `;

        // Create button for each candidate parent question (exclude stems)
        const candidateQuestions = this.questions.filter(q => !q.isStem);
        if (candidateQuestions.length === 0) {
            const emptyNotice = document.createElement('p');
            emptyNotice.textContent = 'Önce en az bir soru veya paragrafı normal olarak ekleyin.';
            emptyNotice.style.cssText = 'color:#cbd5e1;font-size:13px;padding:14px;text-align:center;background:#252538;border-radius:10px;border:1px dashed rgba(255,255,255,0.15);';
            buttonContainer.appendChild(emptyNotice);
        } else {
            this.questions.forEach((q, idx) => {
                if (q.isStem) return; // Cannot link to a stem
                const btn = document.createElement('button');
                const stemCount = q.stemCount || 0;
                const label = stemCount > 0 ? `Soru ${q.number} (${stemCount} bağlı soru var)` : `Soru ${q.number}`;
                btn.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                        <span style="display:flex;align-items:center;gap:10px;font-weight:600;font-size:14.5px;">
                            <span class="material-icons-outlined" style="color:var(--accent-primary, #7c5cfc);font-size:22px;">article</span>
                            ${label}
                        </span>
                        <span class="badge" style="background:rgba(124,92,252,0.25);color:#c4b5fd;font-weight:700;font-size:11.5px;padding:4px 10px;border-radius:6px;border:1px solid rgba(124,92,252,0.4);">Bağla</span>
                    </div>
                `;
                btn.className = 'btn btn-secondary';
                btn.style.cssText = `
                    width: 100%;
                    text-align: left;
                    padding: 13px 16px;
                    border: 1.5px solid rgba(124,92,252,0.3);
                    border-radius: 10px;
                    background: #232338;
                    color: #ffffff;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                `;
                btn.onmouseenter = () => {
                    btn.style.background = '#2c2b50';
                    btn.style.borderColor = 'var(--accent-primary, #7c5cfc)';
                    btn.style.transform = 'translateY(-1px)';
                };
                btn.onmouseleave = () => {
                    btn.style.background = '#232338';
                    btn.style.borderColor = 'rgba(124,92,252,0.3)';
                    btn.style.transform = 'translateY(0)';
                };

                btn.addEventListener('click', () => {
                    this.addStemForQuestion(idx);
                    document.body.removeChild(overlay);
                });

                buttonContainer.appendChild(btn);
            });
        }

        // Scroll to bottom after rendering
        setTimeout(() => {
            buttonContainer.scrollTop = buttonContainer.scrollHeight;
        }, 0);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'İptal';
        cancelBtn.className = 'btn btn-ghost';
        cancelBtn.style.cssText = `
            width: 100%;
            padding: 11px;
            border-radius: 10px;
            background: rgba(255,255,255,0.06);
            color: #cbd5e1;
            font-weight: 600;
            border: 1px solid rgba(255,255,255,0.1);
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        cancelBtn.onmouseenter = () => {
            cancelBtn.style.background = 'rgba(255,255,255,0.12)';
            cancelBtn.style.color = '#ffffff';
        };
        cancelBtn.onmouseleave = () => {
            cancelBtn.style.background = 'rgba(255,255,255,0.06)';
            cancelBtn.style.color = '#cbd5e1';
        };
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        dialog.appendChild(title);
        dialog.appendChild(subtitle);
        dialog.appendChild(buttonContainer);
        dialog.appendChild(cancelBtn);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    addStemForQuestion(questionIndex) {
        if (!this.currentSelection) return;

        const page = this.pages[this.currentPageIndex];
        if (!page) return;

        const { x, y, width, height } = this.currentSelection;

        // Crop image for the stem
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = width;
        cropCanvas.height = height;
        const ctx = cropCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(page.imgElement || page.data, x, y, width, height, 0, 0, width, height);
        const cropDataUrl = cropCanvas.toDataURL('image/jpeg', 0.85);

        // Get the target question
        const targetQ = this.questions[questionIndex];

        // Initialize stem tracking if not exists
        if (!targetQ.stemCount) {
            targetQ.stemCount = 0;
            targetQ.stems = [];
        }

        targetQ.stemCount++;
        const stemNumber = targetQ.stemCount;

        // Create stem question
        const stemQuestion = {
            id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            number: this.questions.length + 1,
            image: cropDataUrl,
            pageIndex: this.currentPageIndex,
            box: { x, y, width, height },
            exam: (this.getFullExamType ? this.getFullExamType() : this.selectedExam) || targetQ.exam || 'TYT',
            subject: targetQ.subject || 'Matematik',
            topic: targetQ.topic || '',
            status: targetQ.status || 'wrong',
            correctAnswer: targetQ.correctAnswer || '',
            errorReason: targetQ.errorReason || '',
            note: targetQ.note || '',
            parentId: targetQ.id,
            parentQuestionNumber: targetQ.number,
            stemNumber: stemNumber,
            isStem: true
        };

        this.questions.push(stemQuestion);
        targetQ.stems.push(stemQuestion.id);

        this.currentSelection = null;
        this.hideCropConfirmPopup();
        this.drawExistingQuestionsOverlay();
        this.renderCroppedThumbnails();

        app.showToast(`🔗 Soru ${targetQ.number} için ${stemNumber}. kök eklendi`, 'success');
    }

    jumpToQuestionPage(questionIdx) {
        const q = this.questions[questionIdx];
        if (!q) return;
        // Crop aşamasındaysak, o soru hangi sayfadaysa oraya git
        if (this.currentStage === 'crop') {
            if (this.currentPageIndex !== q.pageIndex) {
                this.currentPageIndex = q.pageIndex;
                this.updatePageIndicator();
                this.renderCropCanvas();
            }
        } else if (this.currentStage === 'label') {
            // Label aşamasında: o soruyu aktif yap
            this.setActiveQuestionIndex(questionIdx);
        }
    }

    addFullPageAsQuestion() {
        const page = this.pages[this.currentPageIndex];
        if (!page) return;

        this.currentSelection = {
            x: 0,
            y: 0,
            width: page.width,
            height: page.height
        };
        this.confirmCropSelection();
    }

    deleteCroppedQuestion(index) {
        if (index < 0 || index >= this.questions.length) return;
        const deletedQ = this.questions[index];
        this.questions.splice(index, 1);

        // If deleted question was a stem, update parent
        if (deletedQ.isStem) {
            const parent = this.questions.find(pq => (deletedQ.parentId && pq.id === deletedQ.parentId) || (pq.number === deletedQ.parentQuestionNumber));
            if (parent) {
                parent.stems = (parent.stems || []).filter(id => id !== deletedQ.id);
                parent.stemCount = parent.stems.length;
            }
        }

        // If deleted question was a parent with stems, convert its stems to normal questions
        if (!deletedQ.isStem && deletedQ.stemCount > 0) {
            this.questions.forEach(q => {
                if (q.isStem && ((deletedQ.id && q.parentId === deletedQ.id) || q.parentQuestionNumber === deletedQ.number)) {
                    q.isStem = false;
                    delete q.parentId;
                    delete q.parentQuestionNumber;
                    delete q.stemNumber;
                }
            });
        }

        // Renumber remaining questions and update parentQuestionNumber for stems
        this.questions.forEach((q, i) => {
            q.number = i + 1;
        });

        // Re-sync parentQuestionNumber by parentId
        this.questions.forEach(q => {
            if (q.isStem && q.parentId) {
                const parent = this.questions.find(pq => pq.id === q.parentId);
                if (parent) {
                    q.parentQuestionNumber = parent.number;
                }
            }
        });

        if (this.questions.length === 0) {
            this.activeQuestionIndex = 0;
            this.setStage('crop');
            this.drawExistingQuestionsOverlay();
            this.renderCroppedThumbnails();
            app.showToast('Tüm sorular silindi, soru kırpma ekranına dönüldü', 'info');
            return;
        }

        if (this.activeQuestionIndex >= this.questions.length) {
            this.activeQuestionIndex = this.questions.length - 1;
        }

        if (this.currentStage === 'label') {
            // Ensure active question is visible (not a parent paragraph)
            const currentQ = this.questions[this.activeQuestionIndex];
            if (currentQ && !currentQ.isStem && currentQ.stemCount > 0) {
                const nextVis = this.getNextVisibleQuestionIndex(this.activeQuestionIndex, 1);
                const prevVis = this.getNextVisibleQuestionIndex(this.activeQuestionIndex, -1);
                this.activeQuestionIndex = nextVis !== -1 ? nextVis : (prevVis !== -1 ? prevVis : 0);
            }
            this.renderLabelWorkspace();
        }

        this.drawExistingQuestionsOverlay();
        this.renderCroppedThumbnails();
        app.showToast('Soru silindi', 'info');
    }

    renderCroppedThumbnails() {
        const tray = document.getElementById('cropExtractedList');
        const countBadge = document.getElementById('cropExtractedCount');
        const finishBtn = document.getElementById('manualFinishCropBtn');

        const visibleCount = this.questions.filter(q => q.isStem || !q.stemCount).length;
        const parentStemCount = this.questions.filter(q => !q.isStem && q.stemCount > 0).length;

        if (countBadge) {
            countBadge.textContent = parentStemCount > 0 ? `${visibleCount} Soru (+${parentStemCount} Paragraf)` : `${this.questions.length} Soru`;
        }
        if (finishBtn) {
            finishBtn.disabled = visibleCount === 0;
            finishBtn.innerHTML = `
                <span>Soru Bilgilerini Gir (${visibleCount})</span>
                <span class="material-icons-outlined">arrow_forward</span>
            `;
        }

        if (!tray) return;

        if (this.questions.length === 0) {
            tray.innerHTML = `
                <div class="crop-empty-state">
                    <span class="material-icons-outlined">crop</span>
                    <p>Yukarıdaki sayfadan soruları fareyle kutu içine alarak seçin.</p>
                </div>
            `;
            return;
        }

        tray.innerHTML = this.questions.map((q, idx) => {
            let badgeText = `#${q.number}`;
            let badgeStyle = '';
            let nameText = `Soru ${q.number}`;

            if (!q.isStem && q.stemCount > 0) {
                badgeText = `P #${q.number}`;
                badgeStyle = 'background:var(--accent-primary, #7c5cfc);color:#ffffff;';
                nameText = `Paragraf (Soru ${q.number})`;
            } else if (q.isStem && q.parentQuestionNumber) {
                badgeText = `Kök ${q.stemNumber || ''}`;
                badgeStyle = 'background:#059669;color:#ffffff;';
                nameText = `Soru ${q.parentQuestionNumber} (${q.stemNumber}. kök)`;
            }

            return `
                <div class="extracted-q-card ${q.pageIndex === this.currentPageIndex ? 'active-page' : ''}" 
                     onclick="manualAnalyzer.jumpToQuestionPage(${idx})" 
                     title="Sayfa ${q.pageIndex + 1}'e git ve soruyu vurgula">
                    <div class="q-thumb-wrapper">
                        <img src="${q.image}" alt="Soru ${q.number}" loading="lazy" decoding="async">
                        <span class="q-badge" style="${badgeStyle}">${badgeText}</span>
                        <span class="q-page-indicator">S.${q.pageIndex + 1}</span>
                    </div>
                    <div class="q-meta">
                        <span class="q-name">${nameText}</span>
                        <span class="q-page-tag">Sayfa ${q.pageIndex + 1}</span>
                    </div>
                    <div class="q-actions">
                        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); manualAnalyzer.openDrawingForQuestion(${idx})" title="Soruya Çizim Yap">
                            <span class="material-icons-outlined">edit</span>
                        </button>
                        <button class="btn btn-ghost btn-sm btn-delete" onclick="event.stopPropagation(); manualAnalyzer.deleteCroppedQuestion(${idx})" title="Sil">
                            <span class="material-icons-outlined">delete</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Jump to question's page and highlight it
    jumpToQuestionPage(questionIndex) {
        const q = this.questions[questionIndex];
        if (!q) return;

        // Change to question's page if different
        if (q.pageIndex !== this.currentPageIndex) {
            this.currentPageIndex = q.pageIndex;
            this.updatePageIndicator();
            this.renderCropCanvas();
        }

        // Highlight the question temporarily
        this.highlightQuestion(q);

        // Update thumbnails to show active page
        this.renderCroppedThumbnails();
    }

    // Highlight a specific question on canvas
    highlightQuestion(question) {
        if (!question.box) return;

        const overlayCanvas = document.getElementById('cropOverlayCanvas');
        if (!overlayCanvas) return;

        // First redraw all existing questions
        this.drawExistingQuestionsOverlay();

        const ctx = overlayCanvas.getContext('2d');
        const { x, y, width, height } = question.box;

        // Add pulsing highlight effect
        let pulseCount = 0;
        const pulseInterval = setInterval(() => {
            if (pulseCount >= 3) {
                clearInterval(pulseInterval);
                this.drawExistingQuestionsOverlay(); // Reset to normal
                return;
            }

            // Clear and redraw base
            this.drawExistingQuestionsOverlay();

            // Add pulsing highlight
            const alpha = 0.3 + Math.sin(pulseCount * Math.PI / 1.5) * 0.2;
            ctx.fillStyle = `rgba(252, 211, 77, ${alpha})`;
            ctx.fillRect(x, y, width, height);

            ctx.strokeStyle = '#fcd34d';
            ctx.lineWidth = 4;
            ctx.setLineDash([]);
            ctx.strokeRect(x, y, width, height);

            pulseCount++;
        }, 300);

        // Scroll canvas viewport to show the question
        const viewport = document.getElementById('cropCanvasViewport');
        if (viewport && viewport.parentElement) {
            const canvasOuter = viewport.parentElement;

            // Calculate scroll position to center the question
            const scrollX = x - (canvasOuter.clientWidth / 2) + (width / 2);
            const scrollY = y - (canvasOuter.clientHeight / 2) + (height / 2);

            canvasOuter.scrollTo({
                left: Math.max(0, scrollX),
                top: Math.max(0, scrollY),
                behavior: 'smooth'
            });
        }
    }

    // ===================================================
    // STAGE 3: QUESTION LABELING (BUTTON CHIPS)
    // ===================================================

    startLabeling() {
        if (this.questions.length === 0) {
            app.showToast('Lütfen önce en az 1 soru seçin', 'warning');
            return;
        }
        // Start with first visible question (skip parent questions with stems)
        const firstVisible = this.getNextVisibleQuestionIndex(-1, 1);
        this.activeQuestionIndex = firstVisible !== -1 ? firstVisible : 0;
        this.setStage('label');
    }

    // Helper to find next visible question (skips parent questions that have stems)
    getNextVisibleQuestionIndex(currentIndex, direction) {
        let nextIndex = currentIndex + direction;

        while (nextIndex >= 0 && nextIndex < this.questions.length) {
            const q = this.questions[nextIndex];
            // Skip parent questions that have stems
            if (!q.isStem && q.stemCount > 0) {
                nextIndex += direction;
                continue;
            }
            return nextIndex;
        }
        return -1;
    }

    changeActiveQuestion(delta) {
        const next = this.getNextVisibleQuestionIndex(this.activeQuestionIndex, delta);
        if (next !== -1 && next >= 0 && next < this.questions.length) {
            // Apply current question's settings to next question ONLY for NEW analyses and if next question has NOT been opened before
            if (delta > 0 && next < this.questions.length && !this.editingAnalysisId) {
                const current = this.questions[this.activeQuestionIndex];
                const nextQ = this.questions[next];

                if (!nextQ._opened) {
                    if (!nextQ._statusModified) {
                        nextQ.status = current.status;
                    }
                    if (!nextQ._correctAnswerModified) {
                        nextQ.correctAnswer = current.correctAnswer;
                    }
                }
            }

            this.activeQuestionIndex = next;
            this.renderLabelWorkspace();
        }
    }

    setActiveQuestionIndex(idx) {
        if (idx >= 0 && idx < this.questions.length) {
            const targetQ = this.questions[idx];
            // If target question is a parent question with stems, skip to first visible question
            if (targetQ && !targetQ.isStem && targetQ.stemCount > 0) {
                const nextVis = this.getNextVisibleQuestionIndex(idx, 1);
                const prevVis = this.getNextVisibleQuestionIndex(idx, -1);
                this.activeQuestionIndex = nextVis !== -1 ? nextVis : (prevVis !== -1 ? prevVis : 0);
            } else {
                this.activeQuestionIndex = idx;
            }
            this.renderLabelWorkspace();
        }
    }

    renderLabelWorkspace() {
        // If current active question is a parent question with stems, skip to visible question
        let q = this.questions[this.activeQuestionIndex];
        if (q && !q.isStem && q.stemCount > 0) {
            const nextIdx = this.getNextVisibleQuestionIndex(this.activeQuestionIndex, 1);
            if (nextIdx !== -1) {
                this.activeQuestionIndex = nextIdx;
                q = this.questions[this.activeQuestionIndex];
            } else {
                const prevIdx = this.getNextVisibleQuestionIndex(this.activeQuestionIndex, -1);
                if (prevIdx !== -1) {
                    this.activeQuestionIndex = prevIdx;
                    q = this.questions[this.activeQuestionIndex];
                }
            }
        }
        if (!q) return;

        // Mark question as opened so its values are protected from previous question modifications
        q._opened = true;

        // Trigger auto-save when navigating between questions
        this.triggerAutoSave();

        // Render question stepper tabs
        this.renderQuestionTabs();

        // Update preview image - if this is a stem, show parent + stem together
        const imgEl = document.getElementById('labelQuestionImage');
        if (imgEl) {
            if (q.isStem && (q.parentId || q.parentQuestionNumber)) {
                // Find parent question by parentId or parentQuestionNumber
                const parentQ = this.questions.find(pq => (q.parentId && pq.id === q.parentId) || (pq.number === q.parentQuestionNumber && !pq.isStem));
                if (parentQ && parentQ.image) {
                    // Create combined image
                    this.createCombinedImage(parentQ.image, q.image, (combinedDataUrl) => {
                        imgEl.src = combinedDataUrl;
                    });
                } else {
                    imgEl.src = q.image;
                }
            } else {
                imgEl.src = q.image;
            }
        }

        const titleEl = document.getElementById('labelQuestionTitle');
        if (titleEl) {
            if (q.isStem && q.parentQuestionNumber && q.stemNumber) {
                titleEl.textContent = `Soru ${q.parentQuestionNumber} (${q.stemNumber}. Kök)`;
            } else {
                titleEl.textContent = `Soru ${q.number}`;
            }
        }

        // Bind Zoom button for this question
        const zoomBtn = document.getElementById('labelZoomQuestionBtn');
        if (zoomBtn) {
            zoomBtn.onclick = () => this.openZoomModal();
        }

        // Bind Drawing button for this question
        const drawBtn = document.getElementById('labelDrawQuestionBtn');
        if (drawBtn) {
            drawBtn.onclick = () => this.openDrawingForQuestion(this.activeQuestionIndex);
        }

        // Display active exam banner
        const bannerText = document.getElementById('currentExamDisplayText');
        if (bannerText) {
            bannerText.textContent = q.exam || this.selectedExam || 'TYT';
        }

        // Render all chip groups
        this.renderExamChips(q);
        this.renderSubjectChips(q);
        this.renderTopicChips(q);
        this.renderStatusChips(q);
        this.renderCorrectAnswerChips(q);
        this.renderErrorChips(q);

        // Bind personal note
        const noteInput = document.getElementById('labelQuestionNote');
        if (noteInput) {
            noteInput.value = q.note || '';
            noteInput.oninput = (e) => {
                q.note = e.target.value;
            };
        }

        // Update navigation buttons
        const prevBtn = document.getElementById('labelPrevQBtn');
        const nextBtn = document.getElementById('labelNextQBtn');
        const indicator = document.getElementById('labelQCounter');
        const saveBtn = document.getElementById('manualSaveAnalysisBtn');

        // Check if there are visible questions before/after
        const hasPrev = this.getNextVisibleQuestionIndex(this.activeQuestionIndex, -1) !== -1;
        const hasNext = this.getNextVisibleQuestionIndex(this.activeQuestionIndex, 1) !== -1;

        if (prevBtn) prevBtn.disabled = !hasPrev;
        if (nextBtn) nextBtn.disabled = !hasNext;

        // Count visible questions for indicator
        const visibleCount = this.questions.filter(q => q.isStem || !q.stemCount).length;
        const currentVisibleIndex = this.questions.slice(0, this.activeQuestionIndex + 1).filter(q => q.isStem || !q.stemCount).length;

        if (indicator) indicator.textContent = `${currentVisibleIndex} / ${visibleCount}`;

        // Save button: Changes based on position
        // Last visible question: "Save & Finish"
        // Other questions: "Next Question"
        if (saveBtn) {
            const isLastVisible = !hasNext;
            if (isLastVisible) {
                saveBtn.innerHTML = `<span class="material-icons-outlined">check_circle</span> Analizi Kaydet & Bitir`;
                saveBtn.classList.remove('btn-secondary');
                saveBtn.classList.add('btn-primary');
            } else {
                saveBtn.innerHTML = `<span class="material-icons-outlined">arrow_forward</span> Sonraki Soru`;
                saveBtn.classList.remove('btn-primary');
                saveBtn.classList.add('btn-secondary');
            }
        }
    }

    // Helper function to create combined image (parent + stem)
    createCombinedImage(parentImageData, stemImageData, callback) {
        const parentImg = new Image();
        const stemImg = new Image();
        let parentLoaded = false;
        let stemLoaded = false;

        const renderBoth = () => {
            if (!parentLoaded || !stemLoaded) return;

            const parentW = parentImg.naturalWidth || parentImg.width;
            const parentH = parentImg.naturalHeight || parentImg.height;
            const stemW = stemImg.naturalWidth || stemImg.width;
            const stemH = stemImg.naturalHeight || stemImg.height;

            const canvas = document.createElement('canvas');
            const maxWidth = Math.max(parentW, stemW);
            const totalHeight = parentH + stemH + 20;
            canvas.width = maxWidth;
            canvas.height = totalHeight;

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, maxWidth, totalHeight);

            // Draw parent on top
            ctx.drawImage(parentImg, (maxWidth - parentW) / 2, 0);

            // Draw separator
            ctx.strokeStyle = '#3a3a3c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(20, parentH + 10);
            ctx.lineTo(maxWidth - 20, parentH + 10);
            ctx.stroke();

            // Draw stem below
            ctx.drawImage(stemImg, (maxWidth - stemW) / 2, parentH + 20);

            callback(canvas.toDataURL('image/png'));
        };

        parentImg.onload = () => {
            parentLoaded = true;
            renderBoth();
        };
        stemImg.onload = () => {
            stemLoaded = true;
            renderBoth();
        };

        parentImg.src = parentImageData;
        stemImg.src = stemImageData;
    }

    // Promise wrapper for createCombinedImage
    createCombinedImagePromise(parentImageData, stemImageData) {
        return new Promise((resolve) => {
            if (!parentImageData) return resolve(stemImageData);
            if (!stemImageData) return resolve(parentImageData);
            try {
                this.createCombinedImage(parentImageData, stemImageData, (combined) => {
                    resolve(combined);
                });
            } catch (err) {
                console.error('Combined image creation failed:', err);
                resolve(stemImageData);
            }
        });
    }

    renderQuestionTabs() {
        const tabsContainer = document.getElementById('labelQuestionTabs');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = this.questions.map((q, idx) => {
            // Hide parent questions that have stems (only show the stems themselves)
            if (!q.isStem && q.stemCount > 0) {
                return ''; // Don't show this question's tab
            }

            const isActive = idx === this.activeQuestionIndex;
            let statusIcon = 'cancel';
            let statusColor = 'var(--color-wrong)';
            let isComplete = q.status && q.exam && q.subject;

            if (q.status === 'correct') {
                statusIcon = 'check_circle';
                statusColor = 'var(--color-correct)';
            } else if (q.status === 'blank') {
                statusIcon = 'help_outline';
                statusColor = 'var(--color-blank)';
            }

            // Determine display label
            let displayLabel;
            if (q.isStem && q.parentQuestionNumber && q.stemNumber) {
                // This is a stem (root) question
                displayLabel = `Soru ${q.parentQuestionNumber} (${q.stemNumber}. Kök)`;
            } else {
                // Normal question
                displayLabel = `Soru ${q.number}`;
            }

            // Warning badge if incomplete
            const warningBadge = !isComplete ? '<span class="q-tab-warning" title="Eksik bilgi">⚠</span>' : '';
            const pageHint = this.pages.length > 1 ? `<span class="q-tab-page" title="Sayfa ${q.pageIndex + 1}'den eklendi">S.${q.pageIndex + 1}</span>` : '';

            return `
                <button class="q-tab-btn ${isActive ? 'active' : ''} ${!isComplete ? 'incomplete' : ''}" onclick="manualAnalyzer.setActiveQuestionIndex(${idx})">
                    <span class="material-icons-outlined" style="color:${statusColor};font-size:16px;">${statusIcon}</span>
                    <span>${displayLabel}</span>
                    ${pageHint}
                    ${warningBadge}
                    <span class="q-tab-delete-btn" onclick="event.stopPropagation(); manualAnalyzer.deleteCroppedQuestion(${idx})" title="${displayLabel}'i Sil">
                        <span class="material-icons-outlined" style="font-size:14px;">close</span>
                    </span>
                </button>
            `;
        }).join('') + `
            <button class="q-tab-btn add-more-btn" onclick="manualAnalyzer.setStage('crop')" title="Yeni Soru Ekle">
                <span class="material-icons-outlined">add</span>
                <span>Soru Ekle</span>
            </button>
        `;
    }

    renderExamChips(question) {
        const container = document.getElementById('chipsExamContainer');
        if (!container) return;

        container.innerHTML = this.examTypes.map(exam => {
            const isActive = (question.exam === exam) || (exam === 'AYT' && (question.exam || '').startsWith('AYT'));
            return `
                <button type="button" class="chip-btn ${isActive ? 'active' : ''}" data-exam="${exam}">
                    ${exam}
                </button>
            `;
        }).join('');

        container.querySelectorAll('[data-exam]').forEach(btn => {
            btn.onclick = () => {
                const selectedExamName = btn.dataset.exam;
                if (selectedExamName === 'AYT' && this.aytSubfield) {
                    question.exam = this.getFullExamType();
                } else {
                    question.exam = selectedExamName;
                }

                // Auto-adjust subject for exam type if needed
                if (question.exam.startsWith('AYT') && question.subject === 'Türkçe') {
                    const subjs = this.getSubjectsForExam(question.exam);
                    question.subject = subjs[0] || 'Matematik';
                } else if (question.exam === 'TYT' && (question.subject === 'Edebiyat' || question.subject === 'Türk Dili ve Edebiyatı')) {
                    question.subject = 'Türkçe';
                } else if (question.exam === 'YDT') {
                    question.subject = 'İngilizce';
                }

                // Mark current question as modified
                question._examModified = true;

                // Apply to all SUBSEQUENT unopened questions ONLY when creating a new analysis (smart cascade)
                if (!this.editingAnalysisId) {
                    const currentIdx = this.activeQuestionIndex;
                    for (let i = currentIdx + 1; i < this.questions.length; i++) {
                        const oq = this.questions[i];
                        if (oq._opened) continue;
                        if (!oq._examModified) {
                            oq.exam = question.exam;
                            oq.subject = question.subject;
                        }
                    }
                }

                this.triggerAutoSave();
                this.renderExamChips(question);
                this.renderSubjectChips(question);
                this.renderTopicChips(question);
            };
        });
    }

    getSubjectsForExam(exam) {
        let e = (exam || this.getFullExamType() || 'TYT').toUpperCase();
        if (e === 'AYT' && this.aytSubfield) {
            e = `AYT-${this.aytSubfield}`;
        }

        let list = [...this.subjects];

        if (e === 'AYT-SAYISAL') {
            const sayisals = ['Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji'];
            // Sayısal dersleri + kullanıcı özel eklemişse o dersler (sözel/sosyal hariç)
            list = list.filter(s => sayisals.includes(s) || !['Türkçe', 'Edebiyat', 'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'İngilizce'].includes(s));
        } else if (e === 'AYT-EA') {
            const eaSubjs = ['Edebiyat', 'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya', 'Matematik', 'Geometri'];
            list = list.filter(s => eaSubjs.includes(s) || !['Türkçe', 'Fizik', 'Kimya', 'Biyoloji', 'Felsefe', 'Din Kültürü', 'İngilizce'].includes(s));
        } else if (e === 'AYT-SÖZEL') {
            const sozelSubjs = ['Edebiyat', 'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü'];
            list = list.filter(s => sozelSubjs.includes(s) || !['Türkçe', 'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji', 'İngilizce'].includes(s));
        } else if (e.startsWith('AYT')) {
            list = list.filter(s => s !== 'Türkçe');
        } else if (e === 'YDT') {
            const ydtList = list.filter(s => s === 'İngilizce' || s === 'Diğer');
            if (ydtList.length > 0) list = ydtList;
        } else if (e === 'TYT') {
            list = list.filter(s => s !== 'Edebiyat' && s !== 'Türk Dili ve Edebiyatı');
        }

        return list.length > 0 ? this.sortSubjectsByExam(list, e) : this.subjects;
    }

    renderSubjectChips(question) {
        const container = document.getElementById('chipsSubjectContainer');
        if (!container) return;

        const subjectList = this.getSubjectsForExam(question.exam);

        // Ensure current subject is in the list
        let subjectChanged = false;
        if (!subjectList.includes(question.subject)) {
            question.subject = subjectList[0] || 'Matematik';
            subjectChanged = true;
        }

        container.innerHTML = subjectList.map(subj => `
            <button type="button" class="chip-btn ${question.subject === subj ? 'active' : ''}" data-subject="${subj}">
                ${subj}
            </button>
        `).join('');

        if (subjectChanged) {
            this.renderTopicChips(question);
        }

        container.querySelectorAll('[data-subject]').forEach(btn => {
            btn.onclick = () => {
                question.subject = btn.dataset.subject;

                // Mark current question as modified
                question._subjectModified = true;

                // Apply to all SUBSEQUENT unopened questions ONLY when creating a new analysis (smart cascade)
                if (!this.editingAnalysisId) {
                    const currentIdx = this.activeQuestionIndex;
                    for (let i = currentIdx + 1; i < this.questions.length; i++) {
                        const oq = this.questions[i];
                        if (oq._opened) continue;
                        if (!oq._subjectModified) {
                            oq.subject = question.subject;
                        }
                    }
                }

                this.renderSubjectChips(question);
                this.renderTopicChips(question);
            };
        });
    }

    getTopicsFor(exam, subject) {
        let e = (exam || (this.getFullExamType ? this.getFullExamType() : this.selectedExam) || 'TYT').toUpperCase().trim();
        let baseExam = e;
        if (e.startsWith('AYT')) {
            baseExam = 'AYT';
        }

        const subjectAliases = {
            'Türk Dili ve Edebiyatı': 'Edebiyat',
            'Tarih-1': 'Tarih',
            'Tarih-2': 'Tarih',
            'Coğrafya-1': 'Coğrafya',
            'Coğrafya-2': 'Coğrafya',
            'Felsefe Grubu': 'Felsefe'
        };
        const lookupSubject = subjectAliases[subject] || subject;

        let examDict = this.examTopics[e] || this.examTopics[baseExam];
        if (!examDict) {
            examDict = this.examTopics['TYT'] || {};
        }

        let list = [];
        if (examDict[lookupSubject]) {
            list = [...examDict[lookupSubject]];
        } else if (examDict[subject]) {
            list = [...examDict[subject]];
        } else if (e.startsWith('AYT') && this.examTopics['AYT']?.[lookupSubject]) {
            list = [...this.examTopics['AYT'][lookupSubject]];
        } else if (this.examTopics['TYT']?.[lookupSubject]) {
            list = [...this.examTopics['TYT'][lookupSubject]];
        } else {
            list = ['Genel Soru', 'Deneme Sorusu', 'Yorum Sorusu', 'Mantık ve Muhakeme'];
        }

        // Filter out deleted default topics
        const deletedKeys = [
            `${e}_${subject}`,
            `${e}_${lookupSubject}`,
            e.startsWith('AYT') ? `AYT_${subject}` : null,
            e.startsWith('AYT') ? `AYT_${lookupSubject}` : null
        ].filter(Boolean);

        let deleted = [];
        if (this.deletedDefaultTopics) {
            deletedKeys.forEach(k => {
                if (Array.isArray(this.deletedDefaultTopics[k])) {
                    deleted = deleted.concat(this.deletedDefaultTopics[k]);
                }
            });
        }

        return list.filter(t => !deleted.includes(t));
    }

    renderTopicChips(question) {
        const container = document.getElementById('chipsTopicContainer');
        if (!container) return;

        const currentSubject = question.subject || 'Matematik';
        const currentExam = question.exam || 'TYT';

        // Filter default topics strictly by Exam and Subject!
        const defaultList = this.getTopicsFor(currentExam, currentSubject);
        const baseExam = currentExam.startsWith('AYT') ? 'AYT' : currentExam;
        const customList = Array.from(new Set([
            ...(this.customTopics[`${currentExam}_${currentSubject}`] || []),
            ...(baseExam !== currentExam ? (this.customTopics[`${baseExam}_${currentSubject}`] || []) : []),
            ...(this.customTopics[currentSubject] || [])
        ]));

        let html = '';

        // Default topics classified by Exam
        defaultList.forEach(topic => {
            const isSelected = question.topic === topic;
            html += `
                <button type="button" class="chip-btn ${isSelected ? 'active' : ''}" data-topic="${this.escapeHtml(topic)}">
                    ${this.escapeHtml(topic)}
                </button>
            `;
        });

        // Custom topics (with delete button)
        customList.forEach(topic => {
            const isSelected = question.topic === topic;
            html += `
                <div class="chip-btn chip-custom ${isSelected ? 'active' : ''}" data-topic="${this.escapeHtml(topic)}">
                    <span class="chip-text">${this.escapeHtml(topic)}</span>
                    <button type="button" class="chip-delete-btn" onclick="event.stopPropagation(); manualAnalyzer.onDeleteCustomTopic('${currentSubject}', '${this.escapeHtml(topic)}', '${currentExam}')" title="Konuyu Sil">
                        <span class="material-icons-outlined">close</span>
                    </button>
                </div>
            `;
        });

        // Add topic button & inline form
        html += `
            <div class="chip-add-wrapper" id="addTopicWrapper">
                <button type="button" class="chip-btn chip-add-trigger" id="addTopicTriggerBtn">
                    <span class="material-icons-outlined">add</span>
                    Yeni Konu Ekle
                </button>
                <div class="chip-inline-input hidden" id="addTopicInlineForm">
                    <input type="text" id="addTopicInput" placeholder="Örn: Limit ve Süreklilik" maxlength="40">
                    <button type="button" class="btn btn-primary btn-xs" id="addTopicConfirmBtn">Ekle</button>
                    <button type="button" class="btn btn-ghost btn-xs" id="addTopicCancelBtn">İptal</button>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Topic click listeners
        container.querySelectorAll('[data-topic]').forEach(el => {
            el.onclick = () => {
                const val = el.dataset.topic;
                question.topic = val;

                // Mark current question as modified
                question._topicModified = true;

                // Apply to all SUBSEQUENT unopened questions (smart cascade - only for new analyses)
                if (!this.editingAnalysisId) {
                    const currentIdx = this.activeQuestionIndex;
                    for (let i = currentIdx + 1; i < this.questions.length; i++) {
                        const oq = this.questions[i];
                        if (oq._opened) continue;
                        if (!oq._topicModified) {
                            oq.topic = val;
                        }
                    }
                }

                this.renderTopicChips(question);
            };
        });

        // Inline topic add trigger
        const trigger = document.getElementById('addTopicTriggerBtn');
        const form = document.getElementById('addTopicInlineForm');
        const input = document.getElementById('addTopicInput');
        const confirmBtn = document.getElementById('addTopicConfirmBtn');
        const cancelBtn = document.getElementById('addTopicCancelBtn');

        trigger?.addEventListener('click', () => {
            trigger.classList.add('hidden');
            form?.classList.remove('hidden');
            input?.focus();
        });

        const doAdd = () => {
            const val = (input?.value || '').trim();
            if (val) {
                this.addCustomTopic(currentSubject, val, currentExam);
                question.topic = val;
                question._topicModified = true;

                if (!this.editingAnalysisId) {
                    const currentIdx = this.activeQuestionIndex;
                    for (let i = currentIdx + 1; i < this.questions.length; i++) {
                        const oq = this.questions[i];
                        if (oq._opened) continue;
                        if (!oq._topicModified) {
                            oq.topic = val;
                        }
                    }
                }

                this.renderTopicChips(question);
                app.showToast(`"${val}" konusu eklendi`, 'success');
            }
        };

        confirmBtn?.addEventListener('click', doAdd);
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doAdd();
            if (e.key === 'Escape') {
                form?.classList.add('hidden');
                trigger?.classList.remove('hidden');
            }
        });
        cancelBtn?.addEventListener('click', () => {
            form?.classList.add('hidden');
            trigger?.classList.remove('hidden');
        });
    }

    onDeleteCustomTopic(subject, topic, exam = null) {
        this.deleteCustomTopic(subject, topic, exam);
        const q = this.questions[this.activeQuestionIndex];
        if (q && q.topic === topic) q.topic = '';
        this.renderTopicChips(q);
        app.showToast(`"${topic}" silindi`, 'info');
    }

    renderStatusChips(question) {
        const container = document.getElementById('chipsStatusContainer');
        if (!container) return;

        const statuses = [
            { id: 'wrong', label: 'Yanlış', icon: 'cancel', class: 'status-wrong' },
            { id: 'blank', label: 'Boş', icon: 'help_outline', class: 'status-blank' },
            { id: 'correct', label: 'Doğru', icon: 'check_circle', class: 'status-correct' }
        ];

        container.innerHTML = statuses.map(s => `
            <button type="button" class="chip-btn chip-status ${s.class} ${question.status === s.id ? 'active' : ''}" data-status="${s.id}">
                <span class="material-icons-outlined">${s.icon}</span>
                <span>${s.label}</span>
            </button>
        `).join('');

        container.querySelectorAll('[data-status]').forEach(btn => {
            btn.onclick = () => {
                question.status = btn.dataset.status;

                // Mark current question as modified
                question._statusModified = true;

                // Apply to all SUBSEQUENT unopened questions (smart cascade - only for new analyses)
                if (!this.editingAnalysisId) {
                    const currentIdx = this.activeQuestionIndex;
                    for (let i = currentIdx + 1; i < this.questions.length; i++) {
                        const oq = this.questions[i];
                        if (oq._opened) continue;
                        if (!oq._statusModified) {
                            oq.status = question.status;
                        }
                    }
                }

                this.renderStatusChips(question);
                this.renderQuestionTabs();
                // Toggle error reasons visibility based on status
                const errorSection = document.getElementById('labelErrorSection');
                if (errorSection) {
                    errorSection.style.display = question.status === 'correct' ? 'none' : 'block';
                }
            };
        });

        // Hide error reasons if correct
        const errorSection = document.getElementById('labelErrorSection');
        if (errorSection) {
            errorSection.style.display = question.status === 'correct' ? 'none' : 'block';
        }
    }

    renderCorrectAnswerChips(question) {
        const container = document.getElementById('chipsCorrectAnswerContainer');
        if (!container) return;

        const options = ['A', 'B', 'C', 'D', 'E'];
        const isClassical = question.correctAnswer && !options.includes(question.correctAnswer);

        let html = options.map(opt => `
            <button type="button" class="chip-btn chip-opt ${question.correctAnswer === opt ? 'active' : ''}" data-correct-opt="${opt}">
                ${opt}
            </button>
        `).join('');

        html += `
            <button type="button" class="chip-btn chip-opt ${isClassical ? 'active' : ''}" data-correct-opt="klasik">
                <span class="material-icons-outlined">create</span> Klasik / Yazılı
            </button>
        `;

        if (isClassical) {
            html += `
                <div class="correct-answer-custom-input">
                    <input type="text" id="customCorrectAnswerInput" placeholder="Doğru cevap yazın (örn: 24, x=5, Cümle Başı)..." value="${this.escapeHtml(question.correctAnswer || '')}">
                </div>
            `;
        }

        container.innerHTML = html;

        // Bind clicks
        container.querySelectorAll('[data-correct-opt]').forEach(btn => {
            btn.onclick = () => {
                const opt = btn.dataset.correctOpt;
                if (opt === 'klasik') {
                    if (isClassical) {
                        // Toggle off
                        question.correctAnswer = '';
                    } else {
                        question.correctAnswer = 'Yazılı';
                    }
                } else {
                    if (question.correctAnswer === opt) {
                        // Deselect (optional!)
                        question.correctAnswer = '';
                    } else {
                        question.correctAnswer = opt;
                    }
                }

                // Mark current question as modified
                question._correctAnswerModified = true;

                // Apply to all SUBSEQUENT unopened questions (smart cascade - only for new analyses)
                if (!this.editingAnalysisId) {
                    const currentIdx = this.activeQuestionIndex;
                    for (let i = currentIdx + 1; i < this.questions.length; i++) {
                        const oq = this.questions[i];
                        if (oq._opened) continue;
                        if (!oq._correctAnswerModified) {
                            oq.correctAnswer = question.correctAnswer;
                        }
                    }
                }

                this.renderCorrectAnswerChips(question);
            };
        });

        const customInput = document.getElementById('customCorrectAnswerInput');
        if (customInput) {
            customInput.oninput = (e) => {
                question.correctAnswer = e.target.value.trim();
                question._correctAnswerModified = true;

                // Apply to subsequent unopened questions (only for new analyses)
                if (!this.editingAnalysisId) {
                    const currentIdx = this.activeQuestionIndex;
                    for (let i = currentIdx + 1; i < this.questions.length; i++) {
                        const oq = this.questions[i];
                        if (oq._opened) continue;
                        if (!oq._correctAnswerModified) {
                            oq.correctAnswer = question.correctAnswer;
                        }
                    }
                }
            };
        }
    }

    renderErrorChips(question) {
        const container = document.getElementById('chipsErrorContainer');
        if (!container) return;

        let html = '';

        // Default errors
        this.defaultErrors.forEach(err => {
            const isSelected = question.errorReason === err;
            html += `
                <button type="button" class="chip-btn ${isSelected ? 'active' : ''}" data-error="${this.escapeHtml(err)}">
                    ${this.escapeHtml(err)}
                </button>
            `;
        });

        // Custom errors
        this.customErrors.forEach(err => {
            const isSelected = question.errorReason === err;
            html += `
                <div class="chip-btn chip-custom ${isSelected ? 'active' : ''}" data-error="${this.escapeHtml(err)}">
                    <span class="chip-text">${this.escapeHtml(err)}</span>
                    <button type="button" class="chip-delete-btn" onclick="event.stopPropagation(); manualAnalyzer.onDeleteCustomError('${this.escapeHtml(err)}')" title="Hatayı Sil">
                        <span class="material-icons-outlined">close</span>
                    </button>
                </div>
            `;
        });

        // Add error trigger & inline form
        html += `
            <div class="chip-add-wrapper" id="addErrorWrapper">
                <button type="button" class="chip-btn chip-add-trigger" id="addErrorTriggerBtn">
                    <span class="material-icons-outlined">add</span>
                    Yeni Hata Nedeni Ekle
                </button>
                <div class="chip-inline-input hidden" id="addErrorInlineForm">
                    <input type="text" id="addErrorInput" placeholder="Örn: Formülü Ters Hatırladım" maxlength="40">
                    <button type="button" class="btn btn-primary btn-xs" id="addErrorConfirmBtn">Ekle</button>
                    <button type="button" class="btn btn-ghost btn-xs" id="addErrorCancelBtn">İptal</button>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Error click listeners
        container.querySelectorAll('[data-error]').forEach(el => {
            el.onclick = () => {
                const val = el.dataset.error;
                question.errorReason = val;

                // Mark current question as modified
                question._errorModified = true;

                // Apply to all SUBSEQUENT unopened questions (smart cascade - only for new analyses)
                if (!this.editingAnalysisId) {
                    const currentIdx = this.activeQuestionIndex;
                    for (let i = currentIdx + 1; i < this.questions.length; i++) {
                        const oq = this.questions[i];
                        if (oq._opened) continue;
                        if (!oq._errorModified) {
                            oq.errorReason = val;
                        }
                    }
                }

                this.renderErrorChips(question);
            };
        });

        // Inline error add trigger
        const trigger = document.getElementById('addErrorTriggerBtn');
        const form = document.getElementById('addErrorInlineForm');
        const input = document.getElementById('addErrorInput');
        const confirmBtn = document.getElementById('addErrorConfirmBtn');
        const cancelBtn = document.getElementById('addErrorCancelBtn');

        trigger?.addEventListener('click', () => {
            trigger.classList.add('hidden');
            form?.classList.remove('hidden');
            input?.focus();
        });

        const doAdd = () => {
            const val = (input?.value || '').trim();
            if (val) {
                this.addCustomError(val);
                question.errorReason = val;

                // Mark current question as modified
                question._errorModified = true;

                // Apply to all SUBSEQUENT unopened questions (smart cascade - only for new analyses)
                if (!this.editingAnalysisId) {
                    const currentIdx = this.activeQuestionIndex;
                    for (let i = currentIdx + 1; i < this.questions.length; i++) {
                        const oq = this.questions[i];
                        if (oq._opened) continue;
                        if (!oq._errorModified) {
                            oq.errorReason = val;
                        }
                    }
                }

                this.renderErrorChips(question);
                app.showToast(`"${val}" hata nedeni eklendi`, 'success');
            }
        };

        confirmBtn?.addEventListener('click', doAdd);
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doAdd();
            if (e.key === 'Escape') {
                form?.classList.add('hidden');
                trigger?.classList.remove('hidden');
            }
        });
        cancelBtn?.addEventListener('click', () => {
            form?.classList.add('hidden');
            trigger?.classList.remove('hidden');
        });
    }

    onDeleteCustomError(errorReason) {
        this.deleteCustomError(errorReason);
        const q = this.questions[this.activeQuestionIndex];
        if (q && q.errorReason === errorReason) q.errorReason = '';
        this.renderErrorChips(q);
        app.showToast(`"${errorReason}" silindi`, 'info');
    }

    applyCurrentToAll() {
        if (this.questions.length <= 1) {
            app.showToast('Kopyalanacak başka soru bulunmuyor', 'info');
            return;
        }
        const currentQ = this.questions[this.activeQuestionIndex];
        const currentIdx = this.activeQuestionIndex;

        // Apply current question's settings to ALL subsequent questions
        for (let i = currentIdx + 1; i < this.questions.length; i++) {
            this.questions[i].exam = currentQ.exam;
            this.questions[i].subject = currentQ.subject;
            this.questions[i].topic = currentQ.topic;
            this.questions[i].errorReason = currentQ.errorReason;
            this.questions[i].status = currentQ.status;
            this.questions[i]._examModified = false;
            this.questions[i]._subjectModified = false;
            this.questions[i]._topicModified = false;
            this.questions[i]._errorModified = false;
            this.questions[i]._statusModified = false;
        }
        this.renderLabelWorkspace();
        const count = this.questions.length - currentIdx - 1;
        app.showToast(`Mevcut sorunun ayarları ${count} soruya uygulandı`, 'success');
    }

    applyQuestion1ToAll() {
        if (this.questions.length <= 1) {
            app.showToast('Kopyalanacak başka soru bulunmuyor', 'info');
            return;
        }
        const q1 = this.questions[0];
        for (let i = 1; i < this.questions.length; i++) {
            this.questions[i].exam = q1.exam;
            this.questions[i].subject = q1.subject;
            this.questions[i].topic = q1.topic;
            this.questions[i].errorReason = q1.errorReason;
            this.questions[i]._examModified = false;
            this.questions[i]._subjectModified = false;
            this.questions[i]._topicModified = false;
            this.questions[i]._errorModified = false;
        }
        this.renderLabelWorkspace();
        app.showToast('1. sorunun sınav, ders, konu ve hata nedeni tüm sorulara uygulandı', 'success');
    }

    // ---- Integrated Drawing Mode (Kırpma Aşamasındaki Çizim Butonu İçin) ----
    openDrawingForQuestion(arg) {
        let imageData = null;
        let saveCallback = null;

        if (typeof arg === 'number') {
            const q = this.questions[arg];
            if (!q || !q.image) {
                window.app?.showToast('Çizim yapılacak soru görseli bulunamadı', 'warning');
                return;
            }
            imageData = q.image;
            saveCallback = (annotatedDataUrl) => {
                q.image = annotatedDataUrl;
                if (this.currentStage === 'label' && this.activeQuestionIndex === arg) {
                    const imgEl = document.getElementById('labelQuestionImage');
                    if (imgEl) imgEl.src = annotatedDataUrl;
                }
                this.renderCroppedThumbnails();
            };
        } else if (typeof arg === 'string') {
            imageData = arg;
            saveCallback = null;
        }

        if (!imageData) {
            window.app?.showToast('Görsel bulunamadı', 'error');
            return;
        }

        if (window.canvasTools) {
            window.canvasTools.openDrawingMode(imageData, saveCallback);
        } else {
            window.app?.showToast('Çizim modu yüklenemedi', 'error');
        }
    }

    // ---- Question Zoom Modal (Büyük Ekran Soru Görünümü) ----
    openZoomModal(questionIndex) {
        const idx = (questionIndex !== undefined && questionIndex !== null) ? questionIndex : this.activeQuestionIndex;
        const q = this.questions[idx];
        if (!q || !q.image) {
            window.app?.showToast('Görüntülenecek soru görseli bulunamadı', 'warning');
            return;
        }

        this.zoomCurrentIndex = idx;

        const modal = document.getElementById('questionZoomModal');
        const img = document.getElementById('questionZoomImage');
        const title = document.getElementById('questionZoomTitle');
        const counter = document.getElementById('questionZoomCounter');
        const prevBtn = document.getElementById('questionZoomPrevBtn');
        const nextBtn = document.getElementById('questionZoomNextBtn');
        if (!modal || !img) return;

        // Determine title
        let displayTitle = '';
        if (q.isStem && q.parentQuestionNumber && q.stemNumber) {
            displayTitle = `Soru ${q.parentQuestionNumber} (${q.stemNumber}. Kök)`;
        } else {
            displayTitle = `Soru ${q.number || (idx + 1)}`;
        }
        if (q.subject) {
            displayTitle += ` • ${q.subject}`;
        }
        if (q.topic) {
            displayTitle += ` — ${q.topic}`;
        }

        if (title) title.textContent = displayTitle;

        // Counter info
        const visibleQuestions = this.questions.filter(item => item.isStem || !item.stemCount);
        const visibleIdx = visibleQuestions.findIndex(item => item === q);
        if (counter) {
            if (visibleIdx !== -1) {
                counter.textContent = `${visibleIdx + 1} / ${visibleQuestions.length}`;
            } else {
                counter.textContent = `${idx + 1} / ${this.questions.length}`;
            }
        }

        // Navigation button states
        const hasPrev = this.getNextVisibleQuestionIndex(idx, -1) !== -1;
        const hasNext = this.getNextVisibleQuestionIndex(idx, 1) !== -1;
        if (prevBtn) prevBtn.disabled = !hasPrev;
        if (nextBtn) nextBtn.disabled = !hasNext;

        // If stem question and parent exists, combine or show stem image
        if (q.isStem && (q.parentId || q.parentQuestionNumber)) {
            const parentQ = this.questions.find(pq => (q.parentId && pq.id === q.parentId) || (pq.number === q.parentQuestionNumber && !pq.isStem));
            if (parentQ && parentQ.image) {
                this.createCombinedImage(parentQ.image, q.image, (combinedUrl) => {
                    img.src = combinedUrl;
                });
            } else {
                img.src = q.image;
            }
        } else {
            img.src = q.image;
        }

        modal.classList.remove('hidden');

        // Esc & Arrow key navigation listener
        if (this._zoomKeyHandler) {
            window.removeEventListener('keydown', this._zoomKeyHandler);
        }
        this._zoomKeyHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeZoomModal();
            } else if (e.key === 'ArrowLeft') {
                this.navigateZoomQuestion(-1);
            } else if (e.key === 'ArrowRight') {
                this.navigateZoomQuestion(1);
            }
        };
        window.addEventListener('keydown', this._zoomKeyHandler);
    }

    closeZoomModal() {
        const modal = document.getElementById('questionZoomModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        const img = document.getElementById('questionZoomImage');
        if (img) {
            img.src = '';
        }
        if (this._zoomKeyHandler) {
            window.removeEventListener('keydown', this._zoomKeyHandler);
            this._zoomKeyHandler = null;
        }
    }

    navigateZoomQuestion(direction) {
        if (!this.questions || this.questions.length === 0) return;
        const current = (this.zoomCurrentIndex !== undefined) ? this.zoomCurrentIndex : this.activeQuestionIndex;
        const targetIdx = this.getNextVisibleQuestionIndex(current, direction);
        if (targetIdx !== -1) {
            // Also synchronize active question in label workspace if we're in label stage
            if (this.currentStage === 'label') {
                this.setActiveQuestionIndex(targetIdx);
            }
            this.openZoomModal(targetIdx);
        }
    }

    // ===================================================
    // STAGE 4: SAVE & RESULTS
    // ===================================================

    saveAnalysis() {
        if (this.questions.length === 0) {
            app.showToast('Kaydedilecek soru bulunmuyor', 'warning');
            return;
        }

        // Validate: Check if all VISIBLE questions have required fields (skip parent questions with stems)
        const incomplete = [];
        this.questions.forEach((q, idx) => {
            if (!q.isStem && q.stemCount > 0) return; // Skip parent paragraphs
            if (!q.status) {
                const label = (q.isStem && q.parentQuestionNumber) ? `Soru ${q.parentQuestionNumber} (${q.stemNumber}. kök)` : `Soru ${q.number}`;
                incomplete.push({ idx, label });
            }
        });

        if (incomplete.length > 0) {
            const list = incomplete.slice(0, 5).map(item => item.label).join(', ') + (incomplete.length > 5 ? '...' : '');
            app.showToast(`Lütfen tüm soruların durumunu belirleyin (Eksik: ${list})`, 'warning');
            // Jump to first incomplete question
            this.setActiveQuestionIndex(incomplete[0].idx);
            return;
        }

        // Show instant saving notification at the exact moment button is clicked
        const loader = window.app && typeof window.app.showLoadingToast === 'function'
            ? window.app.showLoadingToast('💾 Analiz ve soru görselleri kaydediliyor, lütfen bekleyin...')
            : null;

        const saveBtn = document.getElementById('manualSaveAnalysisBtn');
        const originalHtml = saveBtn?.innerHTML;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="material-icons-outlined spinning">hourglass_top</span> Kaydediliyor...';
        }

        this._activeSaveLoader = loader;

        // Slight delay for UX feedback, then save async
        setTimeout(async () => {
            try {
                await this.performSave();
            } catch (err) {
                console.error('❌ Save failed:', err);
                if (window.app) {
                    window.app.showToast('Kaydetme hatası: ' + err.message, 'error');
                } else {
                    alert('Kaydetme hatası: ' + err.message);
                }
            } finally {
                // Always re-enable button
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalHtml;
                }
            }
        }, 300);
    }

    async performSave() {
        const testTitleInput = document.getElementById('manualTestTitleInput');
        const chosenExam = (this.getFullExamType ? this.getFullExamType() : this.selectedExam) || this.questions[0]?.exam || 'TYT';
        const testTitle = (testTitleInput?.value || '').trim() || `${chosenExam} Deneme Analizi`;

        // Calculate statistics
        // Count only visible questions (exclude parent questions that have stems)
        const visibleQuestions = this.questions.filter(q => q.isStem || !q.stemCount);

        // Pre-populate subject breakdown using the full standard curriculum for chosen exam
        const standardList = this.getStandardSubjectsForExam(chosenExam);
        const subjectCounts = {};
        const subjectBreakdown = {};

        // 1. Initialize all standard subjects with default question counts
        standardList.forEach(s => {
            const defTotal = this.getDefaultQuestionCount(chosenExam, s);
            subjectBreakdown[s] = {
                total: defTotal,
                correct: defTotal,
                wrong: 0,
                blank: 0,
                cancelled: 0,
                net: defTotal,
                hasCustomCount: false
            };
        });

        // 2. Count cropped questions for each subject (wrongs & blanks)
        visibleQuestions.forEach(q => {
            const s = q.subject || 'Genel';
            subjectCounts[s] = (subjectCounts[s] || 0) + 1;

            if (!subjectBreakdown[s]) {
                const defTotal = this.getDefaultQuestionCount(chosenExam, s);
                subjectBreakdown[s] = {
                    total: defTotal > 0 ? defTotal : 10,
                    correct: defTotal > 0 ? defTotal : 10,
                    wrong: 0,
                    blank: 0,
                    cancelled: 0,
                    net: defTotal > 0 ? defTotal : 10,
                    hasCustomCount: false
                };
            }

            if (q.status === 'wrong') subjectBreakdown[s].wrong++;
            else if (q.status === 'blank') subjectBreakdown[s].blank++;
        });

        // 3. Compute totals and nets for each subject and overall exam
        let totalExamQuestions = 0;
        let totalExamCorrect = 0;
        let totalExamWrong = 0;
        let totalExamBlank = 0;

        Object.keys(subjectBreakdown).forEach(s => {
            const item = subjectBreakdown[s];
            if (item.total < item.wrong + item.blank + (item.cancelled || 0)) {
                item.total = item.wrong + item.blank + (item.cancelled || 0);
            }
            item.correct = Math.max(0, item.total - (item.cancelled || 0) - item.wrong - item.blank);
            item.net = window.app ? window.app.calculateNet(item.correct, item.wrong) : Math.max(0, item.correct - (item.wrong * 0.25));

            totalExamQuestions += item.total;
            totalExamCorrect += item.correct;
            totalExamWrong += item.wrong;
            totalExamBlank += item.blank;
        });

        const overallNet = window.app ? window.app.calculateNet(totalExamCorrect, totalExamWrong) : Math.max(0, totalExamCorrect - (totalExamWrong * 0.25));
        const score = totalExamQuestions > 0 ? Math.round((totalExamCorrect / totalExamQuestions) * 100) : 0;

        let primarySubject = 'Genel';
        let maxCount = 0;
        Object.entries(subjectCounts).forEach(([s, count]) => {
            if (count > maxCount) {
                maxCount = count;
                primarySubject = s;
            }
        });

        // Prepare combined images for stems before compression/saving
        const visibleImages = await Promise.all(visibleQuestions.map(async (q) => {
            if (q.isStem && (q.parentId || q.parentQuestionNumber)) {
                const parentQ = this.questions.find(pq => (q.parentId && pq.id === q.parentId) || (pq.number === q.parentQuestionNumber && !pq.isStem));
                if (parentQ && parentQ.image) {
                    try {
                        return await this.createCombinedImagePromise(parentQ.image, q.image);
                    } catch (e) {
                        return q.image;
                    }
                }
            }
            return q.image;
        }));

        console.log(`🔄 Starting compression for ${visibleQuestions.length} images...`);
        const questionCount = visibleQuestions.length;
        const optimizationPromises = visibleImages.map((img, idx) =>
            this.optimizeImage(img, questionCount).catch(err => {
                console.warn(`⚠️ Image ${idx + 1} optimization failed:`, err);
                return img; // Return original on error
            })
        );
        const optimizedImages = await Promise.all(optimizationPromises);

        const compiledQuestions = visibleQuestions.map((q, idx) => {
            return {
                number: idx + 1,
                questionText: q.note || `${q.exam || ''} ${q.subject || ''} — ${q.topic || 'Genel Soru'}`,
                studentAnswer: q.status === 'blank' ? 'Boş' : (q.status === 'correct' ? 'Doğru' : 'Yanlış'),
                correctAnswer: q.correctAnswer || (q.status === 'correct' ? 'Doğru' : 'Çözüm Notunda'),
                isCorrect: q.status === 'correct',
                isBlank: q.status === 'blank',
                status: q.status,
                topic: q.topic || 'Genel',
                subject: q.subject || primarySubject,
                explanation: q.errorReason ? `Hata Sebebi: ${q.errorReason}${q.note ? ' — ' + q.note : ''}` : (q.note || ''),
                difficulty: 'orta',
                exam: q.exam || 'TYT',
                errorReason: q.errorReason,
                image: optimizedImages[idx],
                isStem: q.isStem || false,
                parentQuestionNumber: q.parentQuestionNumber || null,
                stemNumber: q.stemNumber || null,
                pageIndex: q.pageIndex || 0,
                box: q.box || { x: 0, y: 0, width: 100, height: 100 }
            };
        });

        // Check if updating an existing analysis
        if (this.editingAnalysisId) {
            const existingIdx = app.analyses.findIndex(a => a.id === this.editingAnalysisId);
            if (existingIdx !== -1) {
                try {
                    const target = app.analyses[existingIdx];
                    target.title = testTitle;
                    target.subject = primarySubject;
                    target.exam = chosenExam;
                    target.net = overallNet;
                    target.subjectBreakdown = target.subjectBreakdown || subjectBreakdown;
                    target.questions = compiledQuestions;
                    target.rawQuestions = JSON.parse(JSON.stringify(this.questions));
                    target.score = score;
                    target.totalQuestions = total;
                    target.correctCount = correctCount;
                    target.wrongCount = wrongCount;
                    target.blankCount = blankCount;
                    target.date = new Date().toISOString();
                    if (compiledQuestions[0]?.image) {
                        target.imageData = await this.optimizeImage(compiledQuestions[0].image, compiledQuestions.length);
                    }
                    // Keep or update originalPages
                    if (this.pages && this.pages.length > 0) {
                        target.originalPages = await Promise.all(this.pages.map(async (page) => ({
                            name: page.name,
                            data: await this.optimizeImage(page.data, compiledQuestions.length),
                            width: page.width,
                            height: page.height
                        })));
                    }

                    this.currentAnalysis = target;
                    this.editingAnalysisId = null;

                    // Try saving with error handling
                    try {
                        window.app.saveAnalyses();
                    } catch (storageErr) {
                        this.handleStorageError(storageErr, target);
                        return;
                    }

                    // Update review pool
                    if (window.reviewPool) {
                        compiledQuestions.forEach(q => {
                            const poolId = `${target.id}_q${q.number}`;
                            const poolItem = window.reviewPool.pool.find(i => i.id === poolId);
                            if (poolItem) {
                                poolItem.topic = q.topic;
                                poolItem.subject = q.subject;
                                poolItem.exam = q.exam || chosenExam;
                                poolItem.correctAnswer = q.correctAnswer;
                                poolItem.explanation = q.explanation;
                                poolItem.image = q.image;
                                if (q.isCorrect) {
                                    poolItem.status = 'mastered';
                                }
                            } else if (!q.isCorrect) {
                                window.reviewPool.addToPool(q, target);
                            }
                        });
                        window.reviewPool.savePool();
                        window.app.updateReviewBadge();
                    }

                    this.viewAnalysisResults(target.id);
                    window.app.showToast(`Analiz başarıyla güncellendi! (Net: ${overallNet.toFixed(2)})`, 'success');

                    // Clear auto-save after successful save
                    this.clearAutoSave();
                    return;
                } catch (err) {
                    console.error('Save error:', err);
                    window.app.showToast('Güncelleme hatası: ' + err.message, 'error');
                    return;
                }
            }
        }

        const analysis = {
            id: window.app ? window.app.generateId() : 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            date: new Date().toISOString(),
            title: testTitle,
            subject: primarySubject,
            exam: chosenExam,
            net: overallNet,
            subjectBreakdown: subjectBreakdown,
            questions: compiledQuestions,
            rawQuestions: JSON.parse(JSON.stringify(this.questions)),
            score,
            totalQuestions: totalExamQuestions,
            correctCount: totalExamCorrect,
            wrongCount: totalExamWrong,
            blankCount: totalExamBlank,
            imageData: compiledQuestions[0]?.image || await this.optimizeImage(this.pages[0]?.data, compiledQuestions.length) || null,
            // Store original full pages for edit mode
            originalPages: await Promise.all(this.pages.map(async (page) => ({
                name: page.name,
                data: await this.optimizeImage(page.data, compiledQuestions.length),
                width: page.width,
                height: page.height
            })))
        };

        console.log(`📦 Saving analysis with ${analysis.originalPages?.length || 0} original pages`);
        this.currentAnalysis = analysis;

        console.log(`💾 Saving analysis: "${analysis.title}" (${compiledQuestions.length} soru, ${analysis.originalPages?.length || 0} sayfa)`);

        // Check if app is loaded
        if (!window.app) {
            console.error('❌ App not loaded yet!');
            throw new Error('Uygulama henüz yüklenmedi. Lütfen sayfayı yenileyin.');
        }

        try {
            await window.app.addAnalysis(analysis);
            console.log('✅ Analysis saved successfully');
        } catch (storageErr) {
            console.error('❌ Storage error:', storageErr);
            this.handleStorageError(storageErr, analysis);
            return;
        }

        // Auto-add wrong & blank questions to review pool
        const reviewCandidates = compiledQuestions.filter(q => !q.isCorrect);
        if (reviewCandidates.length > 0 && window.reviewPool) {
            reviewCandidates.forEach(q => window.reviewPool.addToPool(q, analysis, false));
            await window.reviewPool.savePool();
            window.app.updateReviewBadge();
        }

        // If editing, update existing review pool items with new subject/topic
        if (this.editingAnalysisId && window.reviewPool) {
            console.log('🔄 Updating review pool with new subject/topic data...');
            compiledQuestions.forEach(q => {
                const poolItem = window.reviewPool.pool.find(item =>
                    (item.testId === analysis.id || item.analysisId === analysis.id) && item.questionNumber === q.number
                );
                if (poolItem) {
                    poolItem.subject = q.subject;
                    poolItem.topic = q.topic;
                    poolItem.exam = q.exam || 'TYT';
                }
            });
            window.reviewPool.savePool();
            console.log('✅ Review pool updated');
        }

        this.viewAnalysisResults(analysis.id);
        if (this._activeSaveLoader) {
            this._activeSaveLoader.success(`✅ Sınav analizi başarıyla kaydedildi! (Puan: ${score})`);
            this._activeSaveLoader = null;
        } else {
            window.app.showToast(`Sınav analizi başarıyla kaydedildi! (Puan: ${score})`, 'success');
        }

        // Clear auto-save after successful save
        this.clearAutoSave();
    }

    async optimizeImage(dataUrl, maxDimension = 1800, quality = 0.85) {
        if (!dataUrl || typeof dataUrl !== 'string') {
            return null;
        }

        // If it's already a compact base64 image (under ~350KB), return directly
        if (dataUrl.length < 350000) {
            return dataUrl;
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let w = img.naturalWidth || img.width;
                let h = img.naturalHeight || img.height;
                const maxDim = typeof maxDimension === 'number' && maxDimension > 200 ? maxDimension : 1800;

                let needsResize = false;
                if (w > maxDim || h > maxDim) {
                    const ratio = maxDim / Math.max(w, h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                    needsResize = true;
                }

                const isPNG = dataUrl.startsWith('data:image/png');
                if (!needsResize && !isPNG && dataUrl.length < 600000) {
                    resolve(dataUrl);
                    return;
                }

                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    // White background for transparent PNG conversion to JPEG
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);

                    const compressed = canvas.toDataURL('image/jpeg', quality || 0.85);
                    resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
                } catch (e) {
                    console.warn('optimizeImage error, using original:', e);
                    resolve(dataUrl);
                }
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    handleStorageError(error, analysis) {
        console.error('Storage error:', error);

        if (!window.app) {
            console.error('❌ App not loaded, cannot handle storage error');
            alert('Uygulama yüklenmedi. Lütfen sayfayı yenileyin ve tekrar deneyin.');
            return;
        }

        if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
            // Calculate storage usage
            const currentSize = new Blob([JSON.stringify(window.app.analyses)]).size;
            const sizeMB = (currentSize / (1024 * 1024)).toFixed(2);
            const analysisCount = window.app.analyses.length;

            // Delete 40% for more aggressive cleanup
            const deletePercent = 0.4;
            const toDelete = Math.ceil(analysisCount * deletePercent);

            window.app.showConfirmModal(
                '💾 Depolama Alanı Doldu',
                `Tarayıcı depolama alanı doldu (${sizeMB} MB / ~5 MB limit, ${analysisCount} analiz).\n\n` +
                `✅ Sınırsız soru desteği aktif - her analiz otomatik sıkıştırılıyor.\n\n` +
                `Çözüm: En eski ${toDelete} analizi otomatik sil ve yeni analizi kaydet?`,
                () => {
                    // Delete oldest analyses
                    const sorted = [...window.app.analyses].sort((a, b) => new Date(a.date) - new Date(b.date));
                    const deleteIds = sorted.slice(0, toDelete).map(a => a.id);

                    deleteIds.forEach(id => {
                        window.app.analyses = window.app.analyses.filter(a => a.id !== id);
                    });

                    try {
                        window.app.saveAnalyses();
                        // Retry adding new analysis
                        window.app.addAnalysis(analysis);
                        this.viewAnalysisResults(analysis.id);
                        window.app.showToast(`✅ ${toDelete} eski analiz silindi, yeni analiz kaydedildi`, 'success');

                        // Clear auto-save after successful save
                        this.clearAutoSave();
                    } catch (retryErr) {
                        window.app.showToast('⚠️ Hala yeterli alan yok. Ayarlar > Verileri Yönet\'ten daha fazla analiz silin.', 'error');
                    }
                },
                () => {
                    window.app.showToast('💡 İptal edildi. Ayarlar sayfasından manuel olarak analiz silebilirsiniz.', 'warning');
                }
            );
        } else {
            window.app.showToast('❌ Kaydetme hatası: ' + error.message, 'error');
        }
    }

    editAnalysis(analysisId, questionIndex = 0, loader = null) {
        // Null or empty ID check
        if (!analysisId || analysisId === '') {
            if (loader) loader.close();
            if (window.app) window.app.showToast('Geçersiz analiz ID', 'warning');
            return;
        }

        const analysis = (window.app.analyses || []).find(a => a.id === analysisId);
        if (!analysis) {
            if (loader) loader.close();
            if (window.app) window.app.showToast('Düzenlenecek analiz bulunamadı', 'warning');
            return;
        }

        if (!loader && window.app?.showLoadingToast) {
            loader = window.app.showLoadingToast('📖 Analiz ve sayfalar yükleniyor, lütfen bekleyin...');
        }

        this.editingAnalysisId = analysisId;
        this.currentAnalysis = analysis;

        // Load existing questions: prioritize rawQuestions (which preserves parent paragraphs and stem links)
        if (analysis.rawQuestions && Array.isArray(analysis.rawQuestions) && analysis.rawQuestions.length > 0) {
            this.questions = JSON.parse(JSON.stringify(analysis.rawQuestions));
        } else {
            this.questions = (analysis.questions || []).map((q, idx) => ({
                id: q.id || `q_${idx}_${Date.now()}`,
                number: q.number || (idx + 1),
                image: q.image || analysis.imageData || null,
                pageIndex: q.pageIndex || 0,
                box: q.box || { x: 0, y: 0, width: 100, height: 100 },
                exam: q.exam || 'TYT',
                subject: q.subject || analysis.subject || 'Matematik',
                topic: q.topic || '',
                status: q.status || (q.isCorrect ? 'correct' : (q.isBlank ? 'blank' : 'wrong')),
                errorReason: q.errorReason || '',
                correctAnswer: (q.correctAnswer && q.correctAnswer !== 'Çözüm Notunda' && q.correctAnswer !== 'Doğru') ? q.correctAnswer : (q.studentAnswer && ['A', 'B', 'C', 'D', 'E'].includes(q.studentAnswer) ? q.studentAnswer : ''),
                note: (q.explanation || '').replace(/^Hata Sebebi: [^—]+( — )?/, '') || (q.questionText || ''),
                isStem: q.isStem || false,
                parentId: q.parentId || null,
                parentQuestionNumber: q.parentQuestionNumber || null,
                stemNumber: q.stemNumber || null,
                stemCount: q.stemCount || 0,
                stems: q.stems || []
            }));
        }

        if (this.questions.length === 0) {
            window.app.showToast('Bu analize ait soru kaydı bulunamadı', 'warning');
            return;
        }

        // When editing an already saved analysis, mark every question as opened and modified
        // so that editing any question never cascades to other questions
        this.questions.forEach(q => {
            q._opened = true;
            q._examModified = true;
            q._subjectModified = true;
            q._topicModified = true;
            q._statusModified = true;
            q._correctAnswerModified = true;
            q._errorModified = true;
        });

        // Try to load original full pages first
        if (analysis.originalPages && analysis.originalPages.length > 0) {
            console.log('📄 Loading original full pages:', analysis.originalPages.length);

            const imagePromises = analysis.originalPages.map((pageData, idx) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        this.pages[idx] = {
                            name: pageData.name || `Sayfa ${idx + 1}`,
                            data: pageData.data,
                            imgElement: img,
                            width: img.naturalWidth || pageData.width || img.width,
                            height: img.naturalHeight || pageData.height || img.height
                        };
                        resolve();
                    };
                    img.onerror = () => {
                        // Fallback if image fails to load
                        this.pages[idx] = {
                            name: pageData.name || `Sayfa ${idx + 1}`,
                            data: pageData.data,
                            width: pageData.width || 800,
                            height: pageData.height || 1200
                        };
                        resolve();
                    };
                    img.src = pageData.data;
                });
            });

            // Wait for all images to load before proceeding
            Promise.all(imagePromises).then(() => {
                // Set test title input
                const titleInput = document.getElementById('manualTestTitleInput');
                if (titleInput) titleInput.value = analysis.title || '';

                this.activeQuestionIndex = Math.max(0, Math.min(questionIndex, this.questions.length - 1));
                this.currentPageIndex = this.questions[this.activeQuestionIndex]?.pageIndex || 0;

                // Navigate to analysis page & open crop stage for re-cropping
                window.app.navigateTo('analysis');
                this.setStage('crop');

                if (loader) {
                    loader.success(`✅ ${analysis.originalPages.length} sayfa yüklendi`);
                } else {
                    window.app.showToast(`✅ ${analysis.originalPages.length} sayfa yüklendi`, 'success');
                }
            });
        } else {
            // Fallback: reconstruct pages from question images (old behavior)
            console.warn('⚠️ No original pages found, using question images');

            const uniqueImages = new Set();
            this.questions.forEach(q => {
                if (q.image && !uniqueImages.has(q.image)) {
                    uniqueImages.add(q.image);
                }
            });

            this.pages = [];
            const imagePromises = Array.from(uniqueImages).map((imgData, idx) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        this.pages[idx] = {
                            name: `Sayfa ${idx + 1}`,
                            data: imgData,
                            imgElement: img,
                            width: img.naturalWidth || img.width,
                            height: img.naturalHeight || img.height
                        };
                        resolve();
                    };
                    img.onerror = () => {
                        this.pages[idx] = {
                            name: `Sayfa ${idx + 1}`,
                            data: imgData,
                            width: 800,
                            height: 1200
                        };
                        resolve();
                    };
                    img.src = imgData;
                });
            });

            Promise.all(imagePromises).then(() => {
                const titleInput = document.getElementById('manualTestTitleInput');
                if (titleInput) titleInput.value = analysis.title || '';

                this.activeQuestionIndex = Math.max(0, Math.min(questionIndex, this.questions.length - 1));

                window.app.navigateTo('analysis');
                this.setStage('label');

                if (loader) {
                    loader.success(`✅ ${uniqueImages.size} sayfa yüklendi`);
                } else {
                    window.app.showToast(`✅ ${uniqueImages.size} sayfa yüklendi`, 'success');
                }
            });
        }
    }

    // ---- Rename Analysis ----
    promptRenameAnalysis() {
        if (!this.currentAnalysis) {
            if (window.app) window.app.showToast('Düzenlenecek analiz bulunamadı', 'warning');
            return;
        }

        const displayRow = document.getElementById('manualResultTitleDisplayRow');
        const editRow = document.getElementById('manualResultTitleEditRow');
        const input = document.getElementById('manualResultTitleInput');

        if (displayRow && editRow && input) {
            displayRow.style.display = 'none';
            editRow.style.display = 'flex';
            input.value = this.currentAnalysis.title || '';
            input.focus();
            input.select();
        } else {
            const currentTitle = this.currentAnalysis.title || '';
            const newTitle = prompt('Yeni deneme / analiz adını girin:', currentTitle);
            if (newTitle !== null && newTitle.trim() && newTitle.trim() !== currentTitle) {
                this.applyNewAnalysisTitle(newTitle.trim());
            }
        }
    }

    cancelRenameAnalysis() {
        const displayRow = document.getElementById('manualResultTitleDisplayRow');
        const editRow = document.getElementById('manualResultTitleEditRow');
        if (displayRow) displayRow.style.display = 'flex';
        if (editRow) editRow.style.display = 'none';
    }

    async saveRenamedAnalysis() {
        if (!this.currentAnalysis) return;

        const input = document.getElementById('manualResultTitleInput');
        const newTitle = (input ? input.value : '').trim();

        if (!newTitle) {
            if (window.app) window.app.showToast('Lütfen geçerli bir deneme adı girin', 'warning');
            input?.focus();
            return;
        }

        await this.applyNewAnalysisTitle(newTitle);
        this.cancelRenameAnalysis();
    }

    async applyNewAnalysisTitle(newTitle) {
        if (!this.currentAnalysis) return;
        const oldTitle = this.currentAnalysis.title;
        if (oldTitle === newTitle) return;

        this.currentAnalysis.title = newTitle;

        // Update DOM title
        const titleEl = document.getElementById('manualResultTitle');
        if (titleEl) titleEl.textContent = newTitle;

        // Update in window.app.analyses
        if (window.app && Array.isArray(window.app.analyses)) {
            const found = window.app.analyses.find(a => a.id === this.currentAnalysis.id);
            if (found) {
                found.title = newTitle;
            }
        }

        // Update in review pool items
        if (window.reviewPool && Array.isArray(window.reviewPool.pool)) {
            let poolUpdated = false;
            window.reviewPool.pool.forEach(item => {
                if (item.testId === this.currentAnalysis.id ||
                    item.analysisId === this.currentAnalysis.id ||
                    (item.id && item.id.startsWith(`${this.currentAnalysis.id}_`))) {
                    item.testTitle = newTitle;
                    poolUpdated = true;
                }
            });
            if (poolUpdated) {
                try {
                    await window.reviewPool.savePool();
                } catch (e) {
                    console.warn('Failed to update review pool title:', e);
                }
            }
        }

        // Save to IndexedDB and LocalStorage
        try {
            if (window.app) {
                if (typeof window.app.saveAnalysisToIndexedDB === 'function') {
                    await window.app.saveAnalysisToIndexedDB(this.currentAnalysis);
                }
                if (typeof window.app.saveAnalyses === 'function') {
                    window.app.saveAnalyses();
                }
                if (window.fileStorage && typeof window.fileStorage.isConfigured === 'function' && window.fileStorage.isConfigured()) {
                    window.fileStorage.saveAnalysis(
                        this.currentAnalysis.id,
                        this.currentAnalysis,
                        [],
                        this.currentAnalysis.questions || []
                    ).catch(console.error);
                }

                // Refresh list & dashboard views
                if (typeof window.app.renderResultsHistory === 'function') {
                    window.app.renderResultsHistory();
                }
                if (typeof window.app.updateDashboard === 'function') {
                    window.app.updateDashboard();
                }
                if (typeof window.app.renderRecentAnalyses === 'function') {
                    window.app.renderRecentAnalyses();
                }

                window.app.showToast(`Deneme adı güncellendi: "${newTitle}"`, 'success');
            }
        } catch (err) {
            console.error('Error saving updated title:', err);
            if (window.app) window.app.showToast('İsim güncellenirken hata oluştu: ' + err.message, 'error');
        }
    }

    // View analysis results (read-only mode)
    viewAnalysisResults(analysisId) {
        const analysis = (window.app.analyses || []).find(a => a.id === analysisId);
        if (!analysis) {
            window.app.showToast('Analiz bulunamadı', 'warning');
            return;
        }

        // Set current analysis without editing mode
        this.currentAnalysis = analysis;
        this.editingAnalysisId = null;

        if (typeof this.cancelRenameAnalysis === 'function') {
            this.cancelRenameAnalysis();
        }

        // Navigate to results page and reveal detail view
        if (window.app) {
            window.app._openingDetail = true;
            window.app.navigateTo('results');
            window.app._openingDetail = false;
        }

        const historyView = document.getElementById('resultsHistoryView');
        const detailView = document.getElementById('resultsDetailView');
        if (historyView) historyView.style.display = 'none';
        if (detailView) detailView.style.display = 'block';

        this.setStage('results');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    renderResultsWorkspace() {
        const analysis = this.currentAnalysis;
        if (!analysis) return;

        // Reset inline rename mode
        if (typeof this.cancelRenameAnalysis === 'function') {
            this.cancelRenameAnalysis();
        }

        // Results score circle
        const circle = document.getElementById('manualScoreCircle');
        if (circle) {
            const circumference = 2 * Math.PI * 52;
            const offset = circumference - (analysis.score / 100) * circumference;
            circle.style.strokeDashoffset = offset;

            if (analysis.score >= 70) {
                circle.style.stroke = 'var(--color-correct)';
            } else if (analysis.score >= 50) {
                circle.style.stroke = 'var(--color-blank)';
            } else {
                circle.style.stroke = 'var(--color-wrong)';
            }
        }

        document.getElementById('manualScoreValue').textContent = analysis.score;
        document.getElementById('manualResultTitle').textContent = analysis.title || 'İsimsiz Test';
        if (document.getElementById('manualTotalCount')) document.getElementById('manualTotalCount').textContent = analysis.totalQuestions || 0;
        document.getElementById('manualCorrectCount').textContent = analysis.correctCount;
        document.getElementById('manualWrongCount').textContent = analysis.wrongCount;
        document.getElementById('manualBlankCount').textContent = analysis.blankCount;

        // Display calculated net
        const netScore = (analysis.net !== undefined && analysis.net !== null)
            ? Number(analysis.net)
            : (window.app ? window.app.calculateNet(analysis.correctCount, analysis.wrongCount) : Math.max(0, analysis.correctCount - (analysis.wrongCount * 0.25)));
        const netEl = document.getElementById('manualNetCount');
        if (netEl) netEl.textContent = netScore.toFixed(2);

        // Render subject breakdown table
        this.renderSubjectBreakdownTable(analysis);

        // Show "Add / Edit Correct Count" button for ALL analyses
        const addCorrectBtn = document.getElementById('addCorrectCountBtn');
        if (addCorrectBtn) {
            addCorrectBtn.style.display = 'inline-flex';
            addCorrectBtn.innerHTML = `<span class="material-icons-outlined">fact_check</span> Ders Doğruları / Net Düzenle`;
            addCorrectBtn.title = 'Her ders için sonradan doğru sayılarını girin ve netleri güncelleyin.';
        }
        // Hide the form initially
        const addCorrectContainer = document.getElementById('addCorrectCountContainer');
        if (addCorrectContainer) {
            addCorrectContainer.style.display = 'none';
        }

        // Questions cards breakdown
        const listContainer = document.getElementById('manualResultQuestionsList');
        if (!listContainer) return;

        listContainer.innerHTML = analysis.questions.map((q, idx) => {
            // Skip parent questions that have stems
            if (!q.isStem && q.stemCount > 0) {
                return '';
            }

            let statusIcon = 'cancel';
            let statusClass = 'wrong';
            let statusText = 'Yanlış';
            if (q.isCorrect) {
                statusIcon = 'check_circle';
                statusClass = 'correct';
                statusText = 'Doğru';
            } else if (q.isBlank) {
                statusIcon = 'help_outline';
                statusClass = 'blank';
                statusText = 'Boş';
            }

            // Determine display label
            let displayLabel;
            if (q.isStem && q.parentQuestionNumber && q.stemNumber) {
                displayLabel = `Soru ${q.parentQuestionNumber} + ${q.stemNumber}. kök`;
            } else {
                displayLabel = `Soru ${q.number}`;
            }

            // Get combined image for stem questions
            let imageToShow = q.image;
            const needsCombinedImage = q.isStem && q.parentQuestionNumber;

            return `
                <div class="manual-result-card" data-q-idx="${idx}" data-needs-combined="${needsCombinedImage}">
                    <div class="result-card-status ${statusClass}">
                        <span class="material-icons-outlined">${statusIcon}</span>
                    </div>
                    ${q.image ? `
                    <div class="result-card-img" data-image-data="${this.escapeAttribute(q.image)}" onclick="manualAnalyzer.openDrawingForQuestionFromElement(this)" title="Büyüt / Çiz">
                        <img src="${imageToShow}" alt="${displayLabel}" class="result-q-img" loading="lazy" decoding="async">
                        <span class="img-zoom-hint"><span class="material-icons-outlined">zoom_in</span></span>
                    </div>` : ''}
                    <div class="result-card-body">
                        <div class="card-title-row">
                            <h4>${displayLabel}</h4>
                            <span class="badge badge-${statusClass}">${statusText}</span>
                            ${q.exam ? `<span class="badge badge-exam">${q.exam}</span>` : ''}
                            <span class="badge badge-subject">${q.subject}</span>
                            ${q.topic ? `<span class="badge badge-topic">📚 ${q.topic}</span>` : ''}
                        </div>
                        ${q.errorReason ? `<p class="result-error-line"><b>Hata:</b> ${this.escapeHtml(q.errorReason)}</p>` : ''}
                        ${q.questionText ? `<p class="result-note-line">${this.escapeHtml(q.questionText)}</p>` : ''}
                    </div>
                    <div class="result-card-actions">
                        ${q.image ? `
                        <button class="btn btn-ghost btn-sm" onclick="manualAnalyzer.openDrawingForSavedQuestion(${idx})" title="Soruya Çizim Yap">
                            <span class="material-icons-outlined">draw</span> Çiz
                        </button>` : ''}
                        <button class="btn btn-ghost btn-sm" onclick="manualAnalyzer.editAnalysis('${this.currentAnalysis?.id || ''}', ${idx})" title="Bu Soruyu Düzenle">
                            <span class="material-icons-outlined">edit</span> Düzenle
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Now update stem images to show parent + stem combined
        setTimeout(() => {
            this.updateStemImagesInResults();
        }, 100);
    }

    updateStemImagesInResults() {
        if (!this.currentAnalysis) return;

        const cards = document.querySelectorAll('.manual-result-card[data-needs-combined="true"]');
        cards.forEach(card => {
            const idx = parseInt(card.dataset.qIdx);
            const q = this.currentAnalysis.questions[idx];
            if (!q || !q.isStem || !q.parentQuestionNumber) return;

            const parentQ = this.currentAnalysis.questions.find(pq => pq.number === q.parentQuestionNumber && !pq.isStem);
            if (!parentQ || !parentQ.image) return;

            const imgEl = card.querySelector('.result-q-img');
            if (!imgEl) return;

            this.createCombinedImage(parentQ.image, q.image, (combinedDataUrl) => {
                imgEl.src = combinedDataUrl;
            });
        });
    }

    openDrawingForSavedQuestion(questionIndex) {
        if (!this.currentAnalysis) return;
        const q = this.currentAnalysis.questions[questionIndex];
        if (q && q.image && window.canvasTools) {
            window.canvasTools.openDrawingMode(q.image, (annotated) => {
                q.image = annotated;
                window.app.saveAnalyses();
                this.renderResultsWorkspace();
                const zoomImg = document.getElementById('questionZoomImage');
                if (zoomImg && !document.getElementById('questionZoomModal')?.classList.contains('hidden')) {
                    zoomImg.src = annotated;
                }
            });
        } else if (!window.canvasTools) {
            console.error('❌ canvasTools not initialized');
            window.app?.showToast('Çizim modu yüklenemedi', 'error');
        }
    }

    openDrawingForQuestionFromElement(element) {
        const card = element.closest('.manual-result-card');
        const idx = card ? parseInt(card.dataset.qIdx) : null;
        if (idx !== null && !isNaN(idx)) {
            this.openDrawingForSavedQuestion(idx);
            return;
        }

        const imageData = element.getAttribute('data-image-data');
        if (!imageData) {
            window.app?.showToast('Görsel bulunamadı', 'error');
            return;
        }
        this.openDrawingForQuestion(imageData);
    }

    escapeAttribute(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ---- Lesson-by-Lesson Subject Breakdown Table & Interactive Editing ----
    getDefaultQuestionCount(exam, subject) {
        const e = (exam || '').toUpperCase().trim();
        const s = (subject || '').trim();

        const rules = {
            'TYT': {
                'Türkçe': 40,
                'Temel Matematik': 40,
                'Matematik': 30,
                'Geometri': 10,
                'Tarih': 5,
                'Coğrafya': 5,
                'Felsefe': 5,
                'Din Kültürü ve Ahlak Bilgisi': 5,
                'Din Kültürü': 5,
                'Sosyal Bilgiler': 20,
                'Sosyal Bilimler': 20,
                'Fizik': 7,
                'Kimya': 7,
                'Biyoloji': 6,
                'Fen Bilimleri': 20
            },
            'AYT': {
                'Matematik': 30,
                'Geometri': 10,
                'Türk Dili ve Edebiyatı': 24,
                'Edebiyat': 24,
                'Tarih-1': 10,
                'Tarih-2': 11,
                'Tarih': 10,
                'Coğrafya-1': 6,
                'Coğrafya-2': 11,
                'Coğrafya': 6,
                'Felsefe Grubu': 12,
                'Felsefe': 12,
                'Din Kültürü': 6,
                'Fizik': 14,
                'Kimya': 13,
                'Biyoloji': 13
            },
            'AYT-SAYISAL': {
                'Matematik': 30,
                'Geometri': 10,
                'Fizik': 14,
                'Kimya': 13,
                'Biyoloji': 13
            },
            'AYT-EA': {
                'Türk Dili ve Edebiyatı': 24,
                'Edebiyat': 24,
                'Tarih-1': 10,
                'Tarih': 10,
                'Coğrafya-1': 6,
                'Coğrafya': 6,
                'Matematik': 30,
                'Geometri': 10
            },
            'AYT-SÖZEL': {
                'Türk Dili ve Edebiyatı': 24,
                'Edebiyat': 24,
                'Tarih-1': 10,
                'Tarih-2': 11,
                'Tarih': 21,
                'Coğrafya-1': 6,
                'Coğrafya-2': 11,
                'Coğrafya': 17,
                'Felsefe': 12,
                'Felsefe Grubu': 12,
                'Din Kültürü': 6,
                'Din Kültürü ve Ahlak Bilgisi': 6
            },
            'LGS': {
                'Türkçe': 20,
                'Matematik': 20,
                'Fen Bilimleri': 20,
                'T.C. İnkılap Tarihi ve Atatürkçülük': 10,
                'İnkılap Tarihi': 10,
                'Tarih': 10,
                'Din Kültürü ve Ahlak Bilgisi': 10,
                'Din Kültürü': 10,
                'Yabancı Dil (İngilizce)': 10,
                'İngilizce': 10
            },
            'KPSS': {
                'Türkçe': 30,
                'Matematik': 30,
                'Geometri': 4,
                'Tarih': 27,
                'Coğrafya': 18,
                'Vatandaşlık': 9,
                'Güncel Bilgiler': 6,
                'Genel Yetenek': 60,
                'Genel Kültür': 60
            },
            'ALES': {
                'Türkçe': 50,
                'Sözel': 50,
                'Matematik': 50,
                'Sayısal': 50
            },
            'DGS': {
                'Türkçe': 50,
                'Sözel': 50,
                'Matematik': 50,
                'Sayısal': 50
            },
            'YDT': {
                'İngilizce': 80,
                'Almanca': 80,
                'Fransızca': 80,
                'Arapça': 80,
                'Rusça': 80
            },
            'MSÜ': {
                'Türkçe': 40,
                'Temel Matematik': 40,
                'Matematik': 30,
                'Geometri': 10,
                'Tarih': 5,
                'Coğrafya': 5,
                'Felsefe': 5,
                'Din Kültürü': 5,
                'Fizik': 7,
                'Kimya': 7,
                'Biyoloji': 6
            }
        };

        if (rules[e] && rules[e][s] !== undefined) {
            return rules[e][s];
        }

        const generic = {
            'Türkçe': 40,
            'Matematik': 30,
            'Geometri': 10,
            'Edebiyat': 24,
            'Fizik': 10,
            'Kimya': 10,
            'Biyoloji': 10,
            'Tarih': 10,
            'Coğrafya': 10,
            'Felsefe': 10,
            'İngilizce': 20
        };

        return generic[s] || 20;
    }

    renderSubjectBreakdownTable(analysis) {
        const card = document.getElementById('manualSubjectBreakdownCard');
        const tbody = document.getElementById('manualSubjectBreakdownBody');
        if (!card || !tbody) return;

        const currentExam = (analysis.exam || (this.getFullExamType ? this.getFullExamType() : this.selectedExam) || 'TYT').toUpperCase();
        const standardList = this.getStandardSubjectsForExam(currentExam);
        let breakdown = analysis.subjectBreakdown || {};

        // Ensure all standard subjects of the exam exist in breakdown
        let modified = false;
        standardList.forEach(s => {
            if (!breakdown[s]) {
                const defTotal = this.getDefaultQuestionCount(currentExam, s);
                const subjQuestions = (analysis.questions || []).filter(q => q.subject === s);
                const w = subjQuestions.filter(q => q.status === 'wrong').length;
                const b = subjQuestions.filter(q => q.status === 'blank').length;
                const tot = Math.max(defTotal, w + b);
                const c = Math.max(0, tot - w - b);
                const net = window.app ? window.app.calculateNet(c, w) : Math.max(0, c - (w * 0.25));

                breakdown[s] = {
                    total: tot,
                    correct: c,
                    wrong: w,
                    blank: b,
                    cancelled: 0,
                    net: net,
                    hasCustomCount: false
                };
                modified = true;
            }
        });

        if (modified) {
            analysis.subjectBreakdown = breakdown;
        }

        const subjects = this.sortSubjectsByExam(Object.keys(breakdown), currentExam);
        if (subjects.length === 0) {
            card.style.display = 'none';
            return;
        }

        const rowsHtml = subjects.map(s => {
            const data = breakdown[s] || { correct: 0, wrong: 0, blank: 0, cancelled: 0, total: 0, net: 0 };
            const c = data.correct || 0;
            const w = data.wrong || 0;
            const b = data.blank || 0;
            const cancel = data.cancelled || 0;
            const total = data.total || (c + w + b + cancel);
            const net = (data.net !== undefined && data.net !== null) ? Number(data.net) : (window.app ? window.app.calculateNet(c, w) : Math.max(0, c - (w * 0.25)));
            const validTotal = Math.max(0, total - cancel);
            const rate = validTotal > 0 ? Math.round((c / validTotal) * 100) : 0;
            const rateColor = rate >= 70 ? 'var(--color-correct)' : rate >= 50 ? 'var(--color-blank)' : 'var(--color-wrong)';

            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:10px 8px;text-align:left;"><strong>${s}</strong></td>
                    <td style="padding:10px 8px;text-align:center;font-weight:600;">${total}</td>
                    <td style="padding:10px 8px;text-align:center;"><span class="text-correct" style="font-weight:700;">${c}</span></td>
                    <td style="padding:10px 8px;text-align:center;"><span class="text-wrong" style="font-weight:700;">${w}</span></td>
                    <td style="padding:10px 8px;text-align:center;"><span class="text-blank" style="font-weight:700;">${b}</span></td>
                    <td style="padding:10px 8px;text-align:center;">
                        ${cancel > 0 ? `<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;font-size:10.5px;padding:2px 6px;" title="${cancel} soru iptal edildi/hesaplama dışı">${cancel} İptal</span>` : '<span style="color:var(--text-tertiary);">-</span>'}
                    </td>
                    <td style="padding:10px 8px;text-align:center;"><span style="color:var(--primary-color);font-weight:700;">${net.toFixed(2)}</span></td>
                    <td style="padding:10px 8px;text-align:center;">
                        <div style="display:flex;align-items:center;gap:6px;justify-content:center;">
                            <div style="width:70px;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
                                <div style="width:${rate}%;height:100%;background:${rateColor};"></div>
                            </div>
                            <span style="font-weight:600;font-size:12px;color:${rateColor}">%${rate}</span>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="table" style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border-color);font-size:12px;">
                            <th style="padding:8px;text-align:left;color:var(--text-secondary);">Ders</th>
                            <th style="padding:8px;text-align:center;color:var(--text-secondary);">Toplam Soru</th>
                            <th style="padding:8px;text-align:center;color:var(--color-correct);font-weight:700;">Doğru</th>
                            <th style="padding:8px;text-align:center;color:var(--color-wrong);font-weight:700;">Yanlış</th>
                            <th style="padding:8px;text-align:center;color:var(--color-blank);font-weight:700;">Boş</th>
                            <th style="padding:8px;text-align:center;color:var(--text-tertiary);">İptal</th>
                            <th style="padding:8px;text-align:center;color:var(--primary-color);font-weight:700;">Net</th>
                            <th style="padding:8px;text-align:center;">Başarı Oranı</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        `;

        card.style.display = 'block';
    }

    toggleCorrectCountForm(forceOpen = null) {
        const container = document.getElementById('addCorrectCountContainer');
        if (!container) return;

        const shouldOpen = (forceOpen !== null) ? forceOpen : (container.style.display === 'none');
        container.style.display = shouldOpen ? 'block' : 'none';

        if (shouldOpen) {
            this.renderSubjectCorrectInputs();
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    renderSubjectCorrectInputs() {
        const listContainer = document.getElementById('subjectCorrectListContainer');
        if (!listContainer || !this.currentAnalysis) return;

        const analysis = this.currentAnalysis;
        let breakdown = analysis.subjectBreakdown || {};
        const currentExam = (analysis.exam || (this.getFullExamType ? this.getFullExamType() : this.selectedExam) || 'TYT').toUpperCase();

        // 1. ALL standard subjects of the exam MUST always be included
        const standardList = this.getStandardSubjectsForExam(currentExam);
        const subjectSet = new Set(standardList);

        // 2. Add any custom subjects from existing breakdown or cropped questions
        Object.keys(breakdown).forEach(s => {
            if (s && s !== 'Genel' && s !== 'Diğer') subjectSet.add(s);
        });
        (analysis.questions || []).forEach(q => {
            if (q.subject && q.subject !== 'Genel' && q.subject !== 'Diğer') subjectSet.add(q.subject);
        });

        // 3. Sort subjects based on canonical exam order
        let subjects = this.sortSubjectsByExam(Array.from(subjectSet), currentExam);
        const penaltyRatio = window.app ? window.app.getPenaltyRatio() : 0.25;

        let rowsHtml = '';
        subjects.forEach(s => {
            const data = breakdown[s] || {};
            const subjQuestions = (analysis.questions || []).filter(q => q.subject === s);

            // Standard question count for this subject
            const defaultTotal = this.getDefaultQuestionCount(currentExam, s);

            // Cropped questions count
            const croppedWrong = subjQuestions.filter(q => q.status === 'wrong').length;
            const croppedBlank = subjQuestions.filter(q => q.status === 'blank').length;

            // Determine wrong and blank counts
            let w = (data.wrong !== undefined) ? data.wrong : croppedWrong;
            let b = (data.blank !== undefined) ? data.blank : croppedBlank;
            const cancel = data.cancelled !== undefined ? data.cancelled : 0;

            // A subject is custom only if it's NOT in the standard exam curriculum
            const isCustom = !standardList.includes(s);

            // Determine total question count:
            // Prefer custom-set total if user explicitly changed it, otherwise use exam default
            let total = defaultTotal > 0 ? defaultTotal : 10;
            if (data.hasCustomTotal && data.total !== undefined && data.total > 0) {
                total = data.total;
            } else if (data.hasCustomCount && data.total !== undefined && data.total > 0) {
                total = data.total;
            }

            if (total < w + b + cancel) {
                total = w + b + cancel;
            }

            // Auto-calculate correct count: Total - Cancelled - Wrong - Blank
            // If user explicitly edited correct count, honor it
            let c = (data.hasCustomCorrect && data.correct !== undefined)
                ? data.correct
                : Math.max(0, total - cancel - w - b);

            const net = Math.max(0, c - (w * penaltyRatio));

            rowsHtml += `
                <tr class="subject-correct-row ${isCustom ? 'custom-subject-row' : ''}" data-subject="${s}" data-wrong="${w}" data-blank="${b}" data-is-custom="${isCustom}">
                    <td style="padding:10px 8px;text-align:left;">
                        <strong style="color:var(--text-primary);font-size:14px;">${s}</strong>
                        ${isCustom ? `<button type="button" class="btn btn-ghost btn-xs" onclick="manualAnalyzer.removeCustomSubject('${this.escapeHtml(s)}')" title="Dersi Sil" style="margin-left:8px;"><span class="material-icons-outlined" style="font-size:16px;color:var(--color-wrong);">close</span></button>` : ''}
                    </td>
                    <td style="padding:10px 8px;text-align:center;">
                        <input type="number" min="0" max="300" class="subject-total-input" data-subject="${s}" value="${total}" title="Dersin toplam soru sayısı" style="width:72px;text-align:center;font-weight:700;">
                    </td>
                    <td style="padding:10px 8px;text-align:center;">
                        <input type="number" min="0" max="300" class="subject-correct-input" data-subject="${s}" value="${c}" title="Doğru sayısı (otomatik hesaplanır, düzenlenebilir)" style="width:72px;text-align:center;font-weight:700;color:var(--color-correct,#10b981) !important;background:rgba(16,185,129,0.1) !important;border:1.5px solid rgba(16,185,129,0.45) !important;">
                    </td>
                    <td style="padding:10px 8px;text-align:center;">
                        <input type="number" min="0" max="300" class="subject-wrong-input" data-subject="${s}" value="${w}" title="Yanlış sayısı" style="width:72px;text-align:center;font-weight:700;color:var(--color-wrong,#ef4444) !important;background:rgba(239,68,68,0.1) !important;border:1.5px solid rgba(239,68,68,0.45) !important;">
                    </td>
                    <td style="padding:10px 8px;text-align:center;">
                        <input type="number" min="0" max="300" class="subject-blank-input" data-subject="${s}" value="${b}" title="Boş sayısı" style="width:72px;text-align:center;font-weight:700;color:var(--color-blank,#f59e0b) !important;background:rgba(245,158,11,0.1) !important;border:1.5px solid rgba(245,158,11,0.45) !important;">
                    </td>
                    <td style="padding:10px 8px;text-align:center;">
                        <input type="number" min="0" max="50" class="subject-cancelled-input" data-subject="${s}" value="${cancel}" placeholder="0" title="İptal / Hatalı soru sayısı (değerlendirme dışı tutulur)" style="width:65px;text-align:center;font-weight:600;color:var(--text-secondary,#94a3b8) !important;background:rgba(255,255,255,0.05) !important;border:1px solid rgba(255,255,255,0.18) !important;">
                    </td>
                    <td style="padding:10px 8px;text-align:right;">
                        <span class="subject-live-net" data-subject="${s}">${net.toFixed(2)} Net</span>
                    </td>
                </tr>
            `;
        });

        // Insert rows directly into tbody
        listContainer.innerHTML = rowsHtml;

        // Wire inputs for live synchronization & calculation
        listContainer.querySelectorAll('.subject-correct-row').forEach(row => {
            const subject = row.dataset.subject;
            const isCustom = row.dataset.isCustom === 'true';

            const totalInput = row.querySelector('.subject-total-input');
            const wrongInput = row.querySelector('.subject-wrong-input');
            const blankInput = row.querySelector('.subject-blank-input');
            const cancelInput = row.querySelector('.subject-cancelled-input');
            const correctInput = row.querySelector('.subject-correct-input');
            const netSpan = row.querySelector(`.subject-live-net[data-subject="${subject}"]`);

            const updateRow = (changedSource) => {
                let curTotal = Math.max(0, parseInt(totalInput.value, 10) || 0);
                let curWrong = wrongInput ? Math.max(0, parseInt(wrongInput.value, 10) || 0) : 0;
                let curBlank = blankInput ? Math.max(0, parseInt(blankInput.value, 10) || 0) : 0;
                let curCancel = cancelInput ? Math.max(0, parseInt(cancelInput.value, 10) || 0) : 0;
                let curCorrect = correctInput ? Math.max(0, parseInt(correctInput.value, 10) || 0) : 0;

                // Update data attributes
                if (wrongInput) row.dataset.wrong = curWrong;
                if (blankInput) row.dataset.blank = curBlank;

                if (changedSource === 'total' || changedSource === 'cancelled' || changedSource === 'wrong' || changedSource === 'blank') {
                    // Auto-calculate correct count based on total, cancelled, wrong, blank
                    curCorrect = Math.max(0, curTotal - curCancel - curWrong - curBlank);
                    correctInput.value = curCorrect;
                    row.dataset.hasCustomCorrect = 'false';
                    if (changedSource === 'total') row.dataset.hasCustomTotal = 'true';
                } else if (changedSource === 'correct') {
                    row.dataset.hasCustomCorrect = 'true';
                    // If user manually changed correct count above remaining, sync total count
                    if (curCorrect + curCancel + curWrong + curBlank > curTotal) {
                        curTotal = curCorrect + curCancel + curWrong + curBlank;
                        totalInput.value = curTotal;
                        row.dataset.hasCustomTotal = 'true';
                    }
                }

                const rowNet = Math.max(0, curCorrect - (curWrong * penaltyRatio));
                if (netSpan) {
                    netSpan.textContent = `${rowNet.toFixed(2)} Net`;
                }

                this.calculateLiveSubjectSummary();
            };

            if (totalInput) totalInput.oninput = () => updateRow('total');
            if (wrongInput) wrongInput.oninput = () => updateRow('wrong');
            if (blankInput) blankInput.oninput = () => updateRow('blank');
            if (cancelInput) cancelInput.oninput = () => updateRow('cancelled');
            if (correctInput) correctInput.oninput = () => updateRow('correct');
        });

        // Wire footer buttons
        const addBtn = document.getElementById('addCustomSubjectBtn');
        if (addBtn) addBtn.onclick = () => this.addCustomSubjectRow();

        const saveBtn = document.getElementById('saveSubjectCorrectBtn');
        if (saveBtn) saveBtn.onclick = () => this.saveSubjectCorrectCounts();

        const cancelBtn = document.getElementById('cancelSubjectCorrectBtn');
        if (cancelBtn) cancelBtn.onclick = () => this.toggleCorrectCountForm(false);

        const customInput = document.getElementById('addCustomSubjectInput');
        if (customInput) {
            customInput.onkeydown = (e) => {
                if (e.key === 'Enter') this.addCustomSubjectRow();
            };
        }

        this.calculateLiveSubjectSummary();
    }

    calculateLiveSubjectSummary() {
        if (!this.currentAnalysis) return;
        const penaltyRatio = window.app ? window.app.getPenaltyRatio() : 0.25;

        let totalQuestions = 0;
        let totalCorrect = 0;
        let totalWrong = 0;
        let totalBlank = 0;
        let totalCancelled = 0;

        document.querySelectorAll('.subject-correct-row').forEach(row => {
            const subject = row.dataset.subject;

            const totalInput = row.querySelector('.subject-total-input');
            const wrongInput = row.querySelector('.subject-wrong-input');
            const blankInput = row.querySelector('.subject-blank-input');
            const cancelInput = row.querySelector('.subject-cancelled-input');
            const correctInput = row.querySelector('.subject-correct-input');

            const total = totalInput ? Math.max(0, parseInt(totalInput.value, 10) || 0) : 0;
            const wrong = wrongInput ? Math.max(0, parseInt(wrongInput.value, 10) || 0) : parseInt(row.dataset.wrong, 10) || 0;
            const blank = blankInput ? Math.max(0, parseInt(blankInput.value, 10) || 0) : parseInt(row.dataset.blank, 10) || 0;
            const cancel = cancelInput ? Math.max(0, parseInt(cancelInput.value, 10) || 0) : 0;
            const correct = correctInput ? Math.max(0, parseInt(correctInput.value, 10) || 0) : 0;

            const net = Math.max(0, correct - (wrong * penaltyRatio));
            const liveNetSpan = row.querySelector(`.subject-live-net[data-subject="${subject}"]`);
            if (liveNetSpan) {
                liveNetSpan.textContent = `${net.toFixed(2)} Net`;
            }

            totalQuestions += total;
            totalCorrect += correct;
            totalWrong += wrong;
            totalBlank += blank;
            totalCancelled += cancel;
        });

        const overallNet = window.app ? window.app.calculateNet(totalCorrect, totalWrong) : Math.max(0, totalCorrect - (totalWrong * penaltyRatio));

        const subTotalQuestionsEl = document.getElementById('subTotalQuestions');
        const subCorrectEl = document.getElementById('subTotalCorrect');
        const subWrongEl = document.getElementById('subTotalWrong');
        const subBlankEl = document.getElementById('subTotalBlank');
        const subCancelledEl = document.getElementById('subTotalCancelled');
        const subCancelledBox = document.getElementById('subTotalCancelledBox');
        const subNetEl = document.getElementById('subTotalNet');

        if (subTotalQuestionsEl) subTotalQuestionsEl.textContent = totalQuestions;
        if (subCorrectEl) subCorrectEl.textContent = totalCorrect;
        if (subWrongEl) subWrongEl.textContent = totalWrong;
        if (subBlankEl) subBlankEl.textContent = totalBlank;
        if (subCancelledEl) subCancelledEl.textContent = totalCancelled;
        if (subCancelledBox) subCancelledBox.style.display = totalCancelled > 0 ? 'inline-block' : 'none';
        if (subNetEl) subNetEl.textContent = overallNet.toFixed(2);
    }

    addCustomSubjectRow() {
        const input = document.getElementById('addCustomSubjectInput');
        if (!input) return;
        const val = (input.value || '').trim();
        if (!val) return;

        if (!this.currentAnalysis.subjectBreakdown) {
            this.currentAnalysis.subjectBreakdown = {};
        }

        if (!this.currentAnalysis.subjectBreakdown[val]) {
            const currentExam = (this.currentAnalysis.exam || this.selectedExam || 'TYT').toUpperCase();
            const defaultTotal = this.getDefaultQuestionCount(currentExam, val);
            this.currentAnalysis.subjectBreakdown[val] = {
                total: defaultTotal,
                correct: defaultTotal,
                wrong: 0,
                blank: 0,
                cancelled: 0,
                net: defaultTotal,
                hasCustomCount: true
            };
        }

        input.value = '';
        this.renderSubjectCorrectInputs();
        if (window.app) window.app.showToast(`"${val}" dersi eklendi`, 'info');
    }

    removeCustomSubject(subject) {
        if (!this.currentAnalysis || !this.currentAnalysis.subjectBreakdown) return;

        // Confirm deletion
        if (window.app) {
            window.app.showConfirmModal(
                'Dersi Sil',
                `"${subject}" dersini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
                () => {
                    delete this.currentAnalysis.subjectBreakdown[subject];
                    this.renderSubjectCorrectInputs();
                    if (window.app) window.app.showToast(`"${subject}" dersi silindi`, 'success');
                }
            );
        } else {
            // Fallback if app not available
            if (confirm(`"${subject}" dersini silmek istediğinize emin misiniz?`)) {
                delete this.currentAnalysis.subjectBreakdown[subject];
                this.renderSubjectCorrectInputs();
            }
        }
    }

    sortSubjectsByExam(subjects, exam) {
        const e = (exam || '').toUpperCase();
        const orderMap = {
            'TYT': ['Türkçe', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji'],
            'AYT-SÖZEL': ['Türk Dili ve Edebiyatı', 'Edebiyat', 'Tarih-1', 'Tarih', 'Coğrafya-1', 'Coğrafya', 'Tarih-2', 'Coğrafya-2', 'Felsefe', 'Din Kültürü'],
            'AYT-EA': ['Türk Dili ve Edebiyatı', 'Edebiyat', 'Tarih-1', 'Tarih', 'Coğrafya-1', 'Coğrafya', 'Matematik', 'Geometri'],
            'AYT-SAYISAL': ['Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji'],
            'AYT': ['Türk Dili ve Edebiyatı', 'Edebiyat', 'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü']
        };

        const orderKey = e.startsWith('AYT-') ? e : (e === 'AYT' && this.aytSubfield ? `AYT-${this.aytSubfield}` : (orderMap[e] ? e : 'TYT'));
        const order = orderMap[orderKey] || orderMap['TYT'];

        // Önce sıralamadaki dersler
        const sorted = [];
        order.forEach(subj => {
            if (subjects.includes(subj) && !sorted.includes(subj)) {
                sorted.push(subj);
            }
        });

        // Sonra sıralamada olmayanlar (custom dersler)
        subjects.forEach(subj => {
            if (!sorted.includes(subj)) {
                sorted.push(subj);
            }
        });

        return sorted;
    }

    saveSubjectCorrectCounts() {
        if (!this.currentAnalysis) return;

        const breakdown = {};
        let totalQuestions = 0;
        let totalCorrect = 0;
        let totalWrong = 0;
        let totalBlank = 0;
        let totalCancelled = 0;

        document.querySelectorAll('.subject-correct-row').forEach(row => {
            const subject = row.dataset.subject;

            const totalInput = row.querySelector('.subject-total-input');
            const wrongInput = row.querySelector('.subject-wrong-input');
            const blankInput = row.querySelector('.subject-blank-input');
            const cancelInput = row.querySelector('.subject-cancelled-input');
            const correctInput = row.querySelector('.subject-correct-input');

            const wrong = wrongInput ? Math.max(0, parseInt(wrongInput.value, 10) || 0) : 0;
            const blank = blankInput ? Math.max(0, parseInt(blankInput.value, 10) || 0) : 0;
            const cancel = cancelInput ? Math.max(0, parseInt(cancelInput.value, 10) || 0) : 0;
            let total = totalInput ? Math.max(0, parseInt(totalInput.value, 10) || 0) : (wrong + blank + cancel);
            let correct = correctInput ? Math.max(0, parseInt(correctInput.value, 10) || 0) : 0;

            if (total < correct + wrong + blank + cancel) {
                total = correct + wrong + blank + cancel;
            }

            const net = window.app ? window.app.calculateNet(correct, wrong) : Math.max(0, correct - (wrong * 0.25));

            breakdown[subject] = {
                total,
                correct,
                wrong,
                blank,
                cancelled: cancel,
                net,
                hasCustomCount: true,
                hasCustomTotal: row.dataset.hasCustomTotal === 'true',
                hasCustomCorrect: row.dataset.hasCustomCorrect === 'true'
            };

            totalQuestions += total;
            totalCorrect += correct;
            totalWrong += wrong;
            totalBlank += blank;
            totalCancelled += cancel;
        });

        const overallNet = window.app ? window.app.calculateNet(totalCorrect, totalWrong) : Math.max(0, totalCorrect - (totalWrong * 0.25));
        const validQuestions = Math.max(0, totalQuestions - totalCancelled);
        const score = validQuestions > 0 ? Math.round((totalCorrect / validQuestions) * 100) : 0;

        this.currentAnalysis.correctCount = totalCorrect;
        this.currentAnalysis.wrongCount = totalWrong;
        this.currentAnalysis.blankCount = totalBlank;
        this.currentAnalysis.cancelledCount = totalCancelled;
        this.currentAnalysis.totalQuestions = totalQuestions;
        this.currentAnalysis.score = score;
        this.currentAnalysis.net = overallNet;
        this.currentAnalysis.subjectBreakdown = breakdown;

        // Persist update in app & IndexedDB
        if (window.app) {
            const idx = window.app.analyses.findIndex(a => a.id === this.currentAnalysis.id);
            if (idx !== -1) {
                window.app.analyses[idx] = this.currentAnalysis;
            }
            if (window.app.db) {
                window.app.saveAnalysisToIndexedDB(this.currentAnalysis).catch(e => console.warn('IndexedDB save failed:', e));
            }
            window.app.saveAnalyses();
            window.app.updateDashboard();
            window.app.renderRecentAnalyses();
            window.app.renderResultsHistory();
            if (window.app.currentPage === 'report') {
                window.app.renderStudyReport();
            }
            window.app.showToast(`✅ Ders doğruları ve netler başarıyla kaydedildi! Toplam Net: ${overallNet.toFixed(2)}`, 'success');
        }

        this.toggleCorrectCountForm(false);
        this.renderResultsWorkspace();
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
}

// Wait for app to be ready before initializing
function initManualAnalyzer() {
    if (window.app) {
        window.manualAnalyzer = new ManualAnalyzer();
        console.log('✅ ManualAnalyzer initialized');
    } else {
        console.warn('⏱️ Waiting for app to load...');
        setTimeout(initManualAnalyzer, 100);
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initManualAnalyzer);
} else {
    initManualAnalyzer();
}
