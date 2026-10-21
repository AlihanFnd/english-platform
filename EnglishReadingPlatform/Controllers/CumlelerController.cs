using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using EnglishReadingPlatform.Authorization;
using EnglishReadingPlatform.Contracts;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Services;
using EnglishReadingPlatform.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace EnglishReadingPlatform.Controllers;

[Authorize]
[ApiController]
[Route("api/cumleler")]
public class CumlelerController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ISeriServisi _seriServisi;
    private readonly ILogger<CumlelerController> _logger;

    public CumlelerController(AppDbContext db, ISeriServisi seriServisi, ILogger<CumlelerController> logger)
    {
        _db = db;
        _seriServisi = seriServisi;
        _logger = logger;
    }

    private int KullaniciId => this.KullaniciId();

    public static string CumleAnahtariUret(string cumle)
    {
        if (string.IsNullOrWhiteSpace(cumle)) return "";
        var s = cumle.Trim().ToLowerInvariant();
        return Regex.Replace(s, @"\s+", " ");
    }

    // GET /api/cumleler
    [HttpGet]
    public async Task<IActionResult> Listele()
    {
        var userId = KullaniciId;
        var cumleler = await _db.CumleKayitlari
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.AddedAt)
            .Select(c => new CumleYaniti(
                c.Id,
                c.Cumle,
                c.Ceviri,
                c.Baglam,
                c.AddedAt,
                c.DogruSayisi,
                c.YanlisSayisi,
                c.DogruSeri,
                c.Kutu,
                c.SonrakiTekrarAt,
                c.SonCalismaAt,
                c.Kutu >= LeitnerHesaplayici.OgrenildiEsigiKutu
            ))
            .ToListAsync();

        return Ok(cumleler);
    }

    // GET /api/cumleler/ozet
    [HttpGet("ozet")]
    public async Task<IActionResult> Ozet()
    {
        var userId = KullaniciId;
        var now = DateTime.UtcNow;
        var yarin = now.AddDays(1);
        const int esik = LeitnerHesaplayici.OgrenildiEsigiKutu;

        var tumu = await _db.CumleKayitlari
            .Where(c => c.UserId == userId)
            .Select(c => new { c.Kutu, c.SonCalismaAt, c.SonrakiTekrarAt })
            .ToListAsync();

        int toplam = tumu.Count;
        int ogrenildi = tumu.Count(c => c.Kutu >= esik);
        int calisiliyor = tumu.Count(c => c.SonCalismaAt != null && c.Kutu < esik);
        int hicCalisilmadi = tumu.Count(c => c.SonCalismaAt == null);
        int bugunTekrar = tumu.Count(c => c.SonrakiTekrarAt != null && c.SonrakiTekrarAt <= now);
        int yarinTekrar = tumu.Count(c => c.SonrakiTekrarAt != null && c.SonrakiTekrarAt > now && c.SonrakiTekrarAt <= yarin);

        int[] kutuDagilimi = new int[8];
        foreach (var c in tumu)
        {
            int k = Math.Clamp(c.Kutu, 0, 7);
            kutuDagilimi[k]++;
        }

        return Ok(new CumleOzetiYaniti(
            toplam,
            ogrenildi,
            calisiliyor,
            hicCalisilmadi,
            bugunTekrar,
            yarinTekrar,
            kutuDagilimi,
            esik
        ));
    }

    // GET /api/cumleler/calisma?adet=10&mod=tekrar
    [HttpGet("calisma")]
    public async Task<IActionResult> CalismaSeansi(
        [FromQuery] [Range(1, 50)] int adet = 10,
        [FromQuery] string mod = "tekrar")
    {
        var userId = KullaniciId;
        var now = DateTime.UtcNow;
        const int esik = LeitnerHesaplayici.OgrenildiEsigiKutu;

        List<CumleKaydi> secilenler;

        if (string.Equals(mod, "serbest", StringComparison.OrdinalIgnoreCase))
        {
            secilenler = await _db.CumleKayitlari
                .Where(c => c.UserId == userId)
                .OrderBy(c => c.Kutu)
                .ThenBy(c => c.SonrakiTekrarAt ?? DateTime.MinValue)
                .ThenBy(c => c.Id)
                .Take(adet)
                .ToListAsync();
        }
        else
        {
            var vadesiGelenler = await _db.CumleKayitlari
                .Where(c => c.UserId == userId && c.SonrakiTekrarAt != null && c.SonrakiTekrarAt <= now)
                .OrderBy(c => c.SonrakiTekrarAt)
                .ThenBy(c => c.Kutu)
                .Take(adet)
                .ToListAsync();

            secilenler = new List<CumleKaydi>(vadesiGelenler);

            if (secilenler.Count < adet)
            {
                int kalanAdet = adet - secilenler.Count;
                int yeniSinir = Math.Min(kalanAdet, LeitnerHesaplayici.GunlukYeniSiniri);

                var vadesiGelenIdler = secilenler.Select(s => s.Id).ToList();

                var yeniCumleler = await _db.CumleKayitlari
                    .Where(c => c.UserId == userId && (c.SonCalismaAt == null || c.Kutu == 0) && !vadesiGelenIdler.Contains(c.Id))
                    .OrderBy(c => c.AddedAt)
                    .ThenBy(c => c.Id)
                    .Take(yeniSinir)
                    .ToListAsync();

                secilenler.AddRange(yeniCumleler);
            }
        }

        var kartlar = secilenler.Select(c => new CumleYaniti(
            c.Id,
            c.Cumle,
            c.Ceviri,
            c.Baglam,
            c.AddedAt,
            c.DogruSayisi,
            c.YanlisSayisi,
            c.DogruSeri,
            c.Kutu,
            c.SonrakiTekrarAt,
            c.SonCalismaAt,
            c.Kutu >= esik
        )).ToList();

        return Ok(kartlar);
    }

    // POST /api/cumleler
    [HttpPost]
    [EnableRateLimiting(HizSinirlari.Yazma)]
    public async Task<IActionResult> Ekle([FromBody] CumleIstegi req)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.Cumle))
        {
            return BadRequest(new { error = "Cümle metni zorunludur." });
        }

        var userId = KullaniciId;
        var anahtar = CumleAnahtariUret(req.Cumle);
        if (string.IsNullOrEmpty(anahtar))
        {
            return BadRequest(new { error = "Geçersiz cümle metni." });
        }

        var varOlan = await _db.CumleKayitlari
            .FirstOrDefaultAsync(c => c.UserId == userId && c.CumleAnahtari == anahtar);

        if (varOlan is not null)
        {
            // Idempotent: zaten var olan cümleyi döndür (puan vermez)
            return Ok(new CumleYaniti(
                varOlan.Id,
                varOlan.Cumle,
                varOlan.Ceviri,
                varOlan.Baglam,
                varOlan.AddedAt,
                varOlan.DogruSayisi,
                varOlan.YanlisSayisi,
                varOlan.DogruSeri,
                varOlan.Kutu,
                varOlan.SonrakiTekrarAt,
                varOlan.SonCalismaAt,
                varOlan.Kutu >= LeitnerHesaplayici.OgrenildiEsigiKutu
            ));
        }

        var yeni = new CumleKaydi
        {
            UserId = userId,
            Cumle = req.Cumle.Trim(),
            CumleAnahtari = anahtar,
            Ceviri = (req.Ceviri ?? "").Trim(),
            Baglam = (req.Baglam ?? "").Trim(),
            AddedAt = DateTime.UtcNow
        };

        _db.CumleKayitlari.Add(yeni);
        if (await _db.BenzersizKaydetAsync())
        {
            await _seriServisi.PuanEkleAsync(userId, "cumle");
        }
        else
        {
            // Yarış durumunda DB'deki kaydı al
            yeni = await _db.CumleKayitlari
                .FirstOrDefaultAsync(c => c.UserId == userId && c.CumleAnahtari == anahtar) ?? yeni;
        }

        return Ok(new CumleYaniti(
            yeni.Id,
            yeni.Cumle,
            yeni.Ceviri,
            yeni.Baglam,
            yeni.AddedAt,
            yeni.DogruSayisi,
            yeni.YanlisSayisi,
            yeni.DogruSeri,
            yeni.Kutu,
            yeni.SonrakiTekrarAt,
            yeni.SonCalismaAt,
            yeni.Kutu >= LeitnerHesaplayici.OgrenildiEsigiKutu
        ));
    }

    // PUT /api/cumleler/{id}
    [HttpPut("{id}")]
    [EnableRateLimiting(HizSinirlari.Yazma)]
    public async Task<IActionResult> Guncelle(
        [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id,
        [FromBody] CumleIstegi req)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.Cumle))
        {
            return BadRequest(new { error = "Cümle metni zorunludur." });
        }

        var userId = KullaniciId;
        var cumle = await _db.CumleKayitlari
            .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);

        if (cumle is null)
        {
            return NotFound(new { error = "Cümle bulunamadı." });
        }

        var yeniAnahtar = CumleAnahtariUret(req.Cumle);
        if (cumle.CumleAnahtari != yeniAnahtar)
        {
            var cakisma = await _db.CumleKayitlari
                .AnyAsync(c => c.UserId == userId && c.Id != id && c.CumleAnahtari == yeniAnahtar);

            if (cakisma)
            {
                return Conflict(new { error = "Bu cümle listende zaten var." });
            }
        }

        cumle.Cumle = req.Cumle.Trim();
        cumle.CumleAnahtari = yeniAnahtar;
        cumle.Ceviri = (req.Ceviri ?? "").Trim();
        cumle.Baglam = (req.Baglam ?? "").Trim();

        await _db.SaveChangesAsync();

        return Ok(new CumleYaniti(
            cumle.Id,
            cumle.Cumle,
            cumle.Ceviri,
            cumle.Baglam,
            cumle.AddedAt,
            cumle.DogruSayisi,
            cumle.YanlisSayisi,
            cumle.DogruSeri,
            cumle.Kutu,
            cumle.SonrakiTekrarAt,
            cumle.SonCalismaAt,
            cumle.Kutu >= LeitnerHesaplayici.OgrenildiEsigiKutu
        ));
    }

    // DELETE /api/cumleler/{id}
    [HttpDelete("{id}")]
    [EnableRateLimiting(HizSinirlari.Yazma)]
    public async Task<IActionResult> Sil(
        [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id)
    {
        var userId = KullaniciId;
        var cumle = await _db.CumleKayitlari
            .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);

        if (cumle is not null)
        {
            _db.CumleKayitlari.Remove(cumle);
            await _db.SaveChangesAsync();
        }

        // Idempotent: yok veya başkasının → aynı 200 yanıtı
        return Ok(new { success = true });
    }

    // POST /api/cumleler/toplu
    [HttpPost("toplu")]
    [EnableRateLimiting(HizSinirlari.Yazma)]
    public async Task<IActionResult> TopluEkle([FromBody] TopluCumleIstegi req)
    {
        if (req?.Cumleler == null)
        {
            return BadRequest(new { error = "Cümle listesi zorunludur." });
        }

        if (req.Cumleler.Count > AlanSinirlari.TopluCumleEnCok)
        {
            return BadRequest(new { error = $"Tek seferde en fazla {AlanSinirlari.TopluCumleEnCok} cümle eklenebilir." });
        }

        var userId = KullaniciId;
        var mevcutAnahtarlar = new HashSet<string>(
            await _db.CumleKayitlari
                .Where(c => c.UserId == userId)
                .Select(c => c.CumleAnahtari)
                .ToListAsync()
        );

        int eklenen = 0;
        int atlanan = 0;

        foreach (var item in req.Cumleler)
        {
            // Öğe düzeyindeki her sorun YALNIZCA o öğeyi düşürür (bkz. TopluCumleOgesi).
            // JSON'daki null öğe de buraya null gelir; eskiden NullReference → 500 idi.
            // Uzunluk, yazılacak olan (kırpılmış) değer üzerinden ölçülür.
            var cumle = item?.Cumle?.Trim() ?? "";
            var ceviri = item?.Ceviri?.Trim() ?? "";
            var baglam = item?.Baglam?.Trim() ?? "";

            if (cumle.Length == 0 ||
                cumle.Length > AlanSinirlari.Cumle ||
                ceviri.Length > AlanSinirlari.CumleCevirisi ||
                baglam.Length > AlanSinirlari.CumleBaglami)
            {
                atlanan++;
                continue;
            }

            var anahtar = CumleAnahtariUret(cumle);
            if (string.IsNullOrEmpty(anahtar) || mevcutAnahtarlar.Contains(anahtar))
            {
                atlanan++;
                continue;
            }

            mevcutAnahtarlar.Add(anahtar);
            _db.CumleKayitlari.Add(new CumleKaydi
            {
                UserId = userId,
                Cumle = cumle,
                CumleAnahtari = anahtar,
                Ceviri = ceviri,
                Baglam = baglam,
                AddedAt = DateTime.UtcNow
            });
            eklenen++;
        }

        if (eklenen > 0)
        {
            await _db.SaveChangesAsync();
            // TOPLU EKLEMEDE PUAN VERİLMEZ (KURAL: içe aktararak seri doldurulmaz)
        }

        return Ok(new TopluCumleSonucYaniti(eklenen, atlanan));
    }

    // POST /api/cumleler/calisma-sonucu
    [HttpPost("calisma-sonucu")]
    [EnableRateLimiting(HizSinirlari.Yazma)]
    public async Task<IActionResult> CalismaSonucu([FromBody] CalismaSonucuCumleIstegi req)
    {
        if (req == null) return BadRequest(new { error = "Geçersiz veri." });

        var userId = KullaniciId;
        var cumle = await _db.CumleKayitlari
            .FirstOrDefaultAsync(c => c.Id == req.CumleId && c.UserId == userId);

        if (cumle is not null)
        {
            var now = DateTime.UtcNow;
            if (req.Bildim)
            {
                cumle.DogruSayisi++;
                cumle.DogruSeri++;
                (cumle.Kutu, cumle.SonrakiTekrarAt) = LeitnerHesaplayici.Bildi(cumle.Kutu, now);
            }
            else
            {
                cumle.YanlisSayisi++;
                cumle.DogruSeri = 0;
                (cumle.Kutu, cumle.SonrakiTekrarAt) = LeitnerHesaplayici.Bilemedi(cumle.Kutu, now);
            }

            cumle.SonCalismaAt = now;
            await _db.SaveChangesAsync();

            await _seriServisi.PuanEkleAsync(userId, "calisma");
        }

        return Ok(new { success = true });
    }
}
