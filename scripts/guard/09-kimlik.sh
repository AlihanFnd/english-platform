#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[09] Kimlik doğrulama sertleştirmesi"

KONTROLLER='EnglishReadingPlatform/Controllers/*.cs'
AUTH="EnglishReadingPlatform/Controllers/AuthController.cs"

# 1. Elle yazılmış şifre uzunluk kontrolü kaldı mı?
#    Politika tek kaynaktan gelmeli; controller içinde ayrı bir eşik olmamalı.
cikti="$(kodda_ara 'Password\.Length < [0-9]+' "$KONTROLLER")"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "elle yazılmış şifre uzunluk kontrolü" "$n" "$cikti"

# 2. Şifre kabul eden HER yol politikadan geçiyor mu?
#    Yalnızca kayıtta uygulamak yarım kapatmadır: değiştirme ve sıfırlama
#    yollarından zayıf şifre girilebilirdi.
eksik=""
for uc in Register SifreDegistir SifreSifirla; do
  grep -A40 "public async Task<IActionResult> $uc" "$AUTH" \
    | grep -q "_sifrePolitikasi.Dogrula" || eksik="${eksik}${uc}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "politikadan geçmeyen şifre yolu" "$n" "$eksik"

# 3. Kayıt enumerasyonu geri geldi mi?
cikti="$(kodda_ara 'zaten kullanımda' "$KONTROLLER")"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "kayıt enumerasyon mesajı" "$n" "$cikti"

# 4. Üç yeni uç duruyor mu?
eksik=""
for uc in "change-password" "forgot-password" "reset-password"; do
  grep -q "\"$uc\"" "$AUTH" || eksik="${eksik}${uc}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "eksik kimlik ucu" "$n" "$eksik"

# 5. Şifre değişimi oturumları sonlandırıyor mu?
n=0
grep -A60 "public async Task<IActionResult> SifreDegistir" "$AUTH" \
  | grep -q "KullaniciTumTokenlariniIptalEt" || n=1
ihlal_bildir "şifre değişimi oturum sonlandırıyor" "$n" "eski token geçerli kalıyor"

# 6. Sıfırlama da oturumları sonlandırıyor mu? (kardeş yol)
n=0
grep -A40 "public async Task<IActionResult> SifreSifirla" "$AUTH" \
  | grep -q "KullaniciTumTokenlariniIptalEt" || n=1
ihlal_bildir "şifre sıfırlama oturum sonlandırıyor" "$n" "sıfırlama sonrası eski token geçerli kalıyor"

# 7. Ham sıfırlama jetonu veritabanına yazılıyor mu?
#    Yalnızca SHA-256 hash saklanmalı; DB okuyan biri hesap ele geçirememeli.
cikti="$(kodda_ara 'JetonHash *= *hamJeton|Jeton *= *hamJeton' 'EnglishReadingPlatform/Security/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "ham jeton saklanıyor" "$n" "$cikti"

# 8. Jeton kriptografik üreteçten mi geliyor?
n=0
grep -q "RandomNumberGenerator.GetBytes" EnglishReadingPlatform/Security/SifreSifirlamaServisi.cs || n=1
ihlal_bildir "jeton kriptografik üreteçten" "$n" "Guid.NewGuid() rastgelelik garantisi vermez"

# 9. Girişte zamanlama eşitleyici duruyor mu?
n=0
grep -A40 "public async Task<IActionResult> Login" "$AUTH" | grep -q "SahteHash" || n=1
ihlal_bildir "girişte zamanlama eşitleyici" "$n" "kullanıcı yokken BCrypt atlanıyor — süre farkı sızdırır"

# 10. Politika dosyası duruyor ve eşikler gevşetilmemiş mi?
n=0
[ -f "EnglishReadingPlatform/Security/SifrePolitikasi.cs" ] || n=1
ihlal_bildir "şifre politikası dosyası mevcut" "$n" "Security/SifrePolitikasi.cs yok"

enaz=$(grep -oE 'const +int +EnAzUzunluk *= *[0-9]+' EnglishReadingPlatform/Security/SifrePolitikasi.cs 2>/dev/null | grep -oE '[0-9]+$' | head -1 || echo 0)
[ -n "$enaz" ] || enaz=0
n=0; [ "$enaz" -ge 10 ] || n=1
ihlal_bildir "asgari şifre uzunluğu >= 10 (mevcut: $enaz)" "$n" "politika gevşetilmiş"

guard_bitir
