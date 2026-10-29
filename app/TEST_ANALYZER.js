// Deneme Lab - Analyzer Test Script
// Bu scripti tarayıcı console'da çalıştırarak analyzer durumunu kontrol edebilirsiniz

console.log('🔍 Deneme Lab Analyzer Diagnostic');
console.log('================================');

// 1. Analyzer instance kontrolü
console.log('\n1️⃣ Analyzer Instance:');
if (window.analyzer) {
    console.log('✅ window.analyzer exists');
} else {
    console.log('❌ window.analyzer NOT FOUND');
}

// 2. Current page kontrolü
console.log('\n2️⃣ Current Page:');
if (window.app) {
    console.log('Current page:', window.app.currentPage);
    if (window.app.currentPage === 'ai-analysis') {
        console.log('✅ On AI Analysis page');
    } else {
        console.log('⚠️ Not on AI Analysis page');
    }
} else {
    console.log('❌ window.app NOT FOUND');
}

// 3. Upload zone element kontrolü
console.log('\n3️⃣ Upload Zone Elements:');
const uploadZoneAi = document.getElementById('uploadZoneAi');
const uploadZone = document.getElementById('uploadZone');
const uploadZoneViaGetEl = window.analyzer?.getEl('uploadZone');

console.log('uploadZoneAi:', uploadZoneAi ? '✅ Found' : '❌ Not found');
console.log('uploadZone:', uploadZone ? '✅ Found' : '❌ Not found');
console.log('analyzer.getEl("uploadZone"):', uploadZoneViaGetEl ? '✅ Found' : '❌ Not found');

if (uploadZoneViaGetEl) {
    console.log('  - classList:', uploadZoneViaGetEl.classList ? '✅ OK' : '❌ NULL');
    console.log('  - parentElement:', uploadZoneViaGetEl.parentElement ? '✅ OK' : '❌ NULL');
}

// 4. File input kontrolü
console.log('\n4️⃣ File Input:');
const fileInputAi = document.getElementById('fileInputAi');
const fileInput = document.getElementById('fileInput');
console.log('fileInputAi:', fileInputAi ? '✅ Found' : '❌ Not found');
console.log('fileInput:', fileInput ? '✅ Found' : '❌ Not found');

// 5. Cache durumu
console.log('\n5️⃣ Browser Cache:');
console.log('⚠️ If you see errors, try:');
console.log('   - Hard refresh: Ctrl+Shift+R');
console.log('   - Or: F12 → Application → Clear storage');

console.log('\n================================');
console.log('✅ Diagnostic complete!');
