#!/usr/bin/env bash
# KURAL-19 — kişisel veri yaşam döngüsü.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[19] Kişisel veri yaşam döngüsü"

ENVANTER="EnglishReadingPlatform/Data/KisiselVeriEnvanteri.cs"
TEMIZLIK="EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs"
VERIM="EnglishReadingPlatform/Controllers/VerimController.cs"

# 1. Envanter dosyası duruyor mu?
n=0; [ -f "$ENVANTER" ] || n=1
ihlal_bildir "kişisel veri envanteri mevcut" "$n" "KisiselVeriEnvanteri.cs yok"

# 2. OcrRecords saklama süresi TANIMLI mı?
n=0; grep -q 'OcrKaydi' "$TEMIZLIK" 2>/dev/null || n=1
ihlal_bildir "OCR saklama süresi tanımlı" "$n" \
  "içeriğini bilmediğimiz kullanıcı metni süresiz saklanıyor"

# 3. Temizlik OCR'ı GERÇEKTEN siliyor mu?
#    "Sabiti tanımladım, iş bitti" tipik yarım iştir: sabit durur, hiçbir
#    satır silinmez ve kural yapılmış GÖRÜNÜR. Yorumlar ayıklanarak taranıyor.
n=0
grep -v '^[[:space:]]*//' "$TEMIZLIK" 2>/dev/null \
  | grep -q 'OcrRecords' || n=1
ihlal_bildir "OCR temizliği uygulanıyor" "$n" \
  "sabit var ama db.OcrRecords üzerinde silme yok"

# 3b. Kimlik doğrulama sırları SIR sınıfında mı?
#      Bir alanı Sir sınıfından çıkarmak, "hicbir Sir disa aktarilmiyor"
#      iddiasini otomatik olarak saglar ve kapiyi yesil birakirdi.
eksik=""
grep -q 'new("Users", "PasswordHash", VeriSinifi.Sir' "$ENVANTER" 2>/dev/null \
  || eksik="Users.PasswordHash Sir sınıfında değil"$'\n'
grep -q 'new("SifreSifirlamaJetonlari", "JetonHash", VeriSinifi.Sir' "$ENVANTER" 2>/dev/null \
  || eksik="${eksik}SifreSifirlamaJetonlari.JetonHash Sir sınıfında değil"$'\n'
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "kimlik sırları Sir sınıfında" "$n" "$eksik"

# 4. Veri sahibi hakları uçları var mı?
eksik=""
for uc in "envanter" "disa-aktar" "hesabimi-sil"; do
  grep -rq "\"$uc\"" EnglishReadingPlatform/Controllers/ 2>/dev/null \
    || eksik="${eksik}${uc} ucu yok"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "veri sahibi hakları uçları" "$n" "$eksik"

# 5. Hesap silme ŞİFRE istiyor mu?
n=0
grep -v '^[[:space:]]*//' "$VERIM" 2>/dev/null \
  | grep -q 'SifreHashleme.Dogrula' || n=1
ihlal_bildir "hesap silme şifre istiyor" "$n" \
  "çalınmış bir token tek başına hesabı ve tüm veriyi silebilir"

# 6. Dışa aktarma sorgularının HEPSİ kullanıcıya filtreli mi?
#    Filtreyi unutmak bu ucun en tehlikeli hatasıdır: uç bütün veritabanını
#    döker. Her ToListAsync/FirstOrDefaultAsync bir Where taşımalı.
cikti="$(python3 - <<'FIL'
import re, pathlib
yol = pathlib.Path("EnglishReadingPlatform/Controllers/VerimController.cs")
if not yol.exists():
    raise SystemExit(0)
src = yol.read_text(encoding="utf-8")
m = re.search(r'public async Task<IActionResult> DisaAktar\(\)(.*?)\n    \}', src, re.S)
if not m:
    print("DisaAktar metodu bulunamadi")
    raise SystemExit(0)
govde = "\n".join(s for s in m.group(1).split("\n") if not s.strip().startswith("//"))
for sorgu in re.findall(r'_db\.(\w+)\s*\n?(.*?)(?:ToListAsync|FirstOrDefaultAsync)\(\)', govde, re.S):
    tablo, ara = sorgu
    if ".Where(" not in ara:
        print(f"{tablo}: kullanici filtresi YOK")
FIL
)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "dışa aktarma kullanıcıya filtreli" "$n" "$cikti"

# 7. Kişisel veri dosyası DEPODA mı? (KURAL-12'nin kardeş kontrolü)
cikti="$(git ls-files | grep -E '\.(db|sqlite|sqlite3|dump|bak)$' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "kişisel veri dosyası repoda" "$n" "$cikti"

# 8. Aydınlatma metnine bağlantı var mı? (istemci tarafı)
n=0
grep -rq "gizlilik" frontend/app --include="*.tsx" 2>/dev/null || n=1
ihlal_bildir "gizlilik sayfasına bağlantı" "$n" \
  "kayıt/gezinti ekranında aydınlatma metni bağlantısı yok"

# 9. Sözleşme testi duruyor MU ve hâlâ ölçtüğünü ölçüyor MU?
TESTDOSYA=EnglishReadingPlatform.Tests/KisiselVeriTests.cs
n=0; eksik=""
if [ ! -f "$TESTDOSYA" ]; then
  n=1; eksik="KisiselVeriTests.cs silinmiş"
else
  for ad in Kisisel_veri_tasiyan_her_kolon_ENVANTERDE \
            Sirlar_disa_aktarmaya_GIRMEZ \
            Belirsiz_icerik_SURESIZ_saklanmaz \
            Disa_aktarma_sifre_hashini_ICERMEZ \
            Disa_aktarma_BASKASININ_verisini_icermez \
            Hesap_silme_SIFRE_ister \
            Hesap_silinince_tum_kisisel_veri_GIDER \
            Saklama_temizligi_eski_OCR_kaydini_siler_yenisini_BIRAKIR; do
    grep -q "$ad" "$TESTDOSYA" || { n=1; eksik="${eksik}${ad} testi kaldırılmış"$'\n'; }
  done
fi
ihlal_bildir "kişisel veri sözleşme testi mevcut" "$n" "$eksik"

guard_bitir
