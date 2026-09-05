#!/usr/bin/env bash
# KURAL-17 — maliyetli iş ve paylaşılan yazma.
#
# TASARIM NOTU (faz 1 dersi 2): uç gövdeleri YAPISAL kesiliyor — bir sonraki
# [Http...] özniteliğine kadar. Sabit satır penceresi (grep -A20) meşru bir
# eklemede taşar ve YANLIŞ ALARM üretir; yanlış alarm gerçek alarmdan daha
# hızlı güven kaybettirir.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[17] Maliyetli iş ve paylaşılan yazma"

KOD_YOLLARI=('EnglishReadingPlatform/*.cs')

# 1. Durum değiştiren GET ucu var mı?
cikti="$(python3 - <<'PY'
import re, glob
bulunan = []
for yol in sorted(glob.glob("EnglishReadingPlatform/Controllers/*.cs")):
    src = open(yol, encoding="utf-8").read()
    for p in re.split(r'\n(?=\s*\[Http)', src)[1:]:
        if not re.match(r'\s*\[HttpGet', p):
            continue
        govde = "\n".join(s for s in p.split("\n") if not s.strip().startswith("//"))
        if re.search(r'SaveChangesAsync|BenzersizKaydetAsync|ExecuteDelete|ExecuteUpdate', govde):
            m = re.search(r'public\s+(?:async\s+)?(?:Task<)?IActionResult>?\s+(\w+)', p)
            bulunan.append(f"{yol.split('/')[-1]} → {m.group(1) if m else '?'}")
print("\n".join(bulunan))
PY
)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "durum değiştiren GET ucu" "$n" "$cikti"

# 2. 'reanalyze' GET sorgu parametresi geri geldi mi?
#    (POST ucunun ADI 'reanalyze' — aranan şey SORGU PARAMETRESİ.)
cikti="$(depoda_ara 'bool reanalyze|reanalyze=true|reanalyze=\$' "${KOD_YOLLARI[@]}" \
         | grep -v -E ':[0-9]+:[[:space:]]*//' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "reanalyze GET parametresi" "$n" "$cikti"

# 3. LLM/çeviri servisi çağıran her uç maliyetini BİLDİRİYOR mu?
cikti="$(python3 - <<'PY'
import re, glob
PAHALI = re.compile(r'AnalyzeTextAsync|TranslateWordAsync|TranslateSentenceAsync')
bulunan = []
for yol in sorted(glob.glob("EnglishReadingPlatform/Controllers/*.cs")):
    src = open(yol, encoding="utf-8").read()
    for p in re.split(r'\n(?=\s*\[Http)', src)[1:]:
        govde = "\n".join(s for s in p.split("\n") if not s.strip().startswith("//"))
        if not PAHALI.search(govde):
            continue
        if "ParaHarcar" in p:
            continue
        m = re.search(r'public\s+(?:async\s+)?(?:Task<)?IActionResult>?\s+(\w+)', p)
        bulunan.append(f"{yol.split('/')[-1]} → {m.group(1) if m else '?'}")
print("\n".join(bulunan))
PY
)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "bildirilmemiş LLM maliyeti" "$n" "$cikti"

# 4. Paylaşılan veriyi ÜZERİNE yazan uç yetki politikası taşıyor mu?
cikti="$(python3 - <<'PY'
import re, glob
bulunan = []
for yol in sorted(glob.glob("EnglishReadingPlatform/Controllers/*.cs")):
    src = open(yol, encoding="utf-8").read()
    for p in re.split(r'\n(?=\s*\[Http)', src)[1:]:
        if "PaylasilanYazmaBicimi.UzerineYazar" not in p:
            continue
        # Oznitelik bolumu YORUMLARDAN ARINDIRILARAK taranir.
        # Aksi halde politikayi yorum satirina cevirmek kapiyi yesil birakir;
        # MUTASYON B ile tam olarak bu oldu (faz 1 dersi 1).
        # NOT: bu blokta TEK SAYIDA kesme isareti kullanilamaz — macOS bash 3.2,
        # komut ikamesi icindeki heredoc icin tirnak esleme hatasi veriyor.
        oznitelikler = "\n".join(
            s for s in p.split("public")[0].split("\n")
            if not s.strip().startswith("//"))
        if re.search(r'\[Authorize\((Policy|Roles)\s*=', oznitelikler):
            continue
        m = re.search(r'public\s+(?:async\s+)?(?:Task<)?IActionResult>?\s+(\w+)', p)
        bulunan.append(f"{yol.split('/')[-1]} → {m.group(1) if m else '?'}")
print("\n".join(bulunan))
PY
)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "yetkisiz paylaşılan yazma" "$n" "$cikti"

# 5. KAYIT ucu istemciden rol ALIYOR mu?
#    Alırsa 'EgitmenVeyaAdmin' politikası göstermelik olur: herkes kendini
#    öğretmen kaydedip paylaşılan analizi ezebilir.
#
#    Kontrol YAPISAL olarak yalnızca register ucuna bakıyor. Depo geneli
#    'req.Role' araması YANLIŞ ALARM verir: yönetici ucunun
#    (PUT admin/users/{id}/role) istekten rol okuması MEŞRU — orada rolü
#    zaten yalnızca bir yönetici veriyor. Yanlış alarm, gerçek alarmdan
#    daha hızlı güven kaybettirir (faz 1 dersi 2).
cikti="$(python3 - <<'ROL'
import re
src = open("EnglishReadingPlatform/Controllers/AuthController.cs", encoding="utf-8").read()
bulunan = []
for p in re.split(r'\n(?=\s*\[Http)', src)[1:]:
    if '[HttpPost("register")]' not in p.split("public")[0]:
        continue
    govde = "\n".join(s for s in p.split("\n") if not s.strip().startswith("//"))
    if re.search(r'req\.Role', govde):
        bulunan.append("AuthController.cs -> Register istekten rol okuyor")
print("\n".join(bulunan))
ROL
)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "kayıtta rol istemciden alınıyor" "$n" "$cikti"

# 6. Nitelik dosyası duruyor mu?
n=0; [ -f EnglishReadingPlatform/RateLimiting/UcNitelikleri.cs ] || n=1
ihlal_bildir "maliyet/etki nitelikleri mevcut" "$n" "UcNitelikleri.cs yok"

# 7. Sözleşme testi duruyor MU ve hâlâ ölçtüğünü ölçüyor MU?
TESTDOSYA=EnglishReadingPlatform.Tests/MaliyetSozlesmesiTests.cs
n=0; eksik=""
if [ ! -f "$TESTDOSYA" ]; then
  n=1; eksik="MaliyetSozlesmesiTests.cs silinmiş"
else
  for ad in Para_harcayan_her_uc_EN_DAR_kotada \
            Groq_cagiran_her_yol_BILDIRILMIS_olmali \
            Paylasilan_veri_UZERINE_yazan_uc_YETKI_ister \
            Hicbir_GET_ucu_veri_YAZMAZ \
            Ogrenci_paylasilan_analizi_YENIDEN_URETEMEZ \
            Ogretmen_paylasilan_analizi_yeniden_URETEBILIR \
            Basarisiz_analiz_mevcut_veriyi_EZMEZ \
            Bos_alani_dolduran_uc_DOLU_analizi_DEGISTIRMEZ \
            Okuma_ucu_analiz_URETMEZ_ama_bekledigini_SOYLER; do
    grep -q "$ad" "$TESTDOSYA" || { n=1; eksik="${eksik}${ad} testi kaldırılmış"$'\n'; }
  done
fi
ihlal_bildir "maliyet sözleşme testi mevcut" "$n" "$eksik"

guard_bitir
