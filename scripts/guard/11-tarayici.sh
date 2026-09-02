#!/usr/bin/env bash
# KURAL-11 kapısı: sunucu tarayıcıya kendini nasıl koruyacağını söyler,
# üçüncü taraf kod CDN'den değil paketten gelir, derleme kapıları açıktır.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[11] Tarayıcı tarafı savunma"

# Yorum satırlarını eler — kapı KODU ölçmeli, prozayı değil.
# "cdnjs kullanmayın" diye yazan bir AÇIKLAMA, CDN kullanımı değildir; böyle
# bir yanlış alarm insanları kapıyı gevşetmeye iter. (KURAL-10'da bunun tersi
# yaşanmıştı: kapı, yorum satırıyla KANDIRILABİLİYORDU. İlke aynı — ölçüm
# yalnızca kodun kendisi üzerinde yapılır.)
# Girdi biçimi: dosya:satır:içerik — tek dosyada grep'e -H vermeyi unutmayın,
# yoksa filtre hiçbir şey elemez (bu tuzağa bir kez düşüldü).
yorumsuz() { grep -v -E '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*|#)' || true; }

PROGRAM="EnglishReadingPlatform/Program.cs"
FE_BASLIK="frontend/guvenlik-basliklari.mjs"
AD_BASLIK="admin-panel/guvenlik-basliklari.mjs"

# ── 1. Güvenlik başlıkları middleware'i kayıtlı mı? ─────────────
n=0; grep -q "GuvenlikBasliklariniKullan()" "$PROGRAM" || n=1
ihlal_bildir "güvenlik başlıkları middleware'i" "$n" "Program.cs'te kayıtlı değil"

# ── 2. Sıra: hata yakalama → güvenlik başlıkları ────────────────
# Ters olursa HataYakalama'nın Response.Clear() çağrısı başlıkları siler ve
# HATA yanıtları korumasız çıkar. Testle de korunuyor (Istisna_500_yaniti...).
hata_satir=$(grep -n "app.HataYakalamayiKullan()"  "$PROGRAM" | head -1 | cut -d: -f1)
bslk_satir=$(grep -n "app.GuvenlikBasliklariniKullan()" "$PROGRAM" | head -1 | cut -d: -f1)
n=0
if [ -n "$hata_satir" ] && [ -n "$bslk_satir" ]; then
  [ "$hata_satir" -lt "$bslk_satir" ] || n=1
else
  n=1
fi
ihlal_bildir "başlıklar hata middleware'inden sonra" "$n" \
  "HataYakalama satır ${hata_satir:-yok}, GuvenlikBasliklari satır ${bslk_satir:-yok}"

# ── 3. Üretimde HTTPS zorlaması ────────────────────────────────
n=0; grep -q "UseHttpsRedirection" "$PROGRAM" || n=1
ihlal_bildir "UseHttpsRedirection mevcut" "$n" "TLS zorlaması yok"

n=0; grep -q "UseHsts()" "$PROGRAM" || n=1
ihlal_bildir "UseHsts mevcut" "$n" "HSTS yok"

# Hedef port açıkça verilmezse UseHttpsRedirection SESSİZCE hiçbir şey yapmaz.
n=0; grep -q "AddHttpsRedirection" "$PROGRAM" || n=1
ihlal_bildir "HTTPS hedef portu tanımlı" "$n" \
  "AddHttpsRedirection yok → yönlendirme üretimde sessizce çalışmaz"

# Ters proxy arkasında ForwardedHeaders olmadan yönlendirme sonsuz döngü yapar.
n=0; grep -q "UseForwardedHeaders" "$PROGRAM" || n=1
ihlal_bildir "ForwardedHeaders okunuyor" "$n" \
  "proxy arkasında sonsuz yönlendirme döngüsü riski"

# HSTS preload GERİ ALINAMAZ bir karardır; kasten kapalı.
cikti="$(grep -Hn "Preload = true" "$PROGRAM" | yorumsuz || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "HSTS preload açılmış" "$n" "$cikti"

# ── 4. Sunucu parmak izi ───────────────────────────────────────
n=0; grep -q "AddServerHeader = false" "$PROGRAM" || n=1
ihlal_bildir "Kestrel Server başlığı kapalı" "$n" "opt.AddServerHeader = false yok"

eksik=""
grep -q "poweredByHeader: false" frontend/next.config.ts     2>/dev/null || eksik="${eksik}frontend"$'\n'
grep -q "poweredByHeader: false" admin-panel/next.config.mjs 2>/dev/null || eksik="${eksik}admin-panel"$'\n'
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "X-Powered-By kapatılmamış" "$n" "$eksik"

# ── 4b. Ölü statik dosya yüzeyi geri gelmesin ──────────────────
# Proje HTML sunmuyor: Razor pipeline'ı yok, hiçbir controller View döndürmüyor.
# UseStaticFiles yalnızca wwwroot/ altındaki ölü varlıkları (eski jQuery vb.)
# internete açıyordu; klasör ve çağrı 2026-09-01'de silindi.
# Statik dosya GERÇEKTEN gerekirse kökü değil tek bir dizini yayınlayın
# (RequestPath + FileProvider) ve bu kontrolü ona göre güncelleyin.
cikti="$(grep -Hn "app.UseStaticFiles" "$PROGRAM" | yorumsuz || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "statik dosya sunumu geri gelmiş" "$n" "$cikti"

