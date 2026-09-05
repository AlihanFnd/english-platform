namespace EnglishReadingPlatform.Data;

/// <summary>KURAL-19: kişisel verinin hassasiyet sınıfı.</summary>
public enum VeriSinifi
{
    /// <summary>Doğrudan kimlik — e-posta, kullanıcı adı.</summary>
    Kimlik,

    /// <summary>
    /// Kimlik doğrulama sırrı — hash, jeton. Dışa AKTARILMAZ:
    /// dışa aktarma dosyası kullanıcının indirdiği, e-postayla gönderdiği,
    /// bulut sürücüsünde bıraktığı bir dosyadır. Oraya konan bir sır,
    /// veritabanındakinden çok daha kolay ele geçer.
    /// </summary>
    Sir,

    /// <summary>Davranış — ne okudu, ne zaman, hangi kelimeyi bilmiyor.</summary>
    Davranis,

    /// <summary>
    /// İçeriğini SİSTEMİN BİLMEDİĞİ kullanıcı girdisi — OCR metni, geri bildirim.
    /// Ders notu da olabilir, kimlik fotokopisi de. Bu belirsizlik yüzünden
    /// süresiz saklamak savunulamaz.
    /// </summary>
    BelirsizIcerik,
}

/// <summary>Envanterdeki tek bir kişisel veri kalemi.</summary>
/// <param name="Tablo">Veritabanı tablosu.</param>
/// <param name="Alan">Kolon adı; tablonun tamamı için "*".</param>
/// <param name="Sinif">Hassasiyet sınıfı.</param>
/// <param name="Sebep">Bu veri NEDEN tutuluyor — amaç sınırlaması.</param>
/// <param name="SaklamaGunu">Otomatik silme süresi; null = hesap silinene kadar.</param>
/// <param name="DisaAktarilir">Kullanıcının indirdiği dosyaya girer mi?</param>
public record KisiselVeriKalemi(
    string Tablo,
    string Alan,
    VeriSinifi Sinif,
    string Sebep,
    int? SaklamaGunu,
    bool DisaAktarilir);

/// <summary>
/// KURAL-19: Sistemde tutulan her kişisel veri kalemi — TEK kaynak.
///
/// Neden kodda, dokümanda değil: dokümanda tutulan envanter ilk şema
/// değişikliğinde eskir ve kimse fark etmez. Burada tutulunca bir KAPI,
/// envantere yazılmamış yeni bir alanı yakalayabilir — ve dışa aktarma
/// da envanterden üretildiği için yeni alan kendiliğinden kapsanır.
/// </summary>
public static class KisiselVeriEnvanteri
{
    public static readonly KisiselVeriKalemi[] Kalemler =
    {
        new("Users", "Email", VeriSinifi.Kimlik,
            "Giriş kimliği ve hesap kurtarma.", null, DisaAktarilir: true),
        new("Users", "Username", VeriSinifi.Kimlik,
            "Grup içinde görünen ad.", null, DisaAktarilir: true),
        new("Users", "PasswordHash", VeriSinifi.Sir,
            "Kimlik doğrulama.", null, DisaAktarilir: false),
        new("Users", "Role", VeriSinifi.Kimlik,
            "Yetki seviyesi (student/teacher/admin).", null, DisaAktarilir: true),
        new("Users", "CreatedAt", VeriSinifi.Davranis,
            "Hesap yaşı — kötüye kullanım incelemesi.", null, DisaAktarilir: true),

        new("OcrRecords", "ExtractedText", VeriSinifi.BelirsizIcerik,
            "Kullanıcının taradığı metni tekrar okuyabilmesi.",
            SaklamaGunu: 365, DisaAktarilir: true),
        new("OcrRecords", "ScannedAt", VeriSinifi.Davranis,
            "Ne zaman tarandı — saklama süresi bu alandan ölçülür.",
            SaklamaGunu: 365, DisaAktarilir: true),
        // ÖLÜ KOLON: hiçbir yerde YAZILMIYOR (OCR istemci tarafında çalışıyor,
        // yalnızca metin saklanıyor). Envanterde tutuluyor ki bir gün
        // doldurulmaya başlanırsa sınıfı ve ömrü zaten kararlaştırılmış olsun —
        // ve o gün dosya silmenin de hesap silmeye eklenmesi gerektiği görülsün.
        new("OcrRecords", "ImagePath", VeriSinifi.BelirsizIcerik,
            "KULLANILMIYOR — sunucuda görüntü saklanmıyor.",
            SaklamaGunu: 365, DisaAktarilir: false),

        new("UserActivityLogs", "Details", VeriSinifi.Davranis,
            "Analitik VE Groq günlük kota sayacı (KURAL-12 uyarısı: " +
            "bu süre kısaltılırsa kota koruması çöker).", 90, DisaAktarilir: true),
        new("UserActivityLogs", "ActivityType/DurationSeconds/Timestamp", VeriSinifi.Davranis,
            "Hangi gün hangi saatte ne yaptığı — davranış arşivi.", 90, DisaAktarilir: true),

        new("ReadingProgresses", "*", VeriSinifi.Davranis,
            "Kaldığı yerden devam.", null, DisaAktarilir: true),
        new("WordListItems", "Word/Context/Translation/AddedAt", VeriSinifi.Davranis,
            "Kişisel kelime listesi — hangi kelimeleri bilmediği.", null, DisaAktarilir: true),
        new("WordListItems", "DogruSayisi/YanlisSayisi/DogruSeri/SonCalismaAt", VeriSinifi.Davranis,
            "Kelime çalışma istatistikleri — öğrenme profili.", null, DisaAktarilir: true),
        new("QuizResults", "*", VeriSinifi.Davranis,
            "İlerleme takibi ve grup raporu.", null, DisaAktarilir: true),
        new("Feedbacks", "Message/CreatedAt", VeriSinifi.BelirsizIcerik,
            "Ürün geri bildirimi.", null, DisaAktarilir: true),

        new("SifreSifirlamaJetonlari", "JetonHash", VeriSinifi.Sir,
            "Hesap kurtarma.", 7, DisaAktarilir: false),
        new("SifreSifirlamaJetonlari", "CreatedAt/GecerlilikSonu/KullanildiAt", VeriSinifi.Sir,
            "Jetonun ömrü ve tüketilip tüketilmediği — kurtarma akışının " +
            "denetim izi. Sır sınıfında: bir jetonun NE ZAMAN istendiği de " +
            "hesabın varlığını doğrular.", 7, DisaAktarilir: false),
    };

    /// <summary>
    /// Dışa aktarmaya giren kalemler — sırlar HER KOŞULDA hariç.
    ///
    /// İki koşul (DisaAktarilir VE sınıf != Sir) bilerek birlikte: bir kalemin
    /// bayrağı yanlışlıkla true yapılsa bile sınıf kontrolü onu tutar.
    /// </summary>
    public static IEnumerable<KisiselVeriKalemi> DisaAktarilanlar()
        => Kalemler.Where(k => k.DisaAktarilir && k.Sinif != VeriSinifi.Sir);

    /// <summary>Bu tablo-alan çifti envanterde kayıtlı mı?</summary>
    public static bool Kayitli(string tablo, string alan)
        => Kalemler.Any(k => k.Tablo == tablo
                          && (k.Alan == alan || k.Alan == "*" || k.Alan.Split('/').Contains(alan)));
}
