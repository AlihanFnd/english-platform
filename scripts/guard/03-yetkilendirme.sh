#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[03] Varsayılan reddet — yetkilendirme"

# 1. FallbackPolicy tanımlı mı?
#    DefaultPolicy yazmak yaygın bir hata: özniteliksiz uçları KAPSAMAZ.
#    Bu yüzden özellikle FallbackPolicy aranıyor.
n=0; grep -q "FallbackPolicy" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "FallbackPolicy tanımlı" "$n" "Program.cs içinde AddAuthorization → FallbackPolicy yok"

# 2. activity/stats admin politikası taşıyor mu?
n=0
grep -A6 'HttpGet("stats")' EnglishReadingPlatform/Controllers/ActivityController.cs \
  | grep -q 'AdminOnly' || n=1
ihlal_bildir "activity/stats AdminOnly" "$n" "ActivityController.GetStats admin korumasında değil"

# 3. Ertelenmiş güvenlik yorumu kaldı mı? (teknik borç işaretleri)
cikti="$(kodda_ara 'İleride admin kontrolü|ileride yetki|TODO.*yetki|FIXME.*auth' 'EnglishReadingPlatform/Controllers/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "ertelenmiş yetki yorumu" "$n" "$cikti"

# 4. AuthController'daki anonim uçlar açıkça işaretli mi?
n=0
grep -q "AllowAnonymous" EnglishReadingPlatform/Controllers/AuthController.cs || n=1
ihlal_bildir "anonim uçlar açık işaretli" "$n" "AuthController'da [AllowAnonymous] yok"

# 5. Sözleşme testi dosyası duruyor mu? (silinerek kapı devre dışı bırakılmasın)
n=0; [ -f "EnglishReadingPlatform.Tests/YetkilendirmeSozlesmesiTests.cs" ] || n=1
ihlal_bildir "sözleşme testi mevcut" "$n" "YetkilendirmeSozlesmesiTests.cs silinmiş"

# 6. Sınıf düzeyinde [AllowAnonymous] — tuzak: tüm controller'ı açar.
#    AuthController'a sınıf düzeyinde konsaydı me/logout da anonim olurdu.
cikti="$(awk '
  /^[[:space:]]*\[AllowAnonymous\]/ { bekle=1; satir=FNR; next }
  bekle==1 && /^[[:space:]]*\[/       { next }                      # araya başka öznitelik girebilir
  bekle==1 {
      if ($0 ~ /public[[:space:]]+class/)
          printf "%s:%d: sınıf düzeyinde [AllowAnonymous] — tüm controller açılır\n", FILENAME, satir
      bekle=0
  }
' EnglishReadingPlatform/Controllers/*.cs || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sınıf düzeyinde AllowAnonymous" "$n" "$cikti"

# 7. Minimal API ucu eklenmiş mi? Sözleşme testi yalnızca controller'ları tarar;
#    app.MapGet/MapPost ile eklenen uçlar taramaya GİRMEZ ve sessizce korumasız kalır.
cikti="$(grep -nE '^\s*app\.Map(Get|Post|Put|Delete|Patch)\(' EnglishReadingPlatform/Program.cs || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "kapsanmayan minimal API ucu" "$n" "$cikti"

guard_bitir
