# 04 — Backend İç İşleyiş

`EnglishReadingPlatform/` — ASP.NET Core 8 Web API, EF Core 8 (Npgsql).

## 1. Dosya haritası

| Dosya | Satır | İçerik |
|---|---|---|
| `Program.cs` | 117 | DI, JWT, CORS, middleware, otomatik migrate |
| `Data/AppDbContext.cs` | 68 | 16 DbSet, unique index'ler, seed |
| `Models/AppModels.cs` | 207 | 16 entity |
| `Controllers/AuthController.cs` | 191 | login, register, logout, me |
| `Controllers/BooksController.cs` | 395 | kitaplık, okuma, kelime listesi, quiz |
| `Controllers/AppControllers.cs` | 436 | **Üç controller:** Groups, Translate, Dashboard |
| `Controllers/AdminController.cs` | 441 | yönetici uçları |
| `Controllers/ActivityController.cs` | 95 | aktivite log/istatistik |
| `Controllers/FeedbackController.cs` | 78 | geri bildirim |
| `Services/AppServices.cs` | 165 | **İki servis:** JwtService, QuizGeneratorService |
| `Security/` | — | token iptal deposu — `ITokenIptalDeposu` (KURAL-04) |
| `RateLimiting/HizSinirlari.cs` | 60 | hız sınırı politikaları ve sayıları — **tek kaynak** (KURAL-07) |
| `RateLimiting/HizSinirlamaKurulumu.cs` | 105 | `AddRateLimiter` kurulumu, 429 gövdesi, bölümleme (KURAL-07) |
| `RateLimiting/HesapSayaci.cs` | 60 | hedef e-posta bazlı başarısız giriş sayacı (KURAL-07) |
| `RateLimiting/AgirIsKapisi.cs` | 45 | LLM/PDF eşzamanlılık kapısı (KURAL-07) |
| `Services/TranslationService.cs` | 664 | çeviri, analiz, önbellek — **en karmaşık dosya** |
| `Services/PdfService.cs` | 402 | PDF/DOCX metin çıkarma, bölümlere ayırma |
| `Files/DosyaDogrulayici.cs` | 221 | KURAL-10: yüklenen dosyanın türünü içerikten doğrular |

**NuGet bağımlılıkları** (`EnglishReadingPlatform.csproj`):

| Paket | Sürüm | Ne için |
|---|---|---|
| `BCrypt.Net-Next` | 4.0.3 | Şifre hash'leme |
| `Microsoft.AspNetCore.Authentication.JwtBearer` | 8.0.11 | JWT doğrulama |
| `Npgsql.EntityFrameworkCore.PostgreSQL` | 8.0.11 | PostgreSQL sağlayıcısı |
| `UglyToad.PdfPig` | 1.7.0-custom-5 | PDF metin çıkarma |
| `DocumentFormat.OpenXml` | 3.0.1 | DOCX okuma |
| `PdfSharpCore` | 1.3.65 | ⚠️ **Kod içinde hiç kullanılmıyor** — kaldırılabilir |

## 2. Servis kayıtları (`Program.cs`)

```csharp
builder.Services.HizSinirlamaEkle();                    // KURAL-07: merkezî hız sınırlama
builder.Services.AddSingleton<HesapSayaci>();           // KURAL-07: hedef bazlı giriş sayacı
builder.Services.AddSingleton<AgirIsKapisi>();          // KURAL-07: eşzamanlılık kapısı
builder.Services.AddSingleton<DosyaDogrulayici>();      // KURAL-10: dosya içerik doğrulaması
builder.Services.AddSingleton<JwtService>();
builder.Services.AddScoped<QuizGeneratorService>();
builder.Services.AddScoped<PdfService>();
builder.Services.AddScoped<TranslationService>();       // AppDbContext'e bağımlı → Scoped olmalı ✅
builder.Services.AddHttpClient();

// KURAL-07: dış API istemcileri adlandırılmış — zaman aşımı VE yanıt boyutu sınırı
builder.Services.AddHttpClient(HizSinirlari.GroqIstemcisi,   c => { … 60 sn, 8 MB … });
builder.Services.AddHttpClient(HizSinirlari.GoogleIstemcisi, c => { … 10 sn, 1 MB … });
```

