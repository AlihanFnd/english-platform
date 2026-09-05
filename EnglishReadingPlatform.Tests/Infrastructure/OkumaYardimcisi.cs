using System.Net.Http.Json;

namespace EnglishReadingPlatform.Tests.Infrastructure;

/// <summary>
/// KURAL-17 sonrası okuma akışı, İSTEMCİNİN yaptığı iki adımdır:
/// önce salt okunur GET, sonra ilerlemeyi kaydeden POST.
///
/// Neden tek yerde: bu iki adımı altı ayrı test dosyasına kopyalamak, birini
/// güncelleyip diğerini unutma riskini altıya katlardı. Testler bu yardımcıyı
/// çağırdığı için ölçtükleri şey değişmedi — yalnızca ARADAKİ sözleşme değişti.
/// </summary>
public static class OkumaYardimcisi
{
    /// <summary>
    /// Bir sayfayı okur ve ilerlemeyi kaydeder. Okuma ucunun döndürdüğü
    /// PageNumber kullanılır — istemci de öyle yapar.
    /// </summary>
    public static async Task<HttpResponseMessage> SayfaOkuVeKaydetAsync(
        this HttpClient c, int kitapId, int? sayfa = null)
    {
        var yol = sayfa is null
            ? $"/api/books/{kitapId}/read"
            : $"/api/books/{kitapId}/read?page={sayfa}";

        var yanit = await c.GetAsync(yol);
        if (!yanit.IsSuccessStatusCode) return yanit;

        var govde = await GovdeyiTekrarOkunurYapAsync<OkumaKonumu>(yanit);
        if (govde is not null)
            await c.PostAsJsonAsync($"/api/books/{kitapId}/progress",
                new { bookId = kitapId, konum = govde.PageNumber });

        return yanit;
    }

    /// <summary>Bir bölümü okur ve ilerlemeyi kaydeder.</summary>
    public static async Task<HttpResponseMessage> BolumOkuVeKaydetAsync(
        this HttpClient c, int kitapId, int? bolum = null)
    {
        var yol = bolum is null
            ? $"/api/books/{kitapId}/read"
            : $"/api/books/{kitapId}/read?chapter={bolum}";

        var yanit = await c.GetAsync(yol);
        if (!yanit.IsSuccessStatusCode) return yanit;

        var govde = await GovdeyiTekrarOkunurYapAsync<OkumaKonumu>(yanit);
        if (govde is not null)
            await c.PostAsJsonAsync($"/api/books/{kitapId}/progress",
                new { bookId = kitapId, konum = govde.ChapterNumber });

        return yanit;
    }

    /// <summary>
    /// Quiz'i getirir; yoksa ÜRETİR. KURAL-17'den önce GET bunu kendisi
    /// yapıyordu — üretim artık ayrı bir POST.
    /// </summary>
    public static async Task<HttpResponseMessage> QuizGetirVeyaUretAsync(
        this HttpClient c, int bolumId)
    {
        var yanit = await c.GetAsync($"/api/books/quiz/{bolumId}");
        if (yanit.IsSuccessStatusCode) return yanit;

        return await c.PostAsync($"/api/books/quiz/{bolumId}", null);
    }

    /// <summary>
    /// Gövdeyi okur ve yanıtın içeriğini TEKRAR OKUNABİLİR hâle getirir.
    ///
    /// TestServer'ın akış tabanlı içeriği yalnızca BİR KEZ okunur; yardımcı
    /// gövdeyi tüketirse çağıran test "Cannot access a closed Stream" alır.
    /// İçerik metin olarak alınıp yerine konuyor — çağıran hiçbir fark görmez.
    /// </summary>
    private static async Task<T?> GovdeyiTekrarOkunurYapAsync<T>(HttpResponseMessage yanit)
    {
        var metin = await yanit.Content.ReadAsStringAsync();
        var tur = yanit.Content.Headers.ContentType;

        yanit.Content = new StringContent(metin);
        if (tur is not null) yanit.Content.Headers.ContentType = tur;

        return System.Text.Json.JsonSerializer.Deserialize<T>(metin,
            new System.Text.Json.JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
    }

    private sealed record OkumaKonumu(int PageNumber, int ChapterNumber);
}
