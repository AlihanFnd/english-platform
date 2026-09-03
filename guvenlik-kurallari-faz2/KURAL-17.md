# KURAL-17 — Maliyetli iş ve paylaşılan yazma

> **Ön koşul:** Faz 1 kapalı. Diğer faz-2 kurallarından bağımsız yürütülebilir.

---

## Kural metni

> **Bir ucun PARA harcadığı ya da BAŞKALARININ gördüğü veriyi değiştirdiği,
> ucun tanımında açıkça yazılı olacak.** Ücretli bir dış API çağıran her yol
> en dar kotaya bağlanacak; paylaşılan (kullanıcıya ait olmayan) veriyi yazan
> her uç yetki kontrolünden geçecek; ve durum değiştiren hiçbir iş `GET`
> üzerinden yapılmayacak. Bir kapı, bu üç sınıflandırmadan geçmemiş yeni bir
> ucun eklenmesini engelleyecek.

---

## Envanter

Ölçüm tarihi: **2026-09-02**, commit `03b8adc`.

### İhlal 1 — Aynı buton, iki farklı kota 🟠

Okuma ekranındaki tek bir "yeniden analiz et" butonu (`handleReanalyze`,
`frontend/app/books/[id]/page.tsx:161`) kitabın biçimine göre **iki farklı
uca** gidiyor:

```
$ grep -n "handleReanalyze" -A10 frontend/app/books/\[id\]/page.tsx | grep -E "readPage|analyzeText"
        const pd = await api.readPage(bookId, currentPage, true);   ← sayfa modu
        const a  = await api.analyzeText(chapter.content);          ← bölüm modu
```

| Yol | Uç | Politika | Dakikada |
|---|---|---|---|
| Bölüm modu | `POST /translate/analyze` | `AgirAnaliz` — *"LLM maliyeti — en dar kova"* | **20** |
| Sayfa modu | `GET /books/{id}/read?reanalyze=true` | `Okuma` — *"elle yazılan sayaçtan devralındı"* | **60** |

```
$ grep -n "AgirAnalizDk\|OkumaDk" EnglishReadingPlatform/RateLimiting/HizSinirlari.cs
24:    public const int OkumaDk      = 60;
26:    public const int AgirAnalizDk = 20;
```

İkisi de **aynı işi** yapıyor: bir metin bloğunu Groq'a gönderip cümle cümle
analiz ettiriyor. KURAL-07, `books/{id}/read` ucunu "okuma" diye
sınıflandırdı — `reanalyze` bayrağının onu bir LLM ucuna çevirdiğini
görmedi. Sonuç: **kotanın üç katı.**

Sayfa boyutu ölçüldü:

```
$ SELECT AVG(length("Content"))::int, MAX(length("Content")) FROM "BookPages";
ortalama=1696 karakter · en büyük=3181 karakter
```

Rol kısıtı yok — sınıf düzeyinde yalnızca `[Authorize]`. Yani giriş yapmış
herhangi bir öğrenci **saatte ~3600 tam sayfa analizi** tetikleyebilir.

### İhlal 2 — Paylaşılan veriye yetkisiz yazma 🟠

```
$ grep -n "class BookPage" -A10 EnglishReadingPlatform/Models/AppModels.cs
164:    public class BookPage
167-        public int BookId { get; set; }
169-        public int PageNumber { get; set; }
171-        public string Content { get; set; } = "";
173-        public string SentencesJson { get; set; } = "[]";
                                          ↑ UserId YOK — kayıt GLOBAL
```

```
$ sed -n '203,212p' EnglishReadingPlatform/Controllers/BooksController.cs
                if (reanalyze || string.IsNullOrWhiteSpace(currentPage.SentencesJson) …)
                {
                    var sentencesData = await _transService.AnalyzeTextAsync(currentPage.Content);
                    if (sentencesData.Any())
                        currentPage.SentencesJson = JsonSerializer.Serialize(sentencesData);   ← ÜZERİNE YAZAR
                }
```

`BookPage` **global**: tüm kullanıcılar aynı satırı okur. Yani bir öğrencinin
bastığı buton, **bütün kullanıcıların gördüğü** çeviri analizini değiştiriyor.
Bölüm modunda aynı buton hiçbir şeyi kalıcılaştırmıyor — yani **aynı arayüz
eylemi, kitabın biçimine göre farklı bir etki yarıçapına sahip.**