> ⚠️ `TranslationService` Scoped olmak zorunda çünkü `AppDbContext` (Scoped) enjekte ediyor.
> `HesapSayaci` ve `AgirIsKapisi` **Singleton** olmak zorunda: durumları (sayaç, semafor)
> istekler arasında yaşamalı. Scoped yapılırsa her istek kendi sayacını alır ve
> sınır **sessizce hiçbir şey yapmaz**.

---

## 3. `JwtService` (`Services/AppServices.cs`)

### Token içeriği

| Claim | Değer |
|---|---|
| `ClaimTypes.NameIdentifier` | `user.Id` — `CurrentUserId` bundan okunur |
| `ClaimTypes.Name` | kullanıcı adı |
| `ClaimTypes.Email` | e-posta |
| `ClaimTypes.Role` | `student` \| `teacher` \| `admin` — `[Authorize(Roles=…)]` bunu kullanır |
| `account_type` | `admin` veya `user` — **kodda hiçbir yerde okunmuyor**, kalıntı |
| `jti` | `Guid.NewGuid()` — iptal listesi anahtarı olması amaçlanmış |
| `iat` | Unix saniye — `RevokeAllUserTokens` karşılaştırması için |

**Ömür:** admin → 1 saat, diğer → 24 saat. **Doğrulama:** issuer, audience, imza, ömür;
`ClockSkew = TimeSpan.Zero` (varsayılan 5 dakikalık tolerans kapatılmış ✅).

### `ValidateToken()` — kullanılmayan metot

`JwtService.ValidateToken()` tanımlı ama **hiçbir yerden çağrılmıyor**. Doğrulama
`Program.cs`'teki `AddJwtBearer` yapılandırmasıyla yapılıyor. Ölü kod.

---

## 4. Hız sınırlama ve kaynak tüketimi (`RateLimiting/`) — KURAL-07

> **Tarihçe:** Bu iş eskiden `Services/TokenSecurityService.cs` içindeydi ve üç
> `ConcurrentDictionary` tutuyordu. Token iptali KURAL-04'te `ITokenIptalDeposu`'na,
> hız sınırı KURAL-07'de aşağıdaki mekanizmaya taşındı; sınıf **silindi**.
> Ana kusur şuydu: `_rateLimitWindow` sözlüğünün anahtarları (`login_{ip}`,
> `register_{ip}`) **asla silinmiyordu** ve saldırgan kontrolündeydi — yavaş ama kesin
> bir OOM yolu.

### 4.1 Merkezî middleware

.NET 8'in yerleşik `Microsoft.AspNetCore.RateLimiting` middleware'i kullanılır
(ek NuGet paketi gerekmez). Elle sayaç yazılmaz.

`PartitionedRateLimiter` boşta kalan bölümleri kendi zamanlayıcısıyla serbest bırakır —
**bellek sızıntısı tasarım gereği ortadan kalkar**, temizlenecek bir sözlük kalmaz.

| Politika | Limit/dk | Bölümleme |
|---|---|---|
| `kimlik-dogrulama` | 10 | IP (token henüz yok) |
| `davet-kodu` | 5 | kullanıcı |
| `okuma` | 60 | kullanıcı |
| `ceviri` | 100 | kullanıcı |
| `agir-analiz` | 20 | kullanıcı |
| `yazma` | 60 | kullanıcı |
| `dosya-yukleme` | 5 | kullanıcı |
| *global taban* | 300 | kullanıcı/IP |

Sayılar `RateLimiting/HizSinirlari.cs` içinde **tek yerdedir**; üretimde dar gelirse
tek dosya değişir.

### 4.2 Middleware sırası — kritik

