import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';

export interface AyristirilmisOge {
  id: string;
  original: string;
  translation: string;
  context?: string;
  selected: boolean;
}

/**
 * XML içindeki özel karakterleri (entity) çözer.
 */
function decodeXml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Word XML parçalarından (<w:t>, <w:tab/>, <w:br/> vb.) metni sıralı çıkarır.
 */
function extractWordXmlText(xmlSnippet: string): string {
  const tokenRegex = /(<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:(?:br|cr)\b[^>]*\/?>|<w:noBreakHyphen\b[^>]*\/?>)/gi;
  let text = '';
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(xmlSnippet)) !== null) {
    if (match[2] !== undefined) {
      text += decodeXml(match[2]);
    } else if (match[0].toLowerCase().startsWith('<w:tab')) {
      text += '\t';
    } else if (match[0].toLowerCase().startsWith('<w:nobreakhyphen')) {
      text += '-';
    } else {
      text += '\n';
    }
  }
  return text;
}

/**
 * Metnin başındaki liste işaretlerini, sıra numaralarını ve madde simgelerini temizler.
 * Örn: "1. car" -> "car", "• book" -> "book", "[1] apple" -> "apple"
 */
export function temizleMaddeIsareti(metin: string): string {
  let s = metin.trim();
  // Baştaki madde işaretleri: •, ⁃, ‣, ◦, -, *, –, —
  s = s.replace(/^[\u2022\u2043\u2023\u25E6\u25CF\u25AA\u25AB\u2013\u2014\-*•]\s+/, '');
  // Baştaki numaralandırma: "1.", "1)", "1-", "[1]", "(1)", "1:"
  s = s.replace(/^(\d+|[a-zA-Z])[\.\)\:\-]\s+/, '');
  s = s.replace(/^\[\d+\]\s+/, '');
  s = s.replace(/^\(\d+\)\s+/, '');
  return s.trim();
}

/**
 * Satırın bir başlık satırı olup olmadığını kontrol eder.
 */
export function baslikSatiriMi(col0: string, col1?: string): boolean {
  const k0 = col0.toLowerCase().trim();
  const k1 = (col1 || '').toLowerCase().trim();
  const basliklar = [
    'word', 'words', 'kelime', 'kelimeler', 'english', 'ingilizce',
    'cümle', 'cumle', 'sentence', 'sentences', 'term', 'vocabulary',
    '#', 'no', 'no.', 'sıra', 'sira', 'id'
  ];
  const ceviriler = [
    'translation', 'çeviri', 'ceviri', 'türkçe', 'turkce',
    'anlam', 'meaning', 'tanım', 'tanim'
  ];

  if (basliklar.includes(k0)) return true;
  if (k1 && ceviriler.includes(k1)) return true;
  if (basliklar.some((b) => k0.includes(b)) && ceviriler.some((c) => k1.includes(c))) return true;
  return false;
}

/**
 * Tek bir metin satırını ayırır.
 * Desteklenen ayraçlar:
 * - "car \t araba" (Word sekmeleri veya kopyalanan hücreler)
 * - "1 \t car \t araba" (Sıra numaralı hücreler)
 * - "car (araba)" veya "car [araba]"
 * - "car -> araba", "car => araba"
 * - "car - araba", "car — araba", "car – araba"
 * - "car : araba", "car = araba", "car ; araba"
 * - "car , araba"
 * - "car   araba" (iki veya daha fazla boşluk)
 */