Model boş sonuç dönerse üzerine yazılmıyor (`if (sentencesData.Any())`),
yani tamamen silinme riski yok. Ama başarılı-fakat-daha-kötü bir sonuç
herkesin okuduğu içeriği bozar.

### İhlal 3 — Durum değiştiren `GET` uçları 🟡

```
$ python3 <HttpGet blokları içinde SaveChanges arayan tarama>
  BooksController.cs   GET {id}/read           → Read      (ReadingProgress yazar + LLM)
  BooksController.cs   GET quiz/{chapterId}    → GetQuiz   (Quiz + sorular yaratır)
```

Çerez `SameSite=Lax`. Lax, **üst düzey GET gezinmesinde** çerezi gönderir.
`<img>`/`<iframe>` ile sömürülemez (bunlar üst düzey gezinme değil) ama
kurbanın yönlendirilmesiyle tetiklenir. Tek başına düşük etkili;
**İhlal 1 ile birleşince** kurbanın hesabından Groq maliyeti yaratır.

### İhlal 4 — Maliyet sınıflandırması ve kapısı yok 🔴

```
$ grep -rn "api.groq.com" EnglishReadingPlatform --include="*.cs" | wc -l
       5
$ grep -rln "Groq\|AgirAnaliz" scripts/guard/07-hiz-siniri.sh
scripts/guard/07-hiz-siniri.sh
```

KURAL-07'nin kapısı `[EnableRateLimiting]` **varlığını** denetliyor
(`HizSiniriSozlesmesiTests` yazma uçlarını zorunlu tutuyor) ama
**hangi politikanın doğru olduğunu** denetlemiyor. Bir uç `Yazma`
yerine `Okuma` politikasına bağlanırsa kapı bunu görmez.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | LLM yolu yanlış kotada | 1 uç (3 kat gevşek) |
| 2 | Paylaşılan veriye yetkisiz yazma | 1 uç, global tablo |
| 3 | Durum değiştiren GET | 2 uç |
| 4 | Maliyet sınıflandırması yok | 5 LLM çağrı noktası, 0 kapı |
| | **TOPLAM** | **9 nokta** |

---

## Merkezî uygulama

### 1. Maliyet ve etki bildirimi — `RateLimiting/UcNitelikleri.cs`

```csharp
namespace EnglishReadingPlatform.RateLimiting;

/// <summary>
/// KURAL-17: Bu uç ÜCRETLİ bir dış API çağırıyor.
///
/// Neden bir attribute: maliyet, kod okunarak keşfedilen bir özellik olmamalı.
/// KURAL-07 'books/{id}/read' ucunu "okuma" diye sınıflandırdı çünkü ucun
/// LLM çağırdığı yalnızca bir sorgu parametresinin (reanalyze) arkasında
/// görünüyordu. Bildirim zorunlu olunca bu tür yollar SAKLANAMAZ.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class ParaHarcarAttribute : Attribute
{
    public ParaHarcarAttribute(string servis, string kosul = "her istekte")
    {
        Servis = servis; Kosul = kosul;
    }
    public string Servis { get; }
    /// <summary>Hangi koşulda harcıyor — ör. "reanalyze=true iken".</summary>
    public string Kosul { get; }
}

/// <summary>
/// KURAL-17: Bu uç, ÇAĞIRANA AİT OLMAYAN (paylaşılan) veriyi yazıyor.
/// Yetki kontrolü zorunludur; sözleşme testi bunu denetler.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class PaylasilanVeriYazarAttribute : Attribute
{
    public PaylasilanVeriYazarAttribute(string tablo, string gerekenRol)
    {
        Tablo = tablo; GerekenRol = gerekenRol;
    }
    public string Tablo { get; }
    public string GerekenRol { get; }
}
```

### 2. `BooksController.Read` — üç düzeltme birden

```csharp
// GET /api/books/{id}/read?chapter=1&page=1&reanalyze=false
//
// KURAL-17: 'reanalyze' bu ucu bir LLM ucuna çevirir.
// Kotayı bayrağa göre DEĞİŞTİREMEYİZ ([EnableRateLimiting] statiktir),
// bu yüzden pahalı yol AYRI BİR UCA taşındı:
//     POST /api/books/{id}/reanalyze
// Bu uç artık yalnızca okur ve ilerleme yazar.
[HttpGet("{id}/read")]
[EnableRateLimiting(HizSinirlari.Okuma)]
public async Task<IActionResult> Read(int id, int chapter = 1, int page = 1)
{
    // … reanalyze parametresi KALDIRILDI …
    // JIT analiz yalnızca SentencesJson HİÇ YOKKEN çalışır (ilk okuma).
    // Bu, kullanıcı başına kitap sayfası kadar; tekrarlanabilir değil.
}
```

