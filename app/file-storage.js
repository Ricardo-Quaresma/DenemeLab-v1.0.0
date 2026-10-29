/* ===================================================
   Deneme Lab — File System Storage Manager
   Manages file storage using File System Access API
   =================================================== */

class FileStorageManager {
    constructor() {
        this.directoryHandle = null;
        
        // Check if showDirectoryPicker exists (multiple checks for compatibility)
        const hasAPI = 'showDirectoryPicker' in window;
        const isFunctionType = typeof window.showDirectoryPicker === 'function';
        const hasSecureContext = window.isSecureContext;
        
        this.isSupported = hasAPI && isFunctionType && hasSecureContext;
        this.defaultFolderName = 'Deneme_Lab';
        this.storageKey = 'testai_directory_handle';
        
        console.log('FileStorageManager initialized:', {
            hasShowDirectoryPicker: hasAPI,
            isFunction: isFunctionType,
            isSecureContext: hasSecureContext,
            isSupported: this.isSupported,
            defaultFolder: this.defaultFolderName,
            protocol: window.location.protocol,
            userAgent: navigator.userAgent.substring(0, 100)
        });
        
        // Initialize on load
        this.init();
    }

    async init() {
        // Double-check support
        const hasAPI = 'showDirectoryPicker' in window;
        const isFunctionType = typeof window.showDirectoryPicker === 'function';
        const hasSecureContext = window.isSecureContext;
        
        this.isSupported = hasAPI && isFunctionType && hasSecureContext;
        
        if (!this.isSupported) {
            console.info('File System Access API not available');
            console.info('Checks:', {
                hasAPI,
                isFunctionType,
                hasSecureContext,
                protocol: window.location.protocol
            });
            
            if (!hasSecureContext) {
                console.warn('⚠️ File System Access API requires HTTPS or localhost');
            }
            return;
        }

        // Try to restore previous directory handle
        try {
            const storedHandle = await this.restoreDirectoryHandle();
            if (storedHandle) {
                this.directoryHandle = storedHandle;
                console.log('✅ Directory handle restored:', storedHandle.name);
            }
        } catch (err) {
            console.log('No previous directory or permission revoked');
        }
    }

    // Check if directory is set up
    isConfigured() {
        return this.directoryHandle !== null;
    }

    // Alias for selectStorageDirectory
    async selectDirectory() {
        return await this.selectStorageDirectory();
    }

