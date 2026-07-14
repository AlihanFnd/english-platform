using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;

namespace EnglishReadingPlatform.Services
{
    public class AnalyzedWord
    {
        [JsonPropertyName("word")]
        public string Word { get; set; } = "";

        [JsonPropertyName("translation")]
        public string Translation { get; set; } = "";

        [JsonPropertyName("type")]
        public string Type { get; set; } = "default";
    }

    public class AnalyzedSentence
    {
        [JsonPropertyName("index")]
        public int Index { get; set; }

        [JsonPropertyName("original")]
        public string Original { get; set; } = "";

        [JsonPropertyName("translation")]
        public string Translation { get; set; } = "";

        [JsonPropertyName("isHeading")]
        public bool IsHeading { get; set; }

        [JsonPropertyName("alignment")]
        public string Alignment { get; set; } = "left";

        [JsonPropertyName("indentation")]
        public int Indentation { get; set; } = 0;

        [JsonPropertyName("words")]
        public List<AnalyzedWord> Words { get; set; } = new();
    }

    public class TextAnalysisResult
    {
        [JsonPropertyName("sentences")]
        public List<AnalyzedSentence> Sentences { get; set; } = new();
    }

    public class TranslationService
    {
        private readonly IHttpClientFactory _httpFactory;
        private readonly IConfiguration _configuration;
        private const string GT = "https://translate.googleapis.com/translate_a/single";
        private const string UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

        public TranslationService(IHttpClientFactory httpFactory, IConfiguration configuration)
        {
            _httpFactory = httpFactory;
            _configuration = configuration;
        }

        public async Task<string> TranslateSentenceAsync(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return text;
            try
            {
                await Task.Delay(50); // Google translate rate-limit yememek için hafif gecikme
                var client = _httpFactory.CreateClient();
                client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", UA);
                var url = $"{GT}?client=gtx&sl=auto&tl=tr&dt=t&q={Uri.EscapeDataString(text)}";
                var res = await client.GetAsync(url);
                if (!res.IsSuccessStatusCode) return text;
                var json = await res.Content.ReadAsStringAsync();
                return ParseSentence(json) ?? text;
            }
            catch { return text; }
        }

        public async Task<(string Tr, string Type)> TranslateWordAsync(string word)
        {
            var clean = Regex.Replace(word, @"[^a-zA-Z0-9'\ -]", "").Trim().ToLower();
            if (string.IsNullOrEmpty(clean)) return (word, "default");
            
            var isKalip = clean.Contains(' ');
            var defaultType = isKalip ? "kalıp" : GuessType(clean);

            try
            {
                await Task.Delay(30); // Kelime ve kalıp çevirileri için hafif gecikme
                var client = _httpFactory.CreateClient();
                client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", UA);
                var url = $"{GT}?client=gtx&sl=en&tl=tr&dt=t&dt=bd&q={Uri.EscapeDataString(clean)}";
                var res = await client.GetAsync(url);
                if (!res.IsSuccessStatusCode) return (word, defaultType);
                var json = await res.Content.ReadAsStringAsync();
                var (tr, rawType) = ParseWord(json);
                var typeResult = isKalip ? "kalıp" : MapType(rawType ?? defaultType);
                return (string.IsNullOrEmpty(tr) ? word : tr, typeResult);
            }
            catch { return (word, defaultType); }
        }

