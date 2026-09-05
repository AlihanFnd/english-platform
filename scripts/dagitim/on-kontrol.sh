#!/usr/bin/env bash
# KURAL-15 — DAĞITIMDAN ÖNCE çalıştırılır.
#
# Kontrol listesi bir belge değil, bir KOMUTTUR: markdown maddeleri unutulur,
# çıkış kodu unutulmaz. Faz 1'in KURAL-11'i iki canlı doğrulama maddesi
# bırakmıştı; ikisi de aylarca yapılmadı. Sebep tembellik değil, biçimdi.
#
# Kullanım:
#   bash scripts/dagitim/on-kontrol.sh                     # yerel kontroller
#   DB_URL="postgres://..." bash scripts/dagitim/on-kontrol.sh   # + üretim taraması
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

SONUC=0
echo "════ DAĞITIM ÖNCESİ KONTROL ════"

bildir() {  # ad · durum(0/1) · ayrıntı
  if [ "$2" -eq 0 ]; then printf '  %-46s ✓\n' "$1"
  else printf '  %-46s ✗\n' "$1"; [ -n "${3:-}" ] && printf '      %s\n' "$3"; SONUC=1; fi
}

# ── 1. Yerelde her şey yeşil mi? ────────────────────────────────────────
dotnet test Linguza.sln --logger "console;verbosity=quiet" >/dev/null 2>&1
bildir "test takımı" $? "dotnet test kırmızı — DAĞITMA"

bash scripts/guard/run-all.sh >/dev/null 2>&1
bildir "güvenlik kapıları" $? "bir kapı kırık — DAĞITMA (ayrıntı: bash scripts/guard/run-all.sh)"

# ── 2. Üretim log ayarı gerçekten üretime gidiyor mu? ───────────────────
# KURAL-01'in "üretime hiç gitmeyen güvenlik dosyası" sınıfı.
n=0
git check-ignore -q EnglishReadingPlatform/appsettings.Production.json && n=1
bildir "üretim log ayarı depoya giriyor" $n \
  ".gitignore'a takılıyor — dosya ÜRETİME HİÇ GİTMEZ"

# ── 3. ÜRETİM veritabanında mükerrer kayıt var mı? ─────────────────────
# KURAL-12'nin tekillik kısıtları açılışta Database.Migrate() ile uygulanıyor.
# Tek bir mükerrer satır varsa migration DÜŞER ve UYGULAMA HİÇ AÇILMAZ.
#
# Kural dosyasındaki sorgu KURAL-12'nin 7 bileşik kısıtını tarıyordu; buraya
# tek kolonlu 4 tekillik de eklendi (User.Email, User.Username,
# Group.InviteCode, SifreSifirlamaJetonu.JetonHash). Onlar da aynı şekilde
# migration'ı düşürür — "kardeş yolları da tara".
TEKILLIKLER=(
  'ReadingProgresses|"UserId","BookId"'
  'WordListItems|"UserId","Word"'
  'TranslationCaches|"QueryText","ContextText"'
  'GroupMembers|"GroupId","UserId"'
  'GroupBookAssignments|"GroupId","BookId"'
  'BookPages|"BookId","PageNumber"'
  'Quizzes|"ChapterId"'
  'Users|"Email"'
  'Users|"Username"'
  'Groups|"InviteCode"'
  'SifreSifirlamaJetonlari|"JetonHash"'
)

if [ -z "${DB_URL:-}" ]; then
  bildir "üretimde mükerrer kayıt yok" 1 \
    "DB_URL verilmedi — kontrol ATLANDI. Atlanan kontrol GEÇMİŞ SAYILMAZ:
      DB_URL=\"postgres://kullanici:sifre@host/veritabani\" bash \$0"
elif ! command -v psql >/dev/null 2>&1; then
  bildir "üretimde mükerrer kayıt yok" 1 "psql bulunamadı — kontrol ATLANDI"
else
  toplam=0; ayrinti=""
  for kayit in "${TEKILLIKLER[@]}"; do
    tablo="${kayit%%|*}"; kolonlar="${kayit#*|}"
    sayi=$(psql "$DB_URL" -tAc \
      "SELECT COUNT(*) FROM (SELECT $kolonlar FROM \"$tablo\" GROUP BY $kolonlar HAVING COUNT(*)>1) t;" \
      2>/dev/null)
    if [ -z "$sayi" ]; then
      ayrinti="${ayrinti}${tablo} SORGULANAMADI (tablo yok ya da yetki yok)"$'\n'
      toplam=$((toplam + 1))
    elif [ "$sayi" != "0" ]; then
      ayrinti="${ayrinti}${tablo} ($kolonlar): $sayi mükerrer grup"$'\n'
      toplam=$((toplam + sayi))
    fi
  done
  [ "$toplam" -eq 0 ]
  bildir "üretimde mükerrer kayıt yok" $? \
    "${ayrinti}migration DÜŞER, uygulama açılmaz. Temizlik SQL'i: guvenlik-kurallari/KURAL-12.md adım 2 (ÖNCE YEDEK AL)"
fi

echo ""
echo "  ⚠️ BU BETİK ÖLÇEMEZ — dağıtım panelinde elle doğrula:"
echo "     • ASPNETCORE_ENVIRONMENT = Production mu?"
echo "       Değilse HSTS, HTTPS yönlendirmesi ve Host doğrulaması HİÇ kurulmaz."
echo "       (Dolaylı ölçüm: dağıtımdan sonra canli-dogrula.sh HSTS başlığına bakar.)"
echo "     • Render health check path = /health mi?"
echo ""
[ "$SONUC" -eq 0 ] && echo "  SONUÇ: dağıtıma hazır ✓" || echo "  SONUÇ: DAĞITMA ✗"
exit "$SONUC"