export function satiriAyristir(satir: string): { original: string; translation: string } | null {
  let temiz = satir.trim();
  if (!temiz || temiz.startsWith('#') || temiz.startsWith('//')) return null;

  temiz = temizleMaddeIsareti(temiz);
  if (!temiz) return null;

  // 1. Tab ayrımı (Word <w:tab/> veya kopyalanan tablolardan gelen \t)
  if (temiz.includes('\t')) {
    const parcalar = temiz.split('\t').map((p) => p.trim()).filter((p) => p.length > 0);
    // Eğer 3 veya daha fazla parça varsa ve ilk parça sıra no / id ise (örn: "1\tapple\telma")
    if (parcalar.length >= 3 && /^(\d+|#|no|sira|sıra)[\.\)]?$/i.test(parcalar[0])) {
      const sol = parcalar[1].replace(/^["']|["']$/g, '').trim();
      const sag = parcalar.slice(2).join(' ').replace(/^["']|["']$/g, '').trim();
      if (sol.length > 0 && sag.length > 0) {
        return { original: sol, translation: sag };
      }
    }
    if (parcalar.length >= 2) {
      const sol = parcalar[0].replace(/^["']|["']$/g, '').trim();
      const sag = parcalar.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();
      if (sol.length > 0 && sag.length > 0) {
        return { original: sol, translation: sag };
      }
    }
  }

  // 2. Parantez içi çeviri kontrolü: "apple (elma)" veya "apple [elma]"
  const parenMatch = temiz.match(/^([^(]+?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    const sol = parenMatch[1].trim().replace(/^["']|["']$/g, '');
    const sag = parenMatch[2].trim().replace(/^["']|["']$/g, '');
    if (sol.length > 0 && sag.length > 0) {
      return { original: sol, translation: sag };
    }
  }

  const squareMatch = temiz.match(/^([^[]+?)\s*\[([^\]]+)\]$/);
  if (squareMatch) {
    const sol = squareMatch[1].trim().replace(/^["']|["']$/g, '');
    const sag = squareMatch[2].trim().replace(/^["']|["']$/g, '');
    if (sol.length > 0 && sag.length > 0) {
      return { original: sol, translation: sag };
    }
  }

  // 3. Açık ok ayraçları: "->", "=>", "-->", ">"
  const okAyraclari = [' -> ', ' => ', ' --> ', ' > '];
  for (const ayrac of okAyraclari) {
    if (temiz.includes(ayrac)) {
      const parcalar = temiz.split(ayrac);
      if (parcalar.length >= 2) {
        const sol = parcalar[0].trim().replace(/^["']|["']$/g, '');
        const sag = parcalar.slice(1).join(' ').trim().replace(/^["']|["']$/g, '');
        if (sol.length > 0 && sag.length > 0) {
          return { original: sol, translation: sag };
        }
      }
    }
  }

  // 4. Standart ayraçlar: " - ", " — ", " – ", " : ", " = ", " / ", ";"
  const ayraclar = [' - ', ' — ', ' – ', ' : ', ' = ', ' / ', ';'];
  for (const ayrac of ayraclar) {
    if (temiz.includes(ayrac)) {
      const parcalar = temiz.split(ayrac);
      if (parcalar.length >= 2) {
        const sol = parcalar[0].trim().replace(/^["']|["']$/g, '');
        const sag = parcalar.slice(1).join(ayrac).trim().replace(/^["']|["']$/g, '');
        if (sol.length > 0 && sag.length > 0) {
          return { original: sol, translation: sag };
        }
      }
    }
  }

  // 5. Boşluksuz iki nokta veya eşittir: ":" veya "="
  for (const ayrac of [':', '=']) {
    if (temiz.includes(ayrac)) {
      const parcalar = temiz.split(ayrac);
      if (parcalar.length >= 2) {
        const sol = parcalar[0].trim().replace(/^["']|["']$/g, '');
        const sag = parcalar.slice(1).join(ayrac).trim().replace(/^["']|["']$/g, '');
        if (sol.length > 0 && sag.length > 0) {
          return { original: sol, translation: sag };
        }
      }
    }
  }

  // 6. Virgül ayracı
  if (temiz.includes(',')) {
    const parcalar = temiz.split(',');
    if (parcalar.length >= 2) {
      const sol = parcalar[0].trim().replace(/^["']|["']$/g, '');
      const sag = parcalar.slice(1).join(',').trim().replace(/^["']|["']$/g, '');
      if (sol.length > 0 && sag.length > 0) {
        return { original: sol, translation: sag };
      }
    }
  }

  // 7. Çoklu boşluk ayracı (örn: "apple    elma")
  if (/\s{2,}/.test(temiz)) {
    const parcalar = temiz.split(/\s{2,}/);
    if (parcalar.length >= 2) {
      const sol = parcalar[0].trim().replace(/^["']|["']$/g, '');
      const sag = parcalar.slice(1).join(' ').trim().replace(/^["']|["']$/g, '');
      if (sol.length > 0 && sag.length > 0) {
        return { original: sol, translation: sag };
      }
    }
  }

  return null;
}

/**
 * Çok satırlı metni ayrıştırır.
 */
export function metniAyristir(metin: string): AyristirilmisOge[] {
  const satirlar = metin.split(/\r?\n/);
  const sonuc: AyristirilmisOge[] = [];
  let sira = 0;

  for (const satir of satirlar) {
    const temiz = satir.trim();
    if (!temiz || temiz.startsWith('#') || temiz.startsWith('//')) continue;
    if (baslikSatiriMi(temiz)) continue;

    const parsed = satiriAyristir(temiz);
    if (parsed) {
      sonuc.push({
        id: `txt_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        original: parsed.original,
        translation: parsed.translation,
        selected: true,
      });
    } else {
      const kelime = temizleMaddeIsareti(temiz).replace(/^["']|["']$/g, '');
      if (kelime.length >= 2 && !baslikSatiriMi(kelime)) {
        sonuc.push({
          id: `txt_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          original: kelime,
          translation: '',
          selected: true,
        });
      }
    }
  }

  return sonuc;
}

/**
 * Dosya URI'sinden zip nesnesini güvenle yükler (fetch ArrayBuffer veya base64 dener).
 */
async function zipYukle(dosyaUri: string): Promise<JSZip> {
  try {
    const resp = await fetch(dosyaUri);
    const buf = await resp.arrayBuffer();
    return await JSZip.loadAsync(buf);
  } catch {
    // fetch çalışmazsa expo-file-system base64 dene
    const base64 = await FileSystem.readAsStringAsync(dosyaUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return await JSZip.loadAsync(base64, { base64: true });
  }
}

/**
 * Excel dosyasını (.xlsx) ayrıştırır.
 */
export async function excelAyristir(dosyaUri: string): Promise<AyristirilmisOge[]> {
  try {
    const zip = await zipYukle(dosyaUri);

    const sharedStrings: string[] = [];
    const sharedFile = zip.file(/xl\/sharedStrings\.xml$/i)[0] || zip.file('xl/sharedStrings.xml');
    if (sharedFile) {
      const xml = await sharedFile.async('string');
      const siMatches = [...xml.matchAll(/<si[\s>][\s\S]*?<\/si>/g)];
      for (const si of siMatches) {
        const raw = si[0].replace(/<[^>]+>/g, '').trim();
        sharedStrings.push(decodeXml(raw));
      }
    }

    const sheetFile =
      zip.file(/xl\/worksheets\/sheet1\.xml$/i)[0] ||
      zip.file(/^xl\/worksheets\/sheet.*\.xml$/i)[0] ||
      zip.file('xl/worksheets/sheet1.xml');

    if (!sheetFile) {
      throw new Error('Excel çalışma sayfası bulunamadı.');
    }

    const sheetXml = await sheetFile.async('string');
    const sonuc: AyristirilmisOge[] = [];
    let sira = 0;

    const rowMatches = [...sheetXml.matchAll(/<row[\s>][\s\S]*?<\/row>/g)];
    for (const rowMatch of rowMatches) {
      const rowXml = rowMatch[0];
      const cMatches = [...rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)];
      const hucreler: string[] = [];

      for (const cMatch of cMatches) {
        const attrs = cMatch[1];
        const valBlock = cMatch[2];
        const isString = attrs.includes('t="s"');
        const isInline = attrs.includes('t="inlineStr"');

        let metin = '';
        if (isInline) {
          metin = decodeXml(valBlock.replace(/<[^>]+>/g, '').trim());
        } else {
          const vMatch = /<v>([\s\S]*?)<\/v>/.exec(valBlock);
          if (vMatch) {
            const rawVal = vMatch[1].trim();
            if (isString) {
              const idx = parseInt(rawVal, 10);
              metin = sharedStrings[idx] || '';
            } else {
              metin = rawVal;
            }
          }
        }
        hucreler.push(metin.trim());
      }

      if (hucreler.length >= 2) {
        let col0 = hucreler[0];
        let col1 = hucreler[1];
        let col2 = hucreler[2] || '';

        // Eğer 3 veya daha fazla sütun varsa ve ilk sütun sıra no (#, 1, 2) ise kaydır
        if (hucreler.length >= 3 && /^(\d+|#|no|sira|sıra)[\.\)]?$/i.test(col0.trim())) {
          col0 = hucreler[1];
          col1 = hucreler[2];
          col2 = hucreler.slice(3).join(' ');
        }

        if (baslikSatiriMi(col0, col1)) {
          continue;
        }

        col0 = temizleMaddeIsareti(col0);
        col1 = col1.trim();

        if (col0 && col1) {
          sonuc.push({
            id: `xls_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            original: col0,
            translation: col1,
            context: col2.trim() || undefined,
            selected: true,
          });
        } else if (col0 && !col1) {
          const parsed = satiriAyristir(col0);
          sonuc.push({
            id: `xls_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            original: parsed ? parsed.original : col0,
            translation: parsed ? parsed.translation : '',
            context: col2.trim() || undefined,
            selected: true,
          });
        }
      } else if (hucreler.length === 1 && hucreler[0]) {
        const col0 = temizleMaddeIsareti(hucreler[0]);
        if (baslikSatiriMi(col0)) continue;

        const parsed = satiriAyristir(col0);
        if (parsed) {
          sonuc.push({
            id: `xls_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            original: parsed.original,
            translation: parsed.translation,
            selected: true,
          });
        } else if (col0.length >= 2) {
          sonuc.push({
            id: `xls_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            original: col0,
            translation: '',
            selected: true,
          });
        }
      }
    }

    return sonuc;
  } catch (e) {
    throw new Error(`Excel belgesi okunamadı: ${(e as Error).message}`);
  }
}

/**
 * Word dosyasını (.docx) hem tablo hem de paragraf formatlarında eksiksiz ayrıştırır.
 * <w:tab/>, <w:noBreakHyphen/>, XML entity'leri ve madde işaretlerini destekler.
 */
export async function wordAyristir(dosyaUri: string): Promise<AyristirilmisOge[]> {
  try {
    const zip = await zipYukle(dosyaUri);

    const docXmlFile =
      zip.file(/word\/document\.xml$/i)[0] ||
      zip.file('word/document.xml');

    if (!docXmlFile) {
      throw new Error(
        'Word belgesi içeriği bulunamadı. Lütfen belgenin geçerli bir Word (.docx) dosyası olduğundan emin olun.',
      );
    }

    const xml = await docXmlFile.async('string');
    const sonuc: AyristirilmisOge[] = [];
    let sira = 0;

    const bodyMatch = /<w:body[\s>]([\s\S]*?)<\/w:body>/i.exec(xml);
    const bodyXml = bodyMatch ? bodyMatch[1] : xml;

    // 1. Önce Tabloları (<w:tbl>) ayrıştır
    const tblMatches = [...bodyXml.matchAll(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g)];
    for (const tblMatch of tblMatches) {
      const tblXml = tblMatch[0];
      const trMatches = [...tblXml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)];

      for (const trMatch of trMatches) {
        const trXml = trMatch[0];
        const tcMatches = [...trXml.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)];
        const hucreler: string[] = [];

        for (const tcMatch of tcMatches) {
          const hucreMetni = extractWordXmlText(tcMatch[0]).trim();
          hucreler.push(hucreMetni);
        }

        if (hucreler.length >= 2) {
          let col0 = hucreler[0];
          let col1 = hucreler[1];
          let col2 = hucreler[2] || '';

          // Eğer 3 veya daha fazla sütun varsa ve ilk sütun sıra no (#, 1, 2) ise kaydır
          if (hucreler.length >= 3 && /^(\d+|#|no|sira|sıra)[\.\)]?$/i.test(col0.trim())) {
            col0 = hucreler[1];
            col1 = hucreler[2];
            col2 = hucreler.slice(3).join(' ');
          }

          if (baslikSatiriMi(col0, col1)) continue;

          col0 = temizleMaddeIsareti(col0);
          col1 = col1.trim();

          if (col0 && col1) {
            sonuc.push({
              id: `doc_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              original: col0,
              translation: col1,
              context: col2.trim() || undefined,
              selected: true,
            });
          } else if (col0 && !col1) {
            const parsed = satiriAyristir(col0);
            sonuc.push({
              id: `doc_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              original: parsed ? parsed.original : col0,
              translation: parsed ? parsed.translation : '',
              context: col2.trim() || undefined,
              selected: true,
            });
          }
        } else if (hucreler.length === 1 && hucreler[0]) {
          const col0 = temizleMaddeIsareti(hucreler[0]);
          if (baslikSatiriMi(col0)) continue;

          const parsed = satiriAyristir(col0);
          if (parsed) {
            sonuc.push({
              id: `doc_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              original: parsed.original,
              translation: parsed.translation,
              selected: true,
            });
          } else if (col0.length >= 2) {
            sonuc.push({
              id: `doc_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              original: col0,
              translation: '',
              selected: true,
            });
          }
        }
      }
    }

    // 2. Tablo dışındaki paragrafları (<w:p>) satır satır ayrıştır
    const nonTableXml = bodyXml.replace(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g, '');
    const pMatches = [...nonTableXml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)];

    for (const pMatch of pMatches) {
      const metin = extractWordXmlText(pMatch[0]).trim();
      if (!metin) continue;

      // Paragraf içinde birden çok satır olabilir (<w:br/> veya \n)
      const satirlar = metin.split(/\r?\n/);
      for (const satir of satirlar) {
        const temiz = satir.trim();
        if (!temiz || temiz.startsWith('#') || temiz.startsWith('//')) continue;
        if (baslikSatiriMi(temiz)) continue;

        const parsed = satiriAyristir(temiz);
        if (parsed) {
          sonuc.push({
            id: `doc_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            original: parsed.original,
            translation: parsed.translation,
            selected: true,
          });
        } else {
          const kelime = temizleMaddeIsareti(temiz).replace(/^["']|["']$/g, '');
          if (kelime.length >= 2 && !baslikSatiriMi(kelime)) {
            sonuc.push({
              id: `doc_${++sira}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              original: kelime,
              translation: '',
              selected: true,
            });
          }
        }
      }
    }

    return sonuc;
  } catch (e: any) {
    if (e.message && e.message.includes('central directory')) {
      throw new Error(
        'Seçilen Word belgesi eski .doc formatında veya bozuk olabilir. Lütfen Word üzerinden "Farklı Kaydet -> Word Belgesi (.docx)" olarak kaydedip tekrar deneyin.',
      );
    }
    throw new Error(`Word belgesi okunamadı: ${e.message || e}`);
  }
}

/**
 * Belirtilen URI'deki dosyayı uzantısına göre doğru ayrıştırıcıya yönlendirir.
 */
export async function dosyadanAyristir(
  uri: string,
  dosyaAdi: string,
): Promise<AyristirilmisOge[]> {
  const uzanti = dosyaAdi.toLowerCase().split('.').pop() || '';

  if (uzanti === 'xlsx' || uzanti === 'xls') {
    return await excelAyristir(uri);
  } else if (uzanti === 'docx' || uzanti === 'doc') {
    return await wordAyristir(uri);
  } else {
    try {
      const metin = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return metniAyristir(metin);
    } catch {
      throw new Error(`Desteklenmeyen dosya türü: .${uzanti}. Lütfen .docx, .xlsx veya .txt dosyası seçin.`);
    }
  }
}