    // Prompt user to select storage directory
    async selectStorageDirectory() {
        if (!this.isSupported) {
            throw new Error('File System Access API desteklenmiyor. Chrome/Edge/Brave kullanın.');
        }

        try {
            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            // Store handle for future use (IndexedDB)
            await this.saveDirectoryHandle(this.directoryHandle);
            
            // Create initial folder structure
            await this.setupFolderStructure();
            
            return this.directoryHandle;
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Klasör seçimi iptal edildi');
            }
            throw err;
        }
    }

    // Save directory handle to IndexedDB (persists across sessions)
    async saveDirectoryHandle(handle) {
        try {
            const db = await this.openHandleDB();
            const tx = db.transaction('handles', 'readwrite');
            const store = tx.objectStore('handles');
            store.put({ key: 'directory', handle: handle });
            
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => {
                    console.log('✅ Directory handle saved to IndexedDB');
                    this.db = db; // Store reference
                    resolve();
                };
                tx.onerror = () => reject(tx.error);
            });
        } catch (err) {
            console.error('Failed to save directory handle:', err);
            throw err;
        }
    }

    // Restore directory handle from IndexedDB
    async restoreDirectoryHandle() {
        try {
            const db = await this.openHandleDB();
            const tx = db.transaction('handles', 'readonly');
            const store = tx.objectStore('handles');
            
            return new Promise((resolve, reject) => {
                const request = store.get('directory');
                
                request.onsuccess = async () => {
                    const result = request.result;
                    
                    if (result && result.handle) {
                        try {
                            // Verify permission
                            const permission = await result.handle.queryPermission({ mode: 'readwrite' });
                            if (permission === 'granted') {
                                console.log('✅ Directory handle restored with permission');
                                this.db = db; // Store reference
                                resolve(result.handle);
                                return;
                            }
                            
                            // Request permission if not granted
                            const newPermission = await result.handle.requestPermission({ mode: 'readwrite' });
                            if (newPermission === 'granted') {
                                console.log('✅ Directory handle restored after permission request');
                                this.db = db; // Store reference
                                resolve(result.handle);
                                return;
                            }
                        } catch (err) {
                            console.warn('Permission check failed:', err);
                        }
                    }
                    resolve(null);
                };
                
                request.onerror = () => {
                    console.error('Failed to get handle from IndexedDB');
                    resolve(null);
                };
            });
        } catch (err) {
            console.error('Failed to restore directory handle:', err);
            return null;
        }
    }

    // Open IndexedDB for storing handles
    openHandleDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('Deneme Lab_Handles', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('handles')) {
                    db.createObjectStore('handles', { keyPath: 'key' });
                }
            };
        });
    }

    // Setup folder structure
    async setupFolderStructure() {
        if (!this.directoryHandle) return;

        try {
            await this.directoryHandle.getDirectoryHandle('originals', { create: true });
            await this.directoryHandle.getDirectoryHandle('analyses', { create: true });
            await this.directoryHandle.getDirectoryHandle('backups', { create: true });
            console.log('✅ Folder structure created');
        } catch (err) {
            console.error('Failed to create folder structure:', err);
        }
    }

    // Save original file (PDF or image)
    async saveOriginalFile(file, analysisId) {
        if (!this.directoryHandle) {
            throw new Error('Depolama klasörü seçilmedi');
        }

        try {
            const originalsDir = await this.directoryHandle.getDirectoryHandle('originals', { create: true });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const extension = file.name.split('.').pop();
            const fileName = `${analysisId}_${timestamp}.${extension}`;
            
            const fileHandle = await originalsDir.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file);
            await writable.close();
            
            console.log(`✅ Original file saved: ${fileName}`);
            return fileName;
        } catch (err) {
            console.error('Failed to save original file:', err);
            throw err;
        }
    }

    // Save analysis data (metadata + images)
    async saveAnalysis(analysisId, metadata, pages, questions) {
        if (!this.directoryHandle) {
            throw new Error('Depolama klasörü seçilmedi');
        }

        try {
            const analysesDir = await this.directoryHandle.getDirectoryHandle('analyses', { create: true });
            const analysisDir = await analysesDir.getDirectoryHandle(analysisId, { create: true });

            // Save metadata
            const metadataFile = await analysisDir.getFileHandle('metadata.json', { create: true });
            const metadataWritable = await metadataFile.createWritable();
            await metadataWritable.write(JSON.stringify(metadata, null, 2));
            await metadataWritable.close();

            // Save pages (original pages - PNG for lossless)
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const blob = await this.dataURLToBlob(page.data);
                const pageFile = await analysisDir.getFileHandle(`page_${i + 1}.png`, { create: true });
                const pageWritable = await pageFile.createWritable();
                await pageWritable.write(blob);
                await pageWritable.close();
            }

            // Save questions (PNG for maximum quality)
            for (let i = 0; i < questions.length; i++) {
                const question = questions[i];
                if (question.image) {
                    const blob = await this.dataURLToBlob(question.image);
                    const qFile = await analysisDir.getFileHandle(`question_${i + 1}.png`, { create: true });
                    const qWritable = await qFile.createWritable();
                    await qWritable.write(blob);
                    await qWritable.close();
                }
            }

            console.log(`✅ Analysis saved: ${analysisId}`);
            return true;
        } catch (err) {
            console.error('Failed to save analysis:', err);
            throw err;
        }
    }

    // Update question image (for drawing mode)
    async updateQuestionImage(analysisId, questionIndex, imageDataURL) {
        if (!this.directoryHandle) return;

        try {
            const analysesDir = await this.directoryHandle.getDirectoryHandle('analyses');
            const analysisDir = await analysesDir.getDirectoryHandle(analysisId);
            
            const blob = await this.dataURLToBlob(imageDataURL);
            const qFile = await analysisDir.getFileHandle(`question_${questionIndex + 1}.png`, { create: true });
            const qWritable = await qFile.createWritable();
            await qWritable.write(blob);
            await qWritable.close();
            
            console.log(`✅ Question ${questionIndex + 1} updated`);
        } catch (err) {
            console.error('Failed to update question image:', err);
        }
    }

    // Load analysis from file system
    async loadAnalysis(analysisId) {
        if (!this.directoryHandle) return null;

        try {
            const analysesDir = await this.directoryHandle.getDirectoryHandle('analyses');
            const analysisDir = await analysesDir.getDirectoryHandle(analysisId);

            // Load metadata
            const metadataFile = await analysisDir.getFileHandle('metadata.json');
            const metadataBlob = await metadataFile.getFile();
            const metadataText = await metadataBlob.text();
            const metadata = JSON.parse(metadataText);

            // Load pages
            const pages = [];
            let pageIndex = 1;
            while (true) {
                try {
                    const pageFile = await analysisDir.getFileHandle(`page_${pageIndex}.png`);
                    const pageBlob = await pageFile.getFile();
                    const pageDataURL = await this.blobToDataURL(pageBlob);
                    pages.push(pageDataURL);
                    pageIndex++;
                } catch {
                    break; // No more pages
                }
            }

            // Load questions
            const questions = [];
            let qIndex = 1;
            while (true) {
                try {
                    const qFile = await analysisDir.getFileHandle(`question_${qIndex}.png`);
                    const qBlob = await qFile.getFile();
                    const qDataURL = await this.blobToDataURL(qBlob);
                    questions.push(qDataURL);
                    qIndex++;
                } catch {
                    break; // No more questions
                }
            }

            return {
                metadata,
                pages,
                questions
            };
        } catch (err) {
            console.error('Failed to load analysis:', err);
            return null;
        }
    }

    // Load all analyses metadata
    async loadAllAnalysesMetadata() {
        if (!this.directoryHandle) return [];

        try {
            const analysesDir = await this.directoryHandle.getDirectoryHandle('analyses');
            const analyses = [];

            for await (const entry of analysesDir.values()) {
                if (entry.kind === 'directory') {
                    try {
                        const metadataFile = await entry.getFileHandle('metadata.json');
                        const metadataBlob = await metadataFile.getFile();
                        const metadataText = await metadataBlob.text();
                        const metadata = JSON.parse(metadataText);
                        analyses.push(metadata);
                    } catch (err) {
                        console.warn(`Failed to load metadata for ${entry.name}`);
                    }
                }
            }

            return analyses;
        } catch (err) {
            console.error('Failed to load analyses:', err);
            return [];
        }
    }

    // Delete analysis from file system
    async deleteAnalysis(analysisId) {
        if (!this.directoryHandle) return;

        try {
            const analysesDir = await this.directoryHandle.getDirectoryHandle('analyses', { create: false });
            await analysesDir.removeEntry(analysisId, { recursive: true });
            console.log(`✅ Analysis deleted: ${analysisId}`);
        } catch (err) {
            // Ignore NotFoundError (already deleted)
            if (err.name === 'NotFoundError') {
                console.log(`ℹ️ Analysis folder not found (already deleted): ${analysisId}`);
                return;
            }
            console.error('Failed to delete analysis:', err);
        }
    }

    // Create automatic backup
    async createBackup() {
        if (!this.directoryHandle) return;

        try {
            const backupsDir = await this.directoryHandle.getDirectoryHandle('backups', { create: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const backupFile = await backupsDir.getFileHandle(`backup_${timestamp}.json`, { create: true });
            
            // Get all analyses metadata
            const analyses = await this.loadAllAnalysesMetadata();
            
            const backupData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                analyses: analyses
            };
            
            const writable = await backupFile.createWritable();
            await writable.write(JSON.stringify(backupData, null, 2));
            await writable.close();
            
            console.log(`✅ Backup created: backup_${timestamp}.json`);
        } catch (err) {
            console.error('Failed to create backup:', err);
        }
    }

    // Helper: Convert data URL to Blob
    async dataURLToBlob(dataURL) {
        const response = await fetch(dataURL);
        return await response.blob();
    }

    // Helper: Convert Blob to data URL
    blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Get storage info
    async getStorageInfo() {
        if (!this.directoryHandle) {
            return {
                path: 'Deneme_Lab (Proje Klasörü)',
                totalAnalyses: (window.app?.analyses?.length) || 0,
                totalFiles: 0,
                isDefaultPending: true
            };
        }

        try {
            const analysesDir = await this.directoryHandle.getDirectoryHandle('analyses');
            let totalAnalyses = 0;
            let totalFiles = 0;

            for await (const entry of analysesDir.values()) {
                if (entry.kind === 'directory') {
                    totalAnalyses++;
                    for await (const file of entry.values()) {
                        if (file.kind === 'file') {
                            totalFiles++;
                        }
                    }
                }
            }

            return {
                path: this.directoryHandle.name,
                totalAnalyses,
                totalFiles,
                isConfigured: true
            };
        } catch (err) {
            console.error('Failed to get storage info:', err);
            return {
                path: this.directoryHandle?.name || 'Deneme_Lab (Proje Klasörü)',
                totalAnalyses: (window.app?.analyses?.length) || 0,
                totalFiles: 0
            };
        }
    }
}

// Global instance
window.fileStorage = new FileStorageManager();
