namespace EnglishReadingPlatform.Contracts;

/// <summary>
/// KURAL-08 — Veri minimizasyonu: yanıt yalnızca gerekeni taşır.
///
/// Buradaki tipler istemciye dönen TÜM yanıt biçimlerinin tek kaynağıdır.
/// Entity nesneleri (User, Book, Group, WordListItem, OcrRecord…) istemciye
/// ASLA doğrudan serileştirilmez.
///
/// NEDEN: Entity döndürmek "bugün güvenli" olabilir — örneğin WordListItem.User
/// navigasyonu Include edilmediği için null gelir ve PasswordHash sızmaz. Ama bu
/// güvenlik bir tesadüftür: biri performans için `.Include(w => w.User)` eklediği
/// gün şifre hash'i sessizce yanıta girer. DTO kullanıldığında bu imkânsızdır.
///
/// KURAL: Bu DTO'lar entity'den TÜRETİLMEZ (miras almaz). Bağımsız record'lardır.
/// Yeni alan eklemek bilinçli bir karardır; YanitSozlesmesiTests hassas alan
/// adlarını (PasswordHash, ImagePath, SentencesJson) burada yasaklar.
/// </summary>
// ─── Kullanıcı ────────────────────────────────────────────────

/// <summary>Kullanıcının KENDİSİ hakkındaki bilgi. PasswordHash BULUNMAZ.</summary>
public record KullaniciYaniti(int Id, string Username, string Email, string Role);

/// <summary>
/// BAŞKASINA gösterilen kullanıcı (grup üyesi listesi).
/// E-posta BULUNMAZ: bir sınıf arkadaşının adresini bilmek okuma takibi için gerekmez.
/// </summary>
public record UyeYaniti(int UserId, string Username, string Role);

// ─── Kelime ───────────────────────────────────────────────────
public record KelimeYaniti(int Id, string Word, string Translation, string Context, DateTime AddedAt);

// ─── OCR ──────────────────────────────────────────────────────
/// <summary>
/// OCR kaydı. ImagePath BULUNMAZ — sunucudaki dosya yolunu sızdırmanın
/// istemciye hiçbir faydası yok, saldırgana dizin yapısını verir.
/// </summary>
public record OcrYaniti(int Id, string ExtractedText, DateTime ScannedAt);

// ─── Grup ─────────────────────────────────────────────────────
public record AtananKitapYaniti(int BookId, string Title);

/// <summary>
/// Grup özeti.
/// <para><see cref="InviteCode"/> YALNIZCA grup sahibine doldurulur; diğerlerine
/// <c>null</c> döner. Sıradan bir üyenin davet kodunu görmesi, grubu sahibinin
/// bilgisi dışında büyütebilmesi demektir.</para>
/// <para><see cref="SahipMiyim"/>: isteği yapan kullanıcı bu grubun sahibi mi?
/// Eskiden istemci bunu <c>group.adminUserId === user.id</c> ile hesaplıyordu;
/// yani BAŞKA bir kullanıcının kimliği yanıta konuyordu. Türetilmiş bir bayrak
/// aynı işi daha az veriyle yapar.</para>
/// </summary>
public record GrupOzetYaniti(
    int Id,
    string Name,
    string Description,
    string? InviteCode,
    bool SahipMiyim,
    int MembersCount,
    IReadOnlyList<AtananKitapYaniti> Assignments);

public record GrupIlerlemeYaniti(
    int UserId, string Username, string BookTitle,
    float ProgressPercent, int CurrentChapter, DateTime LastRead);

public record GrupQuizYaniti(
    string Username, string BookTitle, string QuizTitle,
    int Score, int TotalQuestions, DateTime TakenAt);

/// <summary>
/// Grup detayı.
/// <para><see cref="AllBooks"/> KASTEN kapsam dışıdır: grup sahibinin kitap
/// atayabilmesi için tüm katalogu görmesi gerekir ve kitap başlıkları zaten
/// /api/books ile herkese açıktır. Yalnızca sahibe doldurulur — üyenin bu listeye
/// grup bağlamında ihtiyacı yoktur.</para>
/// <para><see cref="Progresses"/> ve <see cref="QuizResults"/> ise kapsamlıdır:
/// yalnızca gruba ATANMIŞ kitaplara ait kayıtlar görünür.</para>
/// </summary>
public record GrupDetayYaniti(
    GrupOzetYaniti Group,
    IReadOnlyList<UyeYaniti> Members,
    IReadOnlyList<AtananKitapYaniti> AllBooks,
    IReadOnlyList<GrupIlerlemeYaniti> Progresses,
    IReadOnlyList<GrupQuizYaniti> QuizResults);

// ─── Kitap ────────────────────────────────────────────────────
/// <summary>
/// Kitaplık görünümü.
/// <para><see cref="PagesCount"/> YENİ alandır: sayfa modundaki kitapların
/// Chapters koleksiyonu boştur, bu yüzden arayüz onları "1 Bölüm" diye
/// gösteriyordu. İstemci artık hangi modda olduğunu görebiliyor.</para>
/// </summary>
public record KitapYaniti(
    int Id, string Title, string Author, string CoverColor, string Description,
    string Level, string Category, int ChaptersCount, int PagesCount,
    float Progress, int CurrentChapter);
