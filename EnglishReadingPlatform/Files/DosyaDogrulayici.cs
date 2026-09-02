using System.Buffers;
using System.IO.Compression;
using EnglishReadingPlatform.Exceptions;

namespace EnglishReadingPlatform.Files;

/// <summary>Yüklenen dosyanın İÇERİKTEN belirlenmiş gerçek türü.</summary>
public enum DosyaTuru { Bilinmeyen, Pdf, Docx }

/// <summary>
/// KURAL-10: Dosya türünü İÇERİKTEN belirler. Dosya adı yalnızca ilk elemedir.
/// Tüm yükleme yolları bu sınıftan geçer.
///
/// NEDEN: eski kod türü <c>Path.GetExtension(file.FileName)</c> ile belirliyordu.
/// Dosya adını İSTEMCİ yazar; <c>kotu.exe</c> → <c>kotu.pdf</c> diye yeniden
/// adlandırılan her şey doğrudan ayrıştırıcıya gidiyordu. <c>Content-Type</c>
/// başlığı da aynı derecede sahtedir — o yüzden ona hiç bakılmaz.
/// Belirleyici olan tek şey dosyanın ilk baytlarıdır.
/// </summary>
public class DosyaDogrulayici
{
    public const long EnBuyukBoyut        = 100L * 1024 * 1024;  // 100 MB (sıkıştırılmış)
    public const long EnBuyukAcilmisBoyut = 400L * 1024 * 1024;  // 400 MB (zip-bomb koruması)
    public const int  EnCokSayfa          = 1_500;
    public static readonly TimeSpan AyristirmaSuresi = TimeSpan.FromSeconds(180);

    /// <summary>Bir DOCX arşivinde izin verilen azami giriş sayısı.</summary>
    public const int EnCokZipGirisi = 5_000;

    /// <summary>Şüpheli sayılan sıkıştırma oranı (açılmış / sıkıştırılmış).</summary>
    public const int EnCokSikistirmaOrani = 100;

    /// <summary>
    /// Oran kontrolünün devreye girdiği alt eşik. Bunun altındaki dosyalar
    /// oranları ne olursa olsun zararsızdır; eşik olmadan metin ağırlıklı
    /// küçük ve MEŞRU bir DOCX (100 KB → 10 MB) yanlışlıkla reddedilirdi.
    /// </summary>
    public const long OranKontroluAltEsigi = 10L * 1024 * 1024;  // 10 MB

    // ── Sihirli baytlar ────────────────────────────────────────
    private static readonly byte[] PdfImza = "%PDF-"u8.ToArray();
    private static readonly byte[] ZipImza = { 0x50, 0x4B, 0x03, 0x04 };   // PK.. — DOCX bir ZIP'tir

    private static readonly string[] IzinliUzantilar = { ".pdf", ".docx" };

    /// <summary>
    /// Dosyayı doğrular ve gerçek türünü döner.
    /// Geçersizse KullaniciHatasi fırlatır (KURAL-06: mesaj kullanıcıya gösterilebilir).
    /// </summary>
    public DosyaTuru Dogrula(IFormFile? dosya)
    {
        if (dosya is null || dosya.Length == 0)
            throw new KullaniciHatasi("Dosya seçilmedi.");

        if (dosya.Length > EnBuyukBoyut)
            throw new KullaniciHatasi($"Dosya boyutu {EnBuyukBoyut / 1024 / 1024} MB sınırını aşıyor.");

        // 1. Eleme: uzantı (ucuz)
        var uzanti = Path.GetExtension(dosya.FileName).ToLowerInvariant();
        if (!IzinliUzantilar.Contains(uzanti))
            throw new KullaniciHatasi("Sadece PDF veya DOCX dosyaları yüklenebilir.");

        // 2. Eleme: içerik (belirleyici)
        var gercekTur = TuruBelirle(dosya);
        if (gercekTur == DosyaTuru.Bilinmeyen)
            throw new KullaniciHatasi(
                "Dosya içeriği tanınamadı. Geçerli bir PDF veya DOCX dosyası yükleyin.");

        // 3. Uzantı ile içerik uyuşuyor mu?
        var beklenen = uzanti == ".pdf" ? DosyaTuru.Pdf : DosyaTuru.Docx;
        if (gercekTur != beklenen)
            throw new KullaniciHatasi(
                "Dosya uzantısı içeriğiyle uyuşmuyor. Doğru dosyayı yüklediğinizden emin olun.");

        return gercekTur;
    }

