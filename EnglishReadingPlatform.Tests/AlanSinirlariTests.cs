using System.ComponentModel.DataAnnotations;
using System.Reflection;
using EnglishReadingPlatform.Controllers;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Validation;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-05 — SÖZLEŞME TESTİ.
///
/// Bu dosyanın işi tek bir şeyi imkânsız kılmak: DTO sınırının, o değerin
/// yazıldığı veritabanı kolonunun sınırından büyük olması. O durumda kullanıcı
/// 400 yerine 500 alır (PostgreSQL 22001 string data right truncation) —
/// yani doğrulama VARMIŞ gibi görünüp aslında yokmuş gibi davranır.
///
/// Yeni bir DTO alanı eklendiğinde <see cref="Eslesmeler"/> tablosuna da
/// eklenir; eklenmezse EnvanterTamMi testi kırmızı olur.
/// </summary>
public class AlanSinirlariTests
{
    private record Eslesme(Type Dto, string DtoAlan, Type? Entity, string? EntityAlan);

    /// <summary>DTO alanı → yazıldığı entity alanı. Entity null ise kolon 'text' (sınırsız).</summary>
    private static readonly Eslesme[] Eslesmeler =
    {
        // ── Kelime listesi ────────────────────────────────────
        new(typeof(BooksController.AddWordRequest), "Word",        typeof(WordListItem), "Word"),
        new(typeof(BooksController.AddWordRequest), "Translation", typeof(WordListItem), "Translation"),
        new(typeof(BooksController.AddWordRequest), "Context",     typeof(WordListItem), "Context"),

        // ── Aktivite ──────────────────────────────────────────
        new(typeof(ActivityController.LogActivityRequest), "ActivityType", typeof(UserActivityLog), "ActivityType"),
        new(typeof(ActivityController.LogActivityRequest), "Details",      typeof(UserActivityLog), "Details"),

        // ── Geri bildirim ─────────────────────────────────────
        new(typeof(FeedbackController.CreateFeedbackRequest), "Message", typeof(Feedback), "Message"),

        // ── Kitap: üç DTO da AYNI kolonlara yazıyor ───────────
        new(typeof(AdminController.BookUpdateRequest), "Title",       typeof(Book), "Title"),
        new(typeof(AdminController.BookUpdateRequest), "Author",      typeof(Book), "Author"),
        new(typeof(AdminController.BookUpdateRequest), "Description", typeof(Book), "Description"),
        new(typeof(AdminController.BookUploadRequest), "Title",       typeof(Book), "Title"),
        new(typeof(AdminController.BookUploadRequest), "Author",      typeof(Book), "Author"),
        new(typeof(AdminController.BookUploadRequest), "Description", typeof(Book), "Description"),
        new(typeof(AdminController.BookUploadPagesRequest), "Title",       typeof(Book), "Title"),
        new(typeof(AdminController.BookUploadPagesRequest), "Author",      typeof(Book), "Author"),
        new(typeof(AdminController.BookUploadPagesRequest), "Description", typeof(Book), "Description"),

        // ── Kullanıcı ─────────────────────────────────────────
        new(typeof(AuthController.RegisterRequest), "Username", typeof(User), "Username"),
        new(typeof(AuthController.RegisterRequest), "Email",    typeof(User), "Email"),
        new(typeof(AuthController.LoginRequest),    "Email",    typeof(User), "Email"),

        // ── Grup ──────────────────────────────────────────────
        new(typeof(GroupsController.CreateGroupRequest), "Name",        typeof(Group), "Name"),
        new(typeof(GroupsController.CreateGroupRequest), "Description", typeof(Group), "Description"),

        // ── Çeviri: 'Text' TranslationCache.QueryText'e ANAHTAR olarak yazılıyor ──
        new(typeof(TranslateController.KelimeCeviriIstegi), "Text", typeof(TranslationCache), "QueryText"),

        // ── Kolonu 'text' olanlar: taşma yok, yalnızca sınır BİLDİRİLMİŞ olmalı ──
        new(typeof(AuthController.LoginRequest),    "Password", null, null),
        new(typeof(AuthController.RegisterRequest), "Password", null, null),
        new(typeof(GroupsController.JoinGroupRequest), "InviteCode", null, null),
        new(typeof(TranslateController.CumleCeviriIstegi),  "Text", null, null),
        new(typeof(TranslateController.MetinAnaliziIstegi), "Text", null, null),
        new(typeof(DashboardController.SaveOcrRequest),     "Text", null, null),
        new(typeof(AdminController.BookUploadRequest),      "CoverColor",    null, null),
        new(typeof(AdminController.BookUploadPagesRequest), "CoverColor",    null, null),
        new(typeof(AdminController.BookUploadRequest),      "PageSelection", null, null),
        new(typeof(AdminController.BookUploadPagesRequest), "SelectedPages", null, null),
    };

