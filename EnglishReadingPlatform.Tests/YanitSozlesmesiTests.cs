using EnglishReadingPlatform.Contracts;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-08 SÖZLEŞME TESTİ — yanıt DTO'larının BİÇİMİNİ ölçer.
///
/// Davranış testi "bu uç bugün şifre hash'i döndürmüyor" der; bu test
/// "hiçbir yanıt tipi böyle bir alan TAŞIYAMAZ" der. İkincisi yeni yazılan
/// uçları da kapsar: bir gün biri KullaniciYaniti'na PasswordHash eklerse,
/// o alanı hiçbir uç kullanmasa bile build kırılır.
/// </summary>
public class YanitSozlesmesiTests
{
    /// <summary>Hiçbir yanıt DTO'sunda bulunmaması gereken alan adları.</summary>
    private static readonly string[] YasakliAlanlar =
    {
        "PasswordHash", "passwordHash",
        "ImagePath", "imagePath",
        // Ham analiz JSON'u yalnızca okuma ucunda, kendi biçimiyle verilir;
        // liste/özet yanıtlarına girmesi hem gereksiz hem çok büyüktür.
        "SentencesJson", "sentencesJson",
    };

    private static IEnumerable<Type> YanitTipleri()
        => typeof(KullaniciYaniti).Assembly
            .GetTypes()
            .Where(t => t.Namespace == "EnglishReadingPlatform.Contracts" && t.IsPublic);

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public void Contracts_ad_alaninda_yanit_DTOlari_bulunmali()
    {
        // Kapının kendisinin ölçtüğünü kanıtlar: tipler bulunamazsa aşağıdaki
        // testler boş küme üzerinde "yeşil" verir ve hiçbir şey ölçmez.
        YanitTipleri().Should().HaveCountGreaterThanOrEqualTo(10,
            "yanıt biçimleri Contracts/Yanitlar.cs içinde tek kaynakta toplanmalı");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public void Yanit_DTOlari_hassas_alan_tasimamali()
    {
        var ihlaller = new List<string>();
        foreach (var dto in YanitTipleri())
            foreach (var ozellik in dto.GetProperties())
                if (YasakliAlanlar.Contains(ozellik.Name))
                    ihlaller.Add($"{dto.Name}.{ozellik.Name}");

        ihlaller.Should().BeEmpty("hassas alan taşıyan DTO'lar: " + string.Join(", ", ihlaller));
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public void KullaniciYaniti_PasswordHash_icermemeli()
    {
        typeof(KullaniciYaniti).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("PasswordHash");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public void UyeYaniti_eposta_icermemeli()
    {
        // Başkasına gösterilen kullanıcı bilgisinde e-posta olmamalı.
        typeof(UyeYaniti).GetProperties()
            .Select(p => p.Name.ToLowerInvariant())
            .Should().NotContain("email");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public void Yanit_DTOlari_entityden_TUREMEMELI()
    {
        // TUZAK: "record KelimeYaniti : WordListItem" yazılırsa tüm entity alanları
        // miras alınır ve minimizasyon anlamsızlaşır. DTO'lar bağımsız olmalıdır.
        var entityAdAlani = "EnglishReadingPlatform.Models";
        var ihlaller = YanitTipleri()
            .Where(t => t.BaseType is not null && t.BaseType.Namespace == entityAdAlani)
            .Select(t => $"{t.Name} : {t.BaseType!.Name}")
            .ToList();

        ihlaller.Should().BeEmpty("entity'den türeyen DTO'lar: " + string.Join(", ", ihlaller));
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public void GrupOzetYaniti_davet_kodu_NULL_olabilmeli()
    {
        // Davet kodu sahibi olmayan kullanıcı için null döner; tip bunu
        // kaldıramıyorsa (string InviteCode) koşullandırma derlenmez.
        var ozellik = typeof(GrupOzetYaniti).GetProperty("InviteCode")!;
        var nullableBilgisi = new System.Reflection.NullabilityInfoContext().Create(ozellik);

        nullableBilgisi.WriteState.Should().Be(System.Reflection.NullabilityState.Nullable,
            "InviteCode yetkisi olmayan kullanıcıya null dönmeli");
    }
}
