using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Files;
using EnglishReadingPlatform.Validation;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-10: dosya yüklemenin uçtan uca testleri.
///
/// Her test KENDİ yöneticisiyle çalışır (YeniYoneticiOlarakGirisYapAsync).
/// dosya-yukleme kotası kullanıcı başına dakikada 5 istek olduğu ve tohumlanan
/// yönetici tek olduğu için, ortak hesap kullanıldığında bu sınıfa test eklemek
/// HataHijyeniTests içindeki alakasız bir testi 429 ile kırıyordu. Ayrı hesap
/// o bağı koparır; buraya test eklemek artık başka bir dosyayı etkilemez.
/// </summary>
[Collection("api")]
public class DosyaYuklemeTests
{
    private readonly TestAppFactory _fabrika;
    public DosyaYuklemeTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static int _ip;

    private static MultipartFormDataContent Form(byte[] icerik, string dosyaAdi,
                                                 string sayfaAlani, string sayfalar)
        => new()
        {
            { new StringContent("Test Kitap"), "title" },
            { new StringContent("Test Yazar"), "author" },
            { new StringContent("Test aciklama"), "description" },
            { new StringContent("en"), "language" },
            { new StringContent("#6366f1"), "coverColor" },
            { new StringContent("A1"), "level" },
            { new StringContent("story"), "category" },
            { new StringContent(sayfalar), sayfaAlani },
            { new ByteArrayContent(icerik), "file", dosyaAdi }
        };

    private static async Task<HttpResponseMessage> YukleAsync(
        HttpClient client, string yol, MultipartFormDataContent govde)
    {
        using var istek = new HttpRequestMessage(HttpMethod.Post, yol) { Content = govde };
        var n = Interlocked.Increment(ref _ip);
        istek.Headers.Add(TestIstemciIpFiltresi.Baslik,
            $"192.168.{(n >> 8) & 0xFF}.{n & 0xFF}");

        var yanit = await client.SendAsync(istek);

        // Bütçe aşımını sessiz bir flake yerine kendini açıklayan bir hataya çevir.
        if (yanit.StatusCode == HttpStatusCode.TooManyRequests)
            throw new InvalidOperationException(
                "Yükleme hız sınırı doldu (kullanıcı başına 5/dk). Bu sınıftaki yönetici " +
                "yükleme sayısı bütçeyi aşıyor — sınıf başındaki uyarıya bak.");

        return yanit;
    }

    private static Task<HttpResponseMessage> SayfaYukleAsync(
        HttpClient client, byte[] icerik, string dosyaAdi, string sayfalar = "1")
        => YukleAsync(client, "/api/admin/books/upload-pages",
                      Form(icerik, dosyaAdi, "selectedPages", sayfalar));

    /// <summary>
    /// Yanıttaki { error } alanını ÇÖZÜLMÜŞ olarak döner.
    ///
    /// Ham gövdede Türkçe metin aramak yanıltıcıdır: JsonSerializer non-ASCII
    /// karakterleri \u0131 gibi kaçırıyor, yani "tanınamadı" ham metinde HİÇ
    /// geçmiyor. Karşılaştırma çözülmüş değer üzerinden yapılır.
    /// </summary>
    private static async Task<string> HataMesajiAsync(HttpResponseMessage yanit)
        => (await yanit.Content.ReadFromJsonAsync<HataYaniti>())?.error ?? "";

    private async Task<HttpClient> YoneticiIstemcisiAsync()
    {
        var client = _fabrika.CreateClient();
        var yonetici = await AuthHelper.YeniYoneticiOlarakGirisYapAsync(client, _fabrika);
        return client.TokenIle(yonetici.Token);
    }

    // ─── 1 ───────────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Sahte_pdf_400_doner_500_DEGIL()
    {
        // ANA REGRESYON: kotu.exe → kitap.pdf diye yeniden adlandırılmış içerik
        // eskiden doğrudan PdfDocument.Open'a gidiyordu.
        var client = await YoneticiIstemcisiAsync();

        var yanit = await SayfaYukleAsync(client, TestBelgeleri.SahteCalistirilabilir(), "kitap.pdf");

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        yanit.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError);

