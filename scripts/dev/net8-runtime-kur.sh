#!/usr/bin/env bash
# net8.0 runtime'ını aktif dotnet köküne kurar.
#
# NEDEN VAR: Proje net8.0 hedefliyor (CI ve Dockerfile da net8.0). Bu makinede
# homebrew yalnızca .NET 10 kuruyor. net8.0 runtime'ı `dotnet_sdk/shared/` içinde
# zaten mevcut; bu script onu aktif dotnet köküne kopyalar.
#
# `brew upgrade dotnet` bu kopyaları siler. Kapı (scripts/guard/01-altyapi.sh)
# bunu yakalar ve bu scripti çalıştırmanı söyler. İndirme gerektirmez.

set -euo pipefail

SURUM="8.0.17"
PROJE_KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KAYNAK="$PROJE_KOK/dotnet_sdk/shared"

command -v dotnet >/dev/null || { echo "HATA: dotnet PATH'te yok."; exit 1; }

# Hedef dizini `dotnet --list-runtimes` çıktısındaki gerçek yoldan türet.
# (Homebrew'da bin/ ile shared/ farklı seviyelerde: .../libexec/shared)
hedef_dizin() {
  dotnet --list-runtimes | awk -v fw="$1" '$1 == fw { print $3; exit }' | tr -d '[]'
}

for fw in Microsoft.NETCore.App Microsoft.AspNetCore.App; do
  HEDEF="$(hedef_dizin "$fw")"
  [ -n "$HEDEF" ] || { echo "HATA: $fw için hedef dizin bulunamadı."; exit 1; }

  if [ -d "$HEDEF/$SURUM" ]; then
    echo "  $fw/$SURUM  → zaten var, atlandı"
  elif [ ! -d "$KAYNAK/$fw/$SURUM" ]; then
    echo "  HATA: $KAYNAK/$fw/$SURUM bulunamadı."
    echo "  dotnet_sdk/ silinmişse net8.0 runtime'ını Microsoft'tan kurman gerekir:"
    echo "    https://dotnet.microsoft.com/download/dotnet/8.0"
    exit 1
  else
    cp -R "$KAYNAK/$fw/$SURUM" "$HEDEF/$SURUM"
    echo "  $fw/$SURUM  → kopyalandı ($HEDEF)"
  fi
done

echo ""
dotnet --list-runtimes | grep -E "^Microsoft\.(NETCore|AspNetCore)\.App 8\." \
  || { echo "HATA: net8.0 runtime hâlâ görünmüyor."; exit 1; }
echo ""
echo "Tamam. Artık: dotnet test Linguza.sln"