```csharp
// POST /api/books/{id}/reanalyze
//
// KURAL-17 — üç ayrı sebep, tek uçta:
//   1) PARA HARCAR → en dar kotaya (AgirAnaliz) bağlandı
//   2) PAYLAŞILAN VERİ YAZAR → BookPage global, yetki gerekir
//   3) DURUM DEĞİŞTİRİR → GET değil POST
[HttpPost("{id}/reanalyze")]
[Authorize(Policy = "EgitmenVeyaAdmin")]        // ← 00 madde 3, seçenek A
[EnableRateLimiting(HizSinirlari.AgirAnaliz)]
[ParaHarcar("Groq", "her istekte")]
[PaylasilanVeriYazar("BookPages.SentencesJson", "teacher|admin")]
public async Task<IActionResult> YenidenAnalizEt(
    [Range(1, int.MaxValue)] int id,
    [FromQuery][Range(1, int.MaxValue)] int page = 1)
{
    var sayfa = await _db.BookPages
        .FirstOrDefaultAsync(p => p.BookId == id && p.PageNumber == page);
    if (sayfa is null) return NotFound(new { error = "Sayfa bulunamadı." });

    var cumleler = await _transService.AnalyzeTextAsync(sayfa.Content);

    // Boş sonuç mevcut analizi EZMEZ: başarısız bir LLM çağrısı,
    // herkesin okuduğu içeriği silmemeli.
    if (cumleler.Count == 0)
        return StatusCode(502, new { error = "Analiz şu anda yapılamadı. Lütfen tekrar deneyin." });

    sayfa.SentencesJson = JsonSerializer.Serialize(cumleler);
    await _db.SaveChangesAsync();

    _logger.LogInformation(
        "Sayfa yeniden analiz edildi. KitapId={KitapId} Sayfa={Sayfa} KullaniciId={Id}",
        id, page, this.KullaniciId());

    return Ok(new { success = true, sentencesJson = sayfa.SentencesJson });
}
```

> **`EgitmenVeyaAdmin` politikası ilk kez bir uca bağlanıyor.**
> Bu, KURAL-16'nın kapattığı mayının patlama anıdır: rol kayıtta
> seçilebilir kalsaydı, herkes bu uca erişirdi.
> **KURAL-16 kapanmadan bu satırı yazmayın** — ya da bu kuralı 16'dan sonraya alın.

### 3. `GetQuiz` — GET'ten yazmayı çıkar

```csharp
// GET /api/books/quiz/{chapterId} — yalnızca OKUR.
// Quiz yoksa 404 döner; üretmek için POST gerekir.
// KURAL-17: quiz üretimi bir yazma işlemidir ve GET, üst düzey gezinmeyle
// tetiklenebilir (SameSite=Lax çerezi gönderir).

// POST /api/books/quiz/{chapterId}
[HttpPost("quiz/{chapterId}")]
[EnableRateLimiting(HizSinirlari.Yazma)]
public async Task<IActionResult> QuizUret(int chapterId) { … }
```

### 4. İlerleme yazımı — GET'ten çıkar

```csharp
// POST /api/books/{id}/progress
// KURAL-17: 'read' artık SALT OKUNUR. İlerleme kaydı ayrı bir POST'tur.
// İstemci sayfayı gösterdikten sonra bunu çağırır.
[HttpPost("{id}/progress")]
[EnableRateLimiting(HizSinirlari.Yazma)]
public async Task<IActionResult> IlerlemeKaydet([FromBody] IlerlemeIstegi req)
    => Ok(await IlerlemeyiYazAsync(req.BookId, req.Konum, req.Yuzde));   // KURAL-12'den
```

---

## Otomatik kapı

### A) Sözleşme testi — `MaliyetSozlesmesiTests.cs`

