#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[07] Kaynak tüketimi / hız sınırı"

# Yorum satırlarını eler: kaldırılan mekanizmayı ANLATAN yorumlar ihlal sayılmamalı.
yorumsuz() { grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' || true; }

# ── 1. Eski elle yazılmış sınırlayıcı kaldı mı? ─────────────────────────
# _rateLimitWindow sözlüğü hiç temizlenmiyordu; login_{ip}/register_{ip}
# anahtarları saldırgan kontrolündeydi (IPv6 ile pratikte sınırsız) → OOM.
cikti="$(depoda_ara 'IsRateLimitExceeded|_rateLimitWindow|TokenSecurityService' \
         'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "eski sınırlayıcı kullanımda" "$n" "$cikti"

n=0; [ -f "EnglishReadingPlatform/Services/TokenSecurityService.cs" ] && n=1
ihlal_bildir "TokenSecurityService.cs silinmiş" "$n" "dosya hâlâ duruyor"

# ── 2. Merkezî kurulum ve middleware kayıtlı mı? ────────────────────────
n=0; grep -q "HizSinirlamaEkle()" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "HizSinirlamaEkle() kayıtlı" "$n" "Program.cs'te servis kaydı yok"

n=0; grep -q "UseRateLimiter()" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "UseRateLimiter kayıtlı" "$n" "Program.cs'te yok"

# ── 3. Middleware sırası: UseAuthentication → UseRateLimiter → UseAuthorization ──
# Sıra bozulursa ctx.User boş olur, TÜM sınırlar IP bazına düşer ve NAT
# arkasındaki bir okulun tüm öğrencileri birbirinin kotasını tüketir.
n=0
auth=$(grep -n "app.UseAuthentication()" EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
rate=$(grep -n "app.UseRateLimiter()"    EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
yetki=$(grep -n "app.UseAuthorization()" EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
if [ -n "$auth" ] && [ -n "$rate" ] && [ -n "$yetki" ]; then
  { [ "$auth" -lt "$rate" ] && [ "$rate" -lt "$yetki" ]; } || n=1
else n=1; fi
ihlal_bildir "sıra: Authentication<RateLimiter<Authorization" "$n" \
  "sıra yanlış → tüm sınırlar IP bazına düşer"

# ── 4. Adlandırılmış (zaman aşımlı + boyut sınırlı) dış API istemcileri ──
for sabit in GroqIstemcisi GoogleIstemcisi; do
  n=0
  grep -q "AddHttpClient(HizSinirlari.$sabit" EnglishReadingPlatform/Program.cs || n=1
  ihlal_bildir "adlandırılmış HttpClient: $sabit" "$n" \
    "Program.cs'te AddHttpClient(HizSinirlari.$sabit, ...) yok → varsayılan 100 sn timeout"
done

n=0; grep -q "MaxResponseContentBufferSize" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "dış API yanıt boyutu sınırlı" "$n" \
  "MaxResponseContentBufferSize yok → sınırsız yanıt belleği doldurur"

# Adlandırılmamış CreateClient() kalmamalı: varsayılan 100 sn zaman aşımı,
# boyut sınırı yok.
cikti="$(depoda_ara 'CreateClient\(\)' 'EnglishReadingPlatform/Services/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "servislerde adsız CreateClient()" "$n" "$cikti"

# ── 5. Dakika ölçekli HTTP zaman aşımı kaldı mı? ────────────────────────
# 5 dakikalık timeout kendisi bir açıktır: 20 eşzamanlı analiz, 5 dakika
# boyunca 20 bağlantı ve 20 thread tutar.
cikti="$(depoda_ara 'Timeout = TimeSpan\.FromMinutes\(' 'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "dakika ölçekli HTTP timeout" "$n" "$cikti"

# ── 6. Kuyruk yok — kuyruk korunmak istenen belleği tüketir ─────────────
cikti="$(depoda_ara 'QueueLimit = [1-9]' 'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sınırlayıcıda kuyruk açılmış" "$n" "$cikti"

# ── 7. Ağır iş kapısı GERÇEKTEN bağlı mı? ───────────────────────────────
# Sınıfı yazıp çağırmamak, kapıyı hiç kurmamakla aynıdır (ölü kod).
for hedef in "EnglishReadingPlatform/Services/TranslationService.cs" \
             "EnglishReadingPlatform/Services/PdfService.cs"; do
  n=0
  grep -E '_agirIsKapisi\.CalistirAsync' "$hedef" 2>/dev/null \
    | grep -qvE '^[[:space:]]*(//|\*|/\*)' || n=1
  ihlal_bildir "ağır iş kapısı bağlı: $(basename "$hedef")" "$n" \
    "$hedef içinde CalistirAsync çağrısı yok — kapı ölü kod"
done

# ── 8. Yazma uçlarına politika atanmış mı (kaba sayım) ──────────────────
# Kesin ölçüm sözleşme testinde; bu, testin silinmesi hâlinde bile bir taban verir.
sayi=$(depoda_ara '\[EnableRateLimiting\(' 'EnglishReadingPlatform/Controllers/*.cs' \
       | yorumsuz | grep -c . || true)
n=0; [ "$sayi" -ge 18 ] || n=1
ihlal_bildir "EnableRateLimiting sayısı ≥ 18 (şu an $sayi)" "$n" \
  "yazma uçlarının bir kısmı korumasız"

# ── 9. Sözleşme/davranış testleri duruyor mu? ───────────────────────────
# Test silinirse kapı yeşil kalır ama hiçbir şey ölçülmez.
for t in HizSiniriSozlesmesiTests HizSiniriTests HesapSayaciTests AgirIsKapisiTests; do
  n=0; [ -f "EnglishReadingPlatform.Tests/$t.cs" ] || n=1
  ihlal_bildir "test dosyası mevcut: $t" "$n" "$t.cs silinmiş"
done

guard_bitir