        public List<string> SplitSentences(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return new List<string>();

            var result = new List<string>();
            // Önce satırlara bölüyoruz, böylece başlıklar paragrafla birleşmiyor
            var lines = text.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            var pattern = @"(?<!\b(Mr|Mrs|Ms|Dr|St|Co|Inc|Ltd|e\.g|i\.e|a\.m|p\.m)\.)(?<=[.!?][""']?)\s+";

            foreach (var line in lines)
            {
                var cleanLine = Regex.Replace(line, @"\s+", " ").Trim();
                if (string.IsNullOrEmpty(cleanLine)) continue;

                // Eğer tek satır içine başlık ile normal cümle birleşmişse ayır: örn. "CHAPTER I THE BEGINNING It was a dark..."
                var headingMatch = Regex.Match(cleanLine, @"^(CHAPTER|Chapter|PART|Part|UNIT|Unit|LESSON|Lesson|BOOK|Book)\s+([0-9IVXLCDMivxlcdm]+|[A-Za-z]+)?\s*(-|:|–)?\s*([A-Z\s]{2,40}|[A-Za-z\s]{2,40})?(\.\s+|\s{2,}|\n)(.*)$");
                if (headingMatch.Success && headingMatch.Groups[6].Success && headingMatch.Groups[6].Value.Trim().Length > 15)
                {
                    var headingPart = cleanLine.Substring(0, cleanLine.IndexOf(headingMatch.Groups[6].Value)).Trim();
                    var bodyPart = headingMatch.Groups[6].Value.Trim();
                    if (!string.IsNullOrEmpty(headingPart)) result.Add(headingPart);
                    cleanLine = bodyPart;
                }

                var sents = Regex.Split(cleanLine, pattern);
                foreach (var s in sents)
                {
                    var trimmed = s.Trim();
                    if (trimmed.Length > 0)
                    {
                        result.Add(trimmed);
                    }
                }
            }

            return result;
        }

        // Cümleyi kelimelere ve noktalama işaretlerine/boşluklara göre ayırır.
        // Cümlenin orijinal halindeki hiçbir karakteri (virgül, nokta, tırnak) kaybetmez.
        public List<string> ExtractWords(string s)
        {
            var result = new List<string>();
            if (string.IsNullOrEmpty(s)) return result;

            // Unicode uyumlu tüm boşluk karakterlerine göre ayırır (non-breaking space vb. dahil)
            var tokens = s.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            return tokens.ToList();
        }

        private static string? ParseSentence(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var sb = new System.Text.StringBuilder();
                var arr = doc.RootElement[0];
                for (int i = 0; i < arr.GetArrayLength(); i++)
                {
                    var item = arr[i];
                    if (item.GetArrayLength() > 0 && item[0].ValueKind == JsonValueKind.String)
                        sb.Append(item[0].GetString());
                }
                return sb.Length > 0 ? sb.ToString() : null;
            }
            catch { return null; }
        }