```csharp
app.UseAuthentication();     // önce kimliği çöz
app.UseRateLimiter();        // sonra KULLANICI bazlı sınırla
app.UseAuthorization();      // sınırı aşan istek yetki kontrolüne bile girmesin
```

`UseRateLimiter()` `UseAuthentication()`'dan **önce** konursa `ctx.User` boş olur, tüm
sınırlar IP bazına düşer ve NAT arkasındaki bir okulun tüm öğrencileri birbirinin
kotasını tüketir. `scripts/guard/07-hiz-siniri.sh` bu sırayı denetler;
`HizSiniriTests.Farkli_kullanicilar_birbirinin_kotasini_tuketmez` davranışı ölçer.

### 4.3 429 yanıtı

`OnRejected` yanıtı projenin `{ error }` sözleşmesine uydurur ve `Retry-After` başlığı
(en az 1 saniye) ekler. Boş gövde dönmek, kullanıcıya "HTTP error! status: 429"
gösterirdi — istemciler `errorData.error` okuyor.

`QueueLimit = 0`: sınırı aşan istek **kuyruğa alınmaz**. Kuyruk, reddedilmesi gereken
istekleri bellekte tutar — korunmak istenen şeyin ta kendisi.

### 4.4 `HesapSayaci` — hedef bazlı giriş sınırı

IP bazlı sınır, her IP'den 10 deneme yapan bir botnet'i durdurmaz. Bu sayaç **hedef
e-postayı** sayar: 15 dakikada 10 **başarısız** deneme.

Middleware'de yapılamaz — e-posta istek **gövdesindedir** ve middleware gövdeyi okursa
akış tüketilir, controller boş gövde görür. Bu yüzden `AuthController.Login` içinde çağrılır.

- Kontrol **şifre doğrulamasından önce**: bütçe dolduysa doğru şifre de kabul edilmez.
- Yalnızca **başarısız** denemeler permit tüketir. Başarılı girişleri de saymak, birden
  çok cihazdan giren meşru kullanıcıyı kilitlerdi ve saldırgana hiçbir maliyet getirmezdi.
- Anahtar normalize edilir (`trim` + `lower`) — aksi hâlde `Ali@X.com` ile `ali@x.com`
  ayrı kova açar ve sınır sonsuz kez sıfırlanabilirdi.

### 4.5 `AgirIsKapisi` — eşzamanlılık

Hız sınırı "dakikada kaç istek" sorusunu yanıtlar; bu kapı "aynı anda kaç tanesi
bellekte" sorusunu. İkincisi olmadan 10 kullanıcının aynı anda yüklediği 50 MB'lık PDF,
dakikalık kotayı hiç aşmadan sunucuyu düşürebilirdi.

- Aynı anda **4** ağır iş (LLM analizi, PDF ayrıştırma).
- Kapı doluysa **2 saniye** beklenir, sonra `KullaniciHatasi(..., 503)` ile reddedilir.
  Uzun beklemek istekleri biriktirir ve thread tüketir.
- Yer bırakma `finally` içindedir: istisna atan bir iş yerini geri vermezse kapı her
  hatada biraz daralır ve sonunda tamamen kapanır.

### 4.6 Dış API bütçeleri

| İstemci | Zaman aşımı | Yanıt boyutu |
|---|---|---|
| `groq` | 60 sn tavan (çağrı başına 10-60 sn) | 8 MB |
| `google-translate` | 10 sn | 1 MB |

Eskiden analiz ve PDF bölme çağrıları **5 dakika** zaman aşımıyla çalışıyordu: 20
eşzamanlı istek, beş dakika boyunca 20 bağlantı ve 20 thread tutuyordu. Boyut sınırı ise
hiç yoktu — arızalı ya da ele geçirilmiş bir dış servis belleği doldurabilirdi.

---

## 5. `TranslationService` — 664 satır, sistemin beyni

### 5.1 `TranslateSentenceAsync(text)`

Google Translate'in **resmi olmayan** `translate.googleapis.com/translate_a/single`
ucunu `client=gtx` ile çağırır, tarayıcı `User-Agent`'ı taklit eder, `await Task.Delay(50)`
ile kendini yavaşlatır.

