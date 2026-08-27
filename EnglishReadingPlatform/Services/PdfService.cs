using UglyToad.PdfPig;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using System.Net.Http;
using System.Text;
using EnglishReadingPlatform.Exceptions;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Validation;

namespace EnglishReadingPlatform.Services
{
    public class GeminiChapterInfo
    {
        [JsonPropertyName("pageNumber")]
        public int PageNumber { get; set; }

        [JsonPropertyName("title")]
        public string Title { get; set; } = "";
    }

    public class GeminiChaptersResult
    {
        [JsonPropertyName("chapters")]
        public List<GeminiChapterInfo> Chapters { get; set; } = new();
    }

    public class PdfExtractResult
    {
        public string FullText { get; set; } = "";
        public List<PdfChapter> Chapters { get; set; } = new();
        public int PageCount { get; set; }
    }

    public class PdfChapter
    {
        public int Number { get; set; }
        public string Title { get; set; } = "";
        public string Content { get; set; } = "";
    }

    public class PdfService
    {
        private readonly IConfiguration _configuration;
        private readonly IHttpClientFactory _httpFactory;
        private readonly ILogger<PdfService> _logger;   // KURAL-06
        private readonly AgirIsKapisi _agirIsKapisi;   // KURAL-07
        private const long MaxFileSizeBytes = 50 * 1024 * 1024; // 50 MB
        private static readonly string[] AllowedExtensions = { ".pdf", ".docx" };

        public PdfService(IConfiguration configuration, IHttpClientFactory httpFactory,
                          ILogger<PdfService> logger, AgirIsKapisi agirIsKapisi)
        {
            _configuration = configuration;
            _httpFactory = httpFactory;
            _logger = logger;
            _agirIsKapisi = agirIsKapisi;
        }

        public string ExtractSinglePageText(IFormFile file, int pageNumber)
        {
            var ext = System.IO.Path.GetExtension(file.FileName).ToLower();
            if (ext == ".docx")
            {
                // Word belgelerinde sayfa kavramı değişken olduğundan tüm metni tek sayfa veya bölümler halinde alırız.
                return ExtractDocxText(file);
            }

            using var stream = file.OpenReadStream();
            using var document = PdfAc(stream);
            if (pageNumber < 1 || pageNumber > document.NumberOfPages) return "";
            var page = document.GetPage(pageNumber);
            
            return ExtractTextFromPage(page);
        }

        /// <summary>
        /// KURAL-06: bozuk/şifreli bir dosya SUNUCU arızası değil, KULLANICI hatasıdır.
        /// Sarmalanmazsa PdfPig'in ham istisnası merkezî middleware'e düşer: kullanıcı
        /// ne yapacağını söylemeyen "beklenmeyen bir hata" görür ve her bozuk yükleme
        /// üretimde bir LogError üretip gerçek arızaları gürültüye boğar.
        /// İstisna metni yine dışarı ÇIKMAZ; yerine elle yazılmış bir cümle konur.
        /// </summary>
        private static PdfDocument PdfAc(Stream stream)
        {
            try { return PdfDocument.Open(stream); }
            catch (Exception)
            {
                throw new KullaniciHatasi(
                    "PDF dosyası okunamadı. Dosya bozuk, şifreli veya desteklenmeyen bir biçimde olabilir.");
            }
        }

        /// <summary>KURAL-06: PdfAc ile aynı gerekçe, DOCX tarafı için.</summary>
        private static WordprocessingDocument DocxAc(Stream stream)
        {
            try { return WordprocessingDocument.Open(stream, false); }
            catch (Exception)
            {
                throw new KullaniciHatasi(
                    "DOCX dosyası okunamadı. Dosya bozuk veya desteklenmeyen bir biçimde olabilir.");
            }
        }

        private string ExtractTextFromPage(UglyToad.PdfPig.Content.Page page)
        {
            var rawText = page.Text;
            // Eğer normal metin okuma başarılıysa ve kelime boşlukları barındırıyorsa öncelikli kullan.
            // Bu sayede kelime birleşmelerini önler ve sayfa düzenini/paragrafları koruruz.
            if (!string.IsNullOrWhiteSpace(rawText) && rawText.Contains(" "))
            {
                return rawText;
            }

            // Aksi takdirde koordinat tabanlı kelimeleri birleştir
            var words = page.GetWords();
            if (words != null && words.Any())
            {
                return string.Join(" ", words.Select(w => w.Text));
            }

            return rawText ?? "";
        }