    /// <summary>Yalnızca içeriğe bakarak türü belirler.</summary>
    public DosyaTuru TuruBelirle(IFormFile dosya)
    {
        // OpenReadStream her çağrıda dosyanın başına konumlanmış YENİ bir akış
        // döner; bu yüzden burada okumak sonraki ayrıştırmayı bozmaz.
        using var akis = dosya.OpenReadStream();
        Span<byte> tampon = stackalloc byte[8];
        var okunan = akis.ReadAtLeast(tampon, 8, throwOnEndOfStream: false);
        if (okunan < 5) return DosyaTuru.Bilinmeyen;

        if (tampon[..5].SequenceEqual(PdfImza)) return DosyaTuru.Pdf;
        if (tampon[..4].SequenceEqual(ZipImza)) return DosyaTuru.Docx;
        return DosyaTuru.Bilinmeyen;
    }

    /// <summary>
    /// DOCX'in açılmış boyutunu kontrol eder (zip-bomb koruması). İKİ AŞAMALI:
    ///   1) Merkezî dizinde BİLDİRİLEN boyutlar — YÜK TAŞIYAN kontrol budur.
    ///   2) GERÇEKTEN açılan bayt sayısı — yedek kontrol.
    ///
    /// "Bildirilen boyut saldırganın yazdığı bir sayı, ona güvenilmez" itirazı
    /// haklı görünür ama bu yığında ÖLÇÜLDÜ ve öyle değil: .NET'in ZipArchive'ı
    /// bildirilen boyutu DeflateStream'e ÜST SINIR olarak geçiriyor. Boyutunu 0
    /// diye bildiren 300 MB'lık bir bomba 0 bayt teslim ediyor — aşağı yönlü
    /// yalan, bombayı büyütmüyor küçültüyor.
    ///
    /// Bu yüzden (2) BUGÜN ULAŞILAMAZ bir yedektir; ölçülmüş koruma (1)'dir.
    /// Yine de duruyor: bu davranış çalışma zamanına ait bir ayrıntıdır, bizim
    /// sözleşmemiz değil. Değiştiği gün (2) yükü devralır ve
    /// Boyutunu_yalan_soyleyen_zip_bildirdiginden_fazlasini_teslim_edemez testi
    /// kırmızıya dönüp bunu bize haber verir.
    /// </summary>
    public void ZipBombKontrolu(IFormFile dosya)
    {
        using var akis = dosya.OpenReadStream();
        using var arsiv = ArsivAc(akis);

        if (arsiv.Entries.Count > EnCokZipGirisi)
            throw new KullaniciHatasi("Dosya işlenemeyecek kadar çok bileşen içeriyor.");

        // ── 1. Aşama: bildirilen boyut (yük taşıyan kontrol) ──
        long bildirilen = 0;
        foreach (var giris in arsiv.Entries)
        {
            bildirilen += giris.Length;
            if (bildirilen > EnBuyukAcilmisBoyut)
                throw new KullaniciHatasi(
                    "Dosya açıldığında izin verilen boyutu aşıyor. Farklı bir dosya deneyin.");
        }

        // ── 2. Aşama: gerçekten açılan bayt (yedek) ──
        var tampon = ArrayPool<byte>.Shared.Rent(81_920);
        try
        {
            long gercek = 0;
            foreach (var giris in arsiv.Entries)
            {
                using var girisAkisi = GirisAc(giris);
                int okunan;
                while ((okunan = girisAkisi.Read(tampon, 0, tampon.Length)) > 0)
                {
                    gercek += okunan;
                    if (gercek > EnBuyukAcilmisBoyut)
                        throw new KullaniciHatasi(
                            "Dosya açıldığında izin verilen boyutu aşıyor. Farklı bir dosya deneyin.");
                }
            }

            // Sıkıştırma oranı: 100:1'den fazlası şüphelidir. Alt eşik, meşru
            // küçük dosyaların yanlışlıkla reddedilmesini önler.
            if (gercek > OranKontroluAltEsigi
                && dosya.Length > 0
                && gercek / dosya.Length > EnCokSikistirmaOrani)
                throw new KullaniciHatasi("Dosya olağandışı sıkıştırma oranına sahip, işlenemedi.");
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(tampon);
        }
    }

