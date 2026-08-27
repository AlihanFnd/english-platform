#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[05] Girdi doğrulama"

# Yorum satırlarını eler. Kapının, kuralı ANLATAN yorumları ihlal sayması
# yanlış pozitif üretir; yanlış pozitif üreten kapı er geç kapatılır.
yorumsuz() { grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' || true; }

# ── 1. Doğrulama özniteliği taşımayan istek DTO'su var mı? ──────────────
# Her "public class XxxRequest" / "XxxIstegi" gövdesinin ilk 30 satırında
# en az bir doğrulama özniteliği bulunmalı.
eksik=""
for dosya in EnglishReadingPlatform/Controllers/*.cs; do
  [ -e "$dosya" ] || continue
  while IFS= read -r satir; do
    no="${satir%%:*}"
    ad="$(printf '%s' "$satir" | sed -E 's/.*public class ([A-Za-z0-9_]+).*/\1/')"
    if ! sed -n "${no},$((no+30))p" "$dosya" \
         | grep -qE '\[(Required|StringLength|Range|IzinliDeger|MaxLength|RegularExpression|EmailAddress)'; then
      eksik="${eksik}${dosya}:${no}: ${ad}"$'\n'
    fi
  done < <(grep -nE "public class [A-Za-z0-9_]*(Request|Istegi)\b" "$dosya" 2>/dev/null)
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "doğrulamasız istek DTO'su" "$n" "$eksik"

# ── 2. Hata biçimi { error } sözleşmesi korunuyor mu? ───────────────────
# ProblemDetails'a düşmek istemciyi "HTTP error! status: 400" göstermeye zorlar.
n=0; grep -q "InvalidModelStateResponseFactory" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "hata biçimi { error } korunuyor" "$n" "ApiBehaviorOptions yapılandırılmamış"

# ── 3. Sınırlar tek kaynaktan mı geliyor? ───────────────────────────────
# [StringLength(200)] yerine [StringLength(AlanSinirlari.Baglam)] zorunlu.
# Elle yazılan sayı, entity ile DTO'nun sessizce ayrışmasının kaynağıdır.
cikti="$(depoda_ara 'StringLength\([0-9]+' 'EnglishReadingPlatform/Controllers/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "elle yazılmış StringLength sayısı" "$n" "$cikti"

cikti="$(depoda_ara 'MaxLength\([0-9]+' 'EnglishReadingPlatform/Models/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "elle yazılmış entity MaxLength sayısı" "$n" "$cikti"

# ── 4. Whitelist ikinci bir yere kopyalanmış mı? ────────────────────────
# [IzinliDeger(new[]{...})] whitelist'i öznitelik içine kopyalar; iki kopya ayrışır.
cikti="$(depoda_ara 'IzinliDeger\(new' 'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "whitelist özniteliğe kopyalanmış" "$n" "$cikti"

# ── 5. Blocklist deseni (whitelist kullanılmalı) ────────────────────────
cikti="$(depoda_ara 'Blacklist|blocklist|yasakliKelimeler|BannedWords' 'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "blocklist deseni" "$n" "$cikti"

# ── 6. Koleksiyon alanları İKİ sınır da bildiriyor mu? ──────────────────
# [MaxLength] sözlükte/listede yalnızca ELEMAN SAYISINI sınırlar. Eleman
# İÇERİĞİ ayrıca sınırlanmazsa "en fazla 100 cevap" kuralı varken tek bir
# cevap 200.000 karakter olabilir.
eksik=""
for dosya in EnglishReadingPlatform/Controllers/*.cs; do
  [ -e "$dosya" ] || continue
  while IFS= read -r satir; do
    no="${satir%%:*}"
    icerik="${satir#*:}"
    # Alanın hemen ÜSTÜNDEKİ 6 satırda öznitelikler aranır.
    bas=$(( no > 6 ? no - 6 : 1 ))
    # Yorum satırları elenir: açıklamada geçen "[OgeIzinliDeger]" ibaresi
    # gerçek bir öznitelik değildir ve kapıyı kandırmamalıdır.
    ust="$(sed -n "${bas},${no}p" "$dosya" | grep -vE '^[[:space:]]*(//|\*|/\*)')"
    printf '%s' "$ust" | grep -qE '\[MaxLength' \
      || eksik="${eksik}${dosya}:${no}: eleman SAYISI sınırı yok →${icerik}"$'\n'
    printf '%s' "$ust" | grep -qE '\[(OgeUzunlugu|OgeIzinliDeger)' \
      || eksik="${eksik}${dosya}:${no}: eleman İÇERİĞİ sınırı yok →${icerik}"$'\n'
  done < <(grep -nE '^\s*public (Dictionary<[^>]*string>|List<string>|string\[\]|IList<string>|ICollection<string>|IEnumerable<string>) ' "$dosya" 2>/dev/null)
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "sınırsız koleksiyon alanı" "$n" "$eksik"

# ── 7. Rota/sorgu parametreleri doğrulanıyor mu? ────────────────────────
# Gövde alanları kadar sorgu ve rota parametreleri de istemci girdisidir.
# "(int id)" gibi çıplak bir imza, doğrulanmamış bir kimlik demektir.
cikti="$(grep -nE 'public (async Task<IActionResult>|IActionResult) [A-Za-z0-9_]+\((int|\[FromQuery\] int) ' \
         EnglishReadingPlatform/Controllers/*.cs 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "doğrulamasız rota/sorgu parametresi" "$n" "$cikti"

# ── 8. Claim doğrudan int.Parse ediliyor mu? ────────────────────────────
# JWT claim'i de bir girdidir: int.Parse bozuk bir claim'de 500 üretir.
cikti="$(depoda_ara 'int\.Parse\(User\.|int\.Parse\(userIdClaim' 'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "claim int.Parse ile okunuyor" "$n" "$cikti"

# ── 9. Taksonomi ucu duruyor mu? ────────────────────────────────────────
# Uç kaldırılırsa istemciler yine kopya liste tutmaya başlar.
# Yorum satırı sayılmaz: "// [HttpGet(...)]" ucu KALDIRIR ama grep'i kandırır.
n=0; grep -qE '^[[:space:]]*\[HttpGet\("taxonomy"\)\]' \
       EnglishReadingPlatform/Controllers/BooksController.cs || n=1
ihlal_bildir "taksonomi ucu mevcut" "$n" "GET /api/books/taxonomy silinmiş"

n=0; grep -E "/api/books/taxonomy" admin-panel/app/books/page.tsx \
       | grep -qvE '^[[:space:]]*(//|\*|/\*)' || n=1
ihlal_bildir "panel taksonomiyi backendden çekiyor" "$n" "panel yine kopya liste tutuyor"

# Öğrenci arayüzü de kopya liste tutmamalı: seviye eklenip burası unutulursa
# o seviyedeki kitaplar filtrede SESSİZCE kaybolur, hata mesajı bile çıkmaz.
n=0; grep -E "getTaxonomy" frontend/app/books/page.tsx \
       | grep -qvE '^[[:space:]]*(//|\*|/\*)' || n=1
ihlal_bildir "frontend taksonomiyi backendden çekiyor" "$n" "frontend yine kopya liste tutuyor"

n=0; grep -E "'/books/taxonomy'" frontend/app/api.ts \
       | grep -qvE '^[[:space:]]*(//|\*|/\*)' || n=1
ihlal_bildir "frontend taksonomi ucu api.ts'te" "$n" "HTTP çağrısı api.ts dışında yapılıyor"

# ── 10. İstek gövdesi üst sınırı yapılandırılmış mı? ─────────────────────
# [StringLength] gövde ÇÖZÜMLENDİKTEN sonra çalışır; doğrulamadan önceki tek
# savunma budur.
n=0; grep -q "MaxRequestBodySize" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "istek gövdesi üst sınırı var" "$n" "Kestrel MaxRequestBodySize ayarlanmamış"

# ── 11. Tohum verisi deterministik mi? ──────────────────────────────────
# HasData içinde DateTime.UtcNow, her 'migrations add' çağrısında sahte bir
# UpdateData doğurur; gerçek bir şema değişikliği o gürültüde kaybolur.
cikti="$(grep -n "HasData" -A40 EnglishReadingPlatform/Data/AppDbContext.cs \
         | grep -E "DateTime\.UtcNow|DateTime\.Now" \
         | grep -vE '^[0-9]+[-:][[:space:]]*(//|\*)' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "tohum verisinde değişken zaman" "$n" "$cikti"

# ── 12. Sözleşme testleri duruyor mu? ───────────────────────────────────
n=0; [ -f "EnglishReadingPlatform.Tests/AlanSinirlariTests.cs" ] || n=1
ihlal_bildir "sınır sözleşmesi testi mevcut" "$n" "AlanSinirlariTests.cs silinmiş"

n=0; [ -f "EnglishReadingPlatform.Tests/GirdiDogrulamaTests.cs" ] || n=1
ihlal_bildir "uçtan uca 400 testi mevcut" "$n" "GirdiDogrulamaTests.cs silinmiş"

guard_bitir
