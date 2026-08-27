#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[06] Hata ve log hijyeni"

# Yorum satırlarını eler: kuralı ANLATAN yorumlar ihlal sayılmamalı.
# Yanlış pozitif üreten kapı er geç kapatılır.
yorumsuz() { grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' || true; }

# ── 1. İstisna metni yanıtta ────────────────────────────────────────────
# Tek bir ex.Message, Groq/Npgsql'in ham yanıt gövdesini istemciye taşır.
cikti="$(depoda_ara 'error = .*ex\.Message|error = .*ex\.ToString|\+ ex\.Message|\{ex\.Message\}|\{ex\.ToString\(\)\}' \
         'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "istisna metni yanıtta" "$n" "$cikti"

# ── 2. Console.WriteLine ────────────────────────────────────────────────
# Seviyesi yok, filtrelenemez, üretimde toplanamaz; appsettings'teki
# Logging:LogLevel ayarı bu satırların hiçbirini etkilemez.
# Kapsam TÜM proje: Controllers/Services'te kapatıp Security/ veya Data/'da
# açık bırakmak "yarım kapatma"dır.
cikti="$(depoda_ara 'Console\.(WriteLine|Write|Error)' 'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "Console.WriteLine kullanımı" "$n" "$cikti"

# ── 3. Hata middleware'i kayıtlı mı? ────────────────────────────────────
n=0; grep -qE '^[[:space:]]*app\.HataYakalamayiKullan\(\)' EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "hata middleware'i kayıtlı" "$n" "Program.cs'te app.HataYakalamayiKullan() yok"

# ── 4. Zincirin EN BAŞINDA mı? ──────────────────────────────────────────
# UseRouting'den sonra konursa routing/model binding/CORS istisnaları
# ASP.NET Core'un varsayılan işleyicisine düşer ve yığın izi dönebilir.
n=0
if grep -qE '^[[:space:]]*app\.HataYakalamayiKullan\(\)' EnglishReadingPlatform/Program.cs; then
  hata_satir=$(grep -nE '^[[:space:]]*app\.HataYakalamayiKullan\(\)' EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
  routing_satir=$(grep -nE '^[[:space:]]*app\.UseRouting\(\)' EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
  statik_satir=$(grep -nE '^[[:space:]]*app\.UseStaticFiles\(\)' EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
  for k in "$routing_satir" "$statik_satir"; do
    [ -n "$k" ] && [ "$hata_satir" -lt "$k" ] || n=1
  done
fi
ihlal_bildir "hata middleware'i zincirin başında" "$n" "UseStaticFiles/UseRouting'den sonra geliyor"

# ── 5. Log'a veya veritabanına düz kullanıcı içeriği ────────────────────
# Kullanıcının hangi kelimeyi bilmediği bir öğrenme profilidir; PII'dir.
cikti="$(depoda_ara 'Details = \$"Word:|Details = \$"Kelime:' 'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "veritabanına düz kullanıcı kelimesi" "$n" "$cikti"

# Loga ham kullanıcı değişkeni geçilmesi. GuvenliLog.* ile sarılmışsa eşleşmez.
cikti="$(depoda_ara '_logger\.Log[A-Za-z]+\(.*,[[:space:]]*(clean|word|text|metin|kelime|eposta|email|token|password|sifre)[[:space:]]*\)' \
         'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "log'a maskesiz kullanıcı içeriği" "$n" "$cikti"

# ── 6. String interpolasyonlu (yapılandırılmamış) log ───────────────────
# $"..." tek bir düz string üretir: alan bazlı arama yapılamaz ve
# GuvenliLog maskelemesi sessizce atlanır.
cikti="$(depoda_ara '_logger\.Log[A-Za-z]+\(([A-Za-z_][A-Za-z0-9_]*,[[:space:]]*)?\$"' \
         'EnglishReadingPlatform/**/*.cs' | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "interpolasyonlu log çağrısı" "$n" "$cikti"

# ── 7. Include Error Detail üretim yapılandırmasında ────────────────────
# Npgsql istisnalarına tablo/kolon adlarını ekler.
cikti="$(grep -n 'Include Error Detail=true' EnglishReadingPlatform/appsettings.json 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "appsettings'te Include Error Detail" "$n" "$cikti"

# ── 8. ILogger gerçekten kullanılıyor mu? ───────────────────────────────
# Console kapatılıp yerine HİÇBİR ŞEY konmaması da bir gerileme olurdu:
# o zaman hata ayıklanamaz ve "sessiz başarısızlık" geri gelir.
sayi=$(depoda_ara 'ILogger' 'EnglishReadingPlatform/Controllers/*.cs' 'EnglishReadingPlatform/Services/*.cs' \
       | cut -d: -f1 | sort -u | grep -c . || true)
n=0; [ "$sayi" -ge 3 ] || n=1
ihlal_bildir "ILogger kullanan dosya ≥ 3 (şu an $sayi)" "$n" "Console kaldırıldı ama yerine ILogger konmamış"

# ── 9. Sessiz başarısızlık geri gelmesin ────────────────────────────────
# TranslateSentenceAsync string dönerse başarısızlık bilgisi yine kaybolur:
# İngilizce metin, Türkçe çevirisiymiş gibi 200 ile geri döner.
n=0; grep -qE 'Task<CeviriSonucu> TranslateSentenceAsync' \
       EnglishReadingPlatform/Services/TranslationService.cs || n=1
ihlal_bildir "cümle çevirisi başarı durumunu taşıyor" "$n" \
             "TranslateSentenceAsync artık CeviriSonucu döndürmüyor — sessiz başarısızlık geri geldi"

n=0; grep -qE 'ceviriBasarili([^A-Za-z0-9_]|$)' EnglishReadingPlatform/Services/TranslationService.cs || n=1
ihlal_bildir "analiz sonucunda ceviriBasarili alanı" "$n" "AnalyzedSentence bayrağı kaldırılmış"

# ── 10. Arayüz "çevrilemedi" uyarısını GERÇEKTEN gösteriyor mu? ─────────
# Backend'in bayrak üretmesi tek başına işe yaramaz: arayüz göstermezse
# kullanıcı hâlâ İngilizce cümleyi Türkçe çevirisi sanır. Yani sessiz
# başarısızlık kapanmış SAYILMAZ. Yorum satırı sayılmaz.
for hedef in "frontend/app/api.ts" \
             "frontend/app/books/[id]/page.tsx" \
             "frontend/app/ocr/page.tsx"; do
  n=0
  # DİKKAT: sınır ZORUNLU. Çıplak "ceviriBasarili" deseni, alanı
  # "ceviriBasariliXYZ" diye yeniden adlandıran bir değişikliği de eşleştirir
  # ve kapı sessizce yeşil kalır — mutasyon testi bunu tam olarak yakaladı.
  grep -E 'ceviriBasarili([^A-Za-z0-9_]|$)' "$hedef" 2>/dev/null \
    | grep -qvE '^[[:space:]]*(//|\*|/\*)' || n=1
  ihlal_bildir "arayüz bayrağı okuyor: $(basename "$hedef")" "$n" \
               "$hedef içinde ceviriBasarili yok — uyarı kullanıcıya hiç ulaşmıyor"
done

# Kullanıcıya dönük metin gerçekten basılıyor mu? Alanı okuyup hiçbir şey
# göstermemek de aynı kapıdan geçerdi.
for hedef in "frontend/app/books/[id]/page.tsx" "frontend/app/ocr/page.tsx"; do
  n=0
  grep -qE "çevrilemedi" "$hedef" 2>/dev/null || n=1
  ihlal_bildir "uyarı metni mevcut: $(basename "$hedef")" "$n" \
               "$hedef bayrağı okuyor ama kullanıcıya hiçbir uyarı basmıyor"
done

# Kullanıcı kurtulabiliyor mu? Başarısız çeviri SentencesJson'a kalıcı
# yazıldığı için, yeniden deneme yolu olmazsa sayfa sonsuza dek "çevrilemedi"
# kalırdı.
n=0; grep -q "handleReanalyze" "frontend/app/books/[id]/page.tsx" \
     && grep -q "onClick={handleReanalyze}" "frontend/app/books/[id]/page.tsx" || n=1
ihlal_bildir "okuyucuda yeniden deneme butonu bağlı" "$n" \
             "handleReanalyze tanımlı ama hiçbir butona bağlanmamış (ölü kod)"

# ── 11. Sözleşme testleri duruyor mu? ───────────────────────────────────
# Test silinirse kapı yeşil kalır ama hiçbir şey ölçülmez.
n=0; [ -f "EnglishReadingPlatform.Tests/HataMiddlewareTests.cs" ] || n=1
ihlal_bildir "middleware birim testi mevcut" "$n" "HataMiddlewareTests.cs silinmiş"

n=0; [ -f "EnglishReadingPlatform.Tests/HataHijyeniTests.cs" ] || n=1
ihlal_bildir "uçtan uca hata hijyeni testi mevcut" "$n" "HataHijyeniTests.cs silinmiş"

n=0; [ -f "EnglishReadingPlatform.Tests/CeviriBayragiTests.cs" ] || n=1
ihlal_bildir "çeviri bayrağı sözleşme testi mevcut" "$n" "CeviriBayragiTests.cs silinmiş"

guard_bitir
