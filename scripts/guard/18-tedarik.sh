#!/usr/bin/env bash
# KURAL-18 — tedarik zinciri ve kriptografik sertleştirme.
#
# TASARIM NOTU: npm/dotnet taramaları AĞA çıkar ve yavaştır. Kapı yine de
# onları çalıştırıyor — "hızlı olsun" diye atlanan bir tarama, olmayan
# taramadır. Ağ yoksa komut kırılır ve kapı KIRMIZI verir; sessizce geçmez.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[18] Tedarik zinciri ve kripto sertleştirme"

MERKEZ="EnglishReadingPlatform/Security/SifreHashleme.cs"

# 1. Merkez dışında doğrudan BCrypt çağrısı kaldı mı?
#    Sahte hash (zamanlama eşitleyici) dâhil HEPSİ merkezden geçmeli; daha
#    düşük faktörle üretilen bir sahte hash, "kullanıcı yok" dalını ölçülebilir
#    biçimde hızlandırır ve KURAL-09 enumerasyonunu geri getirir.
cikti="$(depoda_ara 'BCrypt\.Net\.BCrypt\.' 'EnglishReadingPlatform/*.cs' \
         | grep -v 'Security/SifreHashleme.cs' \
         | grep -v -E ':[0-9]+:[[:space:]]*//' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "merkez dışında BCrypt çağrısı" "$n" "$cikti"

# 2. Merkez dosyası duruyor mu?
n=0; [ -f "$MERKEZ" ] || n=1
ihlal_bildir "şifre hashleme merkezi mevcut" "$n" "SifreHashleme.cs yok"

# 3. İş faktörü asgari değerin altında mı?
faktor="$(grep -oE 'IsFaktoru[[:space:]]*=[[:space:]]*[0-9]+' "$MERKEZ" 2>/dev/null \
          | grep -oE '[0-9]+' | head -1)"
faktor="${faktor:-0}"
n=0; [ "$faktor" -ge 12 ] 2>/dev/null || n=1
ihlal_bildir "BCrypt iş faktörü >= 12 (mevcut: $faktor)" "$n" \
  "sabit bulunamadı ya da 12'nin altında"

# 3b. Hashle() sabiti GERÇEKTEN kullanıyor mu?
#      "Sabiti 12 yaptım, iş bitti" yanılgısı: cagriyi HashPassword(sifre)
#      olarak birakmak kutuphane varsayilanini (11) surdurur ve sabit YALAN
#      soyler. Kapinin okudugu metin dogru, uretilen hash yanlis olur.
#
#      NOT: bu kontrol metin tabanli ve tek basina zayif. Asil olcum
#      Uretilen_hash_dogru_is_faktorunu_TASIR testinde: o test URETILEN
#      hash'e bakiyor, sabite degil. Ikisi birlikte katmanli savunma.
n=0
grep -v '^[[:space:]]*//' "$MERKEZ" | grep -q 'HashPassword(sifre, IsFaktoru)' || n=1
ihlal_bildir "Hashle() sabiti gerçekten kullanıyor" "$n" \
  "HashPassword sabiti almıyor — kütüphane varsayılanı sessizce sürer"

# 4. Kademeli yenileme girişe bağlı mı?
#    Yorumlar ayıklanarak taranıyor: yorumdaki bir ad kapıyı kandırmasın.
n=0
grep -v '^[[:space:]]*//' EnglishReadingPlatform/Controllers/AuthController.cs \
  | grep -q 'YenilenmeliMi' || n=1
ihlal_bildir "girişte kademeli yeniden hash" "$n" \
  "eski faktörlü hash'ler ASLA güncellenmez — bcrypt tek yönlü olduğu için toplu migration da yapılamaz"

# 5. npm zafiyeti — HER İKİ istemci.
#    İkisini birden ölçmek bu kuralın var olma sebebi: ölçüm anında biri
#    yamalıydı, diğeri değildi ve kimse fark etmemişti.
#
#    node_modules yoksa tarama YAPILAMAZ (ör. CI'nin backend işi npm kurmuyor).
#    O durumda kontrol "atlandı" diye geçilmiyor: 5b, CI iş akışının bu taramayı
#    GERÇEKTEN yaptığını doğruluyor. Yani kapsam hiçbir koşulda sessizce kaybolmuyor.
for uyg in frontend admin-panel; do
  if [ -d "$uyg/node_modules" ]; then
    n=0
    (cd "$uyg" && npm audit --audit-level=high >/dev/null 2>&1) || n=1
    ihlal_bildir "$uyg npm audit" "$n" \
      "yüksek/kritik zafiyet var — 'npm audit fix', sonra 'git diff package-lock.json'"
  else
    printf '  %-42s %s\n' "$uyg npm audit" "node_modules yok — 5b'ye devredildi"
  fi
