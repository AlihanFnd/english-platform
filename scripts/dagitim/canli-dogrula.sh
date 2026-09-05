#!/usr/bin/env bash
# KURAL-15 — DAĞITIMDAN SONRA çalıştırılır.
#
# Faz 1'in KURAL-11'inden devreden iki canlı doğrulama (HTTPS yönlendirmesi,
# güvenlik başlıkları) ile KURAL-13 (CORS) ve KURAL-14 (sıfırlama ucu)
# burada otomatikleşiyor. Bir markdown maddesi çalıştırılamaz; bu çalıştırılır.
#
# Kullanım:  bash scripts/dagitim/canli-dogrula.sh https://linguza-api.onrender.com
set -uo pipefail
TABAN="${1:?kullanım: canli-dogrula.sh https://api-adresi}"
TABAN="${TABAN%/}"
SONUC=0
echo "════ CANLI DOĞRULAMA — $TABAN ════"

bildir() {
  if [ "$2" -eq 0 ]; then printf '  %-46s ✓\n' "$1"
  else printf '  %-46s ✗\n' "$1"; [ -n "${3:-}" ] && printf '      %s\n' "$3"; SONUC=1; fi
}

# ── 1. Sağlık ─────────────────────────────────────────────────────────
kod=$(curl -s -o /dev/null -m 15 -w "%{http_code}" "$TABAN/health")
[ "$kod" = "200" ]; bildir "sağlık ucu 200 dönüyor" $? "dönen: $kod"

govde=$(curl -s -m 15 "$TABAN/health")
[ "$govde" = "OK" ]; bildir "sağlık gövdesi ayrıntı sızdırmıyor" $? "gövde: '$govde'"

# ── 2. HTTP → HTTPS yönlendirmesi (KURAL-11'den devreden) ─────────────
httpTaban="${TABAN/https:/http:}"
yon=$(curl -s -o /dev/null -m 15 -w "%{redirect_url}" "$httpTaban/health")
case "$yon" in https://*) n=0 ;; *) n=1 ;; esac
bildir "http → https yönlendiriyor" $n "yönlendirme: '${yon:-yok}'"

# ── 3. Güvenlik başlıkları (KURAL-11) ─────────────────────────────────
# HSTS'in varlığı aynı zamanda ASPNETCORE_ENVIRONMENT'ın Production olduğunun
# DOLAYLI kanıtıdır: o dal yalnızca üretimde kuruluyor.
basliklar=$(curl -s -I -m 15 "$TABAN/health")
for b in "strict-transport-security" "x-content-type-options" \
         "referrer-policy" "x-frame-options"; do
  printf '%s' "$basliklar" | grep -qi "^$b:"
  bildir "başlık: $b" $? "yoksa ASPNETCORE_ENVIRONMENT=Production olmayabilir"
done

# ── 4. Kestrel Server başlığı sızmıyor (KURAL-11) ─────────────────────
printf '%s' "$basliklar" | grep -qi "^server:.*kestrel"
[ $? -ne 0 ]; bildir "Server başlığı sızmıyor" $?

# ── 5. CORS: yabancı köken reddediliyor (KURAL-13) ────────────────────
yabanci=$(curl -s -I -m 15 -X OPTIONS "$TABAN/api/books" \
  -H "Origin: https://kotu-site.example" \
  -H "Access-Control-Request-Method: GET" | grep -ci "access-control-allow-origin")
[ "$yabanci" = "0" ]; bildir "yabancı köken CORS izni almıyor" $? \
  "Access-Control-Allow-Origin döndü — KURAL-13 üretimde ÇALIŞMIYOR"

# ── 6. Şifre sıfırlama yapılandırılmış mı (KURAL-14) ──────────────────
# 503 bir GÜVENLİK açığı değil, eksik yapılandırmadır: uç kapalı, sızıntı yok.
kod=$(curl -s -o /dev/null -m 15 -w "%{http_code}" -X POST "$TABAN/api/auth/forgot-password" \
  -H "Content-Type: application/json" -d '{"eposta":"kontrol@example.invalid"}')
case "$kod" in
  200) bildir "şifre sıfırlama yapılandırılmış" 0 ;;
  503) bildir "şifre sıfırlama yapılandırılmış" 1 \
         "503 — Resend__ApiKey ya da App__FrontendUrl eksik (KURAL-14).
      Uç GÜVENLİ ama KAPALI: kullanıcı şifresini sıfırlayamaz." ;;
  *)   bildir "şifre sıfırlama yapılandırılmış" 1 "beklenmeyen kod: $kod" ;;
esac

echo ""
echo "  ⚠️ ELLE YAPILACAK (betik ölçemez):"
echo "     • X-Forwarded-For'un EN SAĞDAKİ girdisi gerçek istemci IP'si mi?"
echo "       Değilse tüm kullanıcılar tek hız sınırı kovasını paylaşır."
echo "     • İstemci sayfasını aç ve BİR ŞEYE TIKLA — CSP nonce zinciri"
echo "       kırılırsa sayfa hatasız görünür ama etkileşimsiz kalır."
echo ""
[ "$SONUC" -eq 0 ] && echo "  SONUÇ: canlı doğrulama geçti ✓" || echo "  SONUÇ: SORUN VAR ✗"
exit "$SONUC"
