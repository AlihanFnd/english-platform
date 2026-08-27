using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <summary>
    /// KURAL-02 — Koda gömülü tohum yöneticisini geçersiz kılar.
    ///
    /// Sorun: admin@platform.com hesabının BCrypt hash'i beş ayrı migration
    /// dosyasında sürüm kontrolüne girmiş durumda. Repoyu gören herkes
    /// koda gömülü tohum şifresini bu hash'lere karşı doğrulayabilir — yani
    /// yönetici şifresi fiilen herkese açık.
    ///
    /// EF'nin ürettiği ham hâli koşulsuz bir DeleteData idi. Canlı kurulumda
    /// bu, yöneticiye bağlı tüm veriyi (ilerleme, aktivite, grup) cascade
    /// silerdi. Bunun yerine iki adımlı, veri kaybetmeyen yol izleniyor:
    ///
    ///   1. Hiç kullanılmamış (bağlı satırı olmayan) tohum hesabı tamamen silinir
    ///      — temiz kurulumda sızmış hesap hiç var olmamış gibi olur.
    ///   2. Kullanılmış olan hesap SİLİNMEZ; şifresi, üretildikten sonra
    ///      atılan rastgele 32 baytlık bir sırrın hash'iyle değiştirilir.
    ///      Satır ve bağlı verisi durur, ama kimse o hesaba giremez.
    ///
    /// Her iki adım da yalnızca hash'i BİLİNEN SIZMIŞ değerlerden biri olan
    /// satırlara dokunur. Şifresi elle değiştirilmiş bir hesap etkilenmez.
    ///
    /// Yeni yönetici artık YoneticiTohumlayici tarafından
    /// Seed:AdminEmail / Seed:AdminPassword ortam değişkenlerinden oluşturulur.
    /// </summary>
    public partial class SeedAdminOrtamaTasindi : Migration
    {
        /// <summary>
        /// Sürüm kontrolüne girmiş tohum hash'leri. Hepsi aynı sızmış tohum
        /// şifresinin farklı tuzlarla üretilmiş hâli — her "migrations add"
        /// komutu yenisini doğurmuştu.
        /// Bunlar sır değil, iptal edilecek hedeflerdir.
        /// </summary>
        private const string SizmisHashler = @"
            '$2a$11$Ncpv0yhdoaptfJlGmupRyuZfACjwjQd4gfysg41h5ZIGy8Ug209FO',
            '$2a$11$Id57qBhDy0vxcOtYIGXPm.zdm5hGkd/QYLDGnY.XpkrRV7WpZML6u',
            '$2a$11$QxChAGj7rmBEflnUSd4o/.XBT8GG4S5z5vITRtB2oeytGqycmEXSC',
            '$2a$11$BmvwrnodQ8bt1HDgwvThdut8OnFKKRAo7.immYtNPMhykuzI/TpHm',
            '$2a$11$1/GQ3L.yftZsXrCKiRCklerzhm5qAyiSadiuTIqYrYIUuyX4o8vRe'";

        /// <summary>
        /// Rastgele 32 baytlık bir sırdan üretildi; sır hiçbir yere yazılmadı.
        /// Geçerli bir BCrypt hash'i olması şart — AuthController Verify'ı
        /// doğrudan çağırıyor ve bozuk hash SaltParseException fırlatıp 500 üretirdi.
        /// </summary>
        private const string KilitHash = "$2a$11$1QzDtwUKa1Bqb2z0SJFW3ebb6e1tGX.Z5PFmxpivZiIiIjajww4Bq";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1) Hiç kullanılmamış tohum yöneticisini tamamen kaldır.
            migrationBuilder.Sql($@"
                DELETE FROM ""Users"" u
                 WHERE u.""Email"" = 'admin@platform.com'
                   AND u.""PasswordHash"" IN ({SizmisHashler})
                   AND NOT EXISTS (SELECT 1 FROM ""ReadingProgresses"" x WHERE x.""UserId""      = u.""Id"")
                   AND NOT EXISTS (SELECT 1 FROM ""UserActivityLogs""  x WHERE x.""UserId""      = u.""Id"")
                   AND NOT EXISTS (SELECT 1 FROM ""WordListItems""     x WHERE x.""UserId""      = u.""Id"")
                   AND NOT EXISTS (SELECT 1 FROM ""QuizResults""       x WHERE x.""UserId""      = u.""Id"")
                   AND NOT EXISTS (SELECT 1 FROM ""OcrRecords""        x WHERE x.""UserId""      = u.""Id"")
                   AND NOT EXISTS (SELECT 1 FROM ""Feedbacks""         x WHERE x.""UserId""      = u.""Id"")
                   AND NOT EXISTS (SELECT 1 FROM ""GroupMembers""      x WHERE x.""UserId""      = u.""Id"")
                   AND NOT EXISTS (SELECT 1 FROM ""Groups""            x WHERE x.""AdminUserId"" = u.""Id"");
            ");

            // 2) Geriye kalan (verisi olduğu için silinemeyen) tohum hesabını kilitle.
            migrationBuilder.Sql($@"
                UPDATE ""Users""
                   SET ""PasswordHash"" = '{KilitHash}'
                 WHERE ""Email"" = 'admin@platform.com'
                   AND ""PasswordHash"" IN ({SizmisHashler});
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Kasten boş. Bu migration'ın geri alınması, şifresi herkesçe bilinen
            // bir yönetici hesabını geri getirmek demek olurdu. Sızmış bir sır
            // "geri alınamaz"; iptal edilir. Yönetici gerekiyorsa
            // Seed:AdminEmail / Seed:AdminPassword ile yenisi tohumlanır.
        }
    }
}
