#!/usr/bin/env bash
# KURAL-14 — eksik yapılandırmada KAPALI kal.
#
# TASARIM NOTU (faz 1 dersi 1): bu kapı öncelikle "yasak satır YOK mu" diye
# sorar; "doğru satır VAR mı" kontrolleri ise dosya varlığıyla yetinmez,
# davranışı sabitleyen testlerin ADINI arar. Bir testin içi boşaltılırsa
# dosya yerinde kalır ama kapı kırmızı verir.
#
# TASARIM NOTU 2 (faz 1 dersi 2): pathspec olarak 'EnglishReadingPlatform/*.cs'
# kullanılıyor, 'EnglishReadingPlatform/**/*.cs' DEĞİL. git pathspec'inde '*'
# zaten '/' ile eşleşir; '**/' ise araya EN AZ BİR dizin şart koşar ve
# Program.cs gibi kök dosyalar taramanın DIŞINDA kalır — kapı sessizce
# yarım tarardı.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[14] Eksik yapılandırmada kapalı kal"

# TIRNAKLAR ZORUNLU: tırnaksız yazılırsa kabuk glob'u ATAMA ANINDA genişletir ve
# dizi, git pathspec'i yerine yalnızca KÖK dizindeki dosya adlarını taşır —
# Security/, Services/, Controllers/ altındaki her şey taramanın dışında kalır.
# Bu hata MUTASYON A ile yakalandı: kapı yeşil verdi, sızıntı geri gelmişti.
KOD_YOLLARI=('EnglishReadingPlatform/*.cs' 'EnglishReadingPlatform.Tests/*.cs')
SOZLESME="EnglishReadingPlatform/Configuration/DisServisSozlesmesi.cs"

# Yalnızca YORUM olan eşleşmeleri eler.
#
# Neden gerekli: bu kuralın testleri ve sınıf özetleri, yasak kalıbı TARİF ETMEK
# için alıntılıyor ("eskiden burada ?? \"http://localhost:3000\" vardı"). Onları
# ihlal saymak, kuralı belgelemeyi cezalandırırdı.
#
# Neden GÜVENLİ: yalnızca satırın BAŞI // ya da /// olanlar eleniyor. Sondaki
# yorum ("var x = a ?? \"http://localhost\";  // not") satırın kod kısmıyla
# birlikte taranmaya devam eder — yani ihlal yorumun arkasına saklanamaz.
yorumsuz() { grep -v -E ':[0-9]+:[[:space:]]*(//|\*|/\*)' || true; }

# 1. Sızdıran yedek gerçekten silindi mi?
#    (Kural belgeleri sınıfın adını tarif etmek için anıyor; _lib.sh onları
#    kapsam dışında bırakıyor. Burada aranan şey KODDA kalmış bir uygulama.)
cikti="$(depoda_ara 'LoglayanEpostaGondericisi' "${KOD_YOLLARI[@]}" | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sızdıran e-posta yedeği" "$n" "$cikti"

# 2. Sıfırlama bağlantısı bir log çağrısının parametresi olabiliyor mu?
cikti="$(depoda_ara 'Log(Warning|Information|Debug|Error)\([^)]*[Bb]aglanti' \
         "${KOD_YOLLARI[@]}" | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sıfırlama bağlantısı loga yazılıyor" "$n" "$cikti"

# 3. localhost'a düşen sessiz varsayılan kaldı mı?
cikti="$(depoda_ara '\?\? "http://localhost' "${KOD_YOLLARI[@]}" | yorumsuz)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "localhost sessiz varsayılanı" "$n" "$cikti"

# 4. Sözleşme dosyası duruyor mu?
n=0; [ -f "$SOZLESME" ] || n=1
ihlal_bildir "dış servis sözleşmesi mevcut" "$n" "DisServisSozlesmesi.cs yok"