```
GET {GT}?client=gtx&sl=auto&tl=tr&dt=t&q={metin}
```

Hata veya HTTP başarısızlığında **özgün metni aynen döner** — `try { … } catch { return text; }`.

> ⚠️ İki risk: (a) resmi olmayan uç herhangi bir zaman kapanabilir/IP engelleyebilir,
> (b) başarısızlık istemciye **sessizce** İngilizce metin olarak döner, kullanıcı çevirinin
> çalıştığını sanır. Bir "çeviri başarısız" sinyali yok.

### 5.2 `TranslateWordAsync(word, context, forceAI)`

Kelimeyi `Regex.Replace(word, @"[^a-zA-Z0-9'\ -]", "").Trim().ToLower()` ile normalize eder.
Boşluk içeriyorsa tip `"kalıp"`, yoksa `GuessType()` ile tahmin edilir.

**`context` verilmişse üç kademe:**

```
1. TranslationCaches'de (QueryText, ContextText) ara
      HIT → "genel|||bağlamsal|||eşanlamlı" parçalanır, 0 maliyetle döner
2. MISS ve forceAI == true ve Groq anahtarı varsa
      → Groq'a JSON şemalı prompt gönderilir:
        { general_meaning, contextual_meaning, synonyms, type }
      → sonuç TranslationCaches'e yazılır
3. Aksi halde Google Translate ile bağlamsız çeviri
```

**`context` yoksa** doğrudan Google Translate (kelime listesindeki hızlı ekleme bunu kullanır).

### 5.3 `GuessType(word)` — kural tabanlı sözcük türü tahmini

Sırayla kontrol eder: artikel listesi → zamir listesi → bağlaç listesi → edat listesi →
`-ly` → zarf → `-ing`/`-ed` → fiil → `tion|ness|ment|ity|…` → isim →
`ful|less|ous|ive|able|…` → sıfat → **varsayılan: isim**.

`MapType(en)` ise Google'ın döndürdüğü İngilizce tür adını Türkçeye çevirir
(`verb`→`fiil`, `noun`→`isim`, …).

### 5.4 `SplitSentences(text)` — cümle bölme

1. Metin **önce satırlara** bölünür (başlıkların paragrafa yapışmasını engellemek için)
2. Her satırda `CHAPTER I THE BEGINNING It was a dark…` gibi birleşmeler regex'le ayrılır
3. Kalan satır şu desenle cümlelere bölünür:

```regex
(?<!\b(Mr|Mrs|Ms|Dr|St|Co|Inc|Ltd|e\.g|i\.e|a\.m|p\.m)\.)(?<=[.!?]["']?)\s+
```

Yani kısaltmalardan sonraki noktalar cümle sonu sayılmaz ✅.

### 5.5 `AnalyzeTextAsync(text)` — ana giriş noktası

```
Groq anahtarı var mı?
  ├─ VAR  → AnalyzeTextWithGroqAsync()
  │           başarısızsa → log + fallback'e düş
  └─ YOK  → fallback
```

**Groq yolu:** tek bir istekle şunları ister — OCR/boşluk hatalarını düzelt, başlıkları
paragraftan ayır, cümlelere böl, Türkçeye çevir, hizalama ve girinti bilgisi üret.
`response_format: { type: "json_object" }` ile JSON garantisi alınır.
İstemci timeout'u **5 dakika**. Token kullanımı `Console.WriteLine` ile loglanır.

**Fallback yolu:** `SplitSentences()` + her cümle için paralel `TranslateSentenceAsync()`.