        private static (string tr, string? type) ParseWord(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var tr = doc.RootElement[0][0][0].GetString() ?? "";
                string? rawType = null;
                try { rawType = doc.RootElement[3][0][0].GetString(); } catch { }
                return (tr, rawType);
            }
            catch { return ("", null); }
        }

        private static string MapType(string en) => en.ToLower() switch
        {
            "verb" => "fiil", "noun" => "isim", "adjective" => "sıfat",
            "adverb" => "zarf", "preposition" => "edat", "conjunction" => "bağlaç",
            "pronoun" => "zamir", "article" => "article", _ => en
        };

        private static string GuessType(string w)
        {
            if (Regex.IsMatch(w, @"^(a|an|the)$", RegexOptions.IgnoreCase)) return "article";
            if (Regex.IsMatch(w, @"^(i|you|he|she|it|we|they|me|him|her|us|them|my|your|his|its|our|their)$", RegexOptions.IgnoreCase)) return "zamir";
            if (Regex.IsMatch(w, @"^(and|but|or|nor|for|yet|so|although|because|since|while|if|unless|until|when|where|which|that|who)$", RegexOptions.IgnoreCase)) return "bağlaç";
            if (Regex.IsMatch(w, @"^(in|on|at|by|for|with|about|against|between|into|through|during|before|after|above|below|to|from|up|down|of|off)$", RegexOptions.IgnoreCase)) return "edat";
            if (w.EndsWith("ly")) return "zarf";
            if (w.EndsWith("ing") || w.EndsWith("ed")) return "fiil";
            if (Regex.IsMatch(w, @"(tion|ness|ment|ity|ance|ence|er|or|ist|age|ism|ship|hood)$")) return "isim";
            if (Regex.IsMatch(w, @"(ful|less|ous|ive|able|ible|al|ic|ish)$")) return "sıfat";
            return "isim";
        }

        public async Task<List<AnalyzedSentence>> AnalyzeTextAsync(string text)
        {
            var apiKey = _configuration["Gemini:ApiKey"] 
                         ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY") 
                         ?? Environment.GetEnvironmentVariable("Gemini__ApiKey")
                         ?? Environment.GetEnvironmentVariable("API_KEY");

            if (!string.IsNullOrWhiteSpace(apiKey))
            {
                try
                {
                    return await AnalyzeTextWithGeminiAsync(text, apiKey);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Gemini API Error, falling back to Google Translate]: {ex.Message}");
                }
            }
            else
            {
                Console.WriteLine("[Gemini API Key missing] No API key found in appsettings.json or environment variables (GEMINI_API_KEY). Using fallback.");
            }

            // Fallback to Google Translate + Regex
            var rawSentences = SplitSentences(text.Trim());
            if (!rawSentences.Any()) return new List<AnalyzedSentence>();

            var wordSet = rawSentences.SelectMany(ExtractWords).Select(w => w.ToLower()).Distinct().ToList();

            var sentTask = Task.WhenAll(rawSentences.Select(s => TranslateSentenceAsync(s)));
            var sentTrs = sentTask.Result;

            var sentencesData = rawSentences.Select((s, i) =>
            {
                bool isHead = IsSentenceHeading(s);
                return new AnalyzedSentence
                {
                    Index = i,
                    Original = s,
                    Translation = sentTrs[i],
                    IsHeading = isHead,
                    Alignment = isHead ? "center" : "left",
                    Indentation = 0,
                    Words = ExtractWords(s).Select(w => new AnalyzedWord
                    {
                        Word = w,
                        Translation = w, // Çeviriyi anlık tıklama (lazy) bırakıyoruz, hız kazanmak için
                        Type = "default"
                    }).ToList()
                };
            }).ToList();

            return NormalizeAndSeparateHeadings(sentencesData);
        }

        private async Task<List<AnalyzedSentence>> AnalyzeTextWithGeminiAsync(string text, string apiKey)
        {
            // Try valid active models in order (gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash)
            var models = new[] { "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash" };
            Exception? lastException = null;

            var prompt = "You are an assistant for an English Reading Platform. " +
                         "Analyze the following English text. Do the following:\n" +
                         "1. Correct any word merging or OCR/spacing errors in the text (e.g., 'helloworld' to 'hello world'). Make sure not to change the meaning.\n" +
                         "2. CRITICAL RULE ON HEADINGS, TITLES AND LINE BREAKS: Every single line of text separated by a newline (\\n or \\r) that is a title, chapter number (e.g., 'CHAPTER I', 'CHAPTER 1'), subtitle, author name, or standalone heading MUST BE A SEPARATE INDEPENDENT ITEM in the JSON array! DO NOT EVER MERGE MULTIPLE HEADINGS TOGETHER or merge a heading into the paragraph below it! For example, if 'CHAPTER I' and 'THE BEGINNING' are on two separate lines one above the other, produce TWO SEPARATE items in the list, both with 'isHeading': true and 'alignment': 'center'.\n" +
                         "3. Split the remaining body paragraphs into proper sentences.\n" +
                         "4. Translate each item into Turkish.\n" +
                         "5. VISUAL LAYOUT & HEADING DETECTION:\n" +
                         "   - If an item is a chapter number, title, subtitle, or header, set 'isHeading' to true AND set 'alignment' to 'center'.\n" +
                         "   - If a line is centered in the source, set 'alignment' to 'center'. If right-aligned, set 'right'. Otherwise, 'left'.\n" +
                         "   - If a line has leading spacing (indentation), count the spaces/tabs and set 'indentation' to that count.\n\n" +
                         "Return a JSON object conforming exactly to this JSON schema:\n" +
                         "{\n" +
                         "  \"sentences\": [\n" +
                         "    {\n" +
                         "      \"original\": \"(original item or sentence)\",\n" +
                         "      \"translation\": \"(turkish translation)\",\n" +
                         "      \"isHeading\": false,\n" +
                         "      \"alignment\": \"left\",\n" +
                         "      \"indentation\": 0\n" +
                         "    }\n" +
                         "  ]\n" +
                         "}\n\n" +
                         "Here is the text to analyze:\n" +
                         text;

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

            foreach (var model in models)
            {
                try
                {
                    var client = _httpFactory.CreateClient();
                    client.Timeout = TimeSpan.FromMinutes(5);
                    var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

                    using var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
                    var response = await client.PostAsync(url, content);

                    if (!response.IsSuccessStatusCode)
                    {
                        var errContent = await response.Content.ReadAsStringAsync();
                        throw new Exception($"HTTP {response.StatusCode} for model {model}: {errContent}");
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
                        throw new Exception($"Empty text result from model {model}");

                    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    var result = JsonSerializer.Deserialize<TextAnalysisResult>(textResult, options);
                    if (result != null && result.Sentences != null)
                    {
                        for (int i = 0; i < result.Sentences.Count; i++)
                        {
                            var s = result.Sentences[i];
                            s.Index = i;
                            s.Words = ExtractWords(s.Original ?? "").Select(w => new AnalyzedWord
                            {
                                Word = w,
                                Translation = w,
                                Type = "default"
                            }).ToList();
                        }
                        return NormalizeAndSeparateHeadings(result.Sentences);
                    }
                }
                catch (Exception ex)
                {
                    lastException = ex;
                    Console.WriteLine($"[Gemini Attempt Failed on {model}]: {ex.Message}");
                }
            }

            throw lastException ?? new Exception("All Gemini models failed to analyze text.");
        }

        private static bool IsSentenceHeading(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return false;
            var trimmed = s.Trim();
            if (Regex.IsMatch(trimmed, @"^(CHAPTER|Chapter|PART|Part|UNIT|Unit|LESSON|Lesson|BOOK|Book)\b", RegexOptions.IgnoreCase))
                return true;
            return false;
        }

        private List<AnalyzedSentence> NormalizeAndSeparateHeadings(List<AnalyzedSentence> input)
        {
            if (input == null || !input.Any()) return new List<AnalyzedSentence>();

            var output = new List<AnalyzedSentence>();
            foreach (var item in input)
            {
                var orig = (item.Original ?? "").Trim();
                if (string.IsNullOrEmpty(orig)) continue;

                // Eğer tek satır içine başlık ile normal paragraf cümlesi birleşmişse (örn: "CHAPTER I THE BEGINNING It was a dark...")
                var headingMatch = Regex.Match(orig, @"^(CHAPTER|Chapter|PART|Part|UNIT|Unit|LESSON|Lesson|BOOK|Book)\s+([0-9IVXLCDMivxlcdm]+|[A-Za-z]+)?\s*(-|:|–)?\s*([A-Z\s]{2,40}|[A-Za-z\s]{2,40})?(\.\s+|\s{2,}|\n)(.*)$");
                if (!item.IsHeading && headingMatch.Success && headingMatch.Groups[6].Success && headingMatch.Groups[6].Value.Trim().Length > 15)
                {
                    var headingPart = orig.Substring(0, orig.IndexOf(headingMatch.Groups[6].Value)).Trim();
                    var bodyPart = headingMatch.Groups[6].Value.Trim();
                    if (!string.IsNullOrEmpty(headingPart))
                    {
                        output.Add(new AnalyzedSentence
                        {
                            Index = output.Count,
                            Original = headingPart,
                            Translation = headingPart,
                            IsHeading = true,
                            Alignment = "center",
                            Indentation = 0,
                            Words = ExtractWords(headingPart).Select(w => new AnalyzedWord { Word = w, Translation = w, Type = "default" }).ToList()
                        });
                    }
                    orig = bodyPart;
                    item.Original = bodyPart;
                    item.Words = ExtractWords(bodyPart).Select(w => new AnalyzedWord { Word = w, Translation = w, Type = "default" }).ToList();
                }

                if (!item.IsHeading && IsSentenceHeading(orig))
                {
                    item.IsHeading = true;
                    item.Alignment = "center";
                }

                item.Index = output.Count;
                output.Add(item);
            }

            return output;
        }
    }
}
