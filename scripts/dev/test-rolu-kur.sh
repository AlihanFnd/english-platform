#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Testler için ayrı bir PostgreSQL rolü kurar ve şifresini .env.test.local
# dosyasına yazar (.gitignore'da).
#
# NEDEN AYRI ROL: KURAL-02 sonrası sızmış "appuser" şifresi hiçbir yerde
# kullanılamaz. Testlerin çalışması için o şifreyi koda geri koymak yerine,
# testlere ait, rastgele şifreli, yalnızca test veritabanını yönetebilen
# ayrı bir rol açılır. Canlı uygulamanın kimlik bilgilerine hiç dokunulmaz.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJE_KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJE_KOK"

KONTEYNER="${POSTGRES_CONTAINER:-english_postgres}"
YONETICI="${POSTGRES_USER:-appuser}"
ROL="linguza_test"

if ! docker ps --format '{{.Names}}' | grep -qx "$KONTEYNER"; then
  echo "HATA: '$KONTEYNER' konteyneri çalışmıyor."
  echo "Çözüm: docker compose up -d postgres"
  exit 1
fi

SIFRE="$(openssl rand -hex 24)"     # yalnızca [0-9a-f] — bağlantı dizesini bozmaz

docker exec "$KONTEYNER" psql -U "$YONETICI" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS englishreadingdb_test;" \
  -c "DROP ROLE IF EXISTS $ROL;" \
  -c "CREATE ROLE $ROL LOGIN PASSWORD '$SIFRE' CREATEDB;" >/dev/null

umask 077
cat > .env.test.local <<EOF
# Yerel test veritabanı rolünün şifresi. Bu dosya .gitignore'dadır.
# Yeniden üretmek için: bash scripts/dev/test-rolu-kur.sh
TEST_DB_PASSWORD=$SIFRE
EOF

echo "✓ '$ROL' rolü oluşturuldu, şifresi .env.test.local dosyasına yazıldı."
echo "  Artık 'dotnet test Linguza.sln' çalıştırılabilir."