```csharp
/// <summary>
/// SÖZLEŞME: Groq çağıran her uç, LLM kotasına bağlı olmalı.
/// Yansıma (reflection) ile bütün uçlar taranır — yeni bir uç eklendiğinde
/// kimse hatırlatmasa da bu test onu yakalar.
/// </summary>
[Fact] [Trait("Category", "Maliyet")]
public void Para_harcayan_her_uc_EN_DAR_kotada()
{
    var ihlaller = TumUclar()
        .Where(m => m.GetCustomAttribute<ParaHarcarAttribute>() is not null)
        .Where(m =>
        {
            var kota = m.GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName;
            return kota != HizSinirlari.AgirAnaliz && kota != HizSinirlari.Ceviri;
        })
        .Select(m => $"{m.DeclaringType!.Name}.{m.Name}")
        .ToList();

    ihlaller.Should().BeEmpty(
        "ücretli dış API çağıran uç, genel 'okuma' ya da 'yazma' kotasına bağlanamaz");
}

/// <summary>
/// SÖZLEŞME (ters yön): Groq çağıran ama BİLDİRMEYEN uç olmamalı.
/// Yukarıdaki test yalnızca bildirilmişleri denetler; asıl risk
/// bildirilmemiş olandır — 'reanalyze' tam olarak öyleydi.
/// </summary>
[Fact] [Trait("Category", "Maliyet")]
public void Groq_cagiran_her_yol_BILDIRILMIS_olmali()
{
    // TranslationService/PdfService'in LLM metotlarını çağıran denetleyici
    // metotları çağrı grafiğinden çıkarmak yerine, kaynak taramasıyla:
    // AnalyzeTextAsync / TranslateWordAsync çağıran her denetleyici metodu
    // [ParaHarcar] taşımalı.
}

[Fact] [Trait("Category", "Maliyet")]
public void Paylasilan_veri_yazan_uc_YETKI_ister()
{
    var ihlaller = TumUclar()
        .Where(m => m.GetCustomAttribute<PaylasilanVeriYazarAttribute>() is not null)
        .Where(m => m.GetCustomAttribute<AuthorizeAttribute>()?.Policy is null
                 && m.DeclaringType!.GetCustomAttribute<AuthorizeAttribute>()?.Roles is null)
        .Select(m => $"{m.DeclaringType!.Name}.{m.Name}")
        .ToList();

    ihlaller.Should().BeEmpty("paylaşılan veriyi herkes yazamaz");
}

/// <summary>
/// ANA REGRESYON: hiçbir GET ucu veri yazmamalı.
/// SameSite=Lax çerezi üst düzey GET gezinmesinde GÖNDERİR.
/// </summary>
[Fact] [Trait("Category", "Maliyet")]
public void Hicbir_GET_ucu_veri_YAZMAZ()
{
    // Kaynak taraması: [HttpGet] bloğu içinde SaveChangesAsync /
    // BenzersizKaydetAsync / ExecuteDelete / .Add( / .Remove( geçmemeli.
}

[Fact] [Trait("Category", "Maliyet")]
public async Task Ogrenci_paylasilan_analizi_YENIDEN_URETEMEZ()
{
    var client = _fabrika.CreateClient();
    var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
    client.TokenIle(o.Token);

    var yanit = await client.PostAsync("/api/books/1/reanalyze?page=1", null);

    yanit.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.Unauthorized);
}

[Fact] [Trait("Category", "Maliyet")]
public async Task Basarisiz_analiz_mevcut_veriyi_EZMEZ()
{
    // Groq anahtarı testlerde boş → AnalyzeTextAsync boş liste döner.
    // Uç 502 dönmeli ve SentencesJson DEĞİŞMEMELİ.
}
```

### B) Guard script — `scripts/guard/17-maliyet.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[17] Maliyetli iş ve paylaşılan yazma"

# 1. GET bloğu içinde yazma çağrısı var mı? (yapısal kesme — faz 1 dersi 2)
cikti="$(python3 - <<'PY'
import re, glob
bulunan = []
for yol in glob.glob("EnglishReadingPlatform/Controllers/*.cs"):
    src = open(yol, encoding="utf-8").read()
    for p in re.split(r'\n(?=\s*\[Http)', src):
        if not re.match(r'\s*\[HttpGet', p): continue
        govde = "\n".join(s for s in p.split("\n") if not s.strip().startswith("//"))
        if re.search(r'SaveChangesAsync|BenzersizKaydetAsync|ExecuteDelete', govde):
            m = re.search(r'public\s+async\s+Task<IActionResult>\s+(\w+)', p)
            bulunan.append(f"{yol.split('/')[-1]} → {m.group(1) if m else '?'}")
