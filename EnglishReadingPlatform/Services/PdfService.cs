using UglyToad.PdfPig;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using System.Net.Http;
using System.Text;

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
        private const long MaxFileSizeBytes = 50 * 1024 * 1024; // 50 MB
        private static readonly string[] AllowedExtensions = { ".pdf", ".docx" };

        public PdfService(IConfiguration configuration, IHttpClientFactory httpFactory)
        {
            _configuration = configuration;
            _httpFactory = httpFactory;
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
            using var document = PdfDocument.Open(stream);
            if (pageNumber < 1 || pageNumber > document.NumberOfPages) return "";
            var page = document.GetPage(pageNumber);
            
            return ExtractTextFromPage(page);
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
            using var wordDoc = WordprocessingDocument.Open(stream, false);
            var body = wordDoc.MainDocumentPart?.Document.Body;
            if (body == null) return "";

            var paragraphs = body.Descendants<Paragraph>().Select(p => p.InnerText).Where(t => !string.IsNullOrWhiteSpace(t));
            return string.Join("\n\n", paragraphs);
        }

        /// <summary>
        /// PDF veya DOCX dosyasını doğrular, metnini çıkarır ve bölümlere böler.
        /// </summary>
        public async Task<PdfExtractResult> ExtractAndSplitAsync(IFormFile file, string? pageSelection = null)
        {
            var ext = System.IO.Path.GetExtension(file.FileName).ToLower();
            if (!AllowedExtensions.Contains(ext))
                throw new InvalidOperationException("Sadece PDF veya DOCX dosyaları yüklenebilir.");

            if (file.Length > MaxFileSizeBytes)
                throw new InvalidOperationException("Dosya boyutu 50 MB sınırını aşıyor.");

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
                using var document = PdfDocument.Open(stream);
                result.PageCount = document.NumberOfPages;

                var targetPages = new HashSet<int>();
                if (!string.IsNullOrWhiteSpace(pageSelection))
                {
                    var parts = pageSelection.Split(',', StringSplitOptions.RemoveEmptyEntries);
                    foreach (var part in parts)
                    {
                        var cleanPart = part.Trim();
                        if (cleanPart.Contains('-'))
                        {
                            var rangeParts = cleanPart.Split('-', StringSplitOptions.RemoveEmptyEntries);
                            if (rangeParts.Length == 2 && int.TryParse(rangeParts[0], out int startRange) && int.TryParse(rangeParts[1], out int endRange))
                            {
                                var rStart = Math.Min(startRange, endRange);
                                var rEnd = Math.Max(startRange, endRange);
                                for (int p = rStart; p <= rEnd; p++)
                                {
                                    targetPages.Add(p);
                                }
                            }
                        }
                        else if (int.TryParse(cleanPart, out int singlePage))
                        {
                            targetPages.Add(singlePage);
                        }
                    }
                }

                if (targetPages.Count == 0)
                {
                    for (int i = 1; i <= document.NumberOfPages; i++)
                    {
                        targetPages.Add(i);
                    }
                }

                var sortedPages = targetPages.Where(p => p >= 1 && p <= document.NumberOfPages).OrderBy(p => p).ToList();

                foreach (int pageNumber in sortedPages)
                {
                    var page = document.GetPage(pageNumber);
                    string text = ExtractTextFromPage(page);

                    if (!string.IsNullOrWhiteSpace(text))
                        pageTexts.Add(text.Trim());
                }
            }

            result.FullText = string.Join("\n\n", pageTexts);
            result.Chapters = await SplitIntoChaptersWithGeminiAsync(pageTexts);

            return result;
        }

        private async Task<List<PdfChapter>> SplitIntoChaptersWithGeminiAsync(List<string> pages)
        {
            var apiKey = _configuration["Gemini:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return SplitIntoChaptersRegex(pages);
            }

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

                var client = _httpFactory.CreateClient();
                var url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={apiKey}";

                var payload = new
                {
                    contents = new[]
                    {
                        new
                        {
                            parts = new[]
                            {
                                new { text = prompt }
                            }
                        }
                    },
                    generationConfig = new
                    {
                        responseMimeType = "application/json"
                    }
                };

                var jsonPayload = JsonSerializer.Serialize(payload);
                using var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, content);
                if (!response.IsSuccessStatusCode)
                {
                    throw new Exception("Gemini API call failed");
                }

                var responseJson = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(responseJson);
                var root = doc.RootElement;
                var textResult = root.GetProperty("candidates")[0]
                                     .GetProperty("content")
                                     .GetProperty("parts")[0]
                                     .GetProperty("text")
                                     .GetString();

                if (string.IsNullOrWhiteSpace(textResult))
                    throw new Exception("Empty response");

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
                Console.WriteLine($"[Gemini Chapter Split Error, falling back to regex]: {ex.Message}");
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
                    currentTitle = page.Split('\n').FirstOrDefault(l => l.Length > 2)?.Trim()
                                   ?? $"Chapter {chapterNum + 1}";
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
    }
}