Her iki yolun sonu `NormalizeAndSeparateHeadings()` — birleşik başlıkları ikinci kez
ayıklar ve `CHAPTER/PART/UNIT/LESSON/BOOK` ile başlayanları `isHeading: true, alignment: center`
yapar. (Aynı regex üç ayrı yerde tekrarlanıyor: `SplitSentences`, `NormalizeAndSeparateHeadings`
ve frontend'deki `normalizeSentences` — bkz. Teknik borç.)

### 5.6 🔴 Bilinen sorunlar

> ✅ **KURAL-06 (2026-08-25) ile kapanan iki madde bu listeden çıkarıldı:**
> `TranslateSentenceAsync` artık `CeviriSonucu { Metin, Basarili, Kaynak }` döner —
> çeviri patladığında özgün İngilizce metni "Türkçe çeviri" diye sessizce geri
> vermiyor. Önbellek okuma/yazma hataları da yutulmuyor; `ILogger` ile `Warning`
> seviyesinde loglanıyor (yazma hatası "kota harcandı ama sonuç kaydedilmedi"
> notuyla). Servisteki 13 `Console.WriteLine` `ILogger<TranslationService>`'e taşındı.

| # | Sorun | Nerede | Etki |
|---|---|---|---|
| 1 | `var sentTrs = sentTask.Result;` — async metot içinde **bloklayan `.Result`** | `AnalyzeTextAsync` fallback yolu | Thread-pool açlığı; yük altında deadlock riski. `await Task.WhenAll(...)` olmalı |
| 2 | Analiz edilen kelimelerin **hepsi `Type = "default"`** | Hem Groq hem fallback yolu | `globals.css`'teki `.word-isim`, `.word-fiil` … renkleri okuyucuda **hiç devreye girmiyor**; tüm kelimeler aynı renkte. `GuessType()` sadece kelime kartında kullanılıyor |
| 3 | `AnalyzedWord.Translation = w` (kelimenin kendisi) | Aynı | Kelime çevirileri JSON'a hiç yazılmıyor; her tıklamada API çağrısı gerekiyor. Yorum bunu kabul ediyor: *"Çeviriyi anlık tıklama (lazy) bırakıyoruz, hız kazanmak için"* |
| 4 | `TranslationCache` yazımında yarış durumu | Cache write | Unique index olmadığı için aynı çift için mükerrer satırlar |
| 5 | Groq prompt'una **kullanıcı metni doğrudan** ekleniyor | `AnalyzeTextWithGroqAsync` | Prompt injection: PDF içeriği modele talimat verebilir. Etki sınırlı (çıktı sadece görüntüleniyor) ama bilinmeli |

---

## 6. `PdfService`

### Doğrulamalar — `Files/DosyaDogrulayici.cs` (KURAL-10)

Tür artık **dosya adından değil, içerikten** belirlenir. Tüm yükleme yolları bu
tek sınıftan geçer; `PdfService` kendi uzantı/boyut listesini tutmuyor.

```csharp
EnBuyukBoyut         = 100 MB     // sıkıştırılmış
EnBuyukAcilmisBoyut  = 400 MB     // DOCX açıldığında (zip-bomb)
EnCokSayfa           = 1500       // tek seferde seçilebilecek sayfa
AyristirmaSuresi     = 180 sn     // ayrıştırma bütçesi
```

| Aşama | Ne yapar |
|---|---|
| 1 | Boyut ve uzantı — **ucuz ilk eleme** |
| 2 | Sihirli baytlar (`%PDF-`, `PK\x03\x04`) — **belirleyici karar** |
| 3 | Uzantı ile içerik uyuşuyor mu (`kitap.pdf` içinde DOCX olamaz) |

> `Content-Type` başlığına **hiç bakılmaz**: dosya adı kadar sahtedir, istemci yazar.
>
> ⚠️ `EnCokSayfa` tek başına değiştirilemez: `AlanSinirlari.SayfaSecimiParcaSayisi`
> bir `.Take()` içinde kullanılıyor ve `SayfaSecimiMetni` seçim dizesinin karakter
> sınırı. Üçü birlikte hareket etmezse seçim **sessizce kırpılır** — 1500 sayfa
> seçilir, 500'ü işlenir, kullanıcıya hiçbir uyarı gitmez.
>
> ✅ **KURAL-06:** doğrulama hataları `KullaniciHatasi` fırlatır; ayrıştırıcı çağrıları
> `PdfAc()` / `DocxAc()` / `ArsivAc()` ile sarmalandı. Bozuk bir dosya kullanıcı-tetiklemeli
> **500** değil anlamlı bir **400** üretir — ham kütüphane istisnası dışarı çıkmaz.

### Zip-bomb koruması

DOCX bir ZIP arşividir. `ZipBombKontrolu` iki aşamalıdır:

1. Merkezî dizinde **bildirilen** açılmış boyut toplamı — **yük taşıyan kontrol budur**
2. **Gerçekten açılan** bayt sayısı — yedek

"Bildirilen boyutu saldırgan yazar" itirazı bu yığında ölçüldü ve geçerli değil:
.NET'in `ZipArchive`'ı bildirilen boyutu `DeflateStream`'e üst sınır olarak veriyor,
yani 0 diye bildiren 300 MB'lık bir bomba 0 bayt teslim ediyor. Bu davranış
`Boyutunu_yalan_soyleyen_zip_bildirdiginden_fazlasini_teslim_edemez` testiyle
sabitlendi; değişirse 2. aşama yükü devralır.

### `ExtractTextFromPage(page)` — iki aşamalı strateji

```csharp
var rawText = page.Text;
if (!string.IsNullOrWhiteSpace(rawText) && rawText.Contains(" "))
    return rawText;                                  // 1. tercih: paragraf düzenini korur
return string.Join(" ", page.GetWords().Select(w => w.Text));   // 2. tercih: koordinat tabanlı
```

Bu, "kelimelerin birbirine yapışması" sorununa karşı geliştirilmiş bir çözümdür
(commit `b4bb00e` ve `24e4b36` civarı).

### DOCX işleme

`WordprocessingDocument` ile tüm `Paragraph` düğümlerinin `InnerText`'i `\n\n` ile birleştirilir.
**Sayfa kavramı yok** — `ExtractAndSplitAsync` içinde her **400 kelime** yapay bir "sayfa"
sayılır.

`ExtractDocxText` DOCX işlemenin **tek boğazıdır**; zip-bomb kontrolü çağrı yerlerine
dağıtılmak yerine burada durur, böylece ileride eklenecek bir yol kontrolü atlayamaz.

> ✅ **KURAL-10 (davranış değişikliği, 2026-09-01 güncellendi):** DOCX'te sayfa seçimi
> **okunmaz**; belge `DocxSayfalaraBol` ile **400 kelimelik sayfalara bölünür** ve
> tamamı kaydedilir. Sayfa sonu bir Word belgesinin özelliği değildir — yazı tipine
> ve yazıcı ayarına göre değişir, istemci bilemez.
>
> Bölme mantığı **tek kaynakta**: `books/upload` ve `books/upload-pages` aynı yardımcıyı
> kullanır. Eskiden yalnızca birincisi bölüyordu; ikincisi tüm belgeyi tek parça
> kaydediyor, yani iki uç aynı dosyadan farklı sonuç üretiyordu.
>
> Panelde DOCX için sayfa seçici gösterilmez (`pdfDoc` boş kalır); yerine
> "belgenin tamamı yüklenecek ve otomatik sayfalara bölünecek" bilgisi çıkar.

### Bölümlere ayırma — `SplitIntoChaptersWithGroqAsync`

1. Her sayfanın ilk ~3 satırı / 250 karakteri toplanır ve LLM'e "bölüm başlığı olan
   sayfaları ve başlıklarını söyle" diye sorulur
2. Dönen `{ pageNumber, title }` listesi sıralanır; ilk bölüm 1. sayfada başlamıyorsa
   başa bir `Introduction` eklenir
3. Bölüm sınırları arasındaki sayfalar birleştirilir

**Başarısızlıkta** `SplitIntoChaptersRegex`:

```regex
^(chapter|bölüm|part|section|bölüm\s+\d+|kısım)\s+(\d+|[ivxlcdm]+)[:\.\s]|^([0-9]+\.\s+[A-Z][a-zA-Z\s]{3,30})$
```

Hiç başlık bulunamazsa **her 20 sayfa bir bölüm** yapılır (`Part 1`, `Part 2`, …).

> Not: Sınıf/metot isimleri hâlâ `GeminiChapterInfo`, `GeminiChaptersResult` —
> proje Gemini'den Groq'a geçtiğinde (commit `fef53a9`) yeniden adlandırılmamış.
> `docker-compose.yml`'deki `GEMINI_API_KEY` de aynı kalıntıdır.

---

## 7. `QuizGeneratorService`

**Yapay zekâ kullanmaz.** İki tür soru üretir:

**A) Kelime tanıma:** Bölümdeki 5 harften uzun kelimeler karıştırılır, dörderli gruplanır:
> *"Which word appears in the text of 'Chapter 1'?"* → 4 şık, biri doğru

