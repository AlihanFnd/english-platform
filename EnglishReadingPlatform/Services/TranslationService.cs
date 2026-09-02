using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Models;
using Microsoft.EntityFrameworkCore;
using EnglishReadingPlatform.Logging;
using EnglishReadingPlatform.Validation;

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

    public class WordTranslationResult
    {
        public string Translation { get; set; } = "";
        public string GeneralMeaning { get; set; } = "";
        public string ContextualMeaning { get; set; } = "";
        public string Synonyms { get; set; } = "";
        public string Type { get; set; } = "";
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

        /// <summary>
        /// KURAL-06: false ise 'translation' alanı GERÇEK bir çeviri değildir
        /// (çeviri servisi patladı, özgün metin geri döndü). Arayüz bunu
        /// göstermezse kullanıcı hâlâ yanılır — teknik borç olarak raporlandı.
        /// </summary>
        [JsonPropertyName("ceviriBasarili")]
        public bool CeviriBasarili { get; set; } = true;
    }

    /// <summary>
    /// KURAL-06: çevirinin BAŞARILI OLUP OLMADIĞINI taşır.
    ///
    /// Eskiden TranslateSentenceAsync başarısızlıkta özgün İNGİLİZCE metni
    /// döndürüyordu ve çağıran bunu Türkçe çeviri sanıyordu — kullanıcı da öyle.
    /// Sessiz başarısızlık, yanlış cevabı doğru cevaptan ayırt edilemez kılar.
    /// </summary>
    public class CeviriSonucu
    {
        public string Metin { get; init; } = "";
        public bool Basarili { get; init; }
        public string Kaynak { get; init; } = "";   // "groq" | "google" | "onbellek" | "yok"
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
        private readonly AppDbContext _db;
        private readonly ILogger<TranslationService> _logger;   // KURAL-06
        private readonly AgirIsKapisi _agirIsKapisi;            // KURAL-07
        private const string GT = "https://translate.googleapis.com/translate_a/single";
        private const string UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

        public TranslationService(IHttpClientFactory httpFactory, IConfiguration configuration,
                                  AppDbContext db, ILogger<TranslationService> logger,
                                  AgirIsKapisi agirIsKapisi)
        {
            _httpFactory = httpFactory;
            _configuration = configuration;
            _db = db;
            _logger = logger;
            _agirIsKapisi = agirIsKapisi;
        }

        /// <summary>
        /// KURAL-07: Groq istemcisi TEK yerden gelir.
        ///
        /// Adlandırılmış istemci Program.cs'te 60 saniyelik TAVAN zaman aşımı ve
        /// yanıt boyutu sınırı (MaxResponseContentBufferSize) taşır. Buradaki
        /// <paramref name="butce"/> tek çağrıya daha DAR bir bütçe verir.
        /// Varsayılan HttpCompletionOption.ResponseContentRead sayesinde bu süre
        /// gövdenin indirilmesini de kapsar — yalnızca başlıkları değil.
        /// </summary>
        private HttpClient GroqIstemcisi(string apiKey, TimeSpan butce)
        {
            var client = _httpFactory.CreateClient(HizSinirlari.GroqIstemcisi);
            client.Timeout = butce;
            client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            return client;
        }

        private HttpClient CreateGoogleTranslateClient()
        {
            // KURAL-07: adlandırılmış istemci — zaman aşımı (10 sn) ve yanıt boyutu
            // sınırı Program.cs'te TEK yerde tanımlı. Eskiden buradaki istemcinin
            // hiç zaman aşımı ayarı yoktu; varsayılan 100 saniyeydi.
            var client = _httpFactory.CreateClient(HizSinirlari.GoogleIstemcisi);
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "*/*");
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7");
            client.DefaultRequestHeaders.TryAddWithoutValidation("Referer", "https://translate.google.com/");
            return client;
        }

        /// <summary>
        /// KURAL-06: dönüş tipi string DEĞİL CeviriSonucu'dur.
        /// Başarısızlıkta özgün metin yine döner (arayüz boş kalmasın diye) ama
        /// Basarili=false ile birlikte — çağıran artık ayrımı yapabilir.
        /// </summary>
        public async Task<CeviriSonucu> TranslateSentenceAsync(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
                return new CeviriSonucu { Metin = text, Basarili = true, Kaynak = "yok" };

            try
            {
                await Task.Delay(50); // Google translate rate-limit yememek için hafif gecikme
                var client = CreateGoogleTranslateClient();
                var url = $"{GT}?client=dict-chrome-ex&sl=en&tl=tr&dt=t&q={Uri.EscapeDataString(text)}";
                var res = await client.GetAsync(url);
                if (res.IsSuccessStatusCode)
                {
                    var json = await res.Content.ReadAsStringAsync();
                    var parsed = ParseSentence(json);
                    if (!string.IsNullOrWhiteSpace(parsed))
                        return new CeviriSonucu { Metin = parsed, Basarili = true, Kaynak = "google" };
                }
                else
                {
                    // Durum kodu TEKNİK bir alandır, kullanıcı içeriği değil — düz yazılır.
                    _logger.LogWarning("Google Translate {Durum} döndürdü. Uzunluk={Uzunluk}",
                        (int)res.StatusCode, text.Length);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Google Translate cümle çevirisi başarısız.");
            }

            // Fallback: Google Translate patladıysa (Render IP ban vb.) Groq AI ile çevir
            try
            {
                var apiKey = _configuration["Groq:ApiKey"] 
                              ?? Environment.GetEnvironmentVariable("GROQ_API_KEY") 
                              ?? Environment.GetEnvironmentVariable("Groq__ApiKey");

                if (!string.IsNullOrWhiteSpace(apiKey))
                {
                    var model = _configuration["Groq:Model"] ?? "llama-3.3-70b-versatile";
                    var client = GroqIstemcisi(apiKey, HizSinirlari.GroqKisaButce);

                    var payload = new
                    {
                        model = model,
                        messages = new[]
                        {
                            new { role = "user", content = $"Translate the following English sentence to natural Turkish. Return ONLY the Turkish translation, nothing else.\n\nSentence: {text}" }
                        }
                    };

                    using var reqContent = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                    var response = await client.PostAsync("https://api.groq.com/openai/v1/chat/completions", reqContent);
                    if (response.IsSuccessStatusCode)
                    {
                        var responseJson = await response.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(responseJson);
                        var trResult = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString()?.Trim();
                        if (!string.IsNullOrWhiteSpace(trResult))
                            return new CeviriSonucu { Metin = trResult, Basarili = true, Kaynak = "groq" };
                    }
                    else
                    {
                        _logger.LogWarning("Groq cümle çevirisi {Durum} döndürdü.", (int)response.StatusCode);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Groq cümle çevirisi yedeği başarısız.");
            }

            // KURAL-06: her iki yol da başarısız. Özgün metni "çeviri" diye SESSİZCE
            // dönmüyoruz — metin dönüyor ama Basarili=false ile işaretli.
            _logger.LogWarning("Cümle çevrilemedi, özgün metin işaretlenerek döndürülüyor. Uzunluk={Uzunluk}", text.Length);
            return new CeviriSonucu { Metin = text, Basarili = false, Kaynak = "yok" };
        }

        public class WordTranslationResponse
        {
            [JsonPropertyName("general_meaning")]
            public string GeneralMeaning { get; set; } = "";

            [JsonPropertyName("contextual_meaning")]
            public string ContextualMeaning { get; set; } = "";

            [JsonPropertyName("synonyms")]
            public string Synonyms { get; set; } = "";

            [JsonPropertyName("type")]
            public string Type { get; set; } = "";
        }

        public async Task<WordTranslationResult> TranslateWordAsync(string word, string? context = null, bool forceAI = false)
        {
            var clean = Regex.Replace(word, @"[^a-zA-Z0-9'\ -]", "").Trim().ToLower();
            if (string.IsNullOrEmpty(clean)) return new WordTranslationResult { Translation = word, GeneralMeaning = word, Type = "default" };
            
            var isKalip = clean.Contains(' ');
            var defaultType = isKalip ? "kalıp" : GuessType(clean);
            var cleanContext = context?.Trim().ToLower();

            if (!string.IsNullOrWhiteSpace(context))
            {
                // 1. Önce Veritabanı Önbelleğinden Kontrol Et (Cache hit her zaman 0 tokendir, forceAI olmasa da dönebilir)
                try
                {
                    var cached = await _db.TranslationCaches.FirstOrDefaultAsync(tc => 
                        tc.QueryText == clean && tc.ContextText == cleanContext);
                    
                    if (cached != null && !string.IsNullOrWhiteSpace(cached.Translation) && !cached.Translation.Trim().Equals(clean, StringComparison.OrdinalIgnoreCase))
                    {
                        // KURAL-06: kullanıcının hangi kelimeleri bilmediği bir
                        // öğrenme profilidir. İçerik değil, uzunluk + kısa hash yazılır:
                        // "aynı kelime tekrar mı geldi" sorusu yine yanıtlanabilir.
                        _logger.LogDebug("Çeviri önbelleği isabet. Kelime={Kelime}", GuvenliLog.KullaniciMetni(clean));
                        
                        var parts = cached.Translation.Split("|||", StringSplitOptions.None);
                        if (parts.Length == 3)
                        {
                            var formattedText = $"Anlamı: {parts[0]}\nCümledeki Anlamı: {parts[1]}";
                            if (!string.IsNullOrWhiteSpace(parts[2]))
                            {
                                formattedText += $"\n\nEş Anlamlılar: {parts[2]}";
                            }
                            return new WordTranslationResult
                            {
                                Translation = formattedText,
                                GeneralMeaning = parts[0],
                                ContextualMeaning = parts[1],
                                Synonyms = parts[2],
                                Type = cached.WordType
                            };
                        }
                        else
                        {
                            return new WordTranslationResult
                            {
                                Translation = cached.Translation,
                                GeneralMeaning = cached.Translation,
                                Type = cached.WordType
                            };
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Çeviri önbelleği okunamadı.");
                }

                // 2. Önbellekte Yoksa ve Kullanıcı Butona Basarak Yapay Zekayı Zorladıysa (forceAI == true) Groq'tan Al
                var apiKey = _configuration["Groq:ApiKey"] 
                              ?? Environment.GetEnvironmentVariable("GROQ_API_KEY") 
                              ?? Environment.GetEnvironmentVariable("Groq__ApiKey");

                if (!string.IsNullOrWhiteSpace(apiKey) && forceAI)
                {
                    try
                    {
                        var model = _configuration["Groq:Model"] ?? "llama-3.3-70b-versatile";
                        if (string.IsNullOrWhiteSpace(model)) model = "llama-3.3-70b-versatile";

                        var prompt = "Translate the word in the context of the sentence. Keep the output extremely concise (just the words). Return a JSON object conforming exactly to this schema:\n" +
                                     "{\n" +
                                     "  \"general_meaning\": \"(Literal/general Turkish translation of the word, 1-3 words max)\",\n" +
                                     "  \"contextual_meaning\": \"(The direct Turkish translation of the word *in this specific sentence context*, only 1-3 words max. Absolutely no definitions, no explanations, no reasoning, no extra words)\",\n" +
                                     "  \"synonyms\": \"(comma-separated list of direct Turkish synonyms appropriate for this context, max 4 words)\",\n" +
                                     "  \"type\": \"(word class in Turkish, e.g., isim, fiil, sıfat, zarf, kalıp)\"\n" +
                                     "}\n\n" +
                                     $"Word: {word}\n" +
                                     $"Sentence Context: {context}";

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
                        var client = GroqIstemcisi(apiKey, HizSinirlari.GroqKelimeButcesi);

                        using var reqContent = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
                        var response = await client.PostAsync("https://api.groq.com/openai/v1/chat/completions", reqContent);

                        if (response.IsSuccessStatusCode)
                        {
                            var responseJson = await response.Content.ReadAsStringAsync();
                            using var doc = JsonDocument.Parse(responseJson);
                            var root = doc.RootElement;
                            if (root.TryGetProperty("usage", out var usage))
                            {
                                _logger.LogInformation(
                                    "Groq token kullanımı. Islem={Islem} Girdi={Girdi} Cikti={Cikti} Toplam={Toplam}",
                                    "TranslateWord",
                                    usage.GetProperty("prompt_tokens").ToString(),
                                    usage.GetProperty("completion_tokens").ToString(),
                                    usage.GetProperty("total_tokens").ToString());
                            }
                            var textResult = root.GetProperty("choices")[0]
                                                 .GetProperty("message")
                                                 .GetProperty("content")
                                                 .GetString();

                            if (!string.IsNullOrWhiteSpace(textResult))
                            {
                                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                                var result = JsonSerializer.Deserialize<WordTranslationResponse>(textResult, options);
                                if (result != null && !string.IsNullOrWhiteSpace(result.ContextualMeaning))
                                {
                                    var typeResult = string.IsNullOrWhiteSpace(result.Type) ? defaultType : result.Type;
                                    
                                    var formattedText = $"Anlamı: {result.GeneralMeaning}\n" +
                                                        $"Cümledeki Anlamı: {result.ContextualMeaning}";
                                    if (!string.IsNullOrWhiteSpace(result.Synonyms))
                                    {
                                        formattedText += $"\n\nEş Anlamlılar: {result.Synonyms}";
                                    }

                                    // Veritabanına ||| ayracı ile parça parça sakla
                                    var dbValue = $"{result.GeneralMeaning}|||{result.ContextualMeaning}|||{result.Synonyms}";

                                    try
                                    {
                                        var cachedEntry = new TranslationCache
                                        {
                                            // KURAL-05: iki alan da varchar sınırlı ve
                                            // biri LLM yanıtından geliyor. Taşma burada
                                            // try/catch'e düşüp SESSİZCE yutuluyordu:
                                            // önbellek hiç yazılmıyor, kimse fark etmiyordu.
                                            QueryText = clean.KirpEnCok(AlanSinirlari.OnbellekSorgusu),
                                            ContextText = cleanContext,
                                            Translation = dbValue,
                                            WordType = typeResult.KirpEnCok(AlanSinirlari.OnbellekTipi),
                                            CreatedAt = DateTime.UtcNow
                                        };
                                        _db.TranslationCaches.Add(cachedEntry);

                                        // KURAL-12: (QueryText, ContextText) artık TEKİL.
                                        // Aynı kelime+cümle çifti için iki eşzamanlı istek
                                        // eskiden İKİ önbellek satırı yazıyordu; önbellek
                                        // şişiyor, hangi satırın okunacağı belirsizleşiyordu.
                                        // Çakışma burada bir hata DEĞİLDİR: kaybeden isteğin
                                        // yazacağı değer zaten yazılmış durumda.
                                        await _db.BenzersizKaydetAsync();
                                    }
                                    catch (Exception ex)
                                    {
                                        // KURAL-12 YAN BULGU: başarısız bir SaveChanges,
                                        // eklenmeye çalışılan satırı ChangeTracker'da
                                        // 'Added' durumunda BIRAKIR. Bu servis, aynı
                                        // kapsamda başka bir SaveChanges yapan çağrı
                                        // yollarından da çağrılıyor (BooksController.Read →
                                        // AnalyzeTextAsync → SentencesJson yazımı). O
                                        // durumda burada YUTULAN hata, ilgisiz bir uçta
                                        // 500 olarak yeniden patlıyordu: kullanıcı kitabını
                                        // açamıyor, log ise çeviri önbelleğinden bahsediyor.
                                        // Yutulan hatanın izini de temizlemek şart.
                                        _db.ChangeTracker.Entries<TranslationCache>()
                                            .Where(g => g.State == EntityState.Added)
                                            .ToList()
                                            .ForEach(g => g.State = EntityState.Detached);

                                        // Kota harcandı ama sonuç kaydedilmedi: bir sonraki
                                        // aynı istek yeniden token yakacak. Warning seviyesi
                                        // bilinçli — sessizce yutulursa maliyet fark edilmez.
                                        _logger.LogWarning(ex,
                                            "Çeviri önbelleğine yazılamadı — kota harcandı ama sonuç kaydedilmedi. Kelime={Kelime}",
                                            GuvenliLog.KullaniciMetni(clean));
                                    }

                                    return new WordTranslationResult
                                    {
                                        Translation = formattedText,
                                        GeneralMeaning = result.GeneralMeaning,
                                        ContextualMeaning = result.ContextualMeaning,
                                        Synonyms = result.Synonyms,
                                        Type = typeResult
                                    };
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Groq bağlamsal kelime çevirisi başarısız.");
                    }
                }
            }

            // 3. Google Translate + Synonyms (Ücretsiz ve Hızlı)
            try
            {
                await Task.Delay(30);
                var client = CreateGoogleTranslateClient();
                var url = $"{GT}?client=dict-chrome-ex&sl=en&tl=tr&dt=t&dt=bd&q={Uri.EscapeDataString(clean)}";
                var res = await client.GetAsync(url);
                if (res.IsSuccessStatusCode)
                {
                    var json = await res.Content.ReadAsStringAsync();
                    var (tr, rawType) = ParseWord(json);
                    if (!string.IsNullOrWhiteSpace(tr) && !tr.Trim().Equals(clean, StringComparison.OrdinalIgnoreCase))
                    {
                        var typeResult = isKalip ? "kalıp" : MapType(rawType ?? defaultType);
                        
                        string googleSynonyms = "";
                        var displayTranslation = tr;
                        var idx = tr.IndexOf("\n\nEş Anlamlılar / Alternatifler:");
                        if (idx != -1)
                        {
                            displayTranslation = tr.Substring(0, idx).Trim();
                            googleSynonyms = tr.Substring(idx).Replace("Eş Anlamlılar / Alternatifler:\n", "").Trim();
                        }

                        return new WordTranslationResult
                        {
                            Translation = tr,
                            GeneralMeaning = displayTranslation,
                            ContextualMeaning = "",
                            Synonyms = googleSynonyms,
                            Type = typeResult
                        };
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Google Translate kelime çevirisi başarısız.");
            }

            // 4. Fallback: Google Translate takıldıysa Groq AI ile kelimeyi çevir
            try
            {
                var apiKey = _configuration["Groq:ApiKey"] 
                              ?? Environment.GetEnvironmentVariable("GROQ_API_KEY") 
                              ?? Environment.GetEnvironmentVariable("Groq__ApiKey");

                if (!string.IsNullOrWhiteSpace(apiKey))
                {
                    var model = _configuration["Groq:Model"] ?? "llama-3.3-70b-versatile";
                    var client = GroqIstemcisi(apiKey, HizSinirlari.GroqKisaButce);

                    var prompt = $"Translate the English word/phrase '{clean}' to natural Turkish. Return ONLY the Turkish translation, nothing else.";
                    var payload = new
                    {
                        model = model,
                        messages = new[] { new { role = "user", content = prompt } }
                    };

                    using var reqContent = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                    var response = await client.PostAsync("https://api.groq.com/openai/v1/chat/completions", reqContent);
                    if (response.IsSuccessStatusCode)
                    {
                        var responseJson = await response.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(responseJson);
                        var trResult = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString()?.Trim();
                        if (!string.IsNullOrWhiteSpace(trResult))
                        {
                            return new WordTranslationResult
                            {
                                Translation = trResult,
                                GeneralMeaning = trResult,
                                ContextualMeaning = "",
                                Synonyms = "",
                                Type = defaultType
                            };
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Groq kelime çevirisi yedeği başarısız.");
            }

            return new WordTranslationResult { Translation = word, GeneralMeaning = word, Type = defaultType };
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

                var synonymsList = new List<string>();
                try
                {
                    if (doc.RootElement.GetArrayLength() > 1 && doc.RootElement[1].ValueKind == JsonValueKind.Array)
                    {
                        var partsOfSpeech = doc.RootElement[1];
                        for (int i = 0; i < partsOfSpeech.GetArrayLength(); i++)
                        {
                            var posItem = partsOfSpeech[i];
                            var posName = posItem[0].GetString();
                            var trPosName = MapType(posName ?? "");
                            
                            var translations = posItem[1];
                            var posSyns = new List<string>();
                            for (int j = 0; j < Math.Min(translations.GetArrayLength(), 5); j++)
                            {
                                var syn = translations[j].GetString();
                                if (!string.IsNullOrEmpty(syn) && !syn.Equals(tr, StringComparison.OrdinalIgnoreCase))
                                {
                                    posSyns.Add(syn);
                                }
                            }

                            if (posSyns.Any())
                            {
                                synonymsList.Add($"• {trPosName}: {string.Join(", ", posSyns)}");
                            }
                        }
                    }
                }
                catch { }

                if (synonymsList.Any())
                {
                    tr = $"{tr}\n\nEş Anlamlılar / Alternatifler:\n" + string.Join("\n", synonymsList);
                }

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
            var apiKey = _configuration["Groq:ApiKey"] 
                          ?? Environment.GetEnvironmentVariable("GROQ_API_KEY") 
                          ?? Environment.GetEnvironmentVariable("Groq__ApiKey")
                          ?? Environment.GetEnvironmentVariable("API_KEY");

            if (!string.IsNullOrWhiteSpace(apiKey))
            {
                try
                {
                    // KURAL-07 İhlal 4: LLM analizi AĞIR iştir. Dakikalık kota
                    // "aynı anda kaç tanesi bellekte" sorusunu yanıtlamaz —
                    // eşzamanlılık kapısı onu yanıtlar. Kapı doluysa 503 döner.
                    return await _agirIsKapisi.CalistirAsync(
                        () => AnalyzeTextWithGroqAsync(text, apiKey));
                }
                catch (Exceptions.KullaniciHatasi)
                {
                    // Kapı reddi kullanıcıya AYNEN iletilmeli: "sistem yoğun, tekrar
                    // deneyin". Yedek yola düşmek, ağır işten kaçınma amacını bozar
                    // (yedek yol cümle başına bir Google isteği açar — daha da pahalı).
                    throw;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Groq metin analizi başarısız, Google Translate yedeğine düşülüyor.");
                }
            }
            else
            {
                _logger.LogWarning("Groq API anahtarı tanımlı değil, yedek çeviri yolu kullanılıyor.");
            }

            // Fallback to Google Translate + Regex
            var rawSentences = SplitSentences(text.Trim());
            if (!rawSentences.Any()) return new List<AnalyzedSentence>();

            var wordSet = rawSentences.SelectMany(ExtractWords).Select(w => w.ToLower()).Distinct().ToList();

            var sentTrs = await Task.WhenAll(rawSentences.Select(s => TranslateSentenceAsync(s)));

            var sentencesData = rawSentences.Select((s, i) =>
            {
                bool isHead = IsSentenceHeading(s);
                return new AnalyzedSentence
                {
                    Index = i,
                    Original = s,
                    Translation = sentTrs[i].Metin,
                    // KURAL-06: çevrilemeyen satır artık işaretli geliyor.
                    CeviriBasarili = sentTrs[i].Basarili,
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

        private async Task<List<AnalyzedSentence>> AnalyzeTextWithGroqAsync(string text, string apiKey)
        {
            var model = _configuration["Groq:Model"] ?? "llama-3.3-70b-versatile";
            if (string.IsNullOrWhiteSpace(model)) model = "llama-3.3-70b-versatile";

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

            try
            {
                // KURAL-07: 5 DAKİKALIK zaman aşımı kendisi bir açıktı — 20 eşzamanlı
                // analiz isteği 5 dakika boyunca 20 bağlantıyı ve 20 thread'i tutuyordu.
                var client = GroqIstemcisi(apiKey, HizSinirlari.GroqAgirButce);

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
                        "AnalyzeText",
                        usage.GetProperty("prompt_tokens").ToString(),
                        usage.GetProperty("completion_tokens").ToString(),
                        usage.GetProperty("total_tokens").ToString());
                }
                var textResult = root.GetProperty("choices")[0]
                                     .GetProperty("message")
                                     .GetProperty("content")
                                     .GetString();

                if (string.IsNullOrWhiteSpace(textResult))
                    throw new Exception("Empty text result from Groq model");

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
                // Yeniden fırlatılıyor: çağıran yedek yola düşecek. Log burada
                // kalıyor çünkü asıl HTTP ayrıntısı yalnızca burada biliniyor.
                _logger.LogWarning(ex, "Groq API çağrısı başarısız.");
                throw;
            }

            throw new Exception("Failed to deserialize Groq response");
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
