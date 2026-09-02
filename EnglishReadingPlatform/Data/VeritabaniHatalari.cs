using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace EnglishReadingPlatform.Data;

/// <summary>
/// KURAL-12: veritabanı kısıt ihlallerini TEK yerde tanır.
///
/// Unique index eklendikten sonra, eskiden sessizce mükerrer satır açan her
/// yazma yolu artık istisna fırlatabilir. O istisna yakalanmazsa kullanıcı
/// 500 görür — yani bir bütünlük düzeltmesi, bir kullanılabilirlik hatasına
/// dönüşür. Bu yardımcı, "bu hata gerçekten benzersizlik ihlali mi" sorusunu
/// her çağrı yerinde yeniden yazılan bir string karşılaştırmasına bırakmaz.
///
/// SQLSTATE 23505 = unique_violation (PostgreSQL).
/// </summary>
public static class VeritabaniHatalari
{
    /// <summary>PostgreSQL 23505 = unique_violation</summary>
    public const string BenzersizlikIhlaliKodu = "23505";

    /// <summary>
    /// Bu <see cref="DbUpdateException"/> bir benzersizlik (unique index)
    /// ihlalinden mi kaynaklanıyor?
    /// </summary>
    public static bool BenzersizlikIhlaliMi(this DbUpdateException ex)
        => ex.InnerException is PostgresException pg
           && pg.SqlState == BenzersizlikIhlaliKodu;
}

/// <summary>
/// KURAL-12: benzersizlik kısıtı altında IDEMPOTENT yazma.
///
/// Neden ayrı bir yardımcı: unique index eklenmesi, "kontrol et sonra ekle"
/// desenini kullanan her ucu bir yarış durumunda 500'e çevirir. Eskiden aynı
/// yarış sessizce mükerrer satır açıyordu — yani düzeltme, sorunu görünür bir
/// hataya dönüştürdü ama API sözleşmesini de bozdu. Bu yardımcı sözleşmeyi
/// korur: çakışma, çağıranın bilinçli olarak ele alabileceği bir 'false'tur.
/// </summary>
public static class BenzersizYazma
{
    /// <summary>
    /// Değişiklikleri kaydeder. Benzersizlik ihlali olursa istisnayı yutar,
    /// çakışan girdileri izlemeden çıkarır ve <c>false</c> döner.
    /// Diğer bütün hatalar OLDUĞU GİBİ yukarı çıkar — bu yardımcı yalnızca
    /// tek bir hata sınıfını ele alır, genel bir "hataları yut" değildir.
    /// </summary>
    public static async Task<bool> BenzersizKaydetAsync(
        this Microsoft.EntityFrameworkCore.DbContext db,
        CancellationToken iptal = default)
    {
        try
        {
            await db.SaveChangesAsync(iptal);
            return true;
        }
        catch (DbUpdateException ex) when (ex.BenzersizlikIhlaliMi())
        {
            // Başarısız bir SaveChanges, eklenmeye çalışılan satırı
            // ChangeTracker'da 'Added' durumunda BIRAKIR. Aynı istek içinde
            // ikinci bir kaydetme olursa aynı satır yeniden denenir ve bu kez
            // istisnayı kimse beklemez. Çakışan girdiler izlemeden çıkarılır.
            foreach (var giris in ex.Entries)
                giris.State = Microsoft.EntityFrameworkCore.EntityState.Detached;
            return false;
        }
    }
}
