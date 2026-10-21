using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <summary>
    /// YH-11: mevcut kelimeleri KelimeNormallestirici ile AYNI kurallarla
    /// normalleştirir; aynı kullanıcıda aynı biçime düşenleri birleştirir.
    ///
    /// SIRA KRİTİK — ilk sürüm hedefi ÖNCE güncelleyip kopyaları SONRA siliyordu.
    /// Eski kayıt normalsiz ("Apple"), yeni kayıt zaten normal ("apple") olunca
    /// güncelleme (UserId, Word) tekillik indeksine çarpıyor, migration düşüyor ve
    /// Database.Migrate() açılışta çalıştığı için uygulama HİÇ açılmıyordu.
    /// Artık: toplamlar hesaplanır → kopyalar silinir → hedef güncellenir.
    ///
    /// Kurallar (C# ile birebir): NFC → baş/son boşluk, noktalama ve simge soyulur →
    /// iç boşluk teke iner → küçük harf, tek başına "i" → "I". PostgreSQL'in
    /// [:punct:] sınıfı ASCII dışını her yerel ayarda tanımadığı için sık görülen
    /// tipografik işaretler açıkça listelenir.
    ///
    /// Ölçen testler: KelimeNormalizasyonuTests.Goc_* (migration'ın KENDİ SQL'ini
    /// izole bir şemada çalıştırır).
    /// </summary>
    public partial class NormalizeWordListItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DO $$
DECLARE
    r RECORD;
    v_dogru INT;
    v_yanlis INT;
    v_seri INT;
    v_kutu INT;
    v_son_calisma TIMESTAMPTZ;
    v_sonraki_tekrar TIMESTAMPTZ;
    v_ceviri TEXT;
BEGIN
    CREATE TEMP TABLE tmp_norm_words AS
    SELECT w.""Id"", w.""UserId"", w.""AddedAt"",
           CASE WHEN lower(n.temiz) = 'i' THEN 'I' ELSE lower(n.temiz) END AS ""NormWord""
    FROM ""WordListItems"" w
    CROSS JOIN LATERAL (
        SELECT regexp_replace(
                   regexp_replace(normalize(w.""Word"", NFC),
                       '^[[:space:][:punct:]“”‘’«»–—…]+|[[:space:][:punct:]“”‘’«»–—…]+$', '', 'g'),
                   '[[:space:]]+', ' ', 'g') AS temiz
    ) n;

    -- Normalleşince boş kalanlar (yalnız noktalama) silinir; AddWord bunları zaten 400 ile reddeder.
    DELETE FROM ""WordListItems""
    WHERE ""Id"" IN (SELECT ""Id"" FROM tmp_norm_words WHERE ""NormWord"" = '');

    FOR r IN
        SELECT ""UserId"", ""NormWord"", ARRAY_AGG(""Id"" ORDER BY ""AddedAt"", ""Id"") AS ids
        FROM tmp_norm_words
        WHERE ""NormWord"" <> ''
        GROUP BY ""UserId"", ""NormWord""
        HAVING COUNT(*) > 1
    LOOP
        -- 1) Toplamlar, kopyalar silinmeden ÖNCE hesaplanır.
        SELECT SUM(""DogruSayisi""), SUM(""YanlisSayisi""), MIN(""DogruSeri""), MIN(""Kutu""),
               MAX(""SonCalismaAt""), MIN(""SonrakiTekrarAt"")
          INTO v_dogru, v_yanlis, v_seri, v_kutu, v_son_calisma, v_sonraki_tekrar
          FROM ""WordListItems"" WHERE ""Id"" = ANY(r.ids);

        SELECT ""Translation"" INTO v_ceviri
          FROM ""WordListItems"" WHERE ""Id"" = ANY(r.ids)
          ORDER BY LENGTH(""Translation"") DESC, ""AddedAt"", ""Id""
          LIMIT 1;

        -- 2) Kopyalar ÖNCE silinir: normal biçimi tutan satır hedef değilse yolu açılır.
        DELETE FROM ""WordListItems"" WHERE ""Id"" = ANY(r.ids[2:array_length(r.ids, 1)]);

        -- 3) Hedef (en eski kayıt) EN SON güncellenir.
        UPDATE ""WordListItems"" SET
            ""Word"" = r.""NormWord"",
            ""DogruSayisi"" = v_dogru,
            ""YanlisSayisi"" = v_yanlis,
            ""DogruSeri"" = v_seri,
            ""Kutu"" = v_kutu,
            ""SonCalismaAt"" = v_son_calisma,
            ""SonrakiTekrarAt"" = v_sonraki_tekrar,
            ""Translation"" = COALESCE(v_ceviri, ""Translation"")
        WHERE ""Id"" = r.ids[1];
    END LOOP;

    -- Kopyası olmayan satırlar: yalnızca biçim değişir. Çakışma mümkün değil —
    -- aynı normal biçimi tutan başka bir satır olsaydı yukarıdaki gruba düşerdi.
    UPDATE ""WordListItems"" w
    SET ""Word"" = t.""NormWord""
    FROM tmp_norm_words t
    WHERE w.""Id"" = t.""Id"" AND t.""NormWord"" <> '' AND w.""Word"" <> t.""NormWord"";

    DROP TABLE tmp_norm_words;
END $$;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Geri alınamaz veri göçü: birleştirilen kelimeler yeniden ayrıştırılamaz.
            // Geri dönüş için migration öncesi alınmış yedek gerekir (YH-11 §2).
        }
    }
}
