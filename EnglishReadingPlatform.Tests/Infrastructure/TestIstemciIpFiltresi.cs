using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;

namespace EnglishReadingPlatform.Tests.Infrastructure;

/// <summary>
/// Testlere özel ara katman: istekteki <see cref="Baslik"/> başlığını
/// bağlantının gerçek istemci IP'sine yazar.
///
/// NEDEN GEREKLİ: TestServer altında her istek aynı (boş) uzak adresten gelir.
/// Uygulama hız sınırını "register_{ip}" gibi IP tabanlı anahtarlarla tuttuğu için
/// bütün testler tek bir kovayı paylaşır ve bir dakika içindeki 6. kayıt isteği
/// 429 alır — testin kendisiyle ilgisi olmayan bir sebeple kırmızıya döner.
///
/// Bu filtre YALNIZCA test sunucusunda devrededir (ConfigureTestServices ile
/// eklenir); üretim kodunda ne bu sınıf ne de bu başlık vardır.
/// Başlık verilmezse davranış hiç değişmez — yani hız sınırını sınayan testler
/// başlığı kasten sabit tutarak aynı kovayı paylaşmaya devam edebilir.
/// </summary>
public sealed class TestIstemciIpFiltresi : IStartupFilter
{
    public const string Baslik = "X-Test-Client-Ip";

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use(async (ctx, sonraki) =>
        {
            if (ctx.Request.Headers.TryGetValue(Baslik, out var deger)
                && IPAddress.TryParse(deger.ToString(), out var ip))
            {
                ctx.Connection.RemoteIpAddress = ip;
            }

            await sonraki();
        });

        next(app);
    };
}
