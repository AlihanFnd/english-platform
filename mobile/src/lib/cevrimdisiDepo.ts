import * as FileSystem from 'expo-file-system/legacy';

export interface CevrimdisiSayfa {
  pageNumber: number;
  content: string;
  sentencesJson: string | null;
  analizBekliyor: boolean;
}

interface IndeksItem {
  dosyaYolu: string;
  kitapId: number;
  sayfaNo: number;
  boyut: number;
  sonErisimAt: number;
}

const CEVRIMDISI_DIZIN = `${FileSystem.documentDirectory}cevrimdisi/`;
const INDEKS_DOSYASI = `${CEVRIMDISI_DIZIN}indeks.json`;
const AZAMI_BOYUT_BYTE = 50 * 1024 * 1024; // 50 MB tavan

async function dizinHazirla() {
  const bilgi = await FileSystem.getInfoAsync(CEVRIMDISI_DIZIN);
  if (!bilgi.exists) {
    await FileSystem.makeDirectoryAsync(CEVRIMDISI_DIZIN, { intermediates: true });
  }
}

async function indeksiOku(): Promise<IndeksItem[]> {
  try {
    const bilgi = await FileSystem.getInfoAsync(INDEKS_DOSYASI);
    if (!bilgi.exists) return [];
    const icerik = await FileSystem.readAsStringAsync(INDEKS_DOSYASI);
    return JSON.parse(icerik) as IndeksItem[];
  } catch {
    return [];
  }
}

async function indeksiKaydet(indeks: IndeksItem[]) {
  try {
    await dizinHazirla();
    await FileSystem.writeAsStringAsync(INDEKS_DOSYASI, JSON.stringify(indeks));
  } catch {
    // Hata durumunda yutulur
  }
}

async function lruTemizle(indeks: IndeksItem[]) {
  let toplamBoyut = indeks.reduce((toplam, item) => toplam + item.boyut, 0);
  if (toplamBoyut <= AZAMI_BOYUT_BYTE) return indeks;

  // En eski erişilene göre sırala (eskiden yeniye)
  indeks.sort((a, b) => a.sonErisimAt - b.sonErisimAt);

  const yeniIndeks = [...indeks];
  while (toplamBoyut > AZAMI_BOYUT_BYTE && yeniIndeks.length > 0) {
    const silinecek = yeniIndeks.shift();
    if (silinecek) {
      try {
        await FileSystem.deleteAsync(silinecek.dosyaYolu, { idempotent: true });
        toplamBoyut -= silinecek.boyut;
      } catch {
        // Silme hatası
      }
    }
  }
  return yeniIndeks;
}

/** Toplu sayfaları diskteki önbelleğe kaydeder. */
export async function kaydetSayfalar(kitapId: number, sayfalar: CevrimdisiSayfa[]): Promise<number> {
  await dizinHazirla();
  const kitapDizin = `${CEVRIMDISI_DIZIN}${kitapId}/`;
  const bilgi = await FileSystem.getInfoAsync(kitapDizin);
  if (!bilgi.exists) {
    await FileSystem.makeDirectoryAsync(kitapDizin, { intermediates: true });
  }

  let indeks = await indeksiOku();
  let eklenenSayisi = 0;

  for (const sayfa of sayfalar) {
    const dosyaYolu = `${kitapDizin}${sayfa.pageNumber}.json`;
    const icerikMetni = JSON.stringify(sayfa);
    const boyut = icerikMetni.length * 2; // yaklaşık byte

    await FileSystem.writeAsStringAsync(dosyaYolu, icerikMetni);

    indeks = indeks.filter((i) => !(i.kitapId === kitapId && i.sayfaNo === sayfa.pageNumber));
    indeks.push({
      dosyaYolu,
      kitapId,
      sayfaNo: sayfa.pageNumber,
      boyut,
      sonErisimAt: Date.now(),
    });
    eklenenSayisi++;
  }

  indeks = await lruTemizle(indeks);
  await indeksiKaydet(indeks);
  return eklenenSayisi;
}

/** Diskten önbellekteki sayfayı okur. */
export async function okuSayfa(kitapId: number, sayfaNo: number): Promise<CevrimdisiSayfa | null> {
  try {
    const dosyaYolu = `${CEVRIMDISI_DIZIN}${kitapId}/${sayfaNo}.json`;
    const bilgi = await FileSystem.getInfoAsync(dosyaYolu);
    if (!bilgi.exists) return null;

    const icerik = await FileSystem.readAsStringAsync(dosyaYolu);
    const sayfa = JSON.parse(icerik) as CevrimdisiSayfa;

    // LRU son erişim zamanını güncelle
    indeksiOku().then((indeks) => {
      const guncel = indeks.map((item) =>
        item.kitapId === kitapId && item.sayfaNo === sayfaNo
          ? { ...item, sonErisimAt: Date.now() }
          : item
      );
      indeksiKaydet(guncel);
    });

    return sayfa;
  } catch {
    return null;
  }
}

/** Belirtilen sayfa diskte var mı? */
export async function sayfaMevcutMu(kitapId: number, sayfaNo: number): Promise<boolean> {
  try {
    const dosyaYolu = `${CEVRIMDISI_DIZIN}${kitapId}/${sayfaNo}.json`;
    const bilgi = await FileSystem.getInfoAsync(dosyaYolu);
    return bilgi.exists;
  } catch {
    return false;
  }
}

/** Tüm önbelleği ve indeks dosyasını siler (Çıkış / Hesap Silme kancası). */
export async function temizleCevrimdisiDepo(): Promise<void> {
  try {
    const bilgi = await FileSystem.getInfoAsync(CEVRIMDISI_DIZIN);
    if (bilgi.exists) {
      await FileSystem.deleteAsync(CEVRIMDISI_DIZIN, { idempotent: true });
    }
  } catch {
    // Yutulur
  }
}
