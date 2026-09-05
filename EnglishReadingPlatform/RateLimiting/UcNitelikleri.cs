namespace EnglishReadingPlatform.RateLimiting;

/// <summary>
/// KURAL-17: Bu uç ÜCRETLİ bir dış API çağırıyor.
///
/// Neden bir nitelik (attribute): maliyet, kodu okuyarak keşfedilen bir özellik
/// olmamalı. KURAL-07, <c>books/{id}/read</c> ucunu "okuma" diye sınıflandırdı —
/// çünkü ucun LLM çağırdığı yalnızca bir sorgu parametresinin (<c>reanalyze</c>)
/// arkasında görünüyordu. Sonuç: aynı iş, üç kat gevşek kotada çalıştı.
///
/// Bildirim zorunlu olunca bu tür yollar SAKLANAMAZ: sözleşme testi hem
/// bildirilenleri (dar kotada mı?) hem bildirilmeyenleri (LLM çağırıp da
/// bildirmeyen var mı?) iki yönlü denetliyor.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class ParaHarcarAttribute : Attribute
{
    public ParaHarcarAttribute(string servis, string kosul = "her istekte")
    {
        Servis = servis;
        Kosul  = kosul;
    }

    public string Servis { get; }

    /// <summary>Hangi koşulda harcıyor — ör. "yalnızca analiz boşken".</summary>
    public string Kosul { get; }
}

/// <summary>KURAL-17: paylaşılan veriye yazmanın iki farklı biçimi.</summary>
public enum PaylasilanYazmaBicimi
{
    /// <summary>
    /// Yalnızca BOŞ alanı doldurur, dolu olanı ASLA değiştirmez.
    /// Etkisi eklemelidir (idempotent): başkasının gördüğü bir içeriği bozamaz,
    /// yalnızca hiç olmayan bir içeriği var eder. Rol kısıtı gerekmez —
    /// ama para harcadığı için dar kota ve kimlik doğrulaması gerekir.
    /// </summary>
    BosAlaniDoldurur,

    /// <summary>
    /// Var olan içeriğin ÜZERİNE yazar. Bir kullanıcının eylemi, başka
    /// kullanıcıların gördüğü veriyi değiştirir — yetki kontrolü ZORUNLU.
    /// </summary>
    UzerineYazar,
}

/// <summary>
/// KURAL-17: Bu uç, ÇAĞIRANA AİT OLMAYAN (paylaşılan) veriyi yazıyor.
///
/// <c>BookPage</c> kayıtları <c>UserId</c> taşımaz — yani globaldir; bir
/// öğrencinin bastığı buton bütün kullanıcıların gördüğü çeviriyi değiştirir.
/// Sözleşme testi <see cref="PaylasilanYazmaBicimi.UzerineYazar"/> biçiminde
/// yazan her ucun bir yetki politikası taşımasını zorunlu tutar.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class PaylasilanVeriYazarAttribute : Attribute
{
    public PaylasilanVeriYazarAttribute(string tablo, PaylasilanYazmaBicimi bicim)
    {
        Tablo = tablo;
        Bicim = bicim;
    }

    public string Tablo { get; }
    public PaylasilanYazmaBicimi Bicim { get; }
}
