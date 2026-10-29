#!/bin/bash
cd "$(dirname "$0")/app" || exit 1

echo "=============================================="
echo "           DENEMELAB MAC BASLATICISI          "
echo "=============================================="
echo ""

# Python 3 kontrolü
if command -v python3 &>/dev/null; then
    echo "[✓] Python 3 bulundu, yerel sunucu başlatılıyor..."
    echo "[✓] Tarayıcınız açılıyor: http://localhost:8000"
    echo ""
    echo "(Uygulama çalışırken bu Terminal penceresini kapatmayın)"
    echo ""
    sleep 1
    open "http://localhost:8000"
    python3 -m http.server 8000
elif command -v python &>/dev/null; then
    echo "[✓] Python bulundu, yerel sunucu başlatılıyor..."
    echo "[✓] Tarayıcınız açılıyor: http://localhost:8000"
    echo ""
    sleep 1
    open "http://localhost:8000"
    python -m SimpleHTTPServer 8000
else
    echo "[i] Python bulunamadı, index.html doğrudan tarayıcınızda açılıyor..."
    open "index.html"
fi

