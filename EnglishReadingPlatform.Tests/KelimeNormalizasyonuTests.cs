using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Services;
using EnglishReadingPlatform.Tests.Infrastructure;
using EnglishReadingPlatform.Validation;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// YH-11: Kelime normalizasyonu, kök bulma ve tür doğrulama testleri.
/// </summary>
[Collection("api")]
public class KelimeNormalizasyonuTests
{
    private readonly TestAppFactory _fabrika;
    public KelimeNormalizasyonuTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static async Task<HttpClient> OgrenciIstemcisiAsync(TestAppFactory f)
    {
        var client = f.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        return client.TokenIle(o.Token);
    }

    [Theory]
    [Trait("Category", "KelimeNormalizasyonu")]
    [InlineData(" Conversation. ", "conversation")]
    [InlineData("don't", "don't")]
    [InlineData("well-known,", "well-known")]
    [InlineData("I", "I")]
    [InlineData("“Hello!”", "hello")]
    [InlineData("New   York", "new york")]
    [InlineData("...", "")]
    public void Normallestirme_tablosu(string input, string expected)
    {
        var sonuc = KelimeNormallestirici.Normallestir(input);
        sonuc.Should().Be(expected);
    }

    [Fact]
    [Trait("Category", "KelimeNormalizasyonu")]
    public async Task Noktalamali_kelime_TEMIZ_kaydedilir()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        var response = await client.PostAsJsonAsync("/api/books/addword", new
        {
            Word = "conversation.",
            Translation = "konuşma",
            Context = "We had a long conversation."
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        using var scope = _fabrika.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var item = await db.WordListItems.FirstOrDefaultAsync(w => w.Word == "conversation");
        item.Should().NotBeNull();
        item!.Word.Should().Be("conversation");
    }

    [Fact]
    [Trait("Category", "KelimeNormalizasyonu")]
    public async Task Buyuk_kucuk_harf_farki_TEK_kayit()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        var r1 = await client.PostAsJsonAsync("/api/books/addword", new
        {
            Word = "Apple",
            Translation = "elma"
        });
        r1.StatusCode.Should().Be(HttpStatusCode.OK);

        var r2 = await client.PostAsJsonAsync("/api/books/addword", new
        {
            Word = "apple",
            Translation = "elma meyvesi"
        });
        r2.StatusCode.Should().Be(HttpStatusCode.OK);

        using var scope = _fabrika.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var items = await db.WordListItems.Where(w => w.Word == "apple").ToListAsync();
        items.Count.Should().Be(1);
    }