eksik=""
[ -d "EnglishReadingPlatform/wwwroot" ] && eksik="${eksik}EnglishReadingPlatform/wwwroot geri gelmiş"$'\n'
[ -d "EnglishReadingPlatform/Views" ]   && eksik="${eksik}EnglishReadingPlatform/Views geri gelmiş"$'\n'
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "ölü klasörler geri gelmiş" "$n" "$eksik"

# ── 5. Üçüncü taraf CDN'den kaynak ─────────────────────────────
# Yalnızca app/ değil TÜM istemci ağacı taranıyor: envanterdeki grep app/
# altına baktığı için globals.css'teki Google Fonts @import'u görmemişti.
cikti="$(depoda_ara 'https://cdnjs|https://unpkg|https://cdn\.jsdelivr' 'frontend/**' 'admin-panel/**' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "CDN'den script yükleme" "$n" "$cikti"

cikti="$(depoda_ara 'fonts\.googleapis\.com|fonts\.gstatic\.com|tessdata\.projectnaptha\.com' 'frontend/**' 'admin-panel/**' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "üçüncü taraf yazı tipi/veri" "$n" "$cikti"

# ── 6. Kütüphane varsayılanları CDN'e düşmesin ─────────────────
# tesseract.js hiçbir yol verilmezse worker'ı ve WASM çekirdeğini jsdelivr'dan
# çeker; bu, kodda hiç URL görünmeden oluşan bir CDN bağımlılığıdır.
eksik=""
for anahtar in workerPath corePath langPath; do
  grep -q "$anahtar:" frontend/app/ocr/page.tsx 2>/dev/null || eksik="${eksik}${anahtar}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "Tesseract yolları açıkça verilmemiş" "$n" "$eksik"

# pdf.js worker'ı da kendi origin'imizden gelmeli.
n=0
grep -q 'workerSrc = "/pdfjs/' admin-panel/app/books/page.tsx 2>/dev/null || n=1
ihlal_bildir "pdf.js worker'ı yerel değil" "$n" "GlobalWorkerOptions.workerSrc kendi origin'imizi göstermiyor"

# ── 7. Derleme kapıları ────────────────────────────────────────
cikti="$(grep -n 'ignoreBuildErrors\|ignoreDuringBuilds' admin-panel/next.config.mjs frontend/next.config.ts 2>/dev/null | yorumsuz || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "derleme kapısı kapalı" "$n" "$cikti"

# ── 8. İstemci CSP'si tanımlı ve gevşetilmemiş ─────────────────
eksik=""
for dosya in "$FE_BASLIK" "$AD_BASLIK"; do
  grep -q "script-src" "$dosya" 2>/dev/null || eksik="${eksik}${dosya}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "istemci CSP'si eksik" "$n" "$eksik"

# script-src'te 'unsafe-inline' = CSP'nin XSS'e karşı değerinin büyük kısmı gider.
# Token localStorage'da olduğu için bu pazarlık konusu değil (nonce kullanılıyor).
cikti="$(grep -n "script-src[^\"]*unsafe-inline" "$FE_BASLIK" "$AD_BASLIK" 2>/dev/null | yorumsuz || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "script-src'te 'unsafe-inline'" "$n" "$cikti"

# Nonce üretimi ve proxy'nin varlığı — CSP'nin gerçekten uygulanması buna bağlı.
eksik=""
for uyg in frontend admin-panel; do
  [ -f "$uyg/proxy.ts" ] || eksik="${eksik}${uyg}/proxy.ts yok"$'\n'
  grep -q "nonce" "$uyg/proxy.ts" 2>/dev/null || eksik="${eksik}${uyg}/proxy.ts nonce üretmiyor"$'\n'
  # Nonce'lu CSP yalnızca DİNAMİK render'da işe yarar; statik ön-render'daki
  # script etiketleri isteğe özel nonce'u taşıyamaz ve sayfa hidrasyonu kırılır.
  # Yorumdaki "headers()" sözü sayılmaz — MUTASYON G bunu ortaya çıkardı:
  # kapı, kendi açıklama satırımı kanıt sanıp yeşil kalmıştı.
  grep -n "await headers()" "$uyg/app/layout.tsx" 2>/dev/null | sed "s|^|$uyg/app/layout.tsx:|" | yorumsuz | grep -q . \
    || eksik="${eksik}${uyg}/app/layout.tsx 'await headers()' çağırmıyor (statik ön-render nonce'u taşımaz)"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "nonce zinciri kopuk" "$n" "$eksik"

# ── 9. localStorage.clear() aşırı geniş temizlik ───────────────
cikti="$(depoda_ara 'localStorage\.clear\(\)' 'frontend/**' 'admin-panel/**' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "localStorage.clear() kullanımı" "$n" "$cikti"

guard_bitir
