namespace EnglishReadingPlatform.Validation;

/// <summary>
/// KURAL-05: Alan uzunluk sınırlarının TEK kaynağı.
/// Hem entity [MaxLength] hem DTO [StringLength] bu sabitleri kullanır.
/// AlanSinirlariTests, entity ile DTO'nun ayrışmadığını yansımayla doğrular.
///
/// DEĞER DEĞİŞTİRİRKEN: entity tarafındaki bir sabiti büyütmek/küçültmek ŞEMA
/// değiştirir → migration gerekir. DTO tarafındaki sınır ise kolon sınırından
/// büyük olamaz; sözleşme testi bunu zorlar.
/// </summary>
public static class AlanSinirlari
{
    // ── Kullanıcı ────────────────────────────────────────────
    public const int KullaniciAdi = 100;   // User.Username
    public const int Eposta       = 200;   // User.Email
    public const int SifreEnAz    = 10;    // KURAL-09 bunu sertleştirecek
    public const int SifreEnCok   = 128;   // BCrypt 72 bayt sonrasını yok sayar; DoS'a karşı üst sınır
    public const int SifirlamaJetonu = 128;   // KURAL-09: sıfırlama jetonu 64 hex; tavan bol tutuldu
    public const int JetonHash       = 64;    // KURAL-09: SHA-256 hex çıktısı tam 64 karakter

    // ── Kitap ────────────────────────────────────────────────
    public const int KitapBasligi  = 200;  // Book.Title
    public const int KitapYazari   = 200;  // Book.Author
    public const int KitapAciklama = 500;  // Book.Description
    public const int Seviye        = 50;   // Book.Level
    public const int Kategori      = 50;   // Book.Category
    public const int Dil           = 10;   // Book.Language ('text' kolon; DTO üst sınırı)
    public const int KapakRengi    = 7;    // "#rrggbb"
    public const int BolumBasligi  = 200;  // Chapter.Title

    // ── Kelime listesi ───────────────────────────────────────
    public const int Kelime     = 200;   // WordListItem.Word
    public const int Ceviri     = 500;   // WordListItem.Translation
    public const int Baglam     = 200;   // WordListItem.Context — KOLON sınırı
    public const int BaglamGirdi = 400;  // Bağlam GİRDİ sınırı: üstü reddedilir,
                                         // altı 'Baglam'a KIRPILARAK yazılır.
                                         // Okuyucuda uzun cümle seçmek normaldir;
                                         // kullanıcıya hata vermek özelliği kullanılamaz kılar.

    // ── Grup ─────────────────────────────────────────────────
    public const int GrupAdi      = 200;  // Group.Name
    public const int GrupAciklama = 500;  // Group.Description
    public const int DavetKodu    = 32;   // Group.InviteCode ('text' kolon; üretilen kod 8 karakter)

    // ── Aktivite / geri bildirim ─────────────────────────────
    public const int AktiviteTipi  = 50;    // UserActivityLog.ActivityType
    public const int AktiviteDetay = 200;   // UserActivityLog.Details
    public const int GeriBildirim  = 1000;  // Feedback.Message

    // ── Serbest metin üst sınırları ──────────────────────────
    // Kolon 'text' olsa da kaynak tüketimi (LLM maliyeti, bellek) sınırlanır.
    public const int CeviriMetni  = 20_000;  // /translate/analyze ve /translate/sentence
    public const int CeviriBaglami = 2_000;  // /translate/word 'context' — önbellek anahtarı

    /// <summary>
    /// /translate/word 'text' sınırı.
    ///
    /// DİKKAT — KURAL-05 dosyasındaki 300 değerinden BİLİNÇLİ OLARAK sapıldı:
    /// bu değer TranslationCache.QueryText kolonuna (varchar(255)) yazılıyor.
    /// 300 kabul etmek, kuralın kendi metnini ("DTO sınırı kolon sınırından büyük
    /// olamaz") ihlal ederdi. TranslationService yazma hatasını yutuyor, yani
    /// taşma 500 değil SESSİZ BAŞARISIZLIK üretirdi — daha da kötüsü.
    /// </summary>
    public const int CeviriKelime = 200;
    public const int OnbellekSorgusu = 255;  // TranslationCache.QueryText
    public const int OnbellekTipi    = 50;   // TranslationCache.WordType

    public const int OcrMetni = 50_000;   // OcrRecord.ExtractedText ('text' kolon)

    // ── Sayısal sınırlar ─────────────────────────────────────
    public const int QuizCevapSayisi   = 100;    // tek quiz'de makul üst sınır
    public const int AktiviteSuresiEnCok = 3600; // saniye — 1 saatlik tek kayıt
    // DİKKAT: bu iki sayı DosyaDogrulayici.EnCokSayfa ile BİRLİKTE hareket eder.
    // Sayfa sınırı büyütülüp bunlar unutulursa seçim sessizce kırpılır:
    // 1500 sayfa seçilir, 500'ü işlenir, kullanıcıya hiçbir uyarı gitmez.
    public const int SayfaSecimiMetni  = 8_000;  // "1,2,3-10" biçimli seçim dizesi
    public const int SayfaSecimiParcaSayisi = 1_500;  // virgülle ayrılmış azami parça
}

/// <summary>
/// KURAL-05: İzinli değer kümeleri (whitelist, blocklist DEĞİL).
///
/// <see cref="IzinliDegerAttribute"/> bu sınıftaki kümelere ADIYLA bağlanır
/// (<c>[IzinliDeger(nameof(IzinliDegerler.Seviyeler))]</c>). Öznitelikte dizi
/// kopyalamak yasak: whitelist'in iki yerde tutulması, backend ile frontend
/// taksonomisinin sessizce ayrışmasının kaynağıdır.
/// </summary>
public static class IzinliDegerler
{
    /// <summary>Sistemdeki tüm roller — yönetici ataması için.</summary>
    public static readonly string[] Roller = { "student", "teacher", "admin" };

    /// <summary>Kayıt sırasında SEÇİLEBİLEN roller. "admin" bilerek YOK.</summary>
    public static readonly string[] KayitRolleri = { "student", "teacher" };

    /// <summary>
    /// CEFR seviyeleri. frontend/app/books/page.tsx LEVELS listesiyle
    /// ('all' hariç) ve admin-panel seçenekleriyle BİREBİR aynı olmalıdır.
    /// </summary>
    public static readonly string[] Seviyeler =
    {
        "A1", "A1-A2", "A2", "A2-B1", "B1", "B1-B2",
        "B2", "B2-C1", "C1", "C1-C2", "C2"
    };

    public static readonly string[] Kategoriler = { "story", "article", "other" };

    /// <summary>
    /// Platform yalnızca İngilizce okuma + Türkçe çeviri yapıyor.
    /// Buraya dil eklemek, TranslationService'in o dili desteklemesini gerektirir.
    /// </summary>
    public static readonly string[] Diller = { "en" };

    /// <summary>
    /// frontend/app/hooks/useActivityTracker.ts yalnızca ilk dördünü gönderir;
    /// "ai_word_translation" TranslateController tarafından yazılır.
    /// </summary>
    public static readonly string[] AktiviteTipleri =
    {
        "PageView", "ReadBook", "TakeQuiz", "AuthView", "ai_word_translation"
    };

    public static readonly string[] QuizSiklari = { "A", "B", "C", "D" };
}
