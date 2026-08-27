#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[02] Sırlar koda ve repoya girmez"

DOGRULAYICI="EnglishReadingPlatform/Configuration/SirDogrulayici.cs"

# ─── Yasaklı liste TEK KAYNAKTAN gelir ────────────────────────────────
# Elle senkron tutulan ikinci bir liste tutmuyoruz: desen doğrudan
# SirDogrulayici.YasakliDegerler dizisinden okunuyor. Kod tarafına yeni bir
# sızmış değer eklendiği anda bu kapı da onu aramaya başlar.
if [ ! -f "$DOGRULAYICI" ]; then
  echo "  SirDogrulayici.cs bulunamadı — yasaklı liste okunamıyor"
  echo ""
  echo "  TOPLAM İHLAL: 1"
  exit 1
fi

YASAKLI="$(
  awk '/YasakliDegerler =/,/};/' "$DOGRULAYICI" \
    | grep -oE '"[^"]+"' \
    | tr -d '"' \
    | sed 's/[][\.*^$(){}?+|/]/\\&/g' \
    | paste -sd '|' -
)"

if [ -z "$YASAKLI" ]; then
  echo "  Yasaklı liste boş okundu — SirDogrulayici.YasakliDegerler biçimi bozulmuş"
  echo ""
  echo "  TOPLAM İHLAL: 1"
  exit 1
fi
echo "  (yasaklı liste $DOGRULAYICI dosyasından okundu: $(printf '%s' "$YASAKLI" | tr '|' '\n' | grep -c .) değer)"

# Sızmış değerleri MEŞRU olarak barındıran dosyalar: iptal listesinin kendisi
# ve onu sınayan testler. Liste kasten dar tutuluyor.
MESRU='^(EnglishReadingPlatform/Configuration/SirDogrulayici\.cs|EnglishReadingPlatform\.Tests/(SirDogrulayiciTests|SirlarEntegrasyonTests)\.cs):'

# 1. Depodaki dosyalarda sızmış sır var mı?
cikti="$(depoda_ara "$YASAKLI" '*' | grep -v -E "$MESRU" || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sızmış sır değeri" "$n" "$cikti"

# 2. Program.cs'te sır fallback'i (?? "...") kaldı mı?
cikti="$(grep -n 'Configuration\["Jwt:\(Key\|Issuer\|Audience\)"\].*??' EnglishReadingPlatform/Program.cs 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "Jwt ayarı varsayılana düşüyor" "$n" "$cikti"

# 3. docker-compose'da sır için :- varsayılanı kaldı mı?
cikti="$(grep -nE '(JWT_KEY|POSTGRES_PASSWORD|POSTGRES_USER|PGADMIN_PASSWORD|PGADMIN_EMAIL):-' docker-compose.yml 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "docker-compose sır varsayılanı" "$n" "$cikti"

# 4. appsettings*.json içinde dolu Key/Password alanı var mı?
cikti="$(grep -nE '"(Key|Password|ApiKey)"[[:space:]]*:[[:space:]]*"[^"]+"' \
         EnglishReadingPlatform/appsettings*.json 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "appsettings'te dolu sır alanı" "$n" "$cikti"

# 5. Bağlantı dizesinde gömülü Password= var mı?
cikti="$(grep -nE 'Password=[^;"$]+' EnglishReadingPlatform/appsettings*.json 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "appsettings'te gömülü Password=" "$n" "$cikti"

# 6. .env dosyası yanlışlıkla takibe girmiş mi?
cikti="$(git ls-files | grep -E '(^|/)\.env(\.|$)' | grep -v '\.env\.example$' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir ".env sürüm kontrolünde" "$n" "$cikti"

# 7. .env.example gerçek değer taşıyor mu? (yer tutucu ya da boş olmalı)
cikti="$(grep -nE '^(POSTGRES_PASSWORD|PGADMIN_PASSWORD|PGADMIN_EMAIL|JWT_KEY|Seed__AdminPassword|Seed__AdminEmail)=.+' .env.example 2>/dev/null \
         | grep -v '<DOLDURUN>' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir ".env.example'da gerçek değer" "$n" "$cikti"

# 8. Yaygın API anahtarı desenleri (Groq gsk_, OpenAI sk-, AWS AKIA)
cikti="$(depoda_ara 'gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}' '*')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "API anahtarı deseni" "$n" "$cikti"

# 9. Koda gömülü tohum şifresi geri geldi mi?
cikti="$(depoda_ara 'HashPassword\("[^"]+"\)' '*.cs' | grep -v 'sifre\|password' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "koda gömülü tohum şifresi" "$n" "$cikti"

guard_bitir