    /// <summary>
    /// Bilinçli olarak kolondan BÜYÜK olan girdi sınırları.
    /// Bu alanlar kaydedilmeden önce KirpEnCok ile kolon sınırına kırpılır;
    /// kırpma kaldırılırsa GirdiDogrulamaTests kırmızı olur.
    /// </summary>
    private static readonly HashSet<string> KirpilanAlanlar = new()
    {
        "AddWordRequest.Context",   // 400 girdi sınırı, 200'e kırpılarak yazılır
    };

    /// <summary>Doğrulama özniteliği taşıması BEKLENMEYEN alanlar (bool, sayısal vb. ayrı sınanır).</summary>
    private static readonly HashSet<string> UzunlukBeklenmeyen = new()
    {
        "KelimeCeviriIstegi.UseAI",
        "SubmitQuizRequest.QuizId",
        "AssignBookRequest.GroupId",
        "AssignBookRequest.BookId",
        "LogActivityRequest.DurationSeconds",
    };

    private static int? Sinir(Type tip, string alan)
    {
        var ozellik = tip.GetProperty(alan);
        ozellik.Should().NotBeNull($"{tip.Name}.{alan} bulunamadı — eşleme tablosu kodla ayrışmış");
        return ozellik!.GetCustomAttribute<StringLengthAttribute>()?.MaximumLength
            ?? ozellik!.GetCustomAttribute<MaxLengthAttribute>()?.Length;
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void Her_DTO_alani_uzunluk_siniri_bildirmeli()
    {
        var eksikler = new List<string>();

        foreach (var (dto, dtoAlan, _, _) in Eslesmeler)
            if (Sinir(dto, dtoAlan) is null)
                eksikler.Add($"{dto.Name}.{dtoAlan}");

        eksikler.Should().BeEmpty(
            "bu DTO alanlarında [StringLength] yok: " + string.Join(", ", eksikler));
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void DTO_siniri_kolon_sinirini_ASMAMALI()
    {
        var ihlaller = new List<string>();

        foreach (var (dto, dtoAlan, entity, entityAlan) in Eslesmeler)
        {
            if (entity is null || entityAlan is null) continue;
            if (KirpilanAlanlar.Contains($"{dto.Name}.{dtoAlan}")) continue;

            var dtoSinir = Sinir(dto, dtoAlan);
            var entitySinir = Sinir(entity, entityAlan);
            if (dtoSinir is null || entitySinir is null) continue;

            if (dtoSinir > entitySinir)
                ihlaller.Add($"{dto.Name}.{dtoAlan}={dtoSinir} > {entity.Name}.{entityAlan}={entitySinir}");
        }

        ihlaller.Should().BeEmpty(
            "DTO sınırı kolon sınırından büyükse kullanıcı 400 yerine 500 alır:\n"
            + string.Join("\n", ihlaller));
    }

    /// <summary>
    /// Envanterin kodla birlikte yaşadığını zorlar: yeni bir istek DTO'su
    /// eklenip eşleme tablosuna yazılmazsa bu test kırmızı olur.
    /// Kuralın 12 kural boyunca çürümesini engelleyen kısım burasıdır.
    /// </summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void Tum_istek_DTO_string_alanlari_sinir_bildirmeli()
    {
        var montaj = typeof(AuthController).Assembly;
        var dtolar = montaj.GetTypes()
            .Where(t => t.IsClass && !t.IsAbstract
                        && (t.Name.EndsWith("Request") || t.Name.EndsWith("Istegi"))
                        && t.Namespace == "EnglishReadingPlatform.Controllers")
            .ToList();

        dtolar.Should().NotBeEmpty("istek DTO'ları bulunamadı — tarama deseni bozulmuş");

        var eksikler = new List<string>();
        foreach (var dto in dtolar)
        foreach (var p in dto.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            var ad = $"{dto.Name}.{p.Name}";
            if (UzunlukBeklenmeyen.Contains(ad)) continue;

            if (p.PropertyType == typeof(string))
            {
                var uzunluk = p.GetCustomAttribute<StringLengthAttribute>() is not null
                              || p.GetCustomAttribute<MaxLengthAttribute>() is not null;
                var whitelist = p.GetCustomAttribute<IzinliDegerAttribute>() is not null;

                // Whitelist ZATEN üst sınır demektir (izinli değerlerin en uzunu).
                if (!uzunluk && !whitelist)
                    eksikler.Add($"{ad}  (string — [StringLength] veya [IzinliDeger] yok)");
                continue;
            }

            // ── KOLEKSİYONLAR ──
            // Bu dal eskiden HİÇ YOKTU: tarama "string değilse geç" diyordu.
            // Bu yüzden Dictionary<int,string> Answers alanının değer uzunluğu
            // sınırsız kalmıştı ve kapı bunu göremiyordu.
            if (MetinOgesiTipi(p.PropertyType) is null) continue;

            var sayiSiniri = p.GetCustomAttribute<MaxLengthAttribute>() is not null;
            var ogeSiniri = p.GetCustomAttribute<OgeUzunluguAttribute>() is not null
                            || p.GetCustomAttribute<OgeIzinliDegerAttribute>() is not null;

            if (!sayiSiniri)
                eksikler.Add($"{ad}  (koleksiyon — eleman SAYISI sınırı [MaxLength] yok)");
            if (!ogeSiniri)
                eksikler.Add($"{ad}  (koleksiyon — eleman İÇERİĞİ sınırı [OgeUzunlugu]/[OgeIzinliDeger] yok)");
        }

        eksikler.Should().BeEmpty(
            "bu DTO alanları sınırsız:\n" + string.Join("\n", eksikler));
    }

    /// <summary>
    /// Whitelist'e bağlı alanlarda kümenin EN UZUN değeri de kolona sığmalı.
    /// Aksi hâlde "geçerli" bir seçim bile 500 üretir.
    /// </summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void Whitelist_degerleri_kolona_sigmali()
    {
        var ihlaller = new List<string>();

        void Denetle(Type dto, string alan, Type entity, string entityAlan)
        {
            var oz = dto.GetProperty(alan)!;
            var wl = oz.GetCustomAttribute<IzinliDegerAttribute>();
            wl.Should().NotBeNull($"{dto.Name}.{alan} whitelist taşımalı");

            var kolonSinir = Sinir(entity, entityAlan)!.Value;
            foreach (var deger in wl!.Kume)
                if (deger.Length > kolonSinir)
                    ihlaller.Add($"{dto.Name}.{alan} → '{deger}' ({deger.Length}) > {entity.Name}.{entityAlan}={kolonSinir}");
        }

        Denetle(typeof(AdminController.BookUpdateRequest), "Level",    typeof(Book), "Level");
        Denetle(typeof(AdminController.BookUpdateRequest), "Category", typeof(Book), "Category");
        Denetle(typeof(AdminController.BookUploadRequest), "Level",    typeof(Book), "Level");
        Denetle(typeof(AdminController.BookUploadRequest), "Category", typeof(Book), "Category");
        Denetle(typeof(ActivityController.LogActivityRequest), "ActivityType",
                typeof(UserActivityLog), "ActivityType");

        ihlaller.Should().BeEmpty(string.Join("\n", ihlaller));
    }

    /// <summary>
    /// [IzinliDeger] küme adları yansımayla çözülüyor: yanlış yazılmış bir ad
    /// çalışma zamanına kadar sessiz kalırdı. Burada hepsi zorla çözülür.
    /// </summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void Tum_IzinliDeger_kullanimlari_gercek_bir_kumeye_baglanmali()
    {
        var montaj = typeof(AuthController).Assembly;
        var kullanimlar = montaj.GetTypes()
            .SelectMany(t => t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            .Select(p => (Ozellik: p, Oznitelik: p.GetCustomAttribute<IzinliDegerAttribute>()))
            .Where(x => x.Oznitelik is not null)
            .ToList();

        kullanimlar.Should().NotBeEmpty("hiç whitelist kullanılmıyorsa kural uygulanmamış demektir");

        foreach (var (ozellik, oznitelik) in kullanimlar)
        {
            var kume = () => oznitelik!.Kume;
            kume.Should().NotThrow(
                $"{ozellik.DeclaringType!.Name}.{ozellik.Name} → IzinliDegerler.{oznitelik!.KumeAdi} çözülemedi");
            oznitelik!.Kume.Should().NotBeEmpty();
        }
    }

    /// <summary>
    /// Her iki istemci de taksonomiyi GET /api/books/taxonomy'den alır; ama uç
    /// erişilemezse kendi YEDEK_TAKSONOMI sabitine düşer. O yedek backend
    /// whitelist'inden ayrışırsa, tam da ağ sorunu yaşandığı anda filtreler
    /// yanlış çalışır ve kitaplar sessizce kaybolur.
    ///
    /// Test, dosyaları OKUYARAK karşılaştırır — listenin üçüncü bir kopyasını
    /// testin içine yazmak, çözmeye çalıştığı sorunun ta kendisi olurdu.
    /// </summary>
    [Theory]
    [InlineData("frontend/app/books/page.tsx")]
    [InlineData("admin-panel/app/books/page.tsx")]
    [Trait("Category", "GirdiDogrulama")]
    public void Istemci_yedek_taksonomisi_backend_ile_ayni_olmali(string goreliYol)
    {
        var yol = ProjeKokunda(goreliYol);
        if (yol is null) return;   // istemci bu ortamda yoksa atlanır

        var icerik = File.ReadAllText(yol);

        // Panel ham URL ("/api/books/taxonomy"), frontend api.ts sarmalayıcısı
        // ("api.getTaxonomy()") kullanıyor — ikisi de geçerli, büyük/küçük harf farkı önemsiz.
        //
        // YORUM SATIRLARI ATILIR: yorum içinde geçen "taxonomy" ibaresi çalışan
        // bir çağrı değildir. Bu filtre olmadan, çağrıyı yorum satırına almak
        // testi de kapıyı da kandırıyordu.
        var kod = string.Join("\n", icerik.Split('\n')
            .Where(s => !s.TrimStart().StartsWith("//") && !s.TrimStart().StartsWith("*")));

        kod.Should().ContainEquivalentOf("taxonomy",
            $"{goreliYol} taksonomiyi backend'den çekmeli, kopya tutmamalı");

        var blok = icerik[icerik.IndexOf("YEDEK_TAKSONOMI", StringComparison.Ordinal)..];
        blok = blok[..blok.IndexOf("};", StringComparison.Ordinal)];

        string[] Dizi(string ad)
        {
            var parca = blok[blok.IndexOf(ad + ":", StringComparison.Ordinal)..];
            parca = parca[..parca.IndexOf("]", StringComparison.Ordinal)];
            return System.Text.RegularExpressions.Regex.Matches(parca, @"['""]([^'""]+)['""]")
                .Select(m => m.Groups[1].Value).ToArray();
        }

        Dizi("levels").Should().BeEquivalentTo(IzinliDegerler.Seviyeler);
        Dizi("categories").Should().BeEquivalentTo(IzinliDegerler.Kategoriler);
        Dizi("languages").Should().BeEquivalentTo(IzinliDegerler.Diller);
    }

    /// <summary>
    /// Verilen tip metin öğesi taşıyan bir koleksiyon mu?
    /// Sözlükte DEĞER tipi, dizide/listede ELEMAN tipi bakılır.
    /// string'in kendisi IEnumerable&lt;char&gt;'dır — bilerek dışlanır.
    /// </summary>
    private static Type? MetinOgesiTipi(Type tip)
    {
        if (tip == typeof(string)) return null;

        var arayuzler = tip.GetInterfaces().Append(tip);

        var sozluk = arayuzler.FirstOrDefault(i =>
            i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IDictionary<,>));
        if (sozluk is not null)
            return sozluk.GetGenericArguments()[1] == typeof(string) ? typeof(string) : null;

        var dizi = arayuzler.FirstOrDefault(i =>
            i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IEnumerable<>));
        if (dizi is not null)
            return dizi.GetGenericArguments()[0] == typeof(string) ? typeof(string) : null;

        return null;
    }

    private static string? ProjeKokunda(string goreliYol)
    {
        var dizin = AppContext.BaseDirectory;
        for (var i = 0; i < 8 && dizin is not null; i++)
        {
            var aday = Path.Combine(dizin, goreliYol);
            if (File.Exists(aday)) return aday;
            dizin = Directory.GetParent(dizin)?.FullName;
        }
        return null;
    }
}