**B) Boşluk doldurma:** 30 karakterden uzun bir cümle seçilir, 3. kelimesi `______` yapılır,
üç çeldirici eklenir.

```csharp
var sent  = sentences.First(s => s.Length > 30);   // ⚠️ InvalidOperationException riski
var blank = sent.Split(' ').Skip(2).First();       // ⚠️ 3 kelimeden kısa cümlede patlar
```

### Kalite sorunları

| Sorun | Açıklama |
|---|---|
| A tipi soru **anlamı ölçmüyor** | Metni okumadan da kelime dağarcığıyla tahmin edilebilir; çeldiriciler de aynı metinden geldiği için hepsi "metinde geçen kelime" |
| `options.IndexOf(correctWord)` | Aynı kelime iki kez düşerse yanlış indeks; `-1` dönerse `letters[-1]` → **IndexOutOfRange** |
| `.First(s => s.Length > 30)` | Kısa bölümlerde istisna fırlatır → 500 |
| Toplam soru sayısı | `count` isteniyor ama `Math.Min(count, words.Count / 4)` + 1 → genelde 5'ten az |
| Bir kez üretilir | `Quiz` kaydı oluştuktan sonra asla yenilenmez; kitap içeriği değişse bile eski sorular kalır |

Bu servis, projede **yapay zekâ ile değiştirilmeye en açık** parçadır — `TranslationService`
zaten Groq bağlantısına sahip.