# 5. Koddan okunan HER dış servis anahtarı sözleşmede sınıflandırılmış mı?
#    Yeni bir dış bağımlılık, sınıfı yazılmadan kod tabanına giremesin.
eksik=""
for anahtar in $(depoda_ara '"[A-Za-z][A-Za-z0-9]*:ApiKey"' "${KOD_YOLLARI[@]}" 2>/dev/null \
                | grep -oE '"[A-Za-z][A-Za-z0-9]*:ApiKey"' | tr -d '"' | sort -u); do
  grep -q "\"$anahtar\"" "$SOZLESME" 2>/dev/null || eksik="${eksik}${anahtar}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "sınıflandırılmamış dış bağımlılık" "$n" "$eksik"

# 6. Sözleşme, "özellik kapanır" sınıfının iki üyesini de tanıyor mu?
#    Bir anahtar sözleşmeden çıkarılırsa açılış raporu onu hiç anmaz ve
#    operatör kapalı özelliği göremez.
eksik=""
for anahtar in "Resend:ApiKey" "App:FrontendUrl"; do
  grep -q "\"$anahtar\"" "$SOZLESME" 2>/dev/null || eksik="${eksik}${anahtar} sözleşmeden çıkarılmış"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "kritik anahtarlar sözleşmede" "$n" "$eksik"

# 7. Program.cs: açılış raporu VE kapalı gönderici kaydı bağlı mı?
#    Yorumlar ayıklanarak taranıyor — yorum içindeki bir ad kapıyı kandırmasın.
PROGRAM="$(grep -v '^[[:space:]]*//' EnglishReadingPlatform/Program.cs)"
eksik=""
printf '%s' "$PROGRAM" | grep -q 'KapaliOzellikler' \
  || eksik="${eksik}Program.cs KapaliOzellikler'i loglamıyor — operatör hangi özelliğin kapalı olduğunu bilmez"$'\n'
printf '%s' "$PROGRAM" | grep -q 'KapaliEpostaGondericisi' \
  || eksik="${eksik}Program.cs anahtarsız dalda KapaliEpostaGondericisi kaydetmiyor"$'\n'
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "açılışta kapalı özellik raporu" "$n" "$eksik"

# 8. Sözleşme testi duruyor MU ve hâlâ ölçtüğünü ölçüyor MU?
#    Dosyanın var olması yetmez (faz 1 dersi 1): içi boşaltılırsa kapı yine
#    yeşil verirdi. Kapalı dal, açık dal ve enumerasyon iddialarının ADI aranıyor.
TESTDOSYA=EnglishReadingPlatform.Tests/YapilandirmaSozlesmesiTests.cs
n=0; eksik=""
if [ ! -f "$TESTDOSYA" ]; then
  n=1; eksik="YapilandirmaSozlesmesiTests.cs silinmiş"
else
  for ad in Eposta_servisi_kapaliyken_sifirlama_ucu_503_DONER \
            Servis_kapaliyken_sifirlama_jetonu_URETILMEZ \
            Kapali_uc_KAYITLI_ve_KAYITSIZ_epostada_AYNI_yaniti_verir \
            Kapali_gonderici_baglantiyi_ISTISNAYA_koymaz \
            Servis_ACIKKEN_jeton_uretilir_ve_baglanti_GONDERILIR \
            Sifirlama_baglantisi_localhost_a_URETILEMEZ_uretimde \
            Her_dis_servis_SINIFLANDIRILMIS_olmali; do
    grep -q "$ad" "$TESTDOSYA" || { n=1; eksik="${eksik}${ad} testi kaldırılmış"$'\n'; }
  done
fi
ihlal_bildir "yapılandırma sözleşme testi mevcut" "$n" "$eksik"

# 9. .env.example iki anahtarı da belgeliyor mu?
#    Yeni bir ortam kuran kişi, hangi özelliğin neden kapalı olduğunu bilemez.
eksik=""
grep -q '^Resend__ApiKey=' .env.example   || eksik="${eksik}.env.example Resend__ApiKey içermiyor"$'\n'
grep -q '^App__FrontendUrl=' .env.example || eksik="${eksik}.env.example App__FrontendUrl içermiyor"$'\n'
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir ".env.example dış servisleri belgeliyor" "$n" "$eksik"

guard_bitir