    /// <summary>
    /// KURAL-06: bozuk bir ZIP SUNUCU arızası değil, KULLANICI hatasıdır.
    /// Sarmalanmazsa ham InvalidDataException merkezî middleware'e düşer ve
    /// her bozuk yükleme üretimde bir LogError üretir.
    /// </summary>
    private static ZipArchive ArsivAc(Stream akis)
    {
        try { return new ZipArchive(akis, ZipArchiveMode.Read, leaveOpen: false); }
        catch (Exception)
        {
            throw new KullaniciHatasi(
                "DOCX dosyası okunamadı. Dosya bozuk veya desteklenmeyen bir biçimde olabilir.");
        }
    }

    /// <summary>ArsivAc ile aynı gerekçe, tek bir giriş için.</summary>
    private static Stream GirisAc(ZipArchiveEntry giris)
    {
        try { return giris.Open(); }
        catch (Exception)
        {
            throw new KullaniciHatasi(
                "DOCX dosyası okunamadı. Dosya bozuk veya desteklenmeyen bir biçimde olabilir.");
        }
    }

    /// <summary>
    /// Seçim dizesini sayfa listesine çevirir ve ÜST SINIRI uygular.
    ///
    /// DOSYAYA HİÇ DOKUNMAZ — kasten. Sayfa sayısı sınırı, PDF açılmadan ÖNCE
    /// uygulanmalıdır; aksi hâlde "100.000 sayfa seç" isteği önce ayrıştırıcıyı
    /// meşgul eder, sınır ancak ondan sonra devreye girerdi.
    /// </summary>
    public IReadOnlyList<int> SecimiCoz(string? sayfaSecimi)
    {
        if (string.IsNullOrWhiteSpace(sayfaSecimi))
            throw new KullaniciHatasi("Lütfen yüklenecek sayfaları seçin.");

        var sayfalar = sayfaSecimi.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => int.TryParse(p, out _))
            .Select(int.Parse)
            .Where(p => p >= 1)
            .Distinct()
            .OrderBy(p => p)
            .ToList();

        if (sayfalar.Count == 0)
            throw new KullaniciHatasi("Geçerli bir sayfa seçilmedi.");

        if (sayfalar.Count > EnCokSayfa)
            throw new KullaniciHatasi($"Tek seferde en fazla {EnCokSayfa} sayfa yüklenebilir.");

        return sayfalar;
    }

    /// <summary>Çözülmüş seçimi belgenin gerçek sayfa aralığına kırpar.</summary>
    public IReadOnlyList<int> AraligaKirp(IReadOnlyList<int> istenen, int toplamSayfa)
    {
        var sayfalar = istenen.Where(p => p >= 1 && p <= toplamSayfa).ToList();

        if (sayfalar.Count == 0)
            throw new KullaniciHatasi("Geçerli bir sayfa seçilmedi.");

        return sayfalar;
    }

    /// <summary>Seçilen sayfa listesini doğrular ve normalize eder (tek adımda).</summary>
    public IReadOnlyList<int> SayfalariDogrula(string? sayfaSecimi, int toplamSayfa)
        => AraligaKirp(SecimiCoz(sayfaSecimi), toplamSayfa);
}
