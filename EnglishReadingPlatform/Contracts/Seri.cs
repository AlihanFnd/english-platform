using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using EnglishReadingPlatform.Validation;

namespace EnglishReadingPlatform.Contracts;

public static class SeriKurallari
{
    public const int VarsayilanHedefXp = 20;
    public const string VarsayilanSaatDilimi = "Europe/Istanbul";

    // XP Değerleri ve Tavanlar
    public const int OkumaXp = 5;
    public const int OkumaTavan = 60;

    public const int KelimeXp = 2;
    public const int KelimeTavan = 20;

    public const int CalismaXp = 1;
    public const int CalismaTavan = 40;

    public const int QuizXp = 10;
    public const int QuizTavan = 40;

    public const int CumleXp = 3;
    public const int CumleTavan = 15;
}

public static class SeriHesabi
{
    /// <summary>
    /// UTC anı kullanıcının yerel saat dilimindeki takvim gününe çevirir.
    /// </summary>
    public static DateOnly YerelGun(DateTime utc, TimeZoneInfo tz)
    {
        var yerel = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), tz);
        return DateOnly.FromDateTime(yerel);
    }

    /// <summary>
    /// Aktif günlerden (XP > 0) mevcut seri, en uzun seri ve bugün aktifliğini hesaplar.
    /// Mevcut seri: bugünden (bugün aktifse) ya da DÜNDEN (bugün henüz aktif değilse)
    /// geriye doğru kesintisiz gün sayısı. Dün de aktif değilse 0.
    /// </summary>
    public static (int Mevcut, int EnUzun, bool BugunAktif) Hesapla(IEnumerable<DateOnly> aktifGunler, DateOnly bugun)
    {
        var set = new HashSet<DateOnly>(aktifGunler);
        bool bugunAktif = set.Contains(bugun);

        int mevcut = 0;
        if (bugunAktif)
        {
            var testGun = bugun;
            while (set.Contains(testGun))
            {
                mevcut++;
                testGun = testGun.AddDays(-1);
            }
        }
        else
        {
            var dun = bugun.AddDays(-1);
            if (set.Contains(dun))
            {
                var testGun = dun;
                while (set.Contains(testGun))
                {
                    mevcut++;
                    testGun = testGun.AddDays(-1);
                }
            }
        }

        // En uzun seriyi hesapla
        int enUzun = 0;
        if (set.Count > 0)
        {
            var sirali = set.OrderBy(g => g).ToList();
            int anlik = 0;
            DateOnly? önceki = null;

            foreach (var g in sirali)
            {
                if (önceki is null || g == önceki.Value.AddDays(1))
                {
                    anlik++;
                }
                else
                {
                    anlik = 1;
                }

                if (anlik > enUzun) enUzun = anlik;
                önceki = g;
            }
        }

        return (mevcut, enUzun, bugunAktif);
    }
}

public record KirilimOzeti(
    [property: JsonPropertyName("okuma")] int Okuma,
    [property: JsonPropertyName("kelime")] int Kelime,
    [property: JsonPropertyName("calisma")] int Calisma,
    [property: JsonPropertyName("quiz")] int Quiz,
    [property: JsonPropertyName("cumle")] int Cumle
);

public record BugunOzeti(
    [property: JsonPropertyName("gun")] string Gun,
    [property: JsonPropertyName("xp")] int Xp,
    [property: JsonPropertyName("hedefXp")] int HedefXp,
    [property: JsonPropertyName("hedefTamamlandi")] bool HedefTamamlandi,
    [property: JsonPropertyName("kirilim")] KirilimOzeti Kirilim
);

public record SonGunOzeti(
    [property: JsonPropertyName("gun")] string Gun,
    [property: JsonPropertyName("xp")] int Xp,
    [property: JsonPropertyName("hedefTamamlandi")] bool HedefTamamlandi
);

public record PuanTablosuKalemi(
    [property: JsonPropertyName("tur")] string Tur,
    [property: JsonPropertyName("xp")] int Xp,
    [property: JsonPropertyName("gunlukTavan")] int GunlukTavan
);

public record SeriOzetiResponse(
    [property: JsonPropertyName("mevcutSeri")] int MevcutSeri,
    [property: JsonPropertyName("enUzunSeri")] int EnUzunSeri,
    [property: JsonPropertyName("bugunAktif")] bool BugunAktif,
    [property: JsonPropertyName("seriRiskte")] bool SeriRiskte,
    [property: JsonPropertyName("bugun")] BugunOzeti Bugun,
    [property: JsonPropertyName("sonGunler")] List<SonGunOzeti> SonGunler,
    [property: JsonPropertyName("gunlukHedefXp")] int GunlukHedefXp,
    [property: JsonPropertyName("saatDilimi")] string SaatDilimi,
    [property: JsonPropertyName("hedefSecenekleri")] int[] HedefSecenekleri,
    [property: JsonPropertyName("puanTablosu")] List<PuanTablosuKalemi> PuanTablosu,
    [property: JsonPropertyName("seviye")] string? Seviye = null,
    [property: JsonPropertyName("ilkAcilisTamamlandi")] bool IlkAcilisTamamlandi = false
);

/// <summary>
/// PUT /api/seri/ayarlar gövdesi. Asıl doğrulama denetleyicide (whitelist, IANA deseni,
/// TimeZoneInfo); öznitelikler üst sınırı gövde çözümlenirken bildirir. Sözleşme testi
/// ve guard 05 bunu zorlar. Mesajlar denetleyicininkiyle aynı, istemci fark görmez.
/// </summary>
public record GuncelleAyarlarRequest(
    int? GunlukHedefXp,

    [StringLength(AlanSinirlari.SaatDilimi, ErrorMessage = "Saat dilimi tanınmadı.")]
    string? SaatDilimi,

    [StringLength(AlanSinirlari.KullaniciSeviye, ErrorMessage = "Geçersiz seviye.")]
    string? Seviye,

    bool? IlkAcilisTamamlandi
);