print("\n".join(bulunan))
PY
)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "durum değiştiren GET ucu" "$n" "$cikti"

# 2. 'reanalyze' sorgu parametresi geri geldi mi?
cikti="$(depoda_ara 'reanalyze' 'EnglishReadingPlatform/**/*.cs' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "reanalyze GET parametresi" "$n" "$cikti"

# 3. LLM çağıran servis metodunu kullanan denetleyici, ParaHarcar taşıyor mu?
eksik=""
for m in AnalyzeTextAsync; do
  for dosya in $(grep -rl "$m" EnglishReadingPlatform/Controllers/ 2>/dev/null); do
    grep -q "ParaHarcar" "$dosya" || eksik="${eksik}${dosya} ($m)"$'\n'
  done
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "bildirilmemiş LLM maliyeti" "$n" "$eksik"

# 4. Nitelik dosyası duruyor mu?
n=0; [ -f EnglishReadingPlatform/RateLimiting/UcNitelikleri.cs ] || n=1
ihlal_bildir "maliyet/etki nitelikleri mevcut" "$n" "UcNitelikleri.cs yok"

# 5. Sözleşme testi duruyor mu?
n=0; [ -f EnglishReadingPlatform.Tests/MaliyetSozlesmesiTests.cs ] || n=1
ihlal_bildir "maliyet sözleşme testi mevcut" "$n" "test dosyası silinmiş"

guard_bitir
```

---

## Bitti kriteri

```bash
# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 6
dotnet test Linguza.sln --filter "Category=Maliyet" --logger "console;verbosity=normal"

# 2) Guard — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/17-maliyet.sh; echo "çıkış kodu: $?"

# 3) Durum değiştiren GET kalmadı — BEKLENEN: 0
bash scripts/guard/17-maliyet.sh 2>&1 | grep "durum değiştiren GET"

# 4) reanalyze parametresi kalmadı — BEKLENEN: 0
git grep -c "reanalyze" -- 'EnglishReadingPlatform/*' || echo 0

# 5) İstemciler derleniyor
cd frontend && npx tsc --noEmit; echo "frontend: $?"; cd ..
cd admin-panel && npx tsc --noEmit; echo "admin: $?"; cd ..

# 6) TÜM kapılar — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 7) TÜM testler (KURAL-07 ve KURAL-12 regresyonu!)
dotnet test Linguza.sln --logger "console;verbosity=normal"

# 8) TARAYICIDA: kitap aç → ilerleme kaydediliyor mu? → öğretmenle
#    yeniden analiz çalışıyor mu? → öğrenciyle buton görünmüyor mu?
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — yeniden analiz ucunu gevşek kotaya al
#   .Okuma yap → Para_harcayan_her_uc_EN_DAR_kotada KIRMIZI

# MUTASYON B — yetki politikasını kaldır
#   [Authorize(Policy = "EgitmenVeyaAdmin")] sil
#   → Paylasilan_veri_yazan_uc_YETKI_ister + Ogrenci_..._URETEMEZ KIRMIZI