    [Fact]
    [Trait("Category", "KelimeNormalizasyonu")]
    public async Task Yalniz_noktalama_REDDEDILIR()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        var response = await client.PostAsJsonAsync("/api/books/addword", new
        {
            Word = "...",
            Translation = "noktalar"
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [Trait("Category", "KelimeNormalizasyonu")]
    [InlineData("loves", "love")]
    [InlineData("loved", "love")]
    [InlineData("loving", "love")]
    [InlineData("stopped", "stop")]
    [InlineData("stopping", "stop")]
    [InlineData("stops", "stop")]
    [InlineData("stories", "story")]
    [InlineData("studies", "study")]
    [InlineData("studied", "study")]
    [InlineData("making", "make")]
    [InlineData("makes", "make")]
    [InlineData("writing", "write")]
    [InlineData("children", "child")]
    [InlineData("went", "go")]
    [InlineData("gone", "go")]
    [InlineData("running", "run")]
    [InlineData("ran", "run")]
    [InlineData("played", "play")]
    [InlineData("playing", "play")]
    [InlineData("books", "book")]
    [InlineData("boxes", "box")]
    [InlineData("watches", "watch")]
    [InlineData("wishes", "wish")]
    [InlineData("cities", "city")]
    [InlineData("carried", "carry")]
    [InlineData("taking", "take")]
    [InlineData("coming", "come")]
    [InlineData("knives", "knife")]
    [InlineData("lives", "life")]
    [InlineData("feet", "foot")]
    public void Kok_kurallari_tablosu(string input, string expectedRoot)
    {
        var kok = IngilizceKok.KokBul(input);
        kok.Should().Be(expectedRoot);
    }

    [Fact]
    [Trait("Category", "KelimeNormalizasyonu")]
    public void Guvensiz_kok_ONERILMEZ()
    {
        IngilizceKok.KokBul("news").Should().BeNull();
        IngilizceKok.KokBul("bus").Should().BeNull();
        IngilizceKok.KokBul("this").Should().BeNull();
        IngilizceKok.KokBul("better").Should().BeNull();
    }

    [Fact]
    [Trait("Category", "KelimeNormalizasyonu")]
    public void Bilinmeyen_tur_DIGER_olur()
    {
        TranslationService.TurDogrula("foo").Should().Be("diğer");
        TranslationService.TurDogrula("xyz_tur").Should().Be("diğer");
        TranslationService.TurDogrula("fiil").Should().Be("fiil");
        TranslationService.TurDogrula("isim").Should().Be("isim");
    }

    // ─── YH-11 §2: GERÇEK migration SQL'i ─────────────────────────────
    //
    // Eski test burada KelimeNormallestirici.CakismalariBirlestirAsync adında
    // ayrı bir C# kopyasını sınıyordu; migration'ın kendi SQL'i HİÇ çalışmıyordu.
    // SQL "önce hedefi güncelle, sonra kopyaları sil" sırasıyla yazılmıştı: eski
    // kayıt normalsiz ("Apple"), yeni kayıt zaten normal ("apple") olunca güncelleme
    // tekillik indeksine çarpıyordu. Migration açılışta Database.Migrate() ile
    // uygulandığı için bu, uygulamanın HİÇ AÇILMAMASI demekti.
    //
    // Testler artık migration sınıfının UpOperations'ındaki SQL'i, tablonun
    // birebir kopyası olan İZOLE bir şemada çalıştırıyor: paylaşılan test
    // veritabanındaki diğer testlerin kelimelerine dokunulmaz.

    private sealed record GocSatiri(
        int Id, int UserId, string Word, string Translation,
        int DogruSayisi, int YanlisSayisi, int DogruSeri, int Kutu,
        DateTime? SonCalismaAt, DateTime? SonrakiTekrarAt);

    private sealed record GocGirdisi(
        int UserId, string Word, string Translation, DateTime AddedAt,
        int DogruSayisi = 0, int YanlisSayisi = 0, int DogruSeri = 0, int Kutu = 0,
        DateTime? SonCalismaAt = null, DateTime? SonrakiTekrarAt = null);

    private static string NormalizasyonGocuSqli() =>
        new EnglishReadingPlatform.Migrations.NormalizeWordListItems().UpOperations
            .OfType<Microsoft.EntityFrameworkCore.Migrations.Operations.SqlOperation>()
            .Single().Sql;

    /// <summary>
    /// Satırları izole bir şemaya yazar, migration SQL'ini orada çalıştırır;
    /// eklenen Id'leri ve kalan satırları döndürür. Şema her durumda silinir.
    /// </summary>
    private async Task<(List<int> EklenenIdler, List<GocSatiri> Kalanlar)> GocuIzoleSemadaCalistirAsync(
        params GocGirdisi[] girdiler)
    {
        string baglantiDizesi;
        using (var kapsam = _fabrika.Services.CreateScope())
            baglantiDizesi = kapsam.ServiceProvider.GetRequiredService<AppDbContext>()
                .Database.GetConnectionString()!;

        var sema = $"yh11_goc_{Guid.NewGuid():N}";
        await using var baglanti = new Npgsql.NpgsqlConnection(baglantiDizesi);
        await baglanti.OpenAsync();

        async Task CalistirAsync(string sql)
        {
            await using var komut = baglanti.CreateCommand();
            komut.CommandText = sql;
            await komut.ExecuteNonQueryAsync();
        }

        // LIKE … INCLUDING ALL kolonları, varsayılanları, kimlik kolonunu ve
        // TEKİLLİK İNDEKSİNİ kopyalar; yabancı anahtarı kopyalamaz (Users gerekmez).
        await CalistirAsync(
            $"CREATE SCHEMA \"{sema}\"; " +
            $"CREATE TABLE \"{sema}\".\"WordListItems\" (LIKE public.\"WordListItems\" INCLUDING ALL);");
        try
        {
            await CalistirAsync($"SET search_path TO \"{sema}\";");

            var eklenenIdler = new List<int>();
            foreach (var g in girdiler)
            {
                await using var ekle = baglanti.CreateCommand();
                ekle.CommandText =
                    "INSERT INTO \"WordListItems\" (\"UserId\", \"Word\", \"Translation\", \"Context\", \"AddedAt\", " +
                    "\"DogruSayisi\", \"YanlisSayisi\", \"DogruSeri\", \"Kutu\", \"SonCalismaAt\", \"SonrakiTekrarAt\") " +
                    "VALUES (@u, @w, @t, '', @a, @d, @y, @s, @k, @c, @n) RETURNING \"Id\"";
                ekle.Parameters.AddWithValue("u", g.UserId);
                ekle.Parameters.AddWithValue("w", g.Word);
                ekle.Parameters.AddWithValue("t", g.Translation);
                ekle.Parameters.AddWithValue("a", g.AddedAt);
                ekle.Parameters.AddWithValue("d", g.DogruSayisi);
                ekle.Parameters.AddWithValue("y", g.YanlisSayisi);
                ekle.Parameters.AddWithValue("s", g.DogruSeri);
                ekle.Parameters.AddWithValue("k", g.Kutu);
                ekle.Parameters.AddWithValue("c", (object?)g.SonCalismaAt ?? DBNull.Value);
                ekle.Parameters.AddWithValue("n", (object?)g.SonrakiTekrarAt ?? DBNull.Value);
                eklenenIdler.Add((int)(await ekle.ExecuteScalarAsync())!);
            }

            await CalistirAsync(NormalizasyonGocuSqli());

            var kalanlar = new List<GocSatiri>();
            await using var oku = baglanti.CreateCommand();
            oku.CommandText =
                "SELECT \"Id\", \"UserId\", \"Word\", \"Translation\", \"DogruSayisi\", \"YanlisSayisi\", " +
                "\"DogruSeri\", \"Kutu\", \"SonCalismaAt\", \"SonrakiTekrarAt\" FROM \"WordListItems\" ORDER BY \"Id\"";
            await using (var r = await oku.ExecuteReaderAsync())
            {
                while (await r.ReadAsync())
                    kalanlar.Add(new GocSatiri(
                        r.GetInt32(0), r.GetInt32(1), r.GetString(2), r.GetString(3),
                        r.GetInt32(4), r.GetInt32(5), r.GetInt32(6), r.GetInt32(7),
                        r.IsDBNull(8) ? null : r.GetDateTime(8),
                        r.IsDBNull(9) ? null : r.GetDateTime(9)));
            }
            return (eklenenIdler, kalanlar);
        }
        finally
        {
            await CalistirAsync($"SET search_path TO public; DROP SCHEMA \"{sema}\" CASCADE;");
        }
    }

    /// <summary>
    /// ANA REGRESYON: eski kayıt normalsiz, yeni kayıt zaten normal. Eski SQL
    /// burada 23505 (duplicate key) ile düşüyordu → uygulama açılmıyordu.
    /// </summary>
    [Fact]
    [Trait("Category", "KelimeNormalizasyonu")]
    public async Task Goc_ESKI_normalsiz_YENI_normal_kayitta_PATLAMAZ_ve_BIRLESTIRIR()
    {
        var simdi = DateTime.UtcNow;
        var (idler, kalanlar) = await GocuIzoleSemadaCalistirAsync(
            new GocGirdisi(1, "Apple", "elma", simdi.AddDays(-10),
                DogruSayisi: 2, YanlisSayisi: 1, DogruSeri: 2, Kutu: 3,
                SonCalismaAt: simdi.AddDays(-5), SonrakiTekrarAt: simdi.AddDays(3)),
            new GocGirdisi(1, "apple", "elma meyvesi", simdi.AddDays(-2),
                DogruSayisi: 3, YanlisSayisi: 2, DogruSeri: 1, Kutu: 1,
                SonCalismaAt: simdi.AddDays(-1), SonrakiTekrarAt: simdi.AddDays(1)));

        kalanlar.Should().ContainSingle("aynı kelimenin iki biçimi TEK satırda birleşmeli");
        var k = kalanlar[0];
        k.Id.Should().Be(idler[0], "en ESKİ kayıt kalır");
        k.Word.Should().Be("apple");
        k.DogruSayisi.Should().Be(5);
        k.YanlisSayisi.Should().Be(3);
        k.DogruSeri.Should().Be(1, "iyimser değil: en küçük seri");
        k.Kutu.Should().Be(1, "iyimser değil: en küçük kutu");
        k.SonCalismaAt.Should().BeCloseTo(simdi.AddDays(-1), TimeSpan.FromSeconds(1));
        k.SonrakiTekrarAt.Should().BeCloseTo(simdi.AddDays(1), TimeSpan.FromSeconds(1),
            "en küçük kutuyla tutarlı olan en YAKIN tekrar zamanı kalır");
        k.Translation.Should().Be("elma meyvesi", "en uzun çeviri kalır");
    }

    [Fact]
    [Trait("Category", "KelimeNormalizasyonu")]
    public async Task Goc_UC_bicimli_grupta_normal_kayit_ORTADA_olsa_da_PATLAMAZ()
    {
        var simdi = DateTime.UtcNow;
        var (idler, kalanlar) = await GocuIzoleSemadaCalistirAsync(
            new GocGirdisi(7, "Word.", "kelime", simdi.AddDays(-3)),
            new GocGirdisi(7, "word", "sözcük, kelime", simdi.AddDays(-2)),
            new GocGirdisi(7, "WORD", "kelime", simdi.AddDays(-1)));

        kalanlar.Should().ContainSingle();
        kalanlar[0].Id.Should().Be(idler[0]);
        kalanlar[0].Word.Should().Be("word");
        kalanlar[0].Translation.Should().Be("sözcük, kelime");
    }

    /// <summary>
    /// Migration SQL'i ile C#'taki KelimeNormallestirici AYNI sonucu üretmeli.
    /// Ayrışırsa göçten sonra AddWord aynı kelimeyi başka biçimde yazar ve
    /// listede ikinci bir kayıt açılır ("new   york" ile "new york" gibi).
    /// </summary>
    [Fact]
    [Trait("Category", "KelimeNormalizasyonu")]
    public async Task Goc_normallestirme_kurallari_CSHARP_ile_AYNI()
    {
        var girdiler = new[]
        {
            " Conversation. ", "don't", "well-known,", "“Hello!”", "New   York", "New\tYork",
            "i", "I", "'quoted'", "(bracket)", "#hashtag", "wait…", "«guillemets»",
            "Café", "...",
        };
        var simdi = DateTime.UtcNow;

        // Her girdi AYRI kullanıcıda: birleştirme değil, yalnızca normalleştirme ölçülür.
        var (_, kalanlar) = await GocuIzoleSemadaCalistirAsync(
            girdiler.Select((w, i) => new GocGirdisi(i + 1, w, "x", simdi)).ToArray());

        for (var i = 0; i < girdiler.Length; i++)
        {
            var beklenen = KelimeNormallestirici.Normallestir(girdiler[i]);
            var satir = kalanlar.SingleOrDefault(k => k.UserId == i + 1);

            if (beklenen == "")
            {
                satir.Should().BeNull("'{0}' C#'ta boş kalıyor, göçte SİLİNMELİ", girdiler[i]);
                continue;
            }

            satir.Should().NotBeNull("'{0}' göçte silinmemeli", girdiler[i]);
            satir!.Word.Should().Be(beklenen, "'{0}' için SQL ile C# aynı biçimi üretmeli", girdiler[i]);
        }
    }
}
