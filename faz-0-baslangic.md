# Faz 0 — Projeyi Çalıştırma Kılavuzu

Bu döküman, projenin tüm servislerini yerel makinede nasıl başlatacağını, neyin ne işe yaradığını ve neler yapıldığını/yapılmadığını açıklar.

---

## Servis Haritası

| Servis | Teknoloji | URL | Açıklama |
|---|---|---|---|
| **Backend API** | ASP.NET Core 8 (C#) | `http://localhost:5000` | Tüm API endpointleri |
| **Frontend** | Next.js 14 (React/TS) | `http://localhost:3000` | Kullanıcı arayüzü |
| **Admin Paneli** | Next.js 14 (React/TS) | `http://localhost:3001` | Yönetici paneli (ayrı app) |
| **PostgreSQL** | PostgreSQL 15 | `localhost:5432` | Ana veritabanı |
| **pgAdmin** | pgAdmin 4 | `http://localhost:8080` | Görsel DB yönetimi |

---

## Yöntem 1: Lokal Çalıştırma (Docker olmadan)

### Ön Koşullar
- PostgreSQL 15 kurulu ve çalışıyor olmalı (`brew services start postgresql@15`)
- .NET SDK `./dotnet_sdk/dotnet` konumunda mevcut
- Node.js 18+ kurulu

### Adım 1 — PostgreSQL Başlat
```bash
brew services start postgresql@15
# Kontrol:
psql -U alihanfindikci -d englishreadingdb -c "\dt"
```

### Adım 2 — Backend'i Başlat
```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje/EnglishReadingPlatform
../dotnet_sdk/dotnet run
# ✅ Backend: http://localhost:5187
```

### Adım 3 — Frontend'i Başlat (yeni terminal)
```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje/frontend
npm run dev
# ✅ Kullanıcı arayüzü: http://localhost:3000
```

### Adım 4 — Admin Paneli'ni Başlat (yeni terminal)
```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje/admin-panel
npm run dev -- -p 3001
# ✅ Admin paneli: http://localhost:3001
```

### Admin Giriş Bilgileri
| Alan | Değer |
|---|---|
| E-posta | `admin@platform.com` |
| Şifre | `Admin@2026!` |

---

## Yöntem 2: Docker ile Çalıştırma (Tüm Servisler Tek Komut)

> [!IMPORTANT]
> **Docker Desktop'ın** bilgisayarında kurulu ve **açık** olması gerekmektedir.
> Mac için: https://www.docker.com/products/docker-desktop/

# 🐳 ADIM ADIM DOCKER ÇALIŞTIRMA VE PORT YAPILANDIRMASI

## 1️⃣ PORT ÇAKIŞMASINI ÖNLEME (BACKEND & POSTGRESQL)
1. **Lokal PostgreSQL Servisini Durdurun**: Bilgisayarınızda yerel çalışan PostgreSQL varsa Docker'ın `5432` portuna bağlanabilmesi için durdurulmalıdır:
   ```bash
   brew services stop postgresql@15
   ```
2. **Backend Port Yapılandırması (Port 5001)**: macOS Control Center port `5000`'i işgal ettiği için, backend API Docker üzerinde **`5001`** portuna yönlendirilmiştir. 
   - API URL: `http://localhost:5001`
   - Frontend ve Admin uygulamaları backend ile `http://localhost:5001` üzerinden konuşur.

---

## 2️⃣ DOCKER KAPSAYICILARINI AYAĞA KALDIRMA

### Adım A — .env Dosyasını Oluşturun
Proje ana dizininde (`/Users/alihanfindikci/Desktop/ingilizceproje`) `.env.example` dosyasını kopyalayarak `.env` oluşturun:
```bash
cp .env.example .env
```

### Adım B — Tüm Sistemi Derleyin ve Başlatın
Docker motoru açıkken aşağıdaki komutla tüm servislerin kurulmasını, derlenmesini ve arka planda başlatılmasını sağlayın:
```bash
docker-compose up -d --build
```
*Bu komut backend (.NET), frontend (React) ve admin (Next.js) projelerini Docker imajı olarak sıfırdan derler.*

### Adım C — Servislerin Durumunu Kontrol Edin
Servislerin sağlıklı çalıştığından emin olmak için:
```bash
docker-compose ps
```
*Tüm servislerin STATUS kısmında "running" veya "healthy" yazmalıdır.*

---

## 3️⃣ AKTİF HALE GELEN SERVİS LİNKLERİ

Sisteminiz başarıyla çalıştıktan sonra aşağıdaki portlar üzerinden erişim sağlayabilirsiniz:

*   🌐 **Kullanıcı Arayüzü (Frontend)**: [http://localhost:3000](http://localhost:3000)
*   🛡️ **Yönetici Paneli (Admin Panel)**: [http://localhost:3001](http://localhost:3001)
*   ⚙️ **Backend API**: [http://localhost:5001](http://localhost:5001)
*   🗄️ **pgAdmin (Görsel Veritabanı)**: [http://localhost:8080](http://localhost:8080)

---

## 4️⃣ YÖNETİCİ GİRİŞ BİLGİLERİ

Veritabanı Docker'da ilk kez ayağa kalktığında, EF Core `EnsureCreated()` yapısı sayesinde varsayılan yönetici hesabı otomatik olarak PostgreSQL'e eklenir:

| Giriş Alanı | Değer |
|---|---|
| **E-posta** | `admin@platform.com` |
| **Şifre** | `Admin@2026!` |

*Bu bilgilerle doğrudan [http://localhost:3001](http://localhost:3001) adresinden giriş yapıp PDF kitap yüklemeye başlayabilirsiniz.*

---

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker-compose up -d
```

### Adım 3 — Durumu Kontrol Et
```bash
docker-compose ps
# Tüm servisler "Up" statüsünde görünmeli
```

### Adım 4 — Servislere Eriş
| Servis | URL |
|---|---|
| Kullanıcı Arayüzü | http://localhost:3000 |
| Admin Paneli | http://localhost:3001 |
| API | http://localhost:5000 |
| pgAdmin (DB görsel) | http://localhost:8080 |

### pgAdmin'e Bağlanma
1. http://localhost:8080 aç
2. Giriş: `admin@admin.com` / `admin123`
3. **Add New Server** → Connection sekmesi:
   - Host: `postgres`
   - Port: `5432`
   - Database: `englishreadingdb`
   - Username: `appuser`
   - Password: `StrongPass@2026!`

### Servisleri Durdurma
```bash
docker-compose down         # Servisleri durdur (veriler korunur)
docker-compose down -v      # Servisleri durdur + TÜM VERİLERİ SİL
```

### Logları İzleme
```bash
docker-compose logs -f backend      # Backend logları
docker-compose logs -f postgres     # PostgreSQL logları
docker-compose logs -f frontend     # Frontend logları
```

---

## Proje Klasör Yapısı

```
ingilizceproje/
├── EnglishReadingPlatform/   # 🔵 Backend (ASP.NET Core C#)
│   ├── Controllers/          # API Controller'ları
│   │   ├── AdminController.cs    # ← YENİ: Admin endpointleri
│   │   └── AppControllers.cs    # Mevcut user/group/translate endpointleri
│   ├── Services/
│   │   ├── AppServices.cs       # JWT + Quiz servisleri
│   │   └── PdfService.cs        # ← YENİ: PDF metin çıkarma servisi
│   ├── Models/AppModels.cs      # Veritabanı modelleri
│   ├── Data/AppDbContext.cs     # EF Core context + seed data
│   ├── Migrations/              # PostgreSQL migration dosyaları
│   ├── Dockerfile               # ← YENİ: Docker image
│   └── appsettings.json         # Veritabanı bağlantı ayarları
│
├── frontend/                 # 🟢 Kullanıcı Arayüzü (Next.js)
│   ├── app/                  # Next.js App Router sayfaları
│   └── Dockerfile            # ← YENİ: Docker image
│
├── admin-panel/              # 🔴 Admin Paneli (Next.js) ← YENİ
│   ├── app/
│   │   ├── page.tsx          # Login sayfası
│   │   ├── dashboard/        # İstatistik ekranı
│   │   ├── books/            # Kitap yönetimi + PDF yükleme
│   │   └── users/            # Kullanıcı yönetimi
│   └── Dockerfile            # Docker image
│
├── dotnet_sdk/               # 🔧 Taşınabilir .NET 8 SDK (sudo gerektirmez)
├── docker-compose.yml        # ← YENİ: Tüm servisler tek dosyada
├── .env.example              # ← YENİ: Ortam değişkenleri şablonu
└── proje-dokumani.md         # Ana proje dökümanı
```

---

## Neler Yapıldı ✅

| Özellik | Durum | Detay |
|---|---|---|
| PostgreSQL kurulumu | ✅ Tamamlandı | Homebrew ile PostgreSQL 15 |
| SQLite → PostgreSQL geçişi | ✅ Tamamlandı | Npgsql + EF Core migration |
| JWT Admin token süresi | ✅ Tamamlandı | Admin: 2 saat, User: 7 gün |
| Admin yetkilendirme politikası | ✅ Tamamlandı | `[Authorize(Roles = "admin")]` |
| Varsayılan admin seed kullanıcısı | ✅ Tamamlandı | `admin@platform.com` |
| Admin Controller (`/api/admin/`) | ✅ Tamamlandı | Kullanıcı, kitap, istatistik yönetimi |
| PDF yükleme endpointi | ✅ Tamamlandı | Metin çıkarma + bölümlere ayırma |
| CORS güncelleme (admin panel portu) | ✅ Tamamlandı | `localhost:3001` eklendi |
| Ayrı Admin Paneli uygulaması | ✅ Tamamlandı | Next.js, port 3001 |
| Admin Login sayfası | ✅ Tamamlandı | Sadece admin rolü kabul eder |
| Admin Dashboard | ✅ Tamamlandı | İstatistikler + son kullanıcılar |
| Admin Kitap Yönetimi | ✅ Tamamlandı | PDF yükleme + liste + silme |
| Admin Kullanıcı Yönetimi | ✅ Tamamlandı | Rol değiştirme + silme |
| Backend Dockerfile | ✅ Tamamlandı | Multi-stage, non-root user |
| Frontend Dockerfile | ✅ Tamamlandı | Multi-stage, Node 20 Alpine |
| Admin Panel Dockerfile | ✅ Tamamlandı | Multi-stage, port 3001 |
| Docker Compose (5 servis) | ✅ Tamamlandı | postgres + pgadmin + backend + frontend + admin |
| pgAdmin entegrasyonu | ✅ Tamamlandı | localhost:8080 |
| .env.example dosyası | ✅ Tamamlandı | Güvenli credential yönetimi |

---

## Neler Yapılmadı / Gelecek Aşamalar ⏳

| Özellik | Durum | Not |
|---|---|---|
| Docker Desktop kurulumu | ⏳ Bekliyor | Mac'te sudo gerektiği için manuel kurulması gerekiyor |
| EF Core migration (Docker için) | ⏳ Bekliyor | Docker compose up'tan sonra `dotnet ef database update` çalıştırılmalı |
| Admin paneli 2FA | 🔜 Planlandı | Bölüm 7.3'te belirtildi, ileriki aşamada |
| IP kısıtlaması (Admin) | 🔜 Planlandı | Prodüksiyon aşamasında |
| HTTPS / SSL sertifikası | 🔜 Planlandı | Prodüksiyona geçişte |
| Görsel tabanlı PDF (OCR) desteği | 🔜 Planlandı | Taranmış PDF'ler için Tesseract entegrasyonu |
| Mobil uygulama (React Native) | 🔜 İleride | Bölüm 4'te planlandı |
| Prod Docker Compose | 🔜 İleride | Nginx reverse proxy + SSL eklenmeli |

---

## Sık Kullanılan Komutlar

```bash
# Backend: Migration oluştur
cd EnglishReadingPlatform
PATH=$PATH:/Users/alihanfindikci/Desktop/ingilizceproje/dotnet_sdk \
DOTNET_ROOT=/Users/alihanfindikci/Desktop/ingilizceproje/dotnet_sdk \
./dotnet-ef migrations add <MigrationAdi>

# Backend: Migration uygula
./dotnet-ef database update

# Docker: Tek servisi yeniden build et
docker-compose up -d --build backend

# Docker: Postgres'e doğrudan bağlan
docker exec -it english_postgres psql -U appuser -d englishreadingdb

# Lokal Postgres: Tabloları listele
psql englishreadingdb -c "\dt"
```
