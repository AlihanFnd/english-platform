using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EnglishReadingPlatform.Models
{
    // ─── Kullanıcı ────────────────────────────────────────────
    public class User
    {
        [Key] public int Id { get; set; }
        [Required, MaxLength(100)] public string Username { get; set; } = "";
        [Required, MaxLength(200)] public string Email { get; set; } = "";
        [Required] public string PasswordHash { get; set; } = "";
        public string Role { get; set; } = "student"; // "student" | "teacher" | "admin"
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<ReadingProgress> ReadingProgresses { get; set; } = new List<ReadingProgress>();
        public ICollection<WordListItem> WordListItems { get; set; } = new List<WordListItem>();
        public ICollection<GroupMember> GroupMemberships { get; set; } = new List<GroupMember>();
        public ICollection<QuizResult> QuizResults { get; set; } = new List<QuizResult>();
    }

    // ─── Kitap ────────────────────────────────────────────────
    public class Book
    {
        [Key] public int Id { get; set; }
        [Required, MaxLength(200)] public string Title { get; set; } = "";
        [MaxLength(200)] public string Author { get; set; } = "";
        [MaxLength(500)] public string Description { get; set; } = "";
        public string CoverColor { get; set; } = "#6366f1"; // fallback renk
        public string Language { get; set; } = "en";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<Chapter> Chapters { get; set; } = new List<Chapter>();
        public ICollection<BookPage> Pages { get; set; } = new List<BookPage>();
    }

    // ─── Bölüm ────────────────────────────────────────────────
    public class Chapter
    {
        [Key] public int Id { get; set; }
        public int BookId { get; set; }
        [ForeignKey("BookId")] public Book Book { get; set; } = null!;
        [Required, MaxLength(200)] public string Title { get; set; } = "";
        public int ChapterNumber { get; set; }
        [Required] public string Content { get; set; } = "";
    }

    // ─── Okuma İlerlemesi ─────────────────────────────────────
    public class ReadingProgress
    {
        [Key] public int Id { get; set; }
        public int UserId { get; set; }
        [ForeignKey("UserId")] public User User { get; set; } = null!;
        public int BookId { get; set; }
        [ForeignKey("BookId")] public Book Book { get; set; } = null!;
        public int CurrentChapter { get; set; } = 1;
        public float ProgressPercent { get; set; } = 0;
        public DateTime LastRead { get; set; } = DateTime.UtcNow;
    }

    // ─── Kelime Listesi ───────────────────────────────────────
    public class WordListItem
    {
        [Key] public int Id { get; set; }
        public int UserId { get; set; }
        [ForeignKey("UserId")] public User User { get; set; } = null!;
        [Required, MaxLength(200)] public string Word { get; set; } = "";
        [MaxLength(500)] public string Translation { get; set; } = "";
        [MaxLength(200)] public string Context { get; set; } = ""; // cümledeki bağlamı
        public DateTime AddedAt { get; set; } = DateTime.UtcNow;
    }

    // ─── Quiz ─────────────────────────────────────────────────
    public class Quiz
    {
        [Key] public int Id { get; set; }
        public int BookId { get; set; }
        [ForeignKey("BookId")] public Book Book { get; set; } = null!;
        public int ChapterId { get; set; }
        [ForeignKey("ChapterId")] public Chapter Chapter { get; set; } = null!;
        [Required] public string Title { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<QuizQuestion> Questions { get; set; } = new List<QuizQuestion>();
    }

    public class QuizQuestion
    {
        [Key] public int Id { get; set; }
        public int QuizId { get; set; }
        [ForeignKey("QuizId")] public Quiz Quiz { get; set; } = null!;
        [Required] public string QuestionText { get; set; } = "";
        [Required] public string OptionA { get; set; } = "";
        [Required] public string OptionB { get; set; } = "";
        [Required] public string OptionC { get; set; } = "";
        [Required] public string OptionD { get; set; } = "";
        public string CorrectAnswer { get; set; } = "A"; // A, B, C, D
    }

    public class QuizResult
    {
        [Key] public int Id { get; set; }
        public int UserId { get; set; }
        [ForeignKey("UserId")] public User User { get; set; } = null!;
        public int QuizId { get; set; }
        [ForeignKey("QuizId")] public Quiz Quiz { get; set; } = null!;
        public int Score { get; set; }
        public int TotalQuestions { get; set; }
        public DateTime TakenAt { get; set; } = DateTime.UtcNow;
    }

    // ─── Grup ─────────────────────────────────────────────────
    public class Group
    {
        [Key] public int Id { get; set; }
        [Required, MaxLength(200)] public string Name { get; set; } = "";
        [MaxLength(500)] public string Description { get; set; } = "";
        public int AdminUserId { get; set; }
        [ForeignKey("AdminUserId")] public User Admin { get; set; } = null!;
        public string InviteCode { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<GroupMember> Members { get; set; } = new List<GroupMember>();
        public ICollection<GroupBookAssignment> BookAssignments { get; set; } = new List<GroupBookAssignment>();
    }

    public class GroupMember
    {
        [Key] public int Id { get; set; }
        public int GroupId { get; set; }
        [ForeignKey("GroupId")] public Group Group { get; set; } = null!;
        public int UserId { get; set; }
        [ForeignKey("UserId")] public User User { get; set; } = null!;
        public string Role { get; set; } = "member"; // "admin" | "member"
        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    }

    public class GroupBookAssignment
    {
        [Key] public int Id { get; set; }
        public int GroupId { get; set; }
        [ForeignKey("GroupId")] public Group Group { get; set; } = null!;
        public int BookId { get; set; }
        [ForeignKey("BookId")] public Book Book { get; set; } = null!;
        public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
    }

    // ─── OCR Kayıtları ────────────────────────────────────────
    public class OcrRecord
    {
        [Key] public int Id { get; set; }
        public int UserId { get; set; }
        [ForeignKey("UserId")] public User User { get; set; } = null!;
        [Required] public string ExtractedText { get; set; } = "";
        public string ImagePath { get; set; } = "";
        public DateTime ScannedAt { get; set; } = DateTime.UtcNow;
    }

    // ─── Kitap Sayfası (Önceden Çevrilmiş) ──────────────────────
    public class BookPage
    {
        [Key] public int Id { get; set; }
        public int BookId { get; set; }
        [ForeignKey("BookId")] public Book Book { get; set; } = null!;
        public int PageNumber { get; set; }
        [Required] public string Content { get; set; } = "";
        
        // Cümle cümle ve kelime kelime analiz/çeviri JSON verisi
        [Required] public string SentencesJson { get; set; } = "[]";
    }
}