# MUTASYON C — GET'e yazma geri koy
python3 - <<'PY'
yol = "EnglishReadingPlatform/Controllers/BooksController.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("        [HttpGet(\"{id}/read\")]",
              "        [HttpGet(\"{id}/read\")]   // MUTASYON C hazırlığı")
open(yol, "w", encoding="utf-8").write(k)
PY
# Read metoduna bir SaveChangesAsync ekle → guard 1 KIRMIZI, test KIRMIZI

# MUTASYON D — boş analiz korumasını kaldır
#   if (cumleler.Count == 0) return 502  →  kaldır
#   → Basarisiz_analiz_mevcut_veriyi_EZMEZ KIRMIZI
#   ← Bu mutasyon, "başarısız LLM çağrısı herkesin içeriğini silmez"
#     güvencesinin gerçekten test edildiğini kanıtlar
```

Her mutasyondan sonra:
```bash
grep -c "MUTASYON" <dosya>          # uygulandığını DOĞRULA
git checkout <dosya>
dotnet test Linguza.sln --filter "Category=Maliyet"    # BEKLENEN: Başarısız: 0
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | 🔴 **00 madde 3 kararını oku** (A/B/C) — yoksa **A** | — | rapora yaz |
| 2 | `RateLimiting/UcNitelikleri.cs` | 1 | derlenir |
| 3 | `POST /books/{id}/reanalyze` ucu (yetki + dar kota + nitelikler) | 1 | test yeşil |
| 4 | `Read`'den `reanalyze` parametresini KALDIR | 1 | guard 2 → 0 |
| 5 | `Read`'den ilerleme yazımını çıkar → `POST /books/{id}/progress` | 2 | guard 1 → 0 |
| 6 | `GetQuiz`'den üretimi çıkar → `POST /books/quiz/{chapterId}` | 2 | guard 1 → 0 |
| 7 | `api.ts`: `reanalyzePage`, `saveProgress`, `createQuiz` | 3 | tsc 0 hata |
| 8 | Okuma ekranı: ilerleme POST'u, yeniden analiz butonu **role göre gizle** | 2 | tarayıcı |
| 9 | `MaliyetSozlesmesiTests.cs` | — | 6 test yeşil |
| 10 | `scripts/guard/17-maliyet.sh` + `chmod +x` | — | çıkış kodu 0 |
| 11 | Tarayıcıda uçtan uca (öğrenci + öğretmen) | — | 🧍 insan |
| 12 | `docs/03-API-REFERANSI.md` üç yeni uç | — | — |

### 🔴 Adım 5–6 KIRICI DEĞİŞİKLİKTİR

`GET /read`'in artık ilerleme yazmaması ve `GET /quiz` in artık quiz üretmemesi
**istemci sözleşmesini değiştirir**. Eski bir istemci sürümü canlıdaysa
ilerleme kaydı sessizce durur.

Sıra: **önce istemciyi yeni uçları çağıracak şekilde dağıt, sonra backend'i.**
Ya da geçiş süresince `GET /read` ilerlemeyi yazmaya devam etsin ve bir
kaldırma tarihi belirlensin — o zaman guard 1'e geçici bir istisna eklenir
**ve istisnanın kaldırılma tarihi yorumda yazılır.**

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **Kotayı bayrağa göre seçmeye çalışmak** | `[EnableRateLimiting]` derleme zamanı sabittir; çalışma zamanında değişmez | Pahalı yol AYRI UÇ olur |
| **KURAL-16'dan önce `EgitmenVeyaAdmin`'i bağlamak** | Rol kayıtta seçilebilirken herkes "öğretmen" olup uca erişir — mayın patlar | 16'yı önce kapat, ya da 17'yi 16'dan sonra çalıştır |
| **Boş analiz sonucunu yazmak** | Başarısız bir LLM çağrısı herkesin okuduğu içeriği siler | `Count == 0` → 502; MUTASYON D ölçüyor |
| **`GET /read`'i tek adımda kırmak** | Canlı istemci ilerleme kaydetmeyi sessizce bırakır | Adım 5–6 notu: önce istemci |
| **Yalnızca `[ParaHarcar]` taşıyanları denetlemek** | Asıl risk bildirilmemiş olandır (`reanalyze` böyleydi) | İki yönlü test: bildirilen + bildirilmeyen |
| **Butonu arayüzden gizleyip backend'i açık bırakmak** | Yetki istemcide olmaz; `curl` yeterlidir | `[Authorize(Policy=…)]` zorunlu; test öğrenciyle 403 bekliyor |
| **KURAL-07'nin kapısına güvenmek** | O kapı `[EnableRateLimiting]` **varlığını** denetler, doğru politikayı değil | Bu kuralın sözleşme testi politikayı da denetliyor |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri çıktısı> · <MUTASYON A, B, C, D>
<tarayıcı: öğrenci butonu görmüyor, öğretmen görüyor ve çalışıyor>

## 2. Kapanmadı
- 00 madde 3 kararı: <A/B/C — hangisi uygulandı>
- <geçiş dönemi istisnası varsa: hangi uç, hangi tarihe kadar>

## 3. İnsan müdahalesi gerekiyor
- [ ] `reanalyze` yetkisi kararı (A/B/C)
- [ ] Dağıtım sırası: istemci önce mi gitti?
- [ ] Groq faturası izleniyor mu? (bu kural harcamayı 3 kat düşürmeli)
```
