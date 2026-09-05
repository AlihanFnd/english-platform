import { AnalizCumlesi, AnalizKelimesi } from '@/lib/api';

/**
 * Sunucudan gelen cümle dizisini okuyucunun beklediği biçime çevirir.
 *
 * Web'deki `normalizeSentences` işlevinin birebir taşınmış hâli. Üç iş yapar:
 *  1. PascalCase/camelCase alan adlarını tek biçime indirger (eski kayıtlar
 *     `Original`, yeniler `original` taşıyor).
 *  2. "CHAPTER I THE BEGINNING It was a dark…" gibi başlıkla gövdenin
 *     birleştiği satırları ikiye ayırır.
 *  3. `words` yoksa cümleyi boşluklardan bölerek kelime listesi üretir —
 *     tıklanabilirlik her koşulda çalışsın.
 */

export interface OkumaCumlesi {
  original: string;
  translation: string;
  isHeading: boolean;
  alignment: 'left' | 'center' | 'right';
  indentation: number;
  words: AnalizKelimesi[];
  /** KURAL-06: alan YOKSA `true` varsayılır — eski kayıtları hatalı işaretleme. */
  ceviriBasarili: boolean;
}

const BASLIK_DESENI =
  /^(CHAPTER|Chapter|PART|Part|UNIT|Unit|LESSON|Lesson|BOOK|Book)\s+([0-9IVXLCDMivxlcdm]+|[A-Za-z]+)?\s*(-|:|–)?\s*([A-Z\s]{2,40}|[A-Za-z\s]{2,40})?(\.\s+|\s{2,}|\n)(.*)$/;

const BASLIK_BASLANGICI = /^(CHAPTER|Chapter|PART|Part|UNIT|Unit|LESSON|Lesson|BOOK|Book)\b/i;

function kelimeyeCevir(ham: unknown): AnalizKelimesi {
  if (typeof ham === 'string') return { word: ham, translation: ham, type: 'default' };
  const n = (ham ?? {}) as Record<string, unknown>;
  return {
    word: String(n.word ?? n.Word ?? ''),
    translation: String(n.translation ?? n.Translation ?? ''),
    type: String(n.type ?? n.Type ?? 'default'),
  };
}

export function cumleleriDuzenle(ham: unknown): OkumaCumlesi[] {
  const dizi = Array.isArray(ham) ? ham : [];
  const sonuc: OkumaCumlesi[] = [];

  dizi.forEach((girdi) => {
    const s = (girdi ?? {}) as Record<string, unknown>;

    let orijinal = String(s.original ?? s.Original ?? '').trim();
    let ceviri = String(s.translation ?? s.Translation ?? '').trim();
    let baslikMi = Boolean(s.isHeading ?? s.IsHeading ?? false);
    let hiza = (s.alignment ?? s.Alignment ?? (baslikMi ? 'center' : 'left')) as
      | 'left'
      | 'center'
      | 'right';
    const kelimeler = (s.words ?? s.Words ?? []) as unknown[];
    const basarili = (s.ceviriBasarili ?? s.CeviriBasarili) !== false;

    // 1) Başlık + gövde aynı satırda mı?
    if (!baslikMi && orijinal.length > 20) {
      const eslesme = orijinal.match(BASLIK_DESENI);
      if (eslesme && eslesme[6] && eslesme[6].trim().length > 15) {
        const govde = eslesme[6].trim();
        const baslikKismi = orijinal.substring(0, orijinal.indexOf(govde)).trim();
        if (baslikKismi.length > 0) {
          sonuc.push({
            original: baslikKismi,
            translation: baslikKismi,
            isHeading: true,
            alignment: 'center',
            indentation: 0,
            // Başlıklar zaten çoğu zaman çevrilmeden bırakılır; burada uyarı
            // basmak sürekli yanlış alarm üretirdi.
            ceviriBasarili: true,
            words: baslikKismi
              .split(/\s+/)
              .map((k) => ({ word: k, translation: k, type: 'default' })),
          });
          orijinal = govde;
          if (ceviri.length > baslikKismi.length) {
            ceviri = ceviri.replace(baslikKismi, '').trim();
          }
        }
      }
    }

    // 2) Açıkça CHAPTER vb. ile başlıyorsa başlık say.
    if (!baslikMi && orijinal.length > 0 && BASLIK_BASLANGICI.test(orijinal)) {
      baslikMi = true;
      hiza = 'center';
    }

    const bicimliKelimeler =
      Array.isArray(kelimeler) && kelimeler.length > 0
        ? kelimeler.map(kelimeyeCevir)
        : orijinal.split(/\s+/).filter(Boolean).map(kelimeyeCevir);

    sonuc.push({
      original: orijinal,
      translation: ceviri || orijinal,
      isHeading: baslikMi,
      alignment: baslikMi ? 'center' : hiza || 'left',
      indentation: Number(s.indentation ?? s.Indentation ?? 0) || 0,
      words: bicimliKelimeler,
      ceviriBasarili: basarili,
    });
  });

  return sonuc;
}

/** Sunucudan gelen analiz cümlelerini de aynı biçime sokar. */
export function analizdenDuzenle(cumleler: AnalizCumlesi[]): OkumaCumlesi[] {
  return cumleleriDuzenle(cumleler);
}

/** Kelime türüne göre altı çizgi rengi — web'deki `.word-*` sınıflarıyla aynı. */
export function kelimeRengi(tur?: string): string {
  const eslesme: Record<string, string> = {
    isim: 'rgba(59, 130, 246, 0.75)',
    fiil: 'rgba(16, 185, 129, 0.75)',
    sıfat: 'rgba(245, 158, 11, 0.75)',
    zarf: 'rgba(139, 92, 246, 0.75)',
    edat: 'rgba(236, 72, 153, 0.75)',
    bağlaç: 'rgba(249, 115, 22, 0.75)',
    zamir: 'rgba(6, 182, 212, 0.75)',
  };
  return eslesme[(tur ?? '').toLowerCase()] ?? 'rgba(148, 163, 184, 0.5)';
}
