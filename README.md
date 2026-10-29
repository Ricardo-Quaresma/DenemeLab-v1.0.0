# 🔬 DenemeLab — Sınav ve Deneme Analizi

> [!WARNING]
> **Önemli Not:** Uygulama içerisindeki **Yapay Zeka Destekli Analiz** sistemi şu anda deneysel aşamada olup düzgün çalışmamaktadır / geliştirilme aşamasındadır. Deneme ve sınav analizlerinizi, soru kırpma ve net takiplerinizi sorunsuz gerçekleştirmek için lütfen **Manuel Analiz** modunu kullanınız.

DenemeLab; TYT, AYT, LGS, ALES, KPSS ve MSÜ sınavlarına hazırlanan öğrenciler için tasarlanmış modern, çevrimdışı ve gelişmiş bir deneme analiz ve net takip platformudur.

---

## 🚀 Hızlı Başlangıç

### 🪟 Windows Kullanıcıları İçin:
* **`DenemeLab_Baslat.bat`** dosyasına çift tıklayın. Uygulama otomatik olarak yerel sunucuyla varsayılan tarayıcınızda açılır.
* Dilerseniz **`Masaüstüne Kısayol Oluştur.bat`** dosyasına tıklayarak masaüstünüze hızlı erişim simgesi ekleyebilirsiniz.

> [!TIP]
> **Windows için Python / Kurulum Uyarısı:**
> Başlatıcı script arka planda yerel bir web sunucusu çalıştırmak için **Python** kullanmayı dener.
> * Eğer bilgisayarınızda Python yüklü değilse, Windows Microsoft Store veya terminal üzerinden Python yükleme önerisinde bulunabilir.
> * **Python yüklemek zorunlu değildir:** İptal edip kapatsanız dahi başlatıcı uygulama arayüzünü doğrudan varsayılan tarayıcınızda açacaktır.
> * Daha hızlı açılış ve yerel sunucu deneyimi isterseniz resmi adresten Python'ı kurabilirsiniz: [python.org/downloads](https://www.python.org/downloads/) *(Kurulumda "Add python.exe to PATH" kutucuğunu işaretlemeyi unutmayın).*

---

### 🍎 Mac (macOS) Kullanıcıları İçin:
* **`DenemeLab_Mac_Baslat.command`** dosyasına çift tıklayın. Tarayıcınızda otomatik olarak açılacaktır.

> [!TIP]
> **Mac için Python / Xcode Geliştirici Araçları Uyarısı:**
> macOS, `.command` dosyasını çalıştırdığında sistemde Python veya komut satırı araçları yoksa ekranda:
> `“python3” komutunu kullanabilmek için Xcode komut satırı geliştirici araçları gerekiyor. Araçları şimdi yüklemek ister misiniz?` şeklinde bir açılır pencere çıkarabilir.
> * **Yüklemek İsterseniz:** "Yükle" butonuna basarak macOS'un kendi resmi araçlarını yüklemesine izin verebilirsiniz.
> * **Yüklemek İstemiyorsanız:** Pencereyi "Vazgeç" diyerek kapatabilir ve hiçbir kurulum yapmadan doğrudan `app/index.html` dosyasına çift tıklayarak uygulamayı Safari veya Chrome ile anında kullanabilirsiniz.

> [!NOTE]
> **Mac'te "Erişim ayrıcalıklarına sahip değilsiniz" Uyarısı:**
> macOS güvenlik kuralları gereği indirilen betiklere ilk seferde çalıştırma izni verilmesi gerekebilir:
> 1. Mac'inizde **Terminal** uygulamasını açın.
> 2. `chmod +x ` yazın (sonunda bir boşluk bırakın, Enter'a basmayın).
> 3. **`DenemeLab_Mac_Baslat.command`** dosyasını farenizle sürükleyip Terminal penceresinin içine bırakın ve **Enter**'a basın.
> 4. Artık dosyaya çift tıklayarak sorunsuz başlatabilirsiniz!

---

## 🌟 Öne Çıkan Özellikler

* **✂️ Soru Kırpma & Analiz:** PDF veya görsel formatındaki deneme sınavlarını yükleyin; soruları tek tıkla kırpıp ders, konu ve hata sebepleriyle kaydedin.
* **🎨 Gelişmiş Çizim Modu:** Sorular üzerinde kalem, fosforlu kalem, şekiller (üçgen, ok, dikdörtgen, daire) ve silgilerle serbestçe çözümler yapın. Çizimler doğrudan soruya işlenir.
* **📊 Net ve Başarı Grafikleri:** Sınav türüne ve derslere göre filtrelenebilir net grafikleri, ortalama netler, doğru-yanlış-boş oranları.
* **📚 Tekrar Havuzu:** Yanlış yapılan ve boş bırakılan sorular otomatik olarak tekrar havuzuna aktarılır. Unutma eğrisine göre aralıklı tekrar seanslarıyla eksiklerinizi kapatın.
* **📄 Performans Raporu:** Konu bazlı analiz ve çalışma çıktısını dilediğiniz zaman tek tıkla indirin.
* **🔒 %100 Yerel ve Güvenli:** Tüm verileriniz tamamen kendi bilgisayarınızda (IndexedDB / Yerel Depolama) saklanır; internet bağlantısına ihtiyaç duymaz.

---

## 📁 Klasör Yapısı

* **`app/`**: Uygulamanın tüm web motoru, arayüzü ve çalışma kodları.
* **`belgeler/`**: Detaylı kullanım notları ve rehberler.
* **`DenemeLab_Baslat.bat`**: Windows için tek tıkla başlatıcı.
* **`DenemeLab_Mac_Baslat.command`**: Mac (macOS) için tek tıkla başlatıcı.
* **`Masaüstüne Kısayol Oluştur.bat`**: Windows masaüstü simge oluşturucu.
