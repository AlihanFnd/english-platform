namespace EnglishReadingPlatform.Security;

/// <summary>
/// KURAL-04: Token iptal deposu.
/// Anahtar SÖZLEŞMESİ: her zaman token'ın 'jti' claim değeri kullanılır.
/// Ham JWT stringi, hash'i veya SecurityToken.ToString() ASLA anahtar olarak kullanılmaz.
/// Bu sözleşme TokenIptalSozlesmesiTests ile zorlanır.
/// </summary>
public interface ITokenIptalDeposu
{
    /// <summary>Tek bir token'ı jti değeriyle iptal eder.</summary>
    void JtiIptalEt(string jti, DateTime gecerlilikSonu);

    /// <summary>Kullanıcının bu andan önce üretilmiş TÜM token'larını iptal eder.</summary>
    void KullaniciTumTokenlariniIptalEt(int kullaniciId);

    /// <summary>Token iptal edilmiş mi? jti veya kullanıcı-zaman damgası üzerinden.</summary>
    bool IptalEdilmisMi(string? jti, int kullaniciId, DateTime uretilmeZamaniUtc);
}
