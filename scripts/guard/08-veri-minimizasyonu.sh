#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[08] Veri minimizasyonu"

KONTROLLER='EnglishReadingPlatform/Controllers/*.cs'

# 1. Entity doğrudan döndürülüyor mu?
#    Ok(group) / Ok(record) / Ok(words) … gibi çıplak değişken dönüşleri.
cikti="$(kodda_ara 'return Ok\((group|record|records|words|book|user|item|feedback)\);' "$KONTROLLER")"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "entity doğrudan döndürülüyor" "$n" "$cikti"

# 2. Yanıt DTO dosyası mevcut mu?
n=0; [ -f "EnglishReadingPlatform/Contracts/Yanitlar.cs" ] || n=1
ihlal_bildir "yanıt DTO dosyası mevcut" "$n" "Contracts/Yanitlar.cs yok"

# 3. Yanıt DTO'ları yeterli sayıda mı? (biçim bozulursa test de boş küme gezer)
sayi=$(grep -c "public record" EnglishReadingPlatform/Contracts/Yanitlar.cs 2>/dev/null || echo 0)
n=0; [ "$sayi" -ge 10 ] || n=1
ihlal_bildir "yanıt DTO sayısı >= 10 (bulunan: $sayi)" "$n" "Contracts/Yanitlar.cs yeterli DTO içermiyor"

# 4. Grup kapsam filtresi uygulanıyor mu?
n=0
grep -q "GrupKapsami.GorunurKitapIdleri" EnglishReadingPlatform/Controllers/AppControllers.cs || n=1
ihlal_bildir "grup kapsam filtresi uygulanıyor" "$n" "GetGroupDetails kapsam filtresi kullanmıyor"

# 5. Kapsam filtresi HER İKİ sorguya da uygulanmış mı?
#    Yalnızca ilerlemeyi filtreleyip quiz sonucunu açık bırakmak yarım kapatmadır.
n=0
grep -q "gorunurKitaplar.Contains(p.BookId)" EnglishReadingPlatform/Controllers/AppControllers.cs || n=$((n+1))
grep -q "gorunurKitaplar.Contains(r.Quiz.BookId)" EnglishReadingPlatform/Controllers/AppControllers.cs || n=$((n+1))
ihlal_bildir "kapsam ilerleme VE quiz'e uygulanmış" "$n" "kapsam filtresi eksik sorgu var"

# 6. Davet kodu koşulsuz mu dönüyor? (TÜM controller'lar — kardeş yollar dahil)
#    İzinli biçimler:
#      GrupKapsami.DavetKodu(...)      → merkezî yardımcı
#      AdminUserId == ... ? ...        → satır içi sahiplik koşulu
#      req.InviteCode / InviteCode =   → istek tarafı, yanıt değil
#      g.InviteCode ==                 → arama koşulu (WHERE), yanıt değil
#      public string InviteCode        → DTO/istek alan tanımı
cikti="$(kodda_ara 'InviteCode' "$KONTROLLER" \
  | grep -v 'GrupKapsami\.DavetKodu' \
  | grep -v 'AdminUserId ==' \
  | grep -v 'req\.InviteCode' \
  | grep -v 'InviteCode = ' \
  | grep -v 'InviteCode ==' \
  | grep -v 'public string InviteCode' \
  || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "davet kodu koşulsuz dönüyor" "$n" "$cikti"

# 7. Entity tipi yanıt imzasında geçiyor mu?
cikti="$(kodda_ara 'Task<ActionResult<(User|Book|Group|WordListItem|OcrRecord|Feedback|Quiz)>>' "$KONTROLLER")"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "entity tipi yanıt imzasında" "$n" "$cikti"

# 8. Yanıt DTO'su entity'den türemiş mi?
#    "record KelimeYaniti : WordListItem" yazılırsa tüm alanlar miras alınır ve
#    minimizasyon anlamsızlaşır.
cikti="$(grep -nE 'public record [A-Za-z]+Yaniti[^(]*:' EnglishReadingPlatform/Contracts/Yanitlar.cs 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "DTO entity'den türemiş" "$n" "$cikti"

# 9. Include RATCHET — aşırı çekim geri gelmesin.
#    KURAL-08 öncesi 27'ydi; projeksiyona çevrilerek 13'e indi. Bu sayı
#    ARTAMAZ: yeni bir Include eklenecekse önce bu tavan bilinçli olarak
#    yükseltilmeli, yani karar gözden geçirilmeli.
INCLUDE_TAVANI=13
mevcut=$(grep -rc "\.Include(" EnglishReadingPlatform/Controllers/*.cs 2>/dev/null | awk -F: '{t+=$2} END{print t+0}')
n=0; [ "$mevcut" -le "$INCLUDE_TAVANI" ] || n=1
ihlal_bildir "Include sayısı <= $INCLUDE_TAVANI (mevcut: $mevcut)" "$n" \
  "controller'larda Include sayısı arttı — projeksiyon (.Select) tercih edin"

guard_bitir
