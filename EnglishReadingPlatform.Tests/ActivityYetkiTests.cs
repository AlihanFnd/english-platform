using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-03'ün davranış kanıtı: sözleşme testi özniteliklerin VARLIĞINI ölçer,
/// bu test özniteliklerin ETKİSİNİ ölçer. İkisi ayrı şeydir — yanlış yapılandırılmış
/// bir politika (ör. var olmayan bir Policy adı) öznitelik taramasından geçer
/// ama çalışma zamanında beklenen sonucu vermez.
/// </summary>
[Collection("api")]
public class ActivityYetkiTests
{
    private readonly TestAppFactory _fabrika;
    public ActivityYetkiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Ogrenci_aktivite_istatistiklerini_GOREMEZ()
    {
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        var yanit = await client.GetAsync("/api/activity/stats");

        yanit.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "öğrenci tüm kullanıcıların aktivite akışını görmemeli");
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Admin_aktivite_istatistiklerini_gorebilir()
    {
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        var yanit = await client.GetAsync("/api/activity/stats");

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Tokensiz_istek_401_alir()
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/activity/stats");
        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [Trait("Category", "Yetkilendirme")]
    [InlineData("/api/books")]
    [InlineData("/api/books/words")]
    [InlineData("/api/groups")]
    [InlineData("/api/dashboard/stats")]
    [InlineData("/api/dashboard/ocr")]
    [InlineData("/api/admin/stats")]
    [InlineData("/api/admin/users")]
    [InlineData("/api/admin/books")]
    [InlineData("/api/admin/groups")]
    [InlineData("/api/feedback/list")]
    [InlineData("/api/auth/me")]
    public async Task Korumali_uclar_tokensiz_401_doner(string yol)
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync(yol);
        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized, $"{yol} korumasız kalmamalı");
    }

    [Theory]
    [Trait("Category", "Yetkilendirme")]
    [InlineData("/api/admin/stats")]
    [InlineData("/api/admin/users")]
    [InlineData("/api/admin/books")]
    [InlineData("/api/admin/groups")]
    [InlineData("/api/feedback/list")]
    public async Task Admin_uclarina_ogrenci_erisemez(string yol)
    {
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        var yanit = await client.GetAsync(yol);

        yanit.StatusCode.Should().Be(HttpStatusCode.Forbidden, $"{yol} yalnızca admin'e açık olmalı");
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Giris_ve_kayit_anonim_kalmali()
    {
        var client = _fabrika.CreateClient();

        // FallbackPolicy eklendikten sonraki en büyük risk: giriş ucunun da kapanması
        // ve kimsenin giriş yapamaması. Burada önemli olan kimlik bilgilerinin doğru
        // olması değil, uca ERİŞİLEBİLMESİ. 401 "kimlik bilgileri hatalı" anlamında
        // gelir; 404/405 gelirse uç fallback tarafından kapatılmış demektir.
        using var istek = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "yok@yok.local", password = "yanlis" })
        };
        istek.Headers.Add(TestIstemciIpFiltresi.Baslik, "10.77.0.1");
        var yanit = await client.SendAsync(istek);

        yanit.StatusCode.Should().BeOneOf(HttpStatusCode.Unauthorized, HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Kayit_ucu_anonim_calisiyor()
    {
        // Beyaz listedeki ikinci uç: gerçekten çalıştığını uçtan uca doğrula.
        var client = _fabrika.CreateClient();

        var sonuc = await AuthHelper.OgrenciOlarakGirisYapAsync(client);

        sonuc.Token.Should().NotBeNullOrWhiteSpace();
        sonuc.Role.Should().Be("student");
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Logout_artik_token_gerektiriyor()
    {
        // KURAL-03 adım 3: logout [Authorize] oldu. Tokensiz çağrı 401 almalı,
        // böylece KURAL-04 jti claim'ini güvenle okuyabilir.
        var client = _fabrika.CreateClient();

        var yanit = await client.PostAsync("/api/auth/logout", null);

        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Gecerli_tokenla_logout_calisiyor()
    {
        // Regresyon: logout'u [Authorize] yapmak normal çıkış akışını bozmamalı.
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        var yanit = await client.PostAsync("/api/auth/logout", null);

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
