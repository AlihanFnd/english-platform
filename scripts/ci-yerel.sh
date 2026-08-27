#!/usr/bin/env bash
# .github/workflows/guvenlik.yml içindeki HER adımı yerelde aynı sırayla çalıştırır.
# Amaç: push etmeden önce CI'nin yeşil yanacağını kanıtlamak.
# Çıkış kodu: 0 = tüm adımlar geçti, 1 = en az bir adım kırıldı.

set -uo pipefail
PROJE_KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJE_KOK"

SONUC=0
adim() {
  local ad="$1"; shift
  printf '\n─── %s ───\n' "$ad"
  if "$@" > /tmp/ci-yerel-adim.log 2>&1; then
    printf '    ✓ geçti\n'
  else
    printf '    ✗ KIRILDI (çıkış kodu %d)\n' "$?"
    tail -15 /tmp/ci-yerel-adim.log | sed 's/^/      /'
    SONUC=1
  fi
}

zafiyet_taramasi() {
  dotnet list Linguza.sln package --vulnerable --include-transitive 2>&1 | tee /tmp/zafiyet.txt
  ! grep -qE '(High|Critical)' /tmp/zafiyet.txt
}

echo "════════════════════════════════════════════════════════"
echo " CI ADIMLARI — YEREL KOŞU"
echo "════════════════════════════════════════════════════════"

# ── Ön koşul: test veritabanı erişilebilir mi? ─────────────
# Bu kontrol olmadan, postgres kapalıyken testler uzun bir Npgsql yığın iziyle
# kırılır ve "kodum mu bozuldu?" sanılır. Sebebi açıkça söylüyoruz.
if ! docker exec english_postgres pg_isready -U appuser >/dev/null 2>&1; then
  echo ""
  echo "  ✗ ÖN KOŞUL: test veritabanına ulaşılamıyor."
  if ! docker info >/dev/null 2>&1; then
    echo "    Sebep : Docker çalışmıyor."
    echo "    Çözüm : Docker Desktop'ı başlat, sonra: docker compose up -d postgres"
  else
    echo "    Sebep : english_postgres konteyneri ayakta değil."
    echo "    Çözüm : docker compose up -d postgres"
  fi
  echo ""
  exit 1
fi

# ── backend işi ────────────────────────────────────────────
adim "backend: Derle"          dotnet build Linguza.sln --configuration Release
adim "backend: Testler"        dotnet test Linguza.sln --configuration Release --no-build
adim "backend: Güvenlik kapıları" bash scripts/guard/run-all.sh
adim "backend: Zafiyet taraması"  zafiyet_taramasi

# ── frontend işi (CI'daki matrix) ──────────────────────────
for uygulama in frontend admin-panel; do
  adim "$uygulama: npm ci"     bash -c "cd '$PROJE_KOK/$uygulama' && npm ci"
  adim "$uygulama: npm audit"  bash -c "cd '$PROJE_KOK/$uygulama' && npm audit --audit-level=high"
  adim "$uygulama: npm run build" bash -c "cd '$PROJE_KOK/$uygulama' && npm run build"
done

echo ""
echo "════════════════════════════════════════════════════════"
[ "$SONUC" -eq 0 ] && echo " SONUÇ: CI yeşil yanacak ✓" || echo " SONUÇ: CI KIRILIR ✗"
echo "════════════════════════════════════════════════════════"
exit "$SONUC"