done

# 5b. CI, npm taramasını GERÇEKTEN yapıyor mu?
#     Yerelde node_modules olmadığında tek güvencemiz bu; iş akışından
#     'npm audit' adımı silinirse yerel kapı hiçbir şey söylemezdi.
IS_AKISI=".github/workflows/guvenlik.yml"
eksik=""
if [ ! -f "$IS_AKISI" ]; then
  eksik="CI iş akışı yok"
else
  grep -q 'npm audit --audit-level=high' "$IS_AKISI" \
    || eksik="CI iş akışında 'npm audit --audit-level=high' adımı YOK"$'\n'
  grep -qE 'uygulama:[[:space:]]*\[frontend, ?admin-panel\]' "$IS_AKISI" \
    || eksik="${eksik}CI matrisi iki istemciyi birden kapsamıyor"$'\n'
fi
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "CI npm taraması iki istemciyi kapsıyor" "$n" "$eksik"

# 5c. package.json sürümleri SABİT mi?
#     package-lock.json tek başına yetmez: 'npm ci' kilide uyar ama
#     'npm install' aralığı yeniden çözer ve sürüm SESSİZCE kayar.
#     .csproj tarafında sürümler zaten sabit.
cikti="$(python3 - <<'PIN'
import json, pathlib
bulunan = []
for uyg in ("frontend", "admin-panel"):
    yol = pathlib.Path(uyg) / "package.json"
    if not yol.exists():
        continue
    d = json.loads(yol.read_text(encoding="utf-8"))
    for bolum in ("dependencies", "devDependencies"):
        for ad, spec in d.get(bolum, {}).items():
            if spec and spec[0] in "^~" or spec in ("*", "latest"):
                bulunan.append(f"{uyg}/{ad}: {spec}")
print("\n".join(bulunan))
PIN
)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "package.json sürüm aralığı" "$n" "$cikti"

# 6. .NET zafiyeti
cikti="$(dotnet list Linguza.sln package --vulnerable --include-transitive 2>&1 \
         | grep -E '(High|Critical)' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir ".NET bağımlılık zafiyeti" "$n" "$cikti"

# 7. İstisna kaydı: dosya VAR mı, geçerli mi, süresi geçmiş kayıt var mı?
ISTISNA="guvenlik/zafiyet-istisnalari.json"
n=0; [ -f "$ISTISNA" ] || n=1
ihlal_bildir "zafiyet istisna kaydı mevcut" "$n" \
  "$ISTISNA yok — istisna yolu olmayınca baskı altında seçilen hep 'kapıyı gevşet' olur"

cikti="$(python3 - <<'IST'
import json, datetime, pathlib, sys
yol = pathlib.Path("guvenlik/zafiyet-istisnalari.json")
if not yol.exists():
    sys.exit(0)
try:
    d = json.loads(yol.read_text(encoding="utf-8"))
except Exception as e:
    print(f"JSON okunamadi: {type(e).__name__}")
    sys.exit(0)
bugun = datetime.date.today().isoformat()
for i in d.get("istisnalar", []):
    ad = i.get("tanimlayici", "?")
    son = i.get("sonKullanma", "")
    if not son:
        print(f"{ad}: son kullanma tarihi YOK - tarihsiz istisna kalici olur")
    elif son < bugun:
        print(f"{ad}: suresi doldu ({son})")
    if not i.get("gerekce"):
        print(f"{ad}: gerekce YOK")
IST
)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "süresi geçmiş/eksik zafiyet istisnası" "$n" "$cikti"

# 8. Sözleşme testi duruyor MU ve hâlâ ölçtüğünü ölçüyor MU?
TESTDOSYA=EnglishReadingPlatform.Tests/SifreHashlemeTests.cs
n=0; eksik=""
if [ ! -f "$TESTDOSYA" ]; then
  n=1; eksik="SifreHashlemeTests.cs silinmiş"
else
  for ad in Is_faktoru_asgari_12 \
            Uretilen_hash_dogru_is_faktorunu_TASIR \
            Eski_faktorlu_hash_YENILENMELI_isaretlenir \
            Taninmayan_hash_bicimi_YENILENMELI_sayilmaz \
            Giriste_eski_hash_sessizce_GUCLENDIRILIR \
            Guclendirmeden_SONRA_ayni_sifreyle_tekrar_girilebilir \
            Tum_hash_uretimi_MERKEZDEN_gecer; do
    grep -q "$ad" "$TESTDOSYA" || { n=1; eksik="${eksik}${ad} testi kaldırılmış"$'\n'; }
  done
fi
ihlal_bildir "şifre hashleme sözleşme testi mevcut" "$n" "$eksik"

guard_bitir
