using Microsoft.EntityFrameworkCore;
using EnglishReadingPlatform.Models;

namespace EnglishReadingPlatform.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<User> Users => Set<User>();
        public DbSet<Book> Books => Set<Book>();
        public DbSet<Chapter> Chapters => Set<Chapter>();
        public DbSet<ReadingProgress> ReadingProgresses => Set<ReadingProgress>();
        public DbSet<WordListItem> WordListItems => Set<WordListItem>();
        public DbSet<Quiz> Quizzes => Set<Quiz>();
        public DbSet<QuizQuestion> QuizQuestions => Set<QuizQuestion>();
        public DbSet<QuizResult> QuizResults => Set<QuizResult>();
        public DbSet<Group> Groups => Set<Group>();
        public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
        public DbSet<GroupBookAssignment> GroupBookAssignments => Set<GroupBookAssignment>();
        public DbSet<OcrRecord> OcrRecords => Set<OcrRecord>();
        public DbSet<BookPage> BookPages => Set<BookPage>();
        public DbSet<UserActivityLog> UserActivityLogs => Set<UserActivityLog>();
        public DbSet<Feedback> Feedbacks => Set<Feedback>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Unique constraints
            modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
            modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();
            modelBuilder.Entity<Group>().HasIndex(g => g.InviteCode).IsUnique();

            // Seed: Varsayılan Admin Kullanıcısı
            // Şifre: Admin@2026!  (BCrypt hash)
            modelBuilder.Entity<User>().HasData(
                new User
                {
                    Id = 1,
                    Username = "admin",
                    Email = "admin@platform.com",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin@2026!"),
                    Role = "admin",
                    CreatedAt = new DateTime(2026, 7, 7, 0, 0, 0, DateTimeKind.Utc)
                }
            );


            modelBuilder.Entity<Book>().HasData(
                new Book { Id = 1, Title = "The Adventures of Tom Sawyer", Author = "Mark Twain", Description = "A classic American novel about childhood adventures.", CoverColor = "#6366f1", Language = "en", CreatedAt = DateTime.UtcNow },
                new Book { Id = 2, Title = "Alice in Wonderland", Author = "Lewis Carroll", Description = "A young girl falls into a fantasy world full of peculiar creatures.", CoverColor = "#ec4899", Language = "en", CreatedAt = DateTime.UtcNow },
                new Book { Id = 3, Title = "The Old Man and the Sea", Author = "Ernest Hemingway", Description = "An aging Cuban fisherman struggles with a giant marlin.", CoverColor = "#0ea5e9", Language = "en", CreatedAt = DateTime.UtcNow }
            );

            modelBuilder.Entity<Chapter>().HasData(
                new Chapter { Id = 1, BookId = 1, ChapterNumber = 1, Title = "Chapter 1 — Tom Plays, Fights, and Hides", Content = "Tom was a boy full of mischief and adventure. He lived with his Aunt Polly in the small town of St. Petersburg, Missouri. Every day was a new opportunity for him to get into trouble and have fun at the same time. He was clever, imaginative, and endlessly curious about the world around him. Aunt Polly loved him dearly, though she often despaired of his wild ways. She tried her best to keep him on the straight and narrow path, but Tom always found a way to slip away and follow his own adventures. The fence that surrounded their yard had become Tom's first great challenge of the summer. Aunt Polly had sentenced him to whitewash it — all thirty yards of it — on a bright Saturday morning when every fiber of his being longed to be free and playing with his friends. But Tom, ever resourceful, turned the chore into an opportunity, convincing his friends that painting the fence was a rare privilege, not a punishment, and soon they were eagerly trading their treasures for a chance to whitewash." },
                new Chapter { Id = 2, BookId = 1, ChapterNumber = 2, Title = "Chapter 2 — The Glorious Whitewasher", Content = "Saturday morning was come, and all the summer world was bright and fresh, and brimming with life. There was a song in every heart; and if the heart was young the music issued at the lips. There was cheer in every face and a spring in every step. The locust-trees were in bloom and the fragrance of the blossoms filled the air. Cardiff Hill, beyond the village and above it, was green with vegetation and it lay just far enough away to seem a Delectable Land, dreamy, reposeful, and inviting. Tom appeared on the sidewalk with a bucket of whitewash and a long-handled brush. He surveyed the fence, and all gladness left him and a deep melancholy settled down upon his spirit. Thirty yards of board fence nine feet high. Life to him seemed hollow, and existence but a burden. Tom began to think of the fun he had planned for this day, and his sorrows multiplied. Soon the free boys would come tripping along on all sorts of delicious expeditions, and they would make a world of fun of him for having to work." },
                new Chapter { Id = 3, BookId = 2, ChapterNumber = 1, Title = "Down the Rabbit Hole", Content = "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, and what is the use of a book, thought Alice, without pictures or conversations? So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her. There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, Oh dear! Oh dear! I shall be too late! (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge." },
                new Chapter { Id = 4, BookId = 3, ChapterNumber = 1, Title = "The Old Man", Content = "He was an old man who fished alone in a skiff in the Gulf Stream and he had gone eighty-four days now without taking a fish. In the first forty days a boy had been with him. But after forty days without a fish the boy's parents had told him that the old man was now definitely and finally salao, which is the worst form of unlucky, and the boy had gone at their orders in another boat which caught three good fish the first week. It made the boy sad to see the old man come in each day with his skiff empty and he always went down to help him carry either the coiled lines or the gaff and harpoon and the sail that was furled around the mast. The sail was patched with flour sacks and, furled, it looked like the flag of permanent defeat. The old man was thin and gaunt with deep wrinkles in the back of his neck. The brown blotches of the benevolent skin cancer the sun brings from its reflection on the tropic sea were on his cheeks. The blotches ran well down the sides of his face and his hands had the deep-creased scars from handling heavy fish on the cords." }
            );
        }
    }
}