        (await HataMesajiAsync(yanit)).Should().Contain("tanınamadı");
    }

    // ─── 2 ───────────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Hata_yaniti_ic_detay_sizdirmaz()
    {
        // Sihirli baytları DOĞRU, gövdesi çöp: doğrulayıcıyı geçer, ayrıştırıcıda
        // patlar. Kullanıcıya dönen mesajda ayrıştırıcının izi olmamalı (KURAL-06).
        var client = await YoneticiIstemcisiAsync();

        var yanit = await SayfaYukleAsync(client, TestBelgeleri.BozukPdf(), "bozuk.pdf");
        var govde = await yanit.Content.ReadAsStringAsync();

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        foreach (var isaret in new[] { "PdfPig", "UglyToad", "   at ", "Exception", ".cs:line" })
            govde.Should().NotContain(isaret, $"'{isaret}' sızıyor: {govde}");
    }

    // ─── 3 ───────────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Cok_fazla_sayfa_secimi_reddedilir()
    {
        var client = await YoneticiIstemcisiAsync();

        // Sayfa sayısı EnCokSayfa'nın ÜSTÜNDE ama seçim dizesi SayfaSecimiMetni
        // alan sınırının ALTINDA kalmalı — aksi hâlde istek model doğrulamasında
        // düşer ve test sayfa sınırını değil onu ölçer.
        const int istenenSayfa = 1_600;
        var cokSayfa = string.Join(",", Enumerable.Range(1, istenenSayfa));
        istenenSayfa.Should().BeGreaterThan(DosyaDogrulayici.EnCokSayfa);
        cokSayfa.Length.Should().BeLessThanOrEqualTo(AlanSinirlari.SayfaSecimiMetni,
            "seçim dizesi alan sınırına takılırsa test sayfa üst sınırını ölçmez");

        // GERÇEK bir PDF: sınır kaldırıldığında istek 200'e dönebilsin, yani
        // mutasyon bu testi gerçekten kırmızıya çevirebilsin.
        var yanit = await SayfaYukleAsync(client, TestBelgeleri.GercekPdf(2), "kitap.pdf", cokSayfa);

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await HataMesajiAsync(yanit)).Should().Contain("en fazla");
    }

    // ─── 4 ───────────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Gecerli_pdf_sayfa_secimiyle_yuklenir()
    {
        // FONKSİYONEL REGRESYON: sertleştirme meşru yüklemeyi bozmamalı.
        // Ayrıca tek açışlı yeni yolun gerçekten metin çıkardığını kanıtlar.
        var client = await YoneticiIstemcisiAsync();

        var yanit = await SayfaYukleAsync(client, TestBelgeleri.GercekPdf(2), "kitap.pdf", "1,2");

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
        var sonuc = await yanit.Content.ReadFromJsonAsync<YuklemeSonucu>();
        sonuc!.pagesCreated.Should().Be(2);
        sonuc.bookId.Should().BeGreaterThan(0);
    }

    // ─── 5 ───────────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Kardes_yol_books_upload_da_sahte_dosyayi_reddeder()
    {
        // Tek route yamamak yasak: ikinci yükleme ucu da merkezî doğrulayıcıdan geçmeli.
        var client = await YoneticiIstemcisiAsync();

        var yanit = await YukleAsync(client, "/api/admin/books/upload",
            Form(TestBelgeleri.SahteCalistirilabilir(), "kitap.pdf", "pageSelection", "1"));

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await HataMesajiAsync(yanit)).Should().Contain("tanınamadı");
    }

    // ─── 6 ───────────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Zip_bomb_docx_ucta_reddedilir()
    {
        // Kapı "çağrı satırı duruyor mu?" diye sorar; bu test "koruma gerçekten
        // ateşliyor mu?" diye sorar. Farklı sorulardır: mutasyon C ilk hâlinde
        // kapıyı geçmişti (yorumda geçen kelime yetmişti), bu test ise mesajı
        // kontrol ettiği için kırmızıya döner.
        var client = await YoneticiIstemcisiAsync();

        var yanit = await SayfaYukleAsync(client, TestBelgeleri.ZipBombasi(300), "bomba.docx");

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        // Bomba İKİ kuraldan birine takılabilir: mutlak açılmış boyut ya da
        // sıkıştırma oranı. Hangisinin önce devreye gireceği sınırlara bağlıdır
        // (sınır 200→400 MB olunca bu bomba boyut yerine orana takılmaya başladı).
        // Test korumanın ATEŞLEDİĞİNİ ölçer, hangi kuralın ateşlediğini değil —
        // ama ayrıştırıcının genel "okunamadı" mesajını kabul ETMEZ, çünkü o
        // durumda gerçek bir bombanın geçtiği anlamına gelir.
        var mesaj = await HataMesajiAsync(yanit);
        mesaj.Should().Match(m => m.Contains("boyutu") || m.Contains("sıkıştırma oranına"),
            $"zip-bomb korumasının mesajı dönmeli, gelen: '{mesaj}'");
    }

    // ─── 7 ───────────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Docx_birden_cok_sayfaya_bolunur()
    {
        // Kullanıcı kararı (2026-08-31): DOCX sayfa seçici boş yere durmasın,
        // yükleme DOĞRU çalışsın. Eskiden DOCX'in TAMAMI tek sayfaya yazılıyordu
        // (900 kelimelik bir belge tek blok olarak). Artık 400 kelimede bir
        // sayfaya bölünüyor: 900 kelime → 3 sayfa.
        var client = await YoneticiIstemcisiAsync();
        var metin = string.Join(" ", Enumerable.Range(1, 900).Select(i => $"kelime{i}"));

        var yanit = await SayfaYukleAsync(client, TestBelgeleri.GercekDocx(metin), "kitap.docx");

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
        var sonuc = await yanit.Content.ReadFromJsonAsync<YuklemeSonucu>();
        sonuc!.pagesCreated.Should().Be(3, "900 kelime / sayfa başına 400 kelime = 3 sayfa");
    }

    // ─── Öğrenci: ayrı hız sınırı bölümü, bütçeye girmez ─────────
    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Ogrenci_kitap_yukleyemez()
    {
        // KURAL-03 ile örtüşen çapraz kontrol.
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        var yanit = await SayfaYukleAsync(client, TestBelgeleri.GercekPdf(), "kitap.pdf");

        yanit.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    private record YuklemeSonucu(bool success, int bookId, string title, int pagesCreated);
    private record HataYaniti(string error);
}
