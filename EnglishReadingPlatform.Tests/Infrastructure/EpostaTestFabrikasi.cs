using EnglishReadingPlatform.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace EnglishReadingPlatform.Tests.Infrastructure;

/// <summary>
/// KURAL-14: gerçek gönderim yapmayan, gönderilen bağlantıyı KAYDEDEN sahte gönderici.
///
/// Neden gerekli: "servis açıkken uç çalışıyor mu?" sorusunu gerçek Resend
/// istemcisiyle sınamak, her test koşusunda dış bir servise HTTP isteği atmak
/// demektir. Sahte gönderici yalnızca ağ çağrısını kaldırır — kontrol edilen
/// davranış (uç 503 mü döndü, jeton üretildi mi, bağlantı hangi tabana kuruldu)
/// birebir üretim kodundan gelir.
/// </summary>
public class SahteEpostaGondericisi : IEpostaGondericisi
{
    public string? SonBaglanti { get; private set; }
    public int GonderimSayisi { get; private set; }

    public Task SifreSifirlamaGonderAsync(string eposta, string baglanti, CancellationToken iptal = default)
    {
        SonBaglanti = baglanti;
        GonderimSayisi++;
        return Task.CompletedTask;
    }
}

/// <summary>
/// KURAL-14: e-posta yapılandırmasını İSTEĞE GÖRE kuran test fabrikası.
///
/// TUZAK KONTROLÜ (KURAL-14 tuzak tablosu, "yalnızca kapalıyken test etmek"):
/// paylaşılan <see cref="TestAppFactory"/> anahtarsızdır, yani yalnızca onunla
/// çalışmak "her koşulda 503 dönen" bozuk bir ucu da yeşil bırakırdı.
/// Bu fabrika iki eksik dalı kapatır:
///   • anahtar VAR + taban adres VAR  → uç çalışmalı (200, jeton, doğru bağlantı)
///   • anahtar VAR + taban adres YOK  → uç yine 503 dönmeli (localhost'a düşmemeli)
///
/// Neden ORTAM DEĞİŞKENİ: Program.cs, gönderici kaydını builder.Build()
/// ÇAĞRILMADAN ÖNCE yapıyor; ConfigureAppConfiguration değerleri o an henüz
/// görünmüyor. Aynı gerekçe <see cref="UretimTestFabrikasi"/> içinde de yazılı.
///
/// Neden GERİ YÜKLENİYOR: ortam değişkeni süreç geneli. Kalıcı bırakılsa
/// paylaşılan fabrika da anahtarlı açılır ve "kapalıyken 503" testleri
/// sessizce anlamsızlaşırdı.
///
/// Taban adres için de ortam değişkeni kullanılıyor ve "yok" durumu değişkeni
/// SİLEREK kuruluyor — boş dizeyle DEĞİL. Fark önemli: eski koddaki
/// <c>?? "http://localhost:3000"</c> yalnızca null'da devreye giriyordu, yani
/// boş dize verilse mutasyon kontrolü bu dalı hiç uyandıramazdı.
/// </summary>
public class EpostaTestFabrikasi : TestAppFactory
{
    /// <summary>Gerçek değil; yalnızca "anahtar tanımlı" dalını uyandırmak için.</summary>
    public const string TestApiAnahtari = "TEST_ONLY_resend_anahtari_gercek_degil";

    public const string TabanAdres = "https://linguza.test";

    private readonly string? _resendAnahtari;
    private readonly string? _tabanAdres;

    public SahteEpostaGondericisi Gonderici { get; } = new();

    public EpostaTestFabrikasi(string? resendAnahtari, string? tabanAdres)
    {
        _resendAnahtari = resendAnahtari;
        _tabanAdres     = tabanAdres;
    }

    /// <summary>Anahtar da taban adres de tanımlı — uç ÇALIŞMALI.</summary>
    public static EpostaTestFabrikasi Acik() => new(TestApiAnahtari, TabanAdres);

    /// <summary>Anahtar var ama taban adres YOK — uç yine 503 dönmeli.</summary>
    public static EpostaTestFabrikasi TabanAdresiYok() => new(TestApiAnahtari, null);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        // Sahte gönderici YALNIZCA anahtar tanımlıyken devreye girer; anahtarsız
        // dalda üretim kodunun KapaliEpostaGondericisi'si olduğu gibi kalmalı.
        if (_resendAnahtari is not null)
            builder.ConfigureTestServices(s =>
                s.AddScoped<IEpostaGondericisi>(_ => Gonderici));
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var oncekiAnahtar = Environment.GetEnvironmentVariable("Resend__ApiKey");
        var oncekiTaban   = Environment.GetEnvironmentVariable("App__FrontendUrl");

        Environment.SetEnvironmentVariable("Resend__ApiKey", _resendAnahtari);
        Environment.SetEnvironmentVariable("App__FrontendUrl", _tabanAdres);
        try
        {
            return base.CreateHost(builder);
        }
        finally
        {
            Environment.SetEnvironmentVariable("Resend__ApiKey", oncekiAnahtar);
            Environment.SetEnvironmentVariable("App__FrontendUrl", oncekiTaban);
        }
    }
}
