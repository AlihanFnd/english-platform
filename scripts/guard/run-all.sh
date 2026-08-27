#!/usr/bin/env bash
# Tüm guard script'lerini sırayla çalıştırır.
# Çıkış kodu: 0 = hiç ihlal yok, 1 = en az bir ihlal var.

set -uo pipefail
KLASOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GENEL_SONUC=0
echo "════════════════════════════════════════════════════════"
echo " GÜVENLİK KAPILARI"
echo "════════════════════════════════════════════════════════"

for script in "$KLASOR"/[0-9][0-9]-*.sh; do
  [ -e "$script" ] || continue
  bash "$script" || GENEL_SONUC=1
  echo ""
done

echo "════════════════════════════════════════════════════════"
if [ "$GENEL_SONUC" -eq 0 ]; then
  echo " SONUÇ: tüm kapılar geçildi ✓"
else
  echo " SONUÇ: EN AZ BİR KAPI KIRILDI ✗"
fi
echo "════════════════════════════════════════════════════════"
exit "$GENEL_SONUC"
