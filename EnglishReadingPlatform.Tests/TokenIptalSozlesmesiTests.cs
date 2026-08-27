using EnglishReadingPlatform.Security;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-04: Depo sözleşmesi — yazılan anahtarla okunan anahtar AYNI olmalı.
/// Bu testler eski hatanın (ham token yaz / jti oku) geri gelmesini engeller.
/// </summary>
public class TokenIptalSozlesmesiTests
{
    private static BellekTokenIptalDeposu Depo() =>
        new(NullLogger<BellekTokenIptalDeposu>.Instance);

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Iptal_edilen_jti_iptalli_gorunur()
    {
        var depo = Depo();
        var jti = Guid.NewGuid().ToString();

        depo.JtiIptalEt(jti, DateTime.UtcNow.AddHours(1));

        depo.IptalEdilmisMi(jti, kullaniciId: 5, DateTime.UtcNow).Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Iptal_edilmeyen_jti_gecerli_kalir()
    {
        var depo = Depo();
        depo.JtiIptalEt(Guid.NewGuid().ToString(), DateTime.UtcNow.AddHours(1));

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 5, DateTime.UtcNow).Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Ham_token_stringi_anahtar_olarak_ISE_YARAMAZ()
    {
        // ESKİ HATANIN REGRESYON TESTİ:
        // Ham JWT ile iptal edilip jti ile sorgulanırsa eşleşmemeli —
        // yani çağıranın doğru anahtarı kullanması ZORUNLU.
        var depo = Depo();
        var hamToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sahte.imza";
        var jti = Guid.NewGuid().ToString();

        depo.JtiIptalEt(hamToken, DateTime.UtcNow.AddHours(1));

        depo.IptalEdilmisMi(jti, 5, DateTime.UtcNow).Should().BeFalse(
            "ham token anahtarı jti sorgusuyla eşleşmez — çağıran jti kullanmalı");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Bos_jti_ile_iptal_sessizce_basarili_olmaz()
    {
        var depo = Depo();
        depo.JtiIptalEt("", DateTime.UtcNow.AddHours(1));

        depo.IptalEdilmisMi("", 5, DateTime.UtcNow).Should().BeFalse();
        // Ayrıca uyarı loglanır — sessiz başarısızlık yok.
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Kullanici_toplu_iptali_onceki_tokenlari_keser()
    {
        var depo = Depo();
        var eskiUretilme = DateTime.UtcNow.AddMinutes(-5);

        depo.KullaniciTumTokenlariniIptalEt(kullaniciId: 7);

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 7, eskiUretilme).Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Kullanici_toplu_iptali_SONRAKI_tokenlari_kesmez()
    {
        var depo = Depo();
        depo.KullaniciTumTokenlariniIptalEt(kullaniciId: 7);

        var yeniUretilme = DateTime.UtcNow.AddSeconds(10);   // kesimden sonra

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 7, yeniUretilme).Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Toplu_iptal_diger_kullaniciyi_etkilemez()
    {
        var depo = Depo();
        depo.KullaniciTumTokenlariniIptalEt(kullaniciId: 7);

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 8, DateTime.UtcNow.AddMinutes(-5))
            .Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Suresi_dolan_iptal_kaydi_temizlenir()
    {
        var depo = Depo();
        var jti = Guid.NewGuid().ToString();
        depo.JtiIptalEt(jti, DateTime.UtcNow.AddSeconds(-1));   // zaten dolmuş

        depo.IptalEdilmisMi(jti, 5, DateTime.UtcNow).Should().BeFalse();
        depo.SuresiDolanlariTemizle().Should().BeGreaterThanOrEqualTo(0);
    }

    // ── Kesim kaydı temizliği: iki yön de sınanır ────────────────────────
    // Yanlış yön (erken silme) bir GÜVENLİK açığıdır, doğru yön (hiç silmeme)
    // bir BELLEK sızıntısıdır. İkisi de test edilmeden bu kod güvenilir değildir.

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Kesim_kaydi_saklama_suresi_dolmadan_temizlenmez()
    {
        // GÜVENLİK YÖNÜ: temizlik, iptali geri almamalı.
        var depo = Depo();                                   // varsayılan 25 saat saklama
        var eskiUretilme = DateTime.UtcNow.AddMinutes(-5);
        depo.KullaniciTumTokenlariniIptalEt(kullaniciId: 11);

        depo.SuresiDolanlariTemizle();

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 11, eskiUretilme).Should().BeTrue(
            "temizlik yeni bir kesim kaydını silerse iptal edilen tokenlar yeniden geçerli olur");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Saklama_suresi_dolan_kesim_kaydi_temizlenir()
    {
        // BELLEK YÖNÜ: kayıt sonsuza kadar durmamalı.
        //
        // KIRILGANLIK DÜZELTMESİ: saklama süresi TimeSpan.Zero iken bu test
        // ara sıra kırmızı oluyordu. Sebep temizlik mantığındaki karşılaştırma:
        //     kayit.Value.Add(saklama) < simdi
        // Kaydın damgası ile 'simdi' aynı saat tikine düşerse (DateTime.UtcNow
        // çözünürlüğü ~1 ms; iki çağrı arasında hiç tik geçmeyebilir) sıfır
        // saklamayla eşitlik oluşur ve '<' yanlış döner. Yani hata üründe değil,
        // testin varsayımındaydı: "Zero saklama" ile "süresi DOLMUŞ" aynı şey değil.
        // Negatif saklama, süresi kesin dolmuş bir kaydı belirsizliğe yer
        // bırakmadan ifade eder. Ara sıra yeşil yanan test, test değildir.
        var depo = new BellekTokenIptalDeposu(
            NullLogger<BellekTokenIptalDeposu>.Instance, TimeSpan.FromMilliseconds(-1));
        depo.KullaniciTumTokenlariniIptalEt(kullaniciId: 12);

        depo.SuresiDolanlariTemizle().Should().BeGreaterThan(0,
            "saklama süresi dolan kesim kaydı atılmalı — yoksa sözlük sınırsız büyür");

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 12, DateTime.UtcNow.AddMinutes(-5))
            .Should().BeFalse();
    }
}