        private string ExtractDocxText(IFormFile file)
        {
            using var stream = file.OpenReadStream();
            using var wordDoc = DocxAc(stream);
            var body = wordDoc.MainDocumentPart?.Document.Body;
            if (body == null) return "";

            var paragraphs = body.Descendants<Paragraph>().Select(p => p.InnerText).Where(t => !string.IsNullOrWhiteSpace(t));
            return string.Join("\n\n", paragraphs);
        }

        /// <summary>
        /// PDF veya DOCX dosyasını doğrular, metnini çıkarır ve bölümlere böler.
        /// </summary>
        public Task<PdfExtractResult> ExtractAndSplitAsync(IFormFile file, string? pageSelection = null)
            // KURAL-07 İhlal 4: PDF ayrıştırma AĞIR iştir — 50 MB'lık bir dosya
            // ayrıştırılırken bellekte durur. 10 eşzamanlı yükleme dakikalık kotayı
            // hiç aşmadan sunucuyu düşürebilirdi. Kapı doluysa istek 503 alır.
            => _agirIsKapisi.CalistirAsync(() => AyristirVeBolAsync(file, pageSelection));

        private async Task<PdfExtractResult> AyristirVeBolAsync(IFormFile file, string? pageSelection)
        {
            var ext = System.IO.Path.GetExtension(file.FileName).ToLower();
            // KURAL-06: bu iki mesaj KASTEN kullanıcıya yöneliktir; içlerinde iç
            // detay yoktur. Tipli istisna, "gösterilebilir" ile "gösterilemez"
            // hataları ayırır — eskiden ikisi de ex.Message ile aynı yoldan dönüyordu.
            if (!AllowedExtensions.Contains(ext))
                throw new KullaniciHatasi("Sadece PDF veya DOCX dosyaları yüklenebilir.");

            if (file.Length > MaxFileSizeBytes)
                throw new KullaniciHatasi("Dosya boyutu 50 MB sınırını aşıyor.");

            var result = new PdfExtractResult();
            var pageTexts = new List<string>();

            if (ext == ".docx")
            {
                var fullText = ExtractDocxText(file);
                result.PageCount = 1;
                result.FullText = fullText;
                
                // Word belgesini satırlara/paragraflara göre sayfalara veya bölümlere bölme simülasyonu (her 500 kelime bir sayfa gibi)
                var words = fullText.Split(new[] { ' ', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
                const int wordsPerPage = 400;
                for (int i = 0; i < words.Length; i += wordsPerPage)
                {
                    var chunk = words.Skip(i).Take(wordsPerPage);
                    pageTexts.Add(string.Join(" ", chunk));
                }
                result.PageCount = pageTexts.Count;
            }
            else
            {
                using var stream = file.OpenReadStream();
                using var document = PdfAc(stream);
                result.PageCount = document.NumberOfPages;

                var sortedPages = SayfaSeciminiCoz(pageSelection, document.NumberOfPages);

                foreach (int pageNumber in sortedPages)
                {
                    var page = document.GetPage(pageNumber);
                    string text = ExtractTextFromPage(page);

                    if (!string.IsNullOrWhiteSpace(text))
                        pageTexts.Add(text.Trim());
                }
            }

            result.FullText = string.Join("\n\n", pageTexts);
            result.Chapters = await SplitIntoChaptersWithGroqAsync(pageTexts);

            return result;
        }

        private async Task<List<PdfChapter>> SplitIntoChaptersWithGroqAsync(List<string> pages)
        {
            var apiKey = _configuration["Groq:ApiKey"] 
                          ?? Environment.GetEnvironmentVariable("GROQ_API_KEY") 
                          ?? Environment.GetEnvironmentVariable("Groq__ApiKey");

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return SplitIntoChaptersRegex(pages);
            }

            var model = _configuration["Groq:Model"] ?? "llama-3.3-70b-versatile";
            if (string.IsNullOrWhiteSpace(model)) model = "llama-3.3-70b-versatile";

            try
            {
                // Her sayfanın başındaki ilk 3 satırı veya ilk 250 karakteri toplayıp Gemini'ye gönderelim.
                var pageHeaders = new List<string>();
                for (int i = 0; i < pages.Count; i++)
                {
                    var lines = pages[i].Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
                    var headerText = string.Join(" | ", lines.Take(3)).Trim();
                    if (headerText.Length > 250) headerText = headerText.Substring(0, 250) + "...";
                    pageHeaders.Add($"[Page {i + 1}] {headerText}");
                }

                var prompt = "You are a PDF book structure analyzer. Below is a list showing the starting text of each page in a book.\n" +
                             "Analyze this list and identify which page numbers correspond to the start of a new chapter or major section, and extract the title of that chapter.\n" +
                             "A new chapter usually starts with a title like 'CHAPTER X', 'Part Y', or a bold title on a line by itself. If the book starts on Page 1, usually Page 1 or 2 is the first chapter (Introduction or Chapter 1).\n\n" +
                             "Return a JSON object conforming exactly to this JSON schema:\n" +
                             "{\n" +
                             "  \"chapters\": [\n" +
                             "    {\n" +
                             "      \"pageNumber\": 1,\n" +
                             "      \"title\": \"(Chapter/Section Title)\"\n" +
                             "    }\n" +
                             "  ]\n" +
                             "}\n\n" +
                             "Here is the start text of each page:\n" +
                             string.Join("\n", pageHeaders);

                var payload = new
                {
                    model = model,
                    messages = new[]
                    {
                        new { role = "user", content = prompt }
                    },
                    response_format = new
                    {
                        type = "json_object"
                    }
                };

                var jsonPayload = JsonSerializer.Serialize(payload);
                // KURAL-07: adlandırılmış istemci (yanıt boyutu sınırlı) + 60 sn bütçe.
                // Eskiden 5 dakikaydı: aynı anda yüklenen N PDF, N bağlantıyı ve
                // N thread'i beş dakika boyunca tutuyordu.
                var client = _httpFactory.CreateClient(HizSinirlari.GroqIstemcisi);
                client.Timeout = HizSinirlari.GroqAgirButce;
                client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

                using var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
                var response = await client.PostAsync("https://api.groq.com/openai/v1/chat/completions", content);

                if (!response.IsSuccessStatusCode)
                {
                    var errContent = await response.Content.ReadAsStringAsync();
                    throw new Exception($"HTTP {response.StatusCode} from Groq: {errContent}");
                }

                var responseJson = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(responseJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("usage", out var usage))
                {
                    _logger.LogInformation(
                        "Groq token kullanımı. Islem={Islem} Girdi={Girdi} Cikti={Cikti} Toplam={Toplam}",
                        "PdfChapterSplit",
                        usage.GetProperty("prompt_tokens").ToString(),
                        usage.GetProperty("completion_tokens").ToString(),
                        usage.GetProperty("total_tokens").ToString());
                }
                var textResult = root.GetProperty("choices")[0]
                                     .GetProperty("message")
                                     .GetProperty("content")
                                     .GetString();

                if (string.IsNullOrWhiteSpace(textResult))
                    throw new Exception("Empty response from Groq");

                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var geminiResult = JsonSerializer.Deserialize<GeminiChaptersResult>(textResult, options);

                if (geminiResult != null && geminiResult.Chapters != null && geminiResult.Chapters.Any())
                {
                    var chapters = new List<PdfChapter>();
                    var sortedChapters = geminiResult.Chapters
                        .Where(c => c.PageNumber >= 1 && c.PageNumber <= pages.Count)
                        .OrderBy(c => c.PageNumber)
                        .ToList();

                    if (sortedChapters.Count > 0 && sortedChapters[0].PageNumber > 1)
                    {
                        sortedChapters.Insert(0, new GeminiChapterInfo
                        {
                            PageNumber = 1,
                            Title = "Introduction"
                        });
                    }

                    for (int i = 0; i < sortedChapters.Count; i++)
                    {
                        var current = sortedChapters[i];
                        int startPageIdx = current.PageNumber - 1;
                        int endPageIdx = (i < sortedChapters.Count - 1) ? sortedChapters[i + 1].PageNumber - 1 : pages.Count;

                        var chapterPages = pages.Skip(startPageIdx).Take(endPageIdx - startPageIdx);
                        chapters.Add(new PdfChapter
                        {
                            Number = i + 1,
                            Title = current.Title,
                            Content = string.Join("\n\n", chapterPages)
                        });
                    }

                    return chapters;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Bölüm ayırma başarısız, regex yedeğine düşülüyor.");
            }

            return SplitIntoChaptersRegex(pages);
        }

        private static List<PdfChapter> SplitIntoChaptersRegex(List<string> pages)
        {
            var chapters = new List<PdfChapter>();
            // Gelişmiş Başlık / Bölüm Desenleri
            var chapterPattern = new Regex(
                @"^(chapter|bölüm|part|section|bölüm\s+\d+|kısım)\s+(\d+|[ivxlcdm]+)[:\.\s]|^([0-9]+\.\s+[A-Z][a-zA-Z\s]{3,30})$",
                RegexOptions.IgnoreCase | RegexOptions.Multiline
            );

            var currentContent = new System.Text.StringBuilder();
            int chapterNum = 0;
            string currentTitle = "Introduction";

            foreach (var page in pages)
            {
                var match = chapterPattern.Match(page);
                if (match.Success && currentContent.Length > 100)
                {
                    chapters.Add(new PdfChapter
                    {
                        Number = ++chapterNum,
                        Title = currentTitle,
                        Content = currentContent.ToString().Trim()
                    });
                    currentContent.Clear();
                    // KURAL-05: PDF sayfasının ilk satırı sınırsız uzunlukta olabilir;
                    // Chapter.Title varchar(200). Kırpılmazsa yükleme 500 verir.
                    currentTitle = (page.Split('\n').FirstOrDefault(l => l.Length > 2)?.Trim()
                                   ?? $"Chapter {chapterNum + 1}").KirpEnCok(AlanSinirlari.BolumBasligi);
                }
                currentContent.AppendLine(page);
            }

            if (currentContent.Length > 0)
            {
                chapters.Add(new PdfChapter
                {
                    Number = ++chapterNum,
                    Title = currentTitle,
                    Content = currentContent.ToString().Trim()
                });
            }

            // Bölüm başlığı yoksa her 20 sayfa bir bölüm yap
            if (chapters.Count == 0)
            {
                const int pagesPerChapter = 20;
                for (int i = 0; i < pages.Count; i += pagesPerChapter)
                {
                    var chunk = pages.Skip(i).Take(pagesPerChapter);
                    chapters.Add(new PdfChapter
                    {
                        Number = chapters.Count + 1,
                        Title = $"Part {chapters.Count + 1}",
                        Content = string.Join("\n\n", chunk)
                    });
                }
            }

            return chapters;
        }
    
        /// <summary>
        /// KURAL-05: "1,3,5-12" biçimli sayfa seçimini çözer.
        ///
        /// ESKİ HÂLİNDEKİ AÇIK: aralık ÖNCE genişletiliyor, geçerlilik filtresi
        /// SONRA uygulanıyordu. "1-2000000000" (12 karakterlik bir alan) 2 milyar
        /// yinelemeli bir döngü ve o boyutta bir HashSet doğuruyordu — tek sayfalık
        /// bir PDF'te bile. Filtreye sıra hiç gelmiyordu.
        ///
        /// YENİ KURAL: aralık genişletilmeden ÖNCE [1, toplamSayfa] aralığına
        /// kırpılır. Böylece üretilebilecek azami eleman sayısı, istemcinin
        /// gönderdiği metne değil, belgenin gerçek sayfa sayısına bağlıdır.
        /// </summary>
        public static List<int> SayfaSeciminiCoz(string? secim, int toplamSayfa)
        {
            if (toplamSayfa <= 0) return new List<int>();

            var hedef = new HashSet<int>();

            if (!string.IsNullOrWhiteSpace(secim))
            {
                // Parça sayısı da sınırlı: "1,1,1,1,..." ile milyonlarca parça gönderilemesin.
                var parcalar = secim.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                    .Take(AlanSinirlari.SayfaSecimiParcaSayisi);

                foreach (var parca in parcalar)
                {
                    var temiz = parca.Trim();
                    if (temiz.Length == 0) continue;

                    if (temiz.Contains('-'))
                    {
                        var uclar = temiz.Split('-', StringSplitOptions.RemoveEmptyEntries);
                        if (uclar.Length == 2
                            && int.TryParse(uclar[0], out var bas)
                            && int.TryParse(uclar[1], out var son))
                        {
                            // ── KRİTİK SIRA: önce kırp, sonra genişlet ──
                            var alt = Math.Max(1, Math.Min(bas, son));
                            var ust = Math.Min(toplamSayfa, Math.Max(bas, son));
                            for (var p = alt; p <= ust; p++) hedef.Add(p);
                        }
                    }
                    else if (int.TryParse(temiz, out var tekSayfa))
                    {
                        if (tekSayfa >= 1 && tekSayfa <= toplamSayfa) hedef.Add(tekSayfa);
                    }
                }
            }

            // Seçim yoksa veya hiçbiri geçerli değilse: tüm belge.
            if (hedef.Count == 0)
                for (var i = 1; i <= toplamSayfa; i++) hedef.Add(i);

            return hedef.OrderBy(p => p).ToList();
        }
    }
}
