namespace EnglishReadingPlatform.Contracts;

/// <summary>
/// Leitner kutuları aralıklı tekrar algoritması — TEK kaynak (YH-06).
/// </summary>
public static class LeitnerHesaplayici
{
    public static readonly TimeSpan[] LeitnerAraliklari = new[]
    {
        TimeSpan.Zero,                // Kutu 0 (Hiç çalışılmadı)
        TimeSpan.FromDays(1),         // Kutu 1
        TimeSpan.FromDays(2),         // Kutu 2
        TimeSpan.FromDays(4),         // Kutu 3
        TimeSpan.FromDays(7),         // Kutu 4 ("Öğrenildi" eşiği)
        TimeSpan.FromDays(15),        // Kutu 5
        TimeSpan.FromDays(30),        // Kutu 6
        TimeSpan.FromDays(60)         // Kutu 7 (Tavan)
    };

    public const int OgrenildiEsigiKutu = 4;
    public const int MaxKutu = 7;
    public const int GunlukYeniSiniri = 10;

    public static (int yeniKutu, DateTime yeniSonrakiTekrarAt) Bildi(int mevcutKutu, DateTime simdikiZaman)
    {
        int yeniKutu = Math.Min(mevcutKutu + 1, MaxKutu);
        if (yeniKutu < 1) yeniKutu = 1;
        var yeniZaman = simdikiZaman.Add(LeitnerAraliklari[yeniKutu]);
        return (yeniKutu, yeniZaman);
    }

    public static (int yeniKutu, DateTime yeniSonrakiTekrarAt) Bilemedi(int mevcutKutu, DateTime simdikiZaman)
    {
        int yeniKutu = 1;
        var yeniZaman = simdikiZaman.AddMinutes(10);
        return (yeniKutu, yeniZaman);
    }
}
