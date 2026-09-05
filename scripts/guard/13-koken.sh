#!/usr/bin/env bash
# KURAL-13 — köken ve kaynak denetimi kapısı.
#
# TASARIM NOTU (faz 1 dersi 1): bu kapı "doğru satır var mı" diye değil,
# "yasak satır YOK mu" diye sorar. Yasağı aramak, yorumla kandırılmaya
# daha dirençlidir — çünkü yorum satırları ayıklanarak taranıyor.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[13] Köken ve kaynak denetimi"

KOD="$(grep -v '^[[:space:]]*//' EnglishReadingPlatform/Program.cs)"

# 1. Joker köken ifadesi kodda var mı?
cikti="$(printf '%s' "$KOD" | grep -nE 'SetIsOriginAllowed|AllowAnyOrigin' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "joker köken ifadesi" "$n" "$cikti"

# 2. Köken listesi merkezî kaynaktan okunuyor mu?
n=0
printf '%s' "$KOD" | grep -q 'GuvenilirKokenler.Oku' || n=1
ihlal_bildir "köken listesi merkezden okunuyor" "$n" \
  "Program.cs GuvenilirKokenler.Oku çağırmıyor — liste elle yazılmış olabilir"

# 3. WithOrigins gerçekten kullanılıyor mu?
n=0
printf '%s' "$KOD" | grep -q 'WithOrigins(' || n=1
ihlal_bildir "CORS beyaz listesi bağlı" "$n" "WithOrigins çağrısı yok"

# 4. appsettings'te joker AllowedHosts kaldı mı?
cikti="$(grep -n '"AllowedHosts"[[:space:]]*:[[:space:]]*"\*"' \
         EnglishReadingPlatform/appsettings*.json 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "joker AllowedHosts" "$n" "$cikti"

# 5. .env.example köken anahtarını belgeliyor mu?
n=0; grep -q '^CorsOrigins=' .env.example || n=1
ihlal_bildir ".env.example CorsOrigins içeriyor" "$n" \
  "yeni bir ortam kuran kişi bu değeri bilemez"

# 6. Sözleşme testi duruyor MU ve hâlâ ölçtüğünü ölçüyor MU?
#    Dosyanın var olması yetmez (faz 1 dersi 1): içi boşaltılırsa kapı yine
#    yeşil verirdi. Kritik üç iddianın adı da aranıyor — biri silinirse kırmızı.
TESTDOSYA=EnglishReadingPlatform.Tests/KokenSozlesmesiTests.cs
n=0; eksik=""
if [ ! -f "$TESTDOSYA" ]; then
  n=1; eksik="KokenSozlesmesiTests.cs silinmiş"
else
  for ad in Yabanci_koken_CORS_izni_ALAMAZ \
            Beyaz_listedeki_koken_izin_ALIR \
            Joker_koken_yapilandirmadan_da_GECEMEZ \
            Uretimde_YABANCI_Host_basligi_REDDEDILIR \
            Uretimde_BEYAZ_LISTEDEKI_Host_basligi_GECER; do
    grep -q "$ad" "$TESTDOSYA" || { n=1; eksik="${eksik}${ad} testi kaldırılmış"$'\n'; }
  done
fi
ihlal_bildir "köken sözleşme testi mevcut" "$n" "$eksik"

# 7. Host başlığı doğrulaması bağlı mı? appsettings'ten joker'i silmek TEK
#    başına yetmez: değer koddan gelmezse ASP.NET Core sessizce "*"e düşer.
n=0
printf '%s' "$KOD" | grep -q 'HostFilteringOptions' || n=1
ihlal_bildir "Host filtresi koddan besleniyor" "$n" \
  "Program.cs HostFilteringOptions yapılandırmıyor — AllowedHosts sessizce '*' olur"

guard_bitir
