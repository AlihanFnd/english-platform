import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export type ReaderDurum = 'bos' | 'caliyor' | 'duraklatildi';
export type HizTipi = 0.75 | 1 | 1.25;

const HIZ_KEY = 'linguza_reader_speed';
const SES_KEY = 'linguza_reader_voice';

export interface UseSayfaOkuyucuOptions {
  /** Sayfa sonuna gelindiğinde tetiklenecek geri çağırım. */
  onSayfaBitti?: () => void;
}

type CumleOkuFn = (index: number, liste: string[], mevcutHiz: HizTipi, mevcutSes: string | null) => void;

export function useSayfaOkuyucu(options?: UseSayfaOkuyucuOptions) {
  const [durum, setDurum] = useState<ReaderDurum>('bos');
  const [aktifCumle, setAktifCumle] = useState<number>(0);
  const [cumleler, setCumleler] = useState<string[]>([]);
  const [hiz, setHiz] = useState<HizTipi>(1);
  const [ses, setSes] = useState<string | null>(null);
  const [mevcutSesler, setMevcutSesler] = useState<Speech.Voice[]>([]);

  // Ref'ler (yarış durumlarını ve güncel state erişimlerini yönetmek için)
  const oturumIdRef = useRef<number>(0);
  const cumlelerRef = useRef<string[]>([]);
  const aktifCumleRef = useRef<number>(0);
  const hizRef = useRef<HizTipi>(1);
  const sesRef = useRef<string | null>(null);
  const durumRef = useRef<ReaderDurum>('bos');
  const onSayfaBittiRef = useRef<(() => void) | undefined>(options?.onSayfaBitti);
  const cumleOkuRef = useRef<CumleOkuFn | null>(null);

  // En güncel state'i TTS geri çağırımlarına ve AppState dinleyicisine taşıyan
  // ref'ler. Render sırasında değil commit sonrası yazılır (React Compiler kuralı);
  // bu değerleri okuyan her yol render'dan SONRA çalışır.
  useEffect(() => {
    cumlelerRef.current = cumleler;
    aktifCumleRef.current = aktifCumle;
    hizRef.current = hiz;
    sesRef.current = ses;
    durumRef.current = durum;
    onSayfaBittiRef.current = options?.onSayfaBitti;
  });

  // Kalıcı tercihleri yükle & sesleri getir
  useEffect(() => {
    let iptal = false;

    AsyncStorage.getItem(HIZ_KEY).then((val) => {
      if (!iptal && val) {
        const num = parseFloat(val);
        if (num === 0.75 || num === 1 || num === 1.25) {
          setHiz(num as HizTipi);
        }
      }
    }).catch(() => {});

    AsyncStorage.getItem(SES_KEY).then((val) => {
      if (!iptal && val) {
        setSes(val);
      }
    }).catch(() => {});

    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        if (iptal) return;
        const ingilizce = (voices || []).filter(
          (v) => v.language && v.language.toLowerCase().startsWith('en')
        );
        ingilizce.sort((a, b) => {
          const aUst = a.name?.includes('Enhanced') || (a as { quality?: string }).quality === 'Enhanced' ? 1 : 0;
          const bUst = b.name?.includes('Enhanced') || (b as { quality?: string }).quality === 'Enhanced' ? 1 : 0;
          return bUst - aUst;
        });
        setMevcutSesler(ingilizce);
      })
      .catch(() => {});

    return () => {
      iptal = true;
    };
  }, []);

  // Unmount temizliği: Sayfadan çıkılınca sesi kes
  useEffect(() => {
    return () => {
      oturumIdRef.current++;
      Speech.stop().catch(() => {});
    };
  }, []);

  // Duraklat
  const duraklat = useCallback(() => {
    oturumIdRef.current++;
    Speech.stop().catch(() => {});
    setDurum('duraklatildi');
  }, []);

  // AppState takibi: Uygulama arka plana geçtiğinde okumayı duraklat (YH-12).
  // `duraklat`tan SONRA tanımlı: tanımlanmadan kullanılan değişken derleyici hatasıdır.
  useEffect(() => {
    const abonelik = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (durumRef.current === 'caliyor') {
          duraklat();
        }
      }
    });

    return () => {
      abonelik.remove();
    };
  }, [duraklat]);

  // Durdur
  const durdur = useCallback(() => {
    oturumIdRef.current++;
    Speech.stop().catch(() => {});
    setDurum('bos');
    setAktifCumle(0);
  }, []);

  // Belirtilen indeksteki cümleyi seslendirir
  const cumleOku = useCallback<CumleOkuFn>((index, liste, mevcutHiz, mevcutSes) => {
    if (index < 0 || index >= liste.length) {
      setDurum('bos');
      return;
    }

    const oturum = ++oturumIdRef.current;
    let metin = liste[index] ?? '';
    if (metin.length > 3000) {
      metin = metin.substring(0, 3000);
    }

    Speech.stop().catch(() => {});
    setAktifCumle(index);
    setDurum('caliyor');

    Speech.speak(metin, {
      language: 'en-US',
      pitch: 1.0,
      rate: mevcutHiz,
      voice: mevcutSes ?? undefined,
      onDone: () => {
        if (oturum !== oturumIdRef.current) return;
        const sonrakiIndex = index + 1;
        if (sonrakiIndex < liste.length) {
          // Özyineleme ref üzerinden: useCallback gövdesinde kendine doğrudan
          // başvurmak "tanımlanmadan kullanılıyor" derleyici hatasıdır.
          cumleOkuRef.current?.(sonrakiIndex, liste, mevcutHiz, mevcutSes);
        } else {
          setDurum('bos');
          setAktifCumle(0);
          onSayfaBittiRef.current?.();
        }
      },
      onStopped: () => {
        if (oturum !== oturumIdRef.current) return;
        // Elle duraklatma/durdurmada durum zaten güncellenir
      },
      onError: () => {
        if (oturum !== oturumIdRef.current) return;
        setDurum('bos');
      },
    });
  }, []);

  useEffect(() => {
    cumleOkuRef.current = cumleOku;
  }, [cumleOku]);

  // Başlat
  const baslat = useCallback(
    (yeniCumleler: string[], baslangic = 0) => {
      if (!yeniCumleler || yeniCumleler.length === 0) return;
      setCumleler(yeniCumleler);
      const HedefIndex = Math.min(Math.max(0, baslangic), yeniCumleler.length - 1);
      cumleOku(HedefIndex, yeniCumleler, hizRef.current, sesRef.current);
    },
    [cumleOku],
  );

  // Devam et
  const devam = useCallback(() => {
    if (cumlelerRef.current.length === 0) return;
    cumleOku(aktifCumleRef.current, cumlelerRef.current, hizRef.current, sesRef.current);
  }, [cumleOku]);

  // Önceki cümle
  const onceki = useCallback(() => {
    if (cumlelerRef.current.length === 0) return;
    const yeniIndex = Math.max(0, aktifCumleRef.current - 1);
    cumleOku(yeniIndex, cumlelerRef.current, hizRef.current, sesRef.current);
  }, [cumleOku]);

  // Sonraki cümle
  const sonraki = useCallback(() => {
    if (cumlelerRef.current.length === 0) return;
    const yeniIndex = aktifCumleRef.current + 1;
    if (yeniIndex < cumlelerRef.current.length) {
      cumleOku(yeniIndex, cumlelerRef.current, hizRef.current, sesRef.current);
    } else {
      durdur();
      onSayfaBittiRef.current?.();
    }
  }, [cumleOku, durdur]);

  // Hız değiştir
  const hizDegistir = useCallback(
    (yeniHiz: HizTipi) => {
      setHiz(yeniHiz);
      AsyncStorage.setItem(HIZ_KEY, yeniHiz.toString()).catch(() => {});
      if (durumRef.current === 'caliyor' && cumlelerRef.current.length > 0) {
        cumleOku(aktifCumleRef.current, cumlelerRef.current, yeniHiz, sesRef.current);
      }
    },
    [cumleOku],
  );

  // Ses değiştir
  const sesDegistir = useCallback(
    (yeniSes: string | null) => {
      setSes(yeniSes);
      if (yeniSes) {
        AsyncStorage.setItem(SES_KEY, yeniSes).catch(() => {});
      } else {
        AsyncStorage.removeItem(SES_KEY).catch(() => {});
      }
      if (durumRef.current === 'caliyor' && cumlelerRef.current.length > 0) {
        cumleOku(aktifCumleRef.current, cumlelerRef.current, hizRef.current, yeniSes);
      }
    },
    [cumleOku],
  );

  return {
    durum,
    aktifCumle,
    cumleler,
    hiz,
    ses,
    mevcutSesler,
    baslat,
    duraklat,
    devam,
    onceki,
    sonraki,
    durdur,
    hizDegistir,
    sesDegistir,
  };
}
