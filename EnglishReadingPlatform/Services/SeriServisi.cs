using System.Text.RegularExpressions;
using EnglishReadingPlatform.Contracts;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Validation;
using Microsoft.EntityFrameworkCore;

namespace EnglishReadingPlatform.Services;

public interface ISeriServisi
{
    Task PuanEkleAsync(int userId, string tur);
    Task<SeriOzetiResponse> OzetGetirAsync(int userId);
    Task<SeriOzetiResponse> AyarGuncelleAsync(int userId, int? hedefXp, string? saatDilimi, string? seviye = null, bool? ilkAcilisTamamlandi = null);
}

public class SeriServisi : ISeriServisi
{
    private readonly AppDbContext _db;
    private readonly ILogger<SeriServisi> _logger;

    private static readonly Regex SaatDilimiDeseni =
        new(@"^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$", RegexOptions.Compiled);

    public SeriServisi(AppDbContext db, ILogger<SeriServisi> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// YH-04: bir öğrenme olayının puanını kullanıcının YEREL gününe yazar.
    ///
    /// ATOMİK: tek SQL cümlesi (INSERT … ON CONFLICT … DO UPDATE). Eski sürüm
    /// "oku → topla → yaz" yapıyordu; aynı anda gelen olaylar aynı eski değeri okuyup
    /// birbirini eziyordu (30 eşzamanlı olayda 27 puan kayboldu). Tavanlar da aynı
    /// cümlede LEAST ile uygulanır; HedefXp yalnızca günün İLK olayında yazılır.
    ///
    /// DAYANIKLI: puan, ana işlemin (kelime, quiz, ilerleme kaydı) YAN etkisidir.
    /// Yazılamazsa çağıran uç düşmez — ama sessiz de geçilmez: uyarı günlüğüne yazılır.
    /// </summary>
    public async Task PuanEkleAsync(int userId, string tur)
    {
        int okuma = 0, kelime = 0, calisma = 0, quiz = 0, cumle = 0;

        switch (tur.ToLowerInvariant())
        {
            case "okuma": okuma = Math.Min(SeriKurallari.OkumaXp, SeriKurallari.OkumaTavan); break;
            case "kelime": kelime = Math.Min(SeriKurallari.KelimeXp, SeriKurallari.KelimeTavan); break;
            case "calisma": calisma = Math.Min(SeriKurallari.CalismaXp, SeriKurallari.CalismaTavan); break;
            case "quiz": quiz = Math.Min(SeriKurallari.QuizXp, SeriKurallari.QuizTavan); break;
            case "cumle": cumle = Math.Min(SeriKurallari.CumleXp, SeriKurallari.CumleTavan); break;
            default:
                _logger.LogWarning("Bilinmeyen seri etkinliği yok sayıldı. Tur={Tur}", tur);
                return;
        }

        try
        {
            var ayar = await _db.OgrenmeAyarlari
                .AsNoTracking()
                .Where(a => a.UserId == userId)
                .Select(a => new { a.GunlukHedefXp, a.SaatDilimi })
                .FirstOrDefaultAsync();

            var hedefXp = ayar?.GunlukHedefXp ?? SeriKurallari.VarsayilanHedefXp;
            var tz = TimeZoneInfoCoz(ayar?.SaatDilimi ?? SeriKurallari.VarsayilanSaatDilimi);

            var utcNow = DateTime.UtcNow;
            var gun = SeriHesabi.YerelGun(utcNow, tz);

            // Bütün değerler PARAMETRE olarak gider (FormattableString); dize birleştirme yok.
            await _db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO ""GunlukEtkinlikler""
    (""UserId"", ""Gun"", ""OkumaXp"", ""KelimeXp"", ""CalismaXp"", ""QuizXp"", ""CumleXp"", ""HedefXp"", ""GuncellemeAt"")
VALUES ({userId}, {gun}, {okuma}, {kelime}, {calisma}, {quiz}, {cumle}, {hedefXp}, {utcNow})
ON CONFLICT (""UserId"", ""Gun"") DO UPDATE SET
    ""OkumaXp""   = LEAST(""GunlukEtkinlikler"".""OkumaXp""   + EXCLUDED.""OkumaXp"",   {SeriKurallari.OkumaTavan}),
    ""KelimeXp""  = LEAST(""GunlukEtkinlikler"".""KelimeXp""  + EXCLUDED.""KelimeXp"",  {SeriKurallari.KelimeTavan}),
    ""CalismaXp"" = LEAST(""GunlukEtkinlikler"".""CalismaXp"" + EXCLUDED.""CalismaXp"", {SeriKurallari.CalismaTavan}),
    ""QuizXp""    = LEAST(""GunlukEtkinlikler"".""QuizXp""    + EXCLUDED.""QuizXp"",    {SeriKurallari.QuizTavan}),
    ""CumleXp""   = LEAST(""GunlukEtkinlikler"".""CumleXp""   + EXCLUDED.""CumleXp"",   {SeriKurallari.CumleTavan}),
    ""GuncellemeAt"" = EXCLUDED.""GuncellemeAt""");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex,
                "Seri puanı yazılamadı; ana işlem etkilenmedi. KullaniciId={KullaniciId} Tur={Tur}",
                userId, tur);
        }
    }

    public async Task<SeriOzetiResponse> OzetGetirAsync(int userId)
    {
        var ayar = await _db.OgrenmeAyarlari
            .Where(a => a.UserId == userId)
            .Select(a => new { a.GunlukHedefXp, a.SaatDilimi, a.Seviye, a.IlkAcilisTamamlandi })
            .FirstOrDefaultAsync();

        var hedefXp = ayar?.GunlukHedefXp ?? SeriKurallari.VarsayilanHedefXp;
        var tzStr = ayar?.SaatDilimi ?? SeriKurallari.VarsayilanSaatDilimi;
        var seviye = ayar?.Seviye;
        var ilkAcilisTamamlandi = ayar?.IlkAcilisTamamlandi ?? false;
        var tz = TimeZoneInfoCoz(tzStr);

        var utcNow = DateTime.UtcNow;
        var bugun = SeriHesabi.YerelGun(utcNow, tz);

        // Kullanıcının günlük etkinlik verileri
        var etkinlikler = await _db.GunlukEtkinlikler
            .Where(e => e.UserId == userId)
            .Select(e => new
            {
                e.Gun,
                e.OkumaXp,
                e.KelimeXp,
                e.CalismaXp,
                e.QuizXp,
                e.CumleXp,
                e.HedefXp,
                ToplamXp = e.OkumaXp + e.KelimeXp + e.CalismaXp + e.QuizXp + e.CumleXp
            })
            .ToListAsync();

        var aktifGunler = etkinlikler.Where(e => e.ToplamXp > 0).Select(e => e.Gun).ToList();
        var (mevcutSeri, enUzunSeri, bugunAktif) = SeriHesabi.Hesapla(aktifGunler, bugun);

        bool seriRiskte = !bugunAktif && mevcutSeri > 0;

        var bugunEtkinlik = etkinlikler.FirstOrDefault(e => e.Gun == bugun);
        var bugunXp = bugunEtkinlik?.ToplamXp ?? 0;
        var bugunHedefXp = bugunEtkinlik?.HedefXp > 0 ? bugunEtkinlik.HedefXp : hedefXp;

        var bugunOzeti = new BugunOzeti(
            bugun.ToString("yyyy-MM-dd"),
            bugunXp,
            bugunHedefXp,
            bugunXp >= bugunHedefXp,
            new KirilimOzeti(
                bugunEtkinlik?.OkumaXp ?? 0,
                bugunEtkinlik?.KelimeXp ?? 0,
                bugunEtkinlik?.CalismaXp ?? 0,
                bugunEtkinlik?.QuizXp ?? 0,
                bugunEtkinlik?.CumleXp ?? 0
            )
        );

        // Son 30 günün takvimi
        var son30Gun = Enumerable.Range(0, 30)
            .Select(i => bugun.AddDays(-29 + i))
            .ToList();

        var etkinlikMap = etkinlikler.ToDictionary(e => e.Gun);

        var sonGunlerListesi = son30Gun.Select(g =>
        {
            if (etkinlikMap.TryGetValue(g, out var e))
            {
                var hXp = e.HedefXp > 0 ? e.HedefXp : hedefXp;
                return new SonGunOzeti(g.ToString("yyyy-MM-dd"), e.ToplamXp, e.ToplamXp >= hXp);
            }
            return new SonGunOzeti(g.ToString("yyyy-MM-dd"), 0, false);
        }).ToList();

        var puanTablosu = new List<PuanTablosuKalemi>
        {
            new("okuma", SeriKurallari.OkumaXp, SeriKurallari.OkumaTavan),
            new("kelime", SeriKurallari.KelimeXp, SeriKurallari.KelimeTavan),
            new("calisma", SeriKurallari.CalismaXp, SeriKurallari.CalismaTavan),
            new("quiz", SeriKurallari.QuizXp, SeriKurallari.QuizTavan),
            new("cumle", SeriKurallari.CumleXp, SeriKurallari.CumleTavan),
        };

        return new SeriOzetiResponse(
            mevcutSeri,
            enUzunSeri,
            bugunAktif,
            seriRiskte,
            bugunOzeti,
            sonGunlerListesi,
            hedefXp,
            tzStr,
            IzinliDegerler.GunlukHedefXp,
            puanTablosu,
            seviye,
            ilkAcilisTamamlandi
        );
    }

    public async Task<SeriOzetiResponse> AyarGuncelleAsync(int userId, int? hedefXp, string? saatDilimi, string? seviye = null, bool? ilkAcilisTamamlandi = null)
    {
        if (hedefXp is null && string.IsNullOrWhiteSpace(saatDilimi) && string.IsNullOrWhiteSpace(seviye) && !ilkAcilisTamamlandi.HasValue)
        {
            throw new ArgumentException("Güncellenecek en az bir alan belirtilmelidir.");
        }

        if (hedefXp is int h && !IzinliDegerler.GunlukHedefXp.Contains(h))
        {
            throw new ArgumentException("Günlük hedef 10, 20, 30 ya da 50 XP olabilir.");
        }

        if (!string.IsNullOrWhiteSpace(saatDilimi))
        {
            var tzTemiz = saatDilimi.Trim();
            if (tzTemiz.Length > AlanSinirlari.SaatDilimi ||
                !SaatDilimiDeseni.IsMatch(tzTemiz) ||
                !TimeZoneExists(tzTemiz))
            {
                throw new ArgumentException("Saat dilimi tanınmadı.");
            }
        }

        if (!string.IsNullOrWhiteSpace(seviye))
        {
            var sTemiz = seviye.Trim();
            if (!IzinliDegerler.KullaniciSeviyeleri.Contains(sTemiz))
            {
                throw new ArgumentException("Geçersiz seviye.");
            }
        }

        var ayar = await _db.OgrenmeAyarlari.FirstOrDefaultAsync(a => a.UserId == userId);
        if (ayar is null)
        {
            ayar = new OgrenmeAyarlari
            {
                UserId = userId,
                GunlukHedefXp = hedefXp ?? SeriKurallari.VarsayilanHedefXp,
                SaatDilimi = saatDilimi?.Trim() ?? SeriKurallari.VarsayilanSaatDilimi,
                Seviye = !string.IsNullOrWhiteSpace(seviye) ? seviye.Trim() : null,
                IlkAcilisTamamlandi = ilkAcilisTamamlandi == true,
                GuncellemeAt = DateTime.UtcNow,
            };
            _db.OgrenmeAyarlari.Add(ayar);
        }
        else
        {
            if (hedefXp is int newHedef) ayar.GunlukHedefXp = newHedef;
            if (!string.IsNullOrWhiteSpace(saatDilimi)) ayar.SaatDilimi = saatDilimi.Trim();
            if (!string.IsNullOrWhiteSpace(seviye)) ayar.Seviye = seviye.Trim();
            if (ilkAcilisTamamlandi == true) ayar.IlkAcilisTamamlandi = true;
            ayar.GuncellemeAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        return await OzetGetirAsync(userId);
    }

    public static TimeZoneInfo TimeZoneInfoCoz(string tzStr)
    {
        if (string.IsNullOrWhiteSpace(tzStr))
            return TimeZoneInfo.FindSystemTimeZoneById(SeriKurallari.VarsayilanSaatDilimi);

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(tzStr);
        }
        catch
        {
            return TimeZoneInfo.FindSystemTimeZoneById(SeriKurallari.VarsayilanSaatDilimi);
        }
    }

    public static bool TimeZoneExists(string tzStr)
    {
        try
        {
            TimeZoneInfo.FindSystemTimeZoneById(tzStr);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
