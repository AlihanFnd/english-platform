using System.Collections.Concurrent;

namespace EnglishReadingPlatform.Security;

/// <summary>
/// Tek süreçli dağıtımlar için bellek içi iptal deposu.
/// SINIRLAMA: süreç yeniden başlarsa iptaller kaybolur; çoklu replikada çalışmaz.
/// Yatay ölçekleme gerektiğinde RedisTokenIptalDeposu yazılır — arayüz aynı kalır,
/// Program.cs'te tek satır değişir.
/// </summary>
public class BellekTokenIptalDeposu : ITokenIptalDeposu
{
    private readonly ConcurrentDictionary<string, DateTime> _iptalliJtiler = new();
    private readonly ConcurrentDictionary<int, DateTime> _kullaniciKesimZamanlari = new();
    private readonly ILogger<BellekTokenIptalDeposu> _logger;
    private readonly TimeSpan _kesimSaklamaSuresi;

    /// <summary>
    /// Kesim kayıtları EN UZUN TOKEN ÖMRÜ kadar saklanmalıdır (JwtService: 24 saat) + pay.
    /// Erken silinirse kesimden önce üretilmiş tokenlar YENİDEN GEÇERLİ olur —
    /// yani temizlik, iptali geri alan bir güvenlik açığına dönüşür.
    /// </summary>
    public static readonly TimeSpan VarsayilanKesimSaklama = TimeSpan.FromHours(25);

    public BellekTokenIptalDeposu(ILogger<BellekTokenIptalDeposu> logger)
        : this(logger, VarsayilanKesimSaklama) { }

    /// <summary>Saklama süresi yalnızca testlerin kısaltması için parametrik.</summary>
    public BellekTokenIptalDeposu(ILogger<BellekTokenIptalDeposu> logger, TimeSpan kesimSaklamaSuresi)
    {
        _logger = logger;
        _kesimSaklamaSuresi = kesimSaklamaSuresi;
    }

    public void JtiIptalEt(string jti, DateTime gecerlilikSonu)
    {
        if (string.IsNullOrWhiteSpace(jti))
        {
            // Sessiz başarısızlık YASAK: anahtar yoksa bunu bilmek zorundayız.
            _logger.LogWarning("JtiIptalEt boş jti ile çağrıldı — iptal KAYDEDİLMEDİ.");
            return;
        }
        _iptalliJtiler[jti] = gecerlilikSonu;
    }

    public void KullaniciTumTokenlariniIptalEt(int kullaniciId)
        => _kullaniciKesimZamanlari[kullaniciId] = DateTime.UtcNow;

    public bool IptalEdilmisMi(string? jti, int kullaniciId, DateTime uretilmeZamaniUtc)
    {
        if (!string.IsNullOrEmpty(jti) && _iptalliJtiler.TryGetValue(jti, out var son))
        {
            if (DateTime.UtcNow <= son) return true;
            _iptalliJtiler.TryRemove(jti, out _);      // süresi dolmuş kaydı temizle
        }

        if (_kullaniciKesimZamanlari.TryGetValue(kullaniciId, out var kesim))
        {
            // Kesim anında veya öncesinde üretilmiş token'lar geçersiz.
            // 2 saniyelik pay: iat saniye çözünürlüğünde olduğu için sınır durumları kapsar.
            if (uretilmeZamaniUtc <= kesim.AddSeconds(2)) return true;
        }

        return false;
    }

    /// <summary>
    /// Arka plan temizliği — süresi dolmuş jti kayıtlarını ve artık işe yaramayan
    /// kullanıcı kesim kayıtlarını atar.
    ///
    /// İKİ sözlük de temizlenir: yalnızca jti'leri temizlemek, kesim sözlüğünü
    /// sınırsız büyüyen bir yapı olarak bırakırdı (docs/07 #5 ile aynı hata sınıfı).
    /// </summary>
    public int SuresiDolanlariTemizle()
    {
        var simdi = DateTime.UtcNow;
        var silinen = 0;

        foreach (var kayit in _iptalliJtiler)
            if (kayit.Value < simdi && _iptalliJtiler.TryRemove(kayit.Key, out _))
                silinen++;

        // Kesim kaydı, saklama süresi dolmadan ASLA silinmez: silinirse o kullanıcının
        // eski tokenları yeniden geçerli olur.
        foreach (var kayit in _kullaniciKesimZamanlari)
            // '<' değil '<=': saat çözünürlüğü nedeniyle kayıt ile temizlik aynı tik'e
            // düşebilir. Üretimde saklama 25 saat, en uzun token ömrü 24 saat olduğu için
            // sınırdaki bu bir tik'lik fark hiçbir tokenı erken diriltmez.
            if (kayit.Value.Add(_kesimSaklamaSuresi) <= simdi
                && _kullaniciKesimZamanlari.TryRemove(kayit.Key, out _))
                silinen++;

        return silinen;
    }
}
