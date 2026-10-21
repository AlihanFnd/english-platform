import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, TextInput } from 'react-native';

import { QuizOgesi } from '@/components/words/QuizPratikModali';
import { useKimlik } from '@/context/AuthContext';
import { useSeri } from '@/context/SeriContext';
import { CumleItem, CumleOzeti, KelimeOzeti, WordItem, api } from '@/lib/api';
import { cumleGocuCalistir } from '@/lib/cumleGocu';

function altAnlamlariAyikla(ham?: string): string[] {
  if (!ham) return [];
  return ham
    .split('\n')
    .flatMap((satir) => {
      const iki = satir.replace(/^[•\s-]+/, '').split(':');
      return (iki.length > 1 ? iki.slice(1).join(':') : iki[0]).split(',');
    })
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 40)
    .slice(0, 6);
}

export function useKelimelerim() {
  const { kullanici } = useKimlik();
  const { puanOlayi } = useSeri();

  const [aktifSekme, setAktifSekme] = useState<'kelime' | 'cumle'>('kelime');

  const [kelimeler, setKelimeler] = useState<WordItem[]>([]);
  const [ozet, setOzet] = useState<KelimeOzeti | null>(null);
  const [cumleler, setCumleler] = useState<CumleItem[]>([]);
  const [cumleOzeti, setCumleOzeti] = useState<CumleOzeti | null>(null);

  const [yukleniyor, setYukleniyor] = useState(true);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const [hata, setHata] = useState('');

  const [topluEkleModalAcik, setTopluEkleModalAcik] = useState(false);
  const [raporModalAcik, setRaporModalAcik] = useState(false);
  const [secimModalAcik, setSecimModalAcik] = useState(false);

  /* Hızlı Kelime Ekleme */
  const [hizliKelime, setHizliKelime] = useState('');
  const [hizliCeviri, setHizliCeviri] = useState('');
  const [ceviriliyor, setCeviriliyor] = useState(false);
  const [ekleniyor, setEkleniyor] = useState(false);
  const [, setAlternatifler] = useState<string[]>([]);
  const kelimeAlaniRef = useRef<TextInput>(null);

  /* Hızlı Cümle Ekleme */
  const [hizliCumle, setHizliCumle] = useState('');
  const [hizliCumleCeviri, setHizliCumleCeviri] = useState('');
  const [cumleCeviriliyor, setCumleCeviriliyor] = useState(false);
  const [cumleEkleniyor, setCumleEkleniyor] = useState(false);
  const cumleAlaniRef = useRef<TextInput>(null);

  /* Kart Flip */
  const [cevrilenler, setCevrilenler] = useState<Set<string | number>>(new Set());

  /* Quiz */
  const [seciliMod, setSeciliMod] = useState<'test' | 'flashcard'>('test');
  const [seciliAdet, setSeciliAdet] = useState(10);
  const [calismaModu, setCalismaModu] = useState(false);
  const [seansYukleniyor, setSeansYukleniyor] = useState(false);
  const [quizOgeleri, setQuizOgeleri] = useState<QuizOgesi[]>([]);

  const yukle = useCallback(async () => {
    try {
      setHata('');
      if (kullanici?.id) {
        await cumleGocuCalistir(kullanici.id);
      }
      const [liste, o, cListe, cOzet] = await Promise.all([
        api.getWords(),
        api.getKelimeOzeti(),
        api.getSentences(),
        api.getCumleOzeti(),
      ]);
      setKelimeler(liste);
      setOzet(o);
      setCumleler(cListe);
      setCumleOzeti(cOzet);
    } catch (e) {
      setHata((e as Error).message || 'Veriler yüklenirken bir hata oluştu.');
    } finally {
      setYukleniyor(false);
      setTazeleniyor(false);
    }
  }, [kullanici?.id]);

  const ozetiTazele = useCallback(async () => {
    try {
      const [o, cOzet] = await Promise.all([api.getKelimeOzeti(), api.getCumleOzeti()]);
      setOzet(o);
      setCumleOzeti(cOzet);
    } catch {}
  }, []);

  useEffect(() => {
    yukle();
  }, [yukle]);

  /* Anlık Kelime Çeviri */
  const ceviriOnbellegi = useRef<Map<string, { ana: string; alt: string[] }>>(new Map());
  const istekSayaci = useRef(0);
  const ceviriElleDegisti = useRef(false);

  useEffect(() => {
    const kelime = hizliKelime.trim().toLowerCase();
    if (!kelime) {
      setCeviriliyor(false);
      setAlternatifler([]);
      return;
    }
    if (ceviriElleDegisti.current) return;

    const onbellekten = ceviriOnbellegi.current.get(kelime);
    if (onbellekten !== undefined) {
      setHizliCeviri(onbellekten.ana);
      setAlternatifler(onbellekten.alt);
      setCeviriliyor(false);
      return;
    }

    setCeviriliyor(true);
    const benimSiram = ++istekSayaci.current;

    const zamanlayici = setTimeout(async () => {
      try {
        const yanit = await api.translateWord(kelime);
        if (benimSiram !== istekSayaci.current) return;

        const ana = (yanit.generalMeaning || yanit.translation || '').split('\n')[0].trim();
        const alt = altAnlamlariAyikla(yanit.synonyms);

        ceviriOnbellegi.current.set(kelime, { ana, alt });
        if (!ceviriElleDegisti.current) {
          setHizliCeviri(ana);
          setAlternatifler(alt);
        }
      } catch {
        if (benimSiram === istekSayaci.current) {
          setHizliCeviri('');
          setAlternatifler([]);
        }
      } finally {
        if (benimSiram === istekSayaci.current) setCeviriliyor(false);
      }
    }, 350);

    return () => clearTimeout(zamanlayici);
  }, [hizliKelime]);

  /* Anlık Cümle Çeviri */
  const cumleCeviriOnbellegi = useRef<Map<string, string>>(new Map());
  const cumleIstekSayaci = useRef(0);
  const cumleElleDegisti = useRef(false);

  useEffect(() => {
    const cumle = hizliCumle.trim();
    if (!cumle) {
      setCumleCeviriliyor(false);
      return;
    }
    if (cumleElleDegisti.current) return;

    const onbellekten = cumleCeviriOnbellegi.current.get(cumle.toLowerCase());
    if (onbellekten !== undefined) {
      setHizliCumleCeviri(onbellekten);
      setCumleCeviriliyor(false);
      return;
    }

    setCumleCeviriliyor(true);
    const benimSiram = ++cumleIstekSayaci.current;

    const zamanlayici = setTimeout(async () => {
      try {
        const yanit = await api.translateSentence(cumle);
        if (benimSiram !== cumleIstekSayaci.current) return;
        cumleCeviriOnbellegi.current.set(cumle.toLowerCase(), yanit.translation);
        if (!cumleElleDegisti.current) {
          setHizliCumleCeviri(yanit.translation);
        }
      } catch {
        if (benimSiram === cumleIstekSayaci.current) {
          setHizliCumleCeviri('');
        }
      } finally {
        if (benimSiram === cumleIstekSayaci.current) setCumleCeviriliyor(false);
      }
    }, 400);

    return () => clearTimeout(zamanlayici);
  }, [hizliCumle]);

  const hizliKelimeEkle = async () => {
    if (!hizliKelime.trim() || !hizliCeviri.trim()) return;
    setEkleniyor(true);
    try {
      await api.addWord(hizliKelime.trim(), hizliCeviri.trim(), '');
      puanOlayi();
      setHizliKelime('');
      setHizliCeviri('');
      setAlternatifler([]);
      ceviriElleDegisti.current = false;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      kelimeAlaniRef.current?.focus();
      await yukle();
    } catch (e) {
      Alert.alert('Kelime eklenemedi', (e as Error).message);
    } finally {
      setEkleniyor(false);
    }
  };

  const hizliCumleEkle = async () => {
    if (!hizliCumle.trim() || !hizliCumleCeviri.trim()) return;
    setCumleEkleniyor(true);
    try {
      await api.addSentence(hizliCumle.trim(), hizliCumleCeviri.trim(), '');
      setHizliCumle('');
      setHizliCumleCeviri('');
      cumleElleDegisti.current = false;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      cumleAlaniRef.current?.focus();
      await yukle();
    } catch (e) {
      Alert.alert('Cümle eklenemedi', (e as Error).message);
    } finally {
      setCumleEkleniyor(false);
    }
  };

  const kartiCevir = (id: string | number) => {
    setCevrilenler((oncekiler) => {
      const yeni = new Set(oncekiler);
      if (yeni.has(id)) yeni.delete(id);
      else yeni.add(id);
      return yeni;
    });
  };

  const kelimeSil = (kayit: WordItem) => {
    Alert.alert('Kelimeyi sil', `“${kayit.word}” listenden kaldırılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteWord(kayit.id);
            setKelimeler((oncekiler) => oncekiler.filter((k) => k.id !== kayit.id));
            ozetiTazele();
          } catch (e) {
            Alert.alert('Kelime silinemedi', (e as Error).message);
          }
        },
      },
    ]);
  };

  const cumleSil = (kayit: CumleItem) => {
    Alert.alert('Cümleyi sil', `“${kayit.cumle}” listenden kaldırılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSentence(kayit.id);
            setCumleler((oncekiler) => oncekiler.filter((c) => c.id !== kayit.id));
            ozetiTazele();
          } catch (e) {
            Alert.alert('Cümle silinemedi', (e as Error).message);
          }
        },
      },
    ]);
  };

  const dogrudanOgrenildiIsaretle = async (item: WordItem) => {
    try {
      await api.kaydetCalismaSonucu(item.id, true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setKelimeler((oncekiler) =>
        oncekiler.map((k) => (k.id === item.id ? { ...k, dogruSeri: (k as any).dogruSeri + 1 } : k)),
      );
      ozetiTazele();
    } catch {}
  };

  const dogrudanCumleOgrenildiIsaretle = async (item: CumleItem) => {
    try {
      await api.kaydetCumleCalismaSonucu(item.id, true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setCumleler((oncekiler) =>
        oncekiler.map((c) => (c.id === item.id ? { ...c, dogruSeri: c.dogruSeri + 1 } : c)),
      );
      ozetiTazele();
    } catch {}
  };

  const aktifListeUzunlugu = aktifSekme === 'kelime' ? kelimeler.length : cumleler.length;

  const pratikBaslat = async (mod: 'test' | 'flashcard', adet: number, calismaModu: 'tekrar' | 'serbest' = 'tekrar') => {
    setSecimModalAcik(false);
    if (aktifListeUzunlugu === 0) return;
    setSeansYukleniyor(true);

    try {
      if (aktifSekme === 'kelime') {
        const kartlar = await api.getCalismaSeansi(adet, calismaModu);
        setQuizOgeleri(
          kartlar.map((k) => ({
            id: k.id,
            original: k.word,
            translation: k.translation,
            context: k.context,
            dogruSeri: k.dogruSeri,
            kutu: k.kutu,
            ogrenildi: k.ogrenildi,
          })),
        );
      } else {
        const cKartlar = await api.getCalismaCumleleri(adet, calismaModu);
        setQuizOgeleri(
          cKartlar.map((c) => ({
            id: c.id,
            original: c.cumle,
            translation: c.ceviri,
            context: c.baglam,
            dogruSeri: c.dogruSeri,
            kutu: c.kutu,
            ogrenildi: c.ogrenildi,
          })),
        );
      }

      setSeciliMod(mod);
      setCalismaModu(true);
    } catch (e) {
      Alert.alert('Pratik başlatılamadı', (e as Error).message);
    } finally {
      setSeansYukleniyor(false);
    }
  };

  return {
    kullanici,
    aktifSekme,
    setAktifSekme,
    kelimeler,
    ozet,
    cumleler,
    cumleOzeti,
    yukleniyor,
    tazeleniyor,
    setTazeleniyor,
    hata,
    yukle,
    ozetiTazele,
    topluEkleModalAcik,
    setTopluEkleModalAcik,
    raporModalAcik,
    setRaporModalAcik,
    secimModalAcik,
    setSecimModalAcik,
    hizliKelime,
    setHizliKelime,
    hizliCeviri,
    setHizliCeviri,
    ceviriliyor,
    ekleniyor,
    kelimeAlaniRef,
    ceviriElleDegisti,
    hizliKelimeEkle,
    hizliCumle,
    setHizliCumle,
    hizliCumleCeviri,
    setHizliCumleCeviri,
    cumleCeviriliyor,
    cumleEkleniyor,
    cumleAlaniRef,
    cumleElleDegisti,
    hizliCumleEkle,
    cevrilenler,
    kartiCevir,
    kelimeSil,
    cumleSil,
    dogrudanOgrenildiIsaretle,
    dogrudanCumleOgrenildiIsaretle,
    seciliMod,
    setSeciliMod,
    seciliAdet,
    setSeciliAdet,
    calismaModu,
    setCalismaModu,
    seansYukleniyor,
    quizOgeleri,
    aktifListeUzunlugu,
    pratikBaslat,
  };
}
