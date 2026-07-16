# İngilizce Çeviri ve Kitap Okuma Platformu - Proje Dökümanı

## 1. Proje Özeti

Bu proje, kullanıcıların İngilizce kitapları okurken cümle ve kelime bazında anlık çeviri alabildiği, okuma alışkanlıklarını takip edebildiği, gruplar halinde sosyal öğrenme deneyimi yaşayabildiği bir dil öğrenme ve kitap okuma platformudur. Beelinguapp benzeri bir kullanım mantığı temel alınacak; ancak yapay zeka destekli çeviri, kamera ile metin tarama (OCR) ve grup yönetimi gibi ek özelliklerle zenginleştirilecektir.

**Teknoloji:** ASP.NET (Backend), mobil/tablet uyumlu arayüz (Frontend), yapay zeka destekli çeviri servisleri.

---

## 2. Temel Özellikler

### 2.1 Kitap Okuma Modülü
- Kitapların sisteme eklenmesi ve sayfa sayfa okunabilmesi.
- Akıcı, sade ve rahat bir okuma deneyimi (sayfa çevirme animasyonları, kaldığı yerden devam etme).
- Okuma ilerlemesinin otomatik kaydedilmesi (kaldığı yerden devam).

### 2.2 Çeviri Özellikleri
- **Kelime bazlı çeviri:** Bir kelimeye tıklandığında o kelimenin Türkçe karşılığı anında gösterilir.
- **Cümle bazlı çeviri:** Bir cümleye tıklandığında/basıldığında tüm cümlenin çevirisi gösterilir.
- Çeviriler yapay zeka tabanlı bir çeviri servisi (örn. AI destekli çeviri API'si) üzerinden yapılacaktır.
- Kullanım basit, hızlı ve karmaşık olmayan bir arayüzle sunulacaktır.

### 2.3 Kelime Listesi (Bilinmeyen Kelimeler)
- Kullanıcı, anlamadığı veya bilmediği kelimeleri tek tıkla "Bilinmeyen Kelimeler Listesi"ne ekleyebilir.
- Bu listeden kelimenin çevirisi ve Türkçe anlamı tekrar görüntülenebilir.
- İleride tekrar (flashcard tarzı) çalışma için temel oluşturur.

### 2.4 Otomatik Test/Quiz Oluşturma
- Sisteme eklenen her kitaptan yapay zeka aracılığıyla otomatik test ve quiz soruları üretilir.
- Kullanıcı, okuduğu bölümle ilgili quiz çözerek anlama seviyesini ölçebilir.

### 2.5 Kullanıcı ve Grup Yönetimi
- Kullanıcı kayıt/giriş (oturum açma) sistemi.
- Grup oluşturma özelliği (örn. öğretmen-öğrenci, arkadaş grupları).
- Grup yöneticisi (admin) rolü:
  - Grup üyelerine kitap atayabilir.
  - Üyelerin hangi kitabı ne kadar okuduğunu (ilerleme yüzdesi) görebilir.
  - Grup içi performans ve quiz sonuçlarını takip edebilir.

### 2.6 Kamera ile Metin Tarama (OCR + Çeviri)
- Kullanıcı, kamera ile bastığı/çektiği İngilizce metni uygulamaya aktarabilir.
- Görüntü işleme (OCR) ile metin dijital hale getirilir.
- Taranan metin de kelime kelime ve cümle cümle çevrilebilir.
- Taranan sayfalar kaydedilebilir, kullanıcı daha sonra bu kayıtlı sayfaları tekrar açıp okuyabilir.

### 2.7 Tasarım ve Kullanılabilirlik
- Mobil, tablet ve masaüstü (PC/laptop) tarayıcı uyumlu (responsive) tasarım.
- Sade, akıcı, minimal ve kullanıcı dostu arayüz.
- Öğrenme sürecini zorlaştırmayan, pratik ve hızlı etkileşimler.

---

## 3. Güvenlik (Kritik Öncelik)

Güvenlik bu projede opsiyonel değildir; tüm katmanlarda en yüksek öncelik olarak ele alınacaktır.

- Kullanıcı kimlik doğrulama işlemlerinde güçlü parola politikaları ve şifreleme (hashing) kullanılacaktır (örn. bcrypt/argon2 tabanlı yaklaşımlar).
- Oturum yönetimi güvenli token tabanlı (JWT vb.) yapılarla sağlanacaktır.
- Tüm API iletişimi HTTPS üzerinden şifrelenmiş şekilde yapılacaktır.
- Kullanıcı verileri (okuma geçmişi, kelime listeleri, quiz sonuçları) yetkisiz erişime karşı korunacaktır.
- Grup yönetimi özelliklerinde yetkilendirme (authorization) kontrolleri sıkı şekilde uygulanacak; sadece yetkili yöneticiler ilgili verilere erişebilecektir.
- Kamera/OCR ile yüklenen görsellerin güvenli depolanması ve gerekiyorsa kullanıcı onayına bağlı saklanması sağlanacaktır.
- Olası kötüye kullanım, SQL injection, XSS gibi saldırılara karşı ASP.NET tarafında standart güvenlik önlemleri (input validation, parametreli sorgular, CSRF koruması vb.) uygulanacaktır.
- Düzenli güvenlik testleri ve loglama/izleme mekanizmaları planlanacaktır.
- **Admin paneli, ayrı bir alan olduğu için ekstra güvenlik katmanına sahip olacaktır** (bkz. Bölüm 7 - Talepler).

---

## 4. Teknoloji Yaklaşımı (Genel Hatlarıyla)

- **Backend:** ASP.NET Core Web API (C#), tüm istemcilere (web, admin paneli, ileride mobil) tek merkezden hizmet verecek şekilde API-first mimari.
- **Veritabanı:** PostgreSQL (kurumsal standartlara uygun, ilişkisel veritabanı — kullanıcılar, kitaplar, gruplar, kelime listeleri, quiz verileri için).
- **Kimlik Doğrulama:** JWT Bearer Authentication + BCrypt tabanlı şifreleme.
- **Çeviri Servisi:** Yapay zeka / çeviri API entegrasyonu (kelime + cümle bazlı, paralel işlenen istekler).
- **OCR/Görüntü İşleme:** Kamera ile alınan metinlerin dijitalleştirilmesi için görüntü işleme servisi.
- **Web Frontend:** Next.js (React tabanlı) — API'yi tüketen, ayrı bir istemci uygulaması.
- **Mobil (ileride):** React Native — Next.js ile aynı paradigmayı (React/component mantığı) paylaştığı için web'den mobile geçiş kolaylaştırılmış olacaktır.
- **Admin Paneli:** Ana kullanıcı frontend'inden tamamen ayrı, bağımsız bir uygulama (bkz. Bölüm 7).

---

## 5. Notlar

- Bu döküman, projenin ilk aşama gereksinimlerini içermektedir; ilerleyen adımlarda detaylandırılacaktır.
- Sıradaki adımlarda: veritabanı şema tasarımı, ekran/sayfa akışları, API endpoint listesi gibi konular ele alınacaktır.

---

## 6. Yapılan Değişiklikler ve Güncellemeler (Changelog)

### [2026-07-07] - Admin Paneli, PDF Yükleme ve Docker Entegrasyonu
- **Admin JWT Güvenliği**: Admin tokenları 2 saatlik, normal kullanıcı tokenları 7 günlük süreyle sınırlandırıldı.
- **AdminController**: `/api/admin/` prefix'i altında tüm yönetici endpointleri (`[Authorize(Roles = "admin")]` korumalı) oluşturuldu.
- **Varsayılan Admin Seed**: `admin@platform.com` / `Admin@2026!` bilgileriyle otomatik seed admin kullanıcısı eklendi.
- **PDF Yükleme Servisi**: `PdfService.cs` — iTextSharp/PdfSharpCore ile PDF metin çıkarımı, 50MB limit, MIME türü doğrulama.
- **Ayrı Admin Paneli**: `admin-panel/` klasöründe tamamen bağımsız Next.js uygulaması (port 3001) — Login, Dashboard, Kitap Yönetimi, Kullanıcı Yönetimi sayfaları.
- **Docker Compose**: 5 servis (postgres, pgadmin, backend, frontend, admin) tek `docker-compose.yml` dosyasıyla yönetilir.
- **Dockerfile'lar**: Backend (ASP.NET Core), Frontend (Next.js) ve Admin Panel için multi-stage, non-root user güvenlikli Dockerfile'lar oluşturuldu.
- **faz-0-baslangic.md**: Lokal ve Docker çalıştırma talimatları, klasör yapısı ve yapılan/yapılmayan raporu yazıldı.

### [2026-07-07] - PostgreSQL Göçü ve Docker Kurulumları
- **Profesyonel Veritabanı Geçişi**: Projenin veritabanı SQLite'tan kurumsal standartlara uygun **PostgreSQL 15** sürümüne taşındı. Localde `englishreadingdb` oluşturuldu.
- **ASP.NET Core PostgreSQL Entegrasyonu**: C# tarafında SQLite paketi kaldırılıp yerine `Npgsql.EntityFrameworkCore.PostgreSQL` entegre edildi.
- **Konfigürasyon Güncellemeleri**: `Program.cs` üzerinde `opt.UseNpgsql` aktif edildi, `appsettings.json` üzerindeki bağlantı dizesi PostgreSQL uyumlu olacak şekilde düzenlendi.
- **EF Core Veri Göçü (Migration)**: Yeni veri tabanı için `InitialPostgresCreate` migrasyonu oluşturularak tüm şema ve başlangıç verileri başarıyla PostgreSQL'e aktarıldı.
- **Docker ve Docker-Compose**: Geliştirme ortamı için Docker CLI ve `docker-compose` araçları sisteme kuruldu ve yapılandırıldı.

### [2026-07-05] - C# ASP.NET Core Web API Göçü (Yeni Güncelleme)
- **.NET 8.0 SDK Entegre Edildi**: macOS üzerinde yönetici şifresi gerektirmeyen taşınabilir `.NET SDK` kurulumu `./dotnet_sdk` dizinine yerelleştirildi.
- **ASP.NET Core Web API Backend**: Node.js tabanlı eski backend silindi ve yerine ASP.NET Core (C#) projesi kuruldu.
- **Entity Framework Core (EF Core)**: Veritabanı işlemleri için EF Core SQLite sürücüsü (`Microsoft.EntityFrameworkCore.Sqlite`) entegre edildi.
- **Güvenlik & Yetkilendirme**: C# üzerinde JWT Bearer Authentication (`Microsoft.AspNetCore.Authentication.JwtBearer`) ve güvenli şifreleme (`BCrypt.Net-Next`) altyapısı uygulandı.
- **Interaktif Kontrolcüler (Controllers)**: `Auth`, `Books`, `Words`, `Groups`, `Translate` ve `Quizzes` API uç noktaları C# üzerinde asenkron olarak yeniden kodlandı.
- **Geriye Uyumlu API Tasarımı**: API endpoint yolları ve veri yapıları Node.js sürümü ile birebir aynı kalacak şekilde tasarlanarak React front-end ile tam uyumluluğu korundu.

### [2026-07-05] - İlk Sürüm ve Tam Entegrasyon
- **Proje Altyapısı Kuruldu**: Backend (Express, TypeScript, SQLite) ve Frontend (Vite, React, TS, modern cam arayüz tasarımı) klasör yapısı oluşturuldu.
- **Güvenlik & Auth Entegre Edildi**: Kullanıcılar için şifrelenmiş parola kaydı (bcryptjs) ve güvenli token tabanlı oturum açma sistemi (JWT) eklendi.
- **Kitap Okuma Modülü Tamamlandı**: Kelime ve cümle bazlı interaktif okuma, otomatik kaldığı sayfayı kaydetme ve TTS (sesli okuma) özellikleri eklendi.
- **Yapay Zeka Destekli Quiz Oluşturucu**: Okunan sayfanın içeriğine göre dinamik ve otomatik olarak çoktan seçmeli quiz hazırlayan modül entegre edildi.
- **Bilinmeyen Kelimeler Listesi (Flashcard)**: Okuma esnasında seçilen kelimeleri kaydedebileceğiniz ve daha sonra çevirilerini kartları döndürerek çalışabileceğiniz bir arayüz geliştirildi.
- **Kamera ile Metin Tarama (OCR)**: Fotoğraf yükleyerek içindeki İngilizce metinleri dijitalleştiren (Tesseract.js tabanlı) ve doğrudan okuyup çevirebileceğiniz OCR altyapısı eklendi.
- **Grup ve Sınıf Yönetimi**: Öğretmenlerin sınıf oluşturmasını, öğrencileri eklemesini, kitap atamasını ve öğrencilerin okuma yüzdeleri ile quiz performanslarını canlı takip etmesini sağlayan dashboard paneli tamamlandı.

### [2026-07-05] — Cümle Cümle Çeviri Sistemi Güncellendi
- **Google Translate API Entegrasyonu**: MyMemory yerine `translate.googleapis.com` (ücretsiz, key gerektirmez) kullanılmaya başlandı. Cümle çevirileri ve kelime çevirileri artık paralel olarak (`Task.WhenAll`) aynı anda işleniyor.
- **Cümle Cümle Okuma Modu**: Kitap okuma sayfasında her cümle ayrı bir blok olarak gösterilir. Her cümlenin altında "TÜRKÇE ÇEVİRİYİ GÖSTER / GİZLE" butonu bulunur — tıklanınca çeviri kayar şekilde açılır.
- **Kelime Türü Renk Kodlama**: Kelimelere göre renk sınıfı atandı: isim (mavi), fiil (yeşil), sıfat (sarı), zarf (mor), edat (pembe), bağlaç (turuncu), zamir (cyan). Alt çizgi rengi her kelimenin türünü gösterir.
- **Kelime Tooltip**: Kelimeye tıklandığında Türkçe karşılığı + kelime türü + sesli okuma butonu + kaydetme butonu içeren şık bir tooltip açılır.
- **Sesli Okuma**: Her cümlenin yanındaki 🔊 butonuyla ve her kelime tooltip'indeki butonla Web Speech API üzerinden sesli İngilizce okuma yapılır.
- **Analiz Butonu**: "Cümle Cümle Analiz Et" butonu tüm metni backend'e gönderir; C# tarafı cümle + kelime çevirilerini paralel yapar, JSON döner; frontend render eder.
- **Düz Metin Modu**: Analiz edilmeden de okunabilir — düz modda her cümleye tıklandığında satır içi Türkçe çeviri anında gösterilir.
- **Yeni API Endpoint'leri**: `/Translate/Word` (tek kelime), `/Translate/Sentence` (tek cümle), `/Translate/Analyze` (tam metin analizi) ayrı ayrı endpoint olarak C# controller'a eklendi.

---

## 7. Talepler

### 7.1 Ayrı Admin Paneli (Yönetici Uygulaması)
- Admin paneli, ana kullanıcı frontend'inden (Next.js) **tamamen bağımsız, ayrı bir uygulama** olarak kurulacaktır. Aynı proje/kod tabanı içinde bir sayfa/route olarak değil, fiziksel ve mantıksal olarak ayrılmış ayrı bir istemci olacaktır.
- Örnek dağıtım yapısı:
  - Ana kullanıcı sitesi: `uygulamaadi.com`
  - Admin paneli: `admin.uygulamaadi.com` (ayrı subdomain) veya tamamen ayrı bir sunucu/port üzerinde çalışan ayrı bir uygulama.
- Admin paneli de aynı ASP.NET Core Web API'ye bağlanacak, ancak kendine özel giriş ekranı ve kendine özel arayüzü olacaktır.
- Ana kullanıcı frontend'inde admin paneline geçiş linki, butonu veya herhangi bir görünür referans **bulunmayacaktır**.

### 7.2 Kitap/PDF Yükleme
- Kitapların (PDF vb.) sisteme eklenmesi işlemi **sadece admin panelinden** yapılabilecektir.
- Normal kullanıcılar kitap yükleyemez; içerik girişi tamamen yönetici kontrolündedir.
- Yüklenen PDF'ler işlenip (metin çıkarımı, cümlelere bölme vb.) veritabanına ve depolama alanına güvenli şekilde kaydedilecektir.

### 7.3 Yetkilendirme (Admin Paneli Özelinde)
- Admin paneline erişim, ayrı ve daha sıkı bir kimlik doğrulama katmanına sahip olacaktır (örn. ayrı JWT rolü/claim'i: `Admin`, farklı token süresi, gerekirse IP kısıtlaması veya 2FA gibi ek katmanlar ileride değerlendirilecektir).
- Tüm yönetici yetkileri (kitap/PDF yükleme, kullanıcı yönetimi, grup yönetimi, quiz/test içerik kontrolü, istatistik görüntüleme vb.) bu ayrı panelde toplanacaktır.
- Admin API endpoint'leri (`/api/admin/...`), normal kullanıcı endpoint'lerinden ayrı bir route grubunda tanımlanacak ve sadece `Admin` rolüne sahip token'larla erişilebilecektir.
- Admin paneli, güvenlik ihlali riskini azaltmak için ana kullanıcı uygulamasından bağımsız güncellenebilir/dağıtılabilir olacaktır.

### 7.4 Docker ile Tüm Sistemi Ayağa Kaldırma
- Tüm servisler (PostgreSQL, pgAdmin, Backend, Frontend, Admin Paneli) tek bir `docker-compose up -d` komutuyla başlatılabilecektir.
- Servis adresleri:
  - Kullanıcı Arayüzü: `http://localhost:3000`
  - Admin Paneli: `http://localhost:3001`
  - Backend API: `http://localhost:5000`
  - pgAdmin (Görsel DB Yönetimi): `http://localhost:8080`
- Tüm ortam değişkenleri (şifre, JWT key vb.) `.env` dosyasından okunur ve git'e commit edilmez.
- Veriler kalıcı Docker volume'larında saklanır; `docker-compose down` yapılsa bile veri kaybolmaz.
- Bkz. `faz-0-baslangic.md` — tam çalıştırma ve komut referansı.

### [2026-07-11] - Kelime Çeviri Kaydı, Dinamik Tema Revizyonu ve Yumuşak Renk Geçişleri
- **Kelimeleri Sözlüğe/Listeye Kaydetme**: Okuma modülünde, tooltip içerisinden veya doğrudan kelimelerin "Bilinmeyen Kelimeler Listesi"ne (`/words`) kaydedilmesi altyapısı sağlandı.
- **Yumuşak ve Soft Degrade (Gradient) Arka Plan**: Uygulamanın arka planına çok beyaz veya çok koyu gri olmayan, soldan sağa doğru akan yumuşak bir gri ton degrade geçişi eklendi (`linear-gradient(135deg, var(--background) 0%, var(--surface-dim) 50%, var(--surface-variant) 100%)`).
- **Gelişmiş CSS Cam (Glassmorphism) Efektleri**: Sayfa üzerindeki kartların arka plana daha uyumlu ve gözü yormayan premium bir cam hissiyatı (`--glass-bg`, `--glass-border`, vb.) vermesi için opaklık ve gölge derinlikleri yeniden yapılandırıldı.
- **Renk ve Tema Tutarlılığı**: Tüm sayfalarda (`words`, `books`, `groups` vb.) yer alan `violet-` gibi hardcoded Tailwind sınıfları tamamen temizlenip CSS değişkenlerine (`var(--primary)`, `var(--surface-container)`) bağlandı.
- **Material Symbols İkon Düzeltmesi**: Navigasyon ve diğer sayfalarda metin olarak kayan veya hatalı görünen Material Symbols ikonları, modern `lucide-react` paketinin ikonlarıyla değiştirilerek tam uyum ve görsel güzellik sağlandı.
- **TypeScript & Docker Senkronizasyonu**: Arayüzdeki TypeScript derleme uyarıları düzeltildi ve tüm değişiklikler `docker compose up -d --build frontend` ile sorunsuz şekilde güncellendi.
- **Tam Ekran Okuma Modu**: Kitap okuyucu sayfasına (Book Reader) odaklanmayı artıran "Tam Ekran" butonu eklendi. Aktif edildiğinde sidebar ve üst navbar gizlenir, yazı boyutu okunabilirliği artırmak adına büyütülür ve dikey odaklı şık bir okuma alanı sunulur.
- **Netflix Tipi Seri Kelime Ekleme (Seri Ekle)**: Dizi/film izlerken anında kelime eklemeyi kolaylaştırmak amacıyla sayfanın en üstüne **her zaman açık, tek satırlık hızlı giriş barı** yerleştirildi. Kelime yazıldığı an Google Translate ile anlamı anında otomatik doldurulur, Enter tuşuna basıldığında kelime listenize eklenir ve odağınız otomatik olarak bir sonraki kelimeyi yazmanız için tekrar giriş alanına döner.
- **Biliyorum / Bilmiyorum Pratik Simülatörü**: Kelime listesine interaktif bir çalışma modu eklendi. Kelimeler rastgele sıralanır; kullanıcı kartı döndürerek cevabı kontrol eder ve "Biliyorum" ya da "Bilmiyorum" butonlarıyla kendini test eder. Seans sonunda doğru/yanlış istatistiği gösterilir.
- **Öğrenilecek Kelime Sayacı**: Kelime listesinin üstünde güncel olarak kaç adet kelime öğrenilmeyi beklediği bir sayaç kutusuyla canlı olarak gösterilir.
- **Kelime Düzenleme & Dönüş Düzeltmeleri**: Flashcard'lardaki sonsuz dönme hatası düzeltildi. Kart düzenleme (PUT api) entegrasyonu tamamlandı.

### [2026-07-15] - Groq API Geçişi, Bağlamsal Çeviri, Token Tasarrufu (Önbellek) ve Eş Anlamlılar Entegrasyonu
- **Gemini API'den Groq'a Geçiş**: API limit yetersizlikleri ve maliyet yönetimi nedeniyle platformun tüm yapay zeka analiz (`TranslationService.cs`) ve PDF bölümleme (`PdfService.cs`) altyapısı Gemini API'sinden **Groq API** (`llama-3.3-70b-versatile` modeli) altyapısına taşındı.
- **Akıllı Token Tasarrufu (Önbellek - Cache Sistemi)**:
  * Veritabanında kelime ve geçtiği cümle bazlı composite index (`QueryText`, `ContextText`) içeren `TranslationCaches` tablosu oluşturuldu.
  * Tıklanan kelimeler Groq API'ye gönderilmeden önce bu tablodan kontrol edilir. Aynı cümle içindeki aynı kelime sorgularında **0 token harcanarak** doğrudan önbellekten veri çekilir.
  * Yeni ve benzersiz kelime/bağlam ikilileri Groq ile çevrildikten sonra veritabanına otomatik kaydedilir.
- **Bağlam Duyarlı Yapay Zeka Çevirisi**: Kelime tıklamalarında sadece kelime değil, kelimenin içinde geçtiği tüm cümle bağlamı (`Context`) backend'e iletilir. Groq kelimenin düz sözlük anlamı yerine o cümledeki gerçek fonksiyonunu analiz edip, aradaki farkları açıklama ve örneklerle sunar.
- **Google Translate Eş Anlam (Synonyms) Desteği**:
  * Google Translate üzerinden yapılan standart kelime çevirilerinde, gelen raw JSON yanıtı içindeki alternatif çeviriler ve eş anlamlılar (`dt=bd` parametresi) parse edilmeye başlandı.
  * Kelimeler türlerine göre (isim, fiil, sıfat, zarf vb.) gruplanarak primary çevirinin hemen altında şık bir şekilde listelenir (Örn: *• Fiil: çalıştırmak, yönetmek*).
- **Token Kullanım Loglaması**: Groq üzerinden yapılan her işlemin (kitap analiz, kelime çeviri vb.) anlık girdi, çıktı ve toplam token tüketim miktarı backend loglarına yazdırılarak şeffaf maliyet takibi sağlandı.
- **Otokuplaj ve Docker Rebuild**: Yapılan tüm frontend ve backend güncellemeleri Docker ortamında `docker compose up -d --build` ile derlenerek yayına alındı.

### [2026-07-16] - Dashboard Mobil Yeniden Tasarımı, Günlük Motivasyon Kartları ve Reader Header İyileştirmeleri
- **Dashboard Mobil Uyum Revizyonu (Okumaya Devam Et Kartı)**:
  * "Okumaya Devam Et" kartının mobildeki görünümü tamamen dikey (`flex-col`) düzene geçirildi. Kitap kapağı üstte daha belirgin ve büyük (`w-20 h-28`), kitap detayları, ilerleme barı ve yönlendirme butonu ise altta ortalanmış şekilde konumlandırıldı.
  * Masaüstü ekranlarda (`md:`) ise eski kompakt, yatay (`flex-row`) hizalama ve sağ alt buton yerleşimi korundu.
  * İlerleme barı yüksekliği mobilde takibi kolaylaştırmak adına `h-2.5` olarak güncellendi.
  * "Okumaya Devam Et" butonu mobilde tam genişlik (`w-full`), büyük dolgu (`py-3`) ve belirgin bir buton haline getirilerek dokunmatik ekranlar için optimize edildi.
- **Motivasyon ve Hedef Alanı (Günün İpucu & Hedef Kartları)**:
  * Mobilde en altta kalan boş alanları değerlendirmek ve kullanıcı etkileşimini artırmak için iki yeni kart eklendi:
    * 💡 **Günün İpucu**: Kullanıcıyı her gün düzenli okuma yapmaya teşvik eden, dinamik cam (glass-card) görünümlü bilgi kartı.
    * 🔥 **Hedefin**: Günlük kelime ve bölüm hedeflerini hatırlatarak motivasyon sağlayan etkileşimli hedef kartı.
  * Bu kartlar mobilde alt alta, masaüstünde ise yan yana esnek (`grid-cols-1 md:grid-cols-2`) yerleşimle sunuldu.
- **Book Reader Header Mobil Optimizasyonu & Buton Temizliği**:
  * Kitap okuma sayfasında (`BookReader`) üst kısımda yer alan geri dönüş butonundaki "Kitaplık" yazısı, dar mobil ekranlarda (`max-width: 480px`) CSS kurallarıyla gizlendi. Bu sayede mobilde sadece sol ok simgesi gösterilerek sayfa başlığına maksimum yer açıldı.
  * Sayfa başlığı ve konum bilgisi (`bk-title-block`), mobil cihazlarda sıkışmayı ve üst üste binmeyi önlemek adına sola yaslandı (`text-left`).
  * Aktif olarak kullanılmayan ve arayüzde yer kaplayan "Başlıkları Yeniden Çevir & Düzenle" (`handleReanalyze`) butonu header alanından tamamen kaldırılarak arayüz sadeleştirildi.
- **Tema ve Kod Temizliği**:
  * Dashboard üzerindeki kullanıcı adı baş harfleri ve isim metinleri dinamik `capitalize` fonksiyonu ile biçimlendirildi.
  * Header'da yer alan kullanıcı avatarının rengi, temaya tam uyum sağlaması için mavi (tertiary) tonlardan marka rengi olan yeşile (primary) dönüştürüldü.
  * Yapılan tüm düzenlemeler Docker üzerinde derlendi ve GitHub (`main` dalı) üzerinden Vercel/Render ortamlarına gönderildi.
