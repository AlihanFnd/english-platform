#!/usr/bin/env bash
# Ortak guard yardımcıları. Her guard script bunu source eder.

set -uo pipefail

PROJE_KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJE_KOK"

TOPLAM_IHLAL=0

# Depodaki dosyalarda desen ara. Üretilmiş/vendor dizinleri hariç.
#
# KAPSAM: takip edilen dosyalar + HENÜZ COMMIT EDİLMEMİŞ ama .gitignore'a da
# takılmayan dosyalar. Yalnızca "git ls-files" kullanmak, yeni yazılmış bir
# dosyadaki sırrı commit edilene kadar görmezden gelirdi — kapının tam olarak
# yakalaması gereken an orasıdır. .gitignore'lu dosyalar (.env, .env.test.local)
# --exclude-standard sayesinde kapsam dışında kalır; onlar zaten sır tutmak için var.
depoda_ara() {
  local desen="$1"; shift
  { git ls-files -- "$@" 2>/dev/null
    git ls-files --others --exclude-standard -- "$@" 2>/dev/null; } \
    | sort -u \
    | grep -v -E '^(dotnet_sdk/|.*/node_modules/|.*/\.next/|.*/wwwroot/lib/|guvenlik-kurallari/|scripts/guard/)' \
    | xargs -I{} grep -Hn -E "$desen" {} 2>/dev/null
}

# Geriye dönük ad — KURAL-01 ve öncesi bu adı kullanıyor.
kodda_ara() { depoda_ara "$@"; }

ihlal_bildir() {
  local baslik="$1" sayi="$2" ayrinti="${3:-}"
  if [ "$sayi" -eq 0 ]; then
    printf '  %-42s %d ihlal  ✓\n' "$baslik" "$sayi"
  else
    printf '  %-42s %d ihlal  ✗\n' "$baslik" "$sayi"
    [ -n "$ayrinti" ] && printf '%s\n' "$ayrinti" | sed 's/^/      /'
    TOPLAM_IHLAL=$((TOPLAM_IHLAL + sayi))
  fi
}

guard_bitir() {
  echo ""
  echo "  TOPLAM İHLAL: $TOPLAM_IHLAL"
  [ "$TOPLAM_IHLAL" -eq 0 ] && exit 0 || exit 1
}
