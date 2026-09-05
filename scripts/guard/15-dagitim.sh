#!/usr/bin/env bash
# KURAL-15 — dağıtım kapısı.
#
# TASARIM NOTU (faz 1 dersi 1): "dosya var mı" kontrolleri tek başına
# kandırılabilir. Bu yüzden mümkün olan yerde ÜRETİLMİŞ DURUM okunuyor:
# .gitignore kararı `git check-ignore` ile (elle grep ile değil), sözleşme
# testleri ADLARIYLA, betikler çalıştırılabilirlik biti ile.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[15] Dağıtım kapısı"

KOD="$(grep -v '^[[:space:]]*//' EnglishReadingPlatform/Program.cs)"
URETIM_AYARI="EnglishReadingPlatform/appsettings.Production.json"

# 1. Sağlık ucu bağlı mı?
n=0; printf '%s' "$KOD" | grep -q 'MapHealthChecks' || n=1
ihlal_bildir "sağlık ucu yayımlanmış" "$n" "MapHealthChecks yok"

# 2. Sağlık kontrolü veritabanını kapsıyor mu?
n=0; printf '%s' "$KOD" | grep -q 'AddDbContextCheck' || n=1
ihlal_bildir "sağlık kontrolü veritabanını kapsıyor" "$n" \
  "yalnızca 'ayaktayım' diyen uç, migration'ı düşmüş örneği sağlıklı gösterir"

# 3. Sağlık ucu ayrıntı sızdıran varsayılan yazıcıyı kullanıyor mu?
#    Özel ResponseWriter yoksa kütüphane adları ve istisna metinleri anonim
#    bir uçtan dışarı akar (KURAL-06).
n=0; printf '%s' "$KOD" | grep -q 'ResponseWriter' || n=1
ihlal_bildir "sağlık ucu özel yanıt yazıcısı kullanıyor" "$n" \
  "varsayılan yazıcı kontrol/kütüphane adlarını ve istisna metinlerini döker"

# 4. Ortam sözleşmesi bağlı mı?
n=0; printf '%s' "$KOD" | grep -q 'OrtamSozlesmesi.UretimdeDogrula' || n=1
ihlal_bildir "ortam sözleşmesi doğrulanıyor" "$n" "Program.cs sözleşmeyi çağırmıyor"

n=0; [ -f EnglishReadingPlatform/Configuration/OrtamSozlesmesi.cs ] || n=1
ihlal_bildir "ortam sözleşmesi dosyası mevcut" "$n" "OrtamSozlesmesi.cs yok"

# 5. Üretim log yapılandırması VAR ve ÜRETİME GİDİYOR mu?
n=0; [ -f "$URETIM_AYARI" ] || n=1
ihlal_bildir "appsettings.Production.json mevcut" "$n" "dosya yok"

# Üretilmiş durumdan oku. DİKKAT: burada `git check-ignore` YETMEZ —
# .gitignore, zaten TAKİP EDİLEN bir dosyaya uygulanmaz, yani dosya
# commit'liyken ignore satırı geri konsa bile check-ignore sessiz kalır.
# MUTASYON D bunu ortaya çıkardı: kapı yeşil verdi.
#
# Gerçek soru "yok sayılıyor mu" değil, "ÜRETİME GİDİYOR MU" — cevabı
# dosyanın takip edilip edilmediğidir. İkisi birden kontrol ediliyor:
# takipten çıkarılmışsa VEYA yok sayılıyorsa kapı kırmızı.
n=0
if [ -f "$URETIM_AYARI" ]; then
  git ls-files --error-unmatch "$URETIM_AYARI" >/dev/null 2>&1 || n=1
  git check-ignore -q "$URETIM_AYARI" && n=1
fi
ihlal_bildir "üretim log ayarı depoya giriyor" "$n" \
  "takip edilmiyor ya da .gitignore'a takılıyor — dosya ÜRETİME HİÇ GİTMEZ"

# 6. EF komut logu üretimde kısılmış mı?
n=0
grep -q '"Microsoft.EntityFrameworkCore.Database.Command"[[:space:]]*:[[:space:]]*"Warning"' \
  "$URETIM_AYARI" 2>/dev/null || n=1
ihlal_bildir "üretimde SQL logu kısılmış" "$n" "her sorgu loga akıyor"

# 7. Kendi kayıtlarımız üretimde GÖRÜNÜR kalıyor mu?
#    Hepsini Warning'e çekmek, KURAL-06'nın GuvenliLog kayıtlarını ve
#    KURAL-14'ün açılış raporunu da söndürür — gürültüyü susturayım derken
#    tek işe yarar sinyali kesmek.
n=0
grep -q '"EnglishReadingPlatform"[[:space:]]*:[[:space:]]*"Information"' \
  "$URETIM_AYARI" 2>/dev/null || n=1
ihlal_bildir "kendi loglarımız üretimde görünür" "$n" \
  "EnglishReadingPlatform ad alanı Information'da değil — KURAL-14 açılış raporu görünmez olur"

# 8. Dağıtım betikleri var ve çalıştırılabilir mi?
for betik in scripts/dagitim/on-kontrol.sh scripts/dagitim/canli-dogrula.sh; do
  n=0; [ -x "$betik" ] || n=1
  ihlal_bildir "$(basename "$betik") çalıştırılabilir" "$n" "yok ya da chmod +x eksik"
done

# 9. Sözleşme testi duruyor MU ve hâlâ ölçtüğünü ölçüyor MU?
TESTDOSYA=EnglishReadingPlatform.Tests/DagitimSozlesmesiTests.cs
n=0; eksik=""
if [ ! -f "$TESTDOSYA" ]; then
  n=1; eksik="DagitimSozlesmesiTests.cs silinmiş"
else
  for ad in Saglik_ucu_anonim_erisilebilir_ve_200_doner \
            Saglik_ucu_ic_detay_SIZDIRMAZ \
            Saglik_kontrolu_veritabanini_da_KAPSAR \
            Uretimde_eksik_zorunlu_degisken_uygulamayi_DURDURUR \
            Eksik_degisken_mesaji_YOL_GOSTERIR \
            Gelistirmede_eksik_degisken_uygulamayi_DURDURMAZ \
            Sessiz_bozulan_degiskenler_URETIMDE_ZORUNLU \
            Ozellik_kapanir_sinifi_dagitimi_ENGELLEMEZ \
            Her_dis_servis_ortam_sozlesmesinde_de_VAR; do
    grep -q "$ad" "$TESTDOSYA" || { n=1; eksik="${eksik}${ad} testi kaldırılmış"$'\n'; }
  done
fi
ihlal_bildir "dağıtım sözleşme testi mevcut" "$n" "$eksik"

guard_bitir