---

## 8. Controller'lardaki tekrar eden desenler

### `CurrentUserId`

Beş ayrı controller'da birebir aynı satır tekrarlanıyor:

```csharp
private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
```

> ⚠️ `!` null-forgiving operatörü ve `int.Parse` — claim yoksa `ArgumentNullException`,
> sayı değilse `FormatException` → **500**. `[Authorize]` sayesinde pratikte olmaz, ama
> `ControllerBase` uzantısı veya taban sınıf olarak toplanıp `TryParse` kullanılmalı.

### `Details`/`Context` uzunluk doğrulaması yok

`AddWord`, `LogActivity`, `CreateFeedback` — hepsi `MaxLength` özniteliğine güveniyor ama
**EF Core `MaxLength`'i doğrulamaz**, sadece kolonu `varchar(n)` yapar. Uzun değer
PostgreSQL'de `22001` hatası → yakalanmamış istisna → 500.

Doğru çözüm: DTO'lara `[StringLength]` ekleyip `ModelState.IsValid` kontrolü yapmak
(veya `[ApiController]` otomatik doğrulamasının devreye girmesi için `[Required]`/`[StringLength]`
özniteliklerini istek sınıflarına koymak).

### Sessiz başarı

`AddWord`, `Join`, `AssignBook`, `DeleteWord` — hiçbir şey yapmasalar bile `200 { success: true }`
döner. İstemci "eklendi" der ama eklenmemiş olabilir. Bu bilinçli bir idempotency tercihidir,
ancak `AddWord` örneğinde kullanıcı **mevcut çeviriyi güncelleyemez** — sessizce yok sayılır.
