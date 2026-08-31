#!/usr/bin/env bash
# KURAL-10 kapısı: yüklenen dosyanın türü İÇERİKTEN belirlenir, uzantıdan değil.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[10] Dosya yükleme"

DENETCI="EnglishReadingPlatform/Controllers/AdminController.cs"
PDFSRV="EnglishReadingPlatform/Services/PdfService.cs"
DOGRULAYICI="EnglishReadingPlatform/Files/DosyaDogrulayici.cs"

# Bir controller eyleminin gövdesini yazdırır: verilen [HttpPost("...")] satırından
# başlar, bir SONRAKİ [Http... özniteliğine kadar sürer. Böylece "dosyada bir yerde
# geçiyor" ile "bu ucun içinde geçiyor" karıştırılmaz.
eylem_govdesi() {
  awk -v uc="$1" '
    index($0, "[HttpPost(\"" uc "\")]") { yaz=1 }
    yaz && /\[Http(Get|Post|Put|Delete)\(/ && !index($0, "[HttpPost(\"" uc "\")]") { exit }
    yaz { print }
  ' "$DENETCI"
}

# ── 1. Tür dosya adından mı belirleniyor? ───────────────────────
cikti="$(kodda_ara 'if \(ext == "\.docx"\)|AllowedExtensions\.Contains\(ext\)' 'EnglishReadingPlatform/Services/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "tür uzantıdan belirleniyor" "$n" "$cikti"

# ── 2. Her iki yükleme ucu da merkezî doğrulayıcıdan geçiyor mu? ──
eksik=""
for uc in "books/upload" "books/upload-pages"; do
  eylem_govdesi "$uc" \
    | grep -qE '^[[:space:]]*(var [A-Za-z]+ = )?_dogrulayici\.Dogrula\(' \
    || eksik="${eksik}${uc} doğrulayıcı çağırmıyor"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "yükleme uçları doğrulayıcıdan geçiyor" "$n" "$eksik"

# ── 3. Sayfa başına dosyayı yeniden açan eski API kaldı mı? ─────
cikti="$(kodda_ara 'ExtractSinglePageText' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sayfa başına yeniden açan API" "$n" "$cikti"

# ── 4. Sayfa üst sınırı tanımlı mı? ─────────────────────────────
n=0; grep -qE '^[[:space:]]*public const int[[:space:]]+EnCokSayfa' "$DOGRULAYICI" 2>/dev/null || n=1
ihlal_bildir "sayfa üst sınırı tanımlı" "$n" "DosyaDogrulayici.EnCokSayfa yok"

# ── 5. Zip-bomb kontrolü uygulanıyor mu? ────────────────────────
# Yorumda geçmesi YETMEZ; gerçek çağrı aranır (bkz. mutasyon C).
n=0; grep -qE '^[[:space:]]*_dogrulayici\.ZipBombKontrolu\(' "$PDFSRV" 2>/dev/null || n=1
ihlal_bildir "zip-bomb kontrolü uygulanıyor" "$n" "DOCX açılmış boyutu kontrol edilmiyor"

# ── 6. RequestSizeLimit tüm yükleme uçlarında var mı? ───────────
# Öznitelikler [HttpPost] ile eylem imzası ARASINDA da durabildiği için pencere
# iki yöne de bakar; yalnızca -B3 kullanan bir kontrol sırayı değiştiren ilk
# düzenlemede sessizce yanlış alarm verirdi.
eksik=""
for uc in "books/upload" "books/upload-pages"; do
  grep -B4 -A4 "HttpPost(\"$uc\")" "$DENETCI" \
    | grep -q "RequestSizeLimit" || eksik="${eksik}${uc}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "RequestSizeLimit eksik uç" "$n" "$eksik"

# ── 7. Boyut sınırı elle yazılmış sayı mı? ──────────────────────
# 52_428_800 gibi bir sabit, DosyaDogrulayici.EnBuyukBoyut ile sessizce ayrışır.
cikti="$(kodda_ara 'RequestSizeLimit\([0-9]' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "RequestSizeLimit elle yazılmış sayı" "$n" "$cikti"

# ── 8. Doğrulanmamış ayrıştırma yolu var mı? ────────────────────
# PDF/DOCX yalnızca PdfService ve DosyaDogrulayici içinde açılabilir. Başka bir
# dosyada açılıyorsa, o yol merkezî doğrulamayı atlıyor demektir.
cikti="$(kodda_ara 'PdfDocument\.Open\(|WordprocessingDocument\.Open\(|new ZipArchive\(' 'EnglishReadingPlatform/**/*.cs' \
        | grep -v -E "^($PDFSRV|$DOGRULAYICI):" || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "merkez dışında ayrıştırma" "$n" "$cikti"

# ── 9. Karar Content-Type başlığına mı bakıyor? ─────────────────
# Content-Type'ı istemci yazar; dosya adı kadar sahtedir.
cikti="$(kodda_ara 'ContentType (==|!=)|ContentType\.Contains' 'EnglishReadingPlatform/Controllers/*.cs' 'EnglishReadingPlatform/Services/*.cs' 'EnglishReadingPlatform/Files/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "tür Content-Type'tan belirleniyor" "$n" "$cikti"

guard_bitir
