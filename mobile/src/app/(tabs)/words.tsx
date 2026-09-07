import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import {
  Award,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  FileUp,
  GraduationCap,
  HelpCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Timer,
  Trash2,
  Volume2,
  X,
  XCircle,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IlerlemeRaporuModal } from '@/components/IlerlemeRaporuModal';
import { TopluEkleModal } from '@/components/TopluEkleModal';
import { UstBar } from '@/components/UstBar';
import {
  BosDurum,
  Buton,
  EkranZemini,
  HataKutusu,
  Kart,
  Metin,
  Yukleniyor,
} from '@/components/ui';
import { useKimlik } from '@/context/AuthContext';
import { useRenk } from '@/context/ThemeContext';
import { useTelaffuz, KELIME_HIZI } from '@/hooks/useTelaffuz';
import { CalismaKarti, KelimeOzeti, WordItem, api } from '@/lib/api';
import { CumleOzeti, SentenceItem, cumleDeposu } from '@/lib/cumleDeposu';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

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

const YEDEK_CELDIRICILER = [
  { word: 'journey', translation: 'yolculuk' },
  { word: 'courage', translation: 'cesaret' },
  { word: 'freedom', translation: 'özgürlük' },
  { word: 'discovery', translation: 'keşif' },
  { word: 'whisper', translation: 'fısıltı' },
  { word: 'curiosity', translation: 'merak' },
  { word: 'silence', translation: 'sessizlik' },
  { word: 'promise', translation: 'söz, vaat' },
  { word: 'adventure', translation: 'macera' },
  { word: 'patience', translation: 'sabır' },
  { word: 'memory', translation: 'anı, hafıza' },
  { word: 'treasure', translation: 'hazine' },
];

export default function KelimelerimEkrani() {
  const palet = useRenk();
  const { kullanici } = useKimlik();
  const sekmeYuksekligi = useBottomTabBarHeight();
  const { seslendir, konusuyorMu } = useTelaffuz();
  const { seans } = useLocalSearchParams<{ seans?: string }>();

  /* Aktif Sekme: Kelimelerim vs Cümlelerim */
  const [aktifSekme, setAktifSekme] = useState<'kelime' | 'cumle'>('kelime');

  /* Kelimeler State */
  const [kelimeler, setKelimeler] = useState<WordItem[]>([]);
  const [ozet, setOzet] = useState<KelimeOzeti | null>(null);

  /* Cümleler State */
  const [cumleler, setCumleler] = useState<SentenceItem[]>([]);
  const [cumleOzeti, setCumleOzeti] = useState<CumleOzeti | null>(null);

  const [yukleniyor, setYukleniyor] = useState(true);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const [hata, setHata] = useState('');

  /* Modallar */
  const [topluEkleModalAcik, setTopluEkleModalAcik] = useState(false);
  const [raporModalAcik, setRaporModalAcik] = useState(false);
  const [secimModalAcik, setSecimModalAcik] = useState(false);

  /* Hızlı Kelime Ekleme */
  const [hizliKelime, setHizliKelime] = useState('');
  const [hizliCeviri, setHizliCeviri] = useState('');
  const [ceviriliyor, setCeviriliyor] = useState(false);
  const [ekleniyor, setEkleniyor] = useState(false);
  const [alternatifler, setAlternatifler] = useState<string[]>([]);
  const kelimeAlaniRef = useRef<TextInput>(null);

  /* Hızlı Cümle Ekleme */
  const [hizliCumle, setHizliCumle] = useState('');
  const [hizliCumleCeviri, setHizliCumleCeviri] = useState('');
  const [cumleCeviriliyor, setCumleCeviriliyor] = useState(false);
  const [cumleEkleniyor, setCumleEkleniyor] = useState(false);
  const cumleAlaniRef = useRef<TextInput>(null);

  /* Kart Flip & Düzenleme */
  const [cevrilenler, setCevrilenler] = useState<Set<string | number>>(new Set());
  const [duzenlenenId, setDuzenlenenId] = useState<string | number | null>(null);
  const [duzKelime, setDuzKelime] = useState('');
  const [duzCeviri, setDuzCeviri] = useState('');
  const [duzBaglam, setDuzBaglam] = useState('');
  const [guncellenenId, setGuncellenenId] = useState<string | number | null>(null);

  /* Quiz Seçenekleri (Sade Seçim Modalı için) */
  const [seciliMod, setSeciliMod] = useState<'test' | 'flashcard'>('test');
  const [seciliAdet, setSeciliAdet] = useState(10);

  /* Aktif Quiz Seansı */
  const [calismaModu, setCalismaModu] = useState(false);
  const [seansYukleniyor, setSeansYukleniyor] = useState(false);
  const [quizOgeleri, setQuizOgeleri] = useState<
    Array<{
      id: string | number;
      original: string;
      translation: string;
      context?: string;
      dogruSeri: number;
      ogrenildi: boolean;
    }>
  >([]);

  /* Verileri Yükle */
  const yukle = useCallback(async () => {
    try {
      setHata('');
      const [liste, o, cListe, cOzet] = await Promise.all([
        api.getWords(),
        api.getKelimeOzeti(),
        cumleDeposu.getCumleler(kullanici?.id),
        cumleDeposu.cumleOzeti(kullanici?.id),
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
      const [o, cOzet] = await Promise.all([
        api.getKelimeOzeti(),
        cumleDeposu.cumleOzeti(kullanici?.id),
      ]);
      setOzet(o);
      setCumleOzeti(cOzet);
    } catch {}
  }, [kullanici?.id]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  /* ── Kelime İçin Anlık Çeviri ── */
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

  /* ── Cümle İçin Anlık Çeviri ── */
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

  /* Hızlı Ekleme */
  const hizliKelimeEkle = async () => {
    if (!hizliKelime.trim() || !hizliCeviri.trim()) return;
    setEkleniyor(true);
    try {
      await api.addWord(hizliKelime.trim(), hizliCeviri.trim(), '');
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
      await cumleDeposu.cumleEkle(kullanici?.id, hizliCumle.trim(), hizliCumleCeviri.trim(), '');
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

  /* Kart Flip & Düzenleme */
  const kartiCevir = (id: string | number) => {
    if (duzenlenenId === id) return;
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

  const cumleSil = (kayit: SentenceItem) => {
    Alert.alert('Cümleyi sil', `“${kayit.sentence}” listenden kaldırılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await cumleDeposu.cumleSil(kullanici?.id, kayit.id);
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

  const dogrudanCumleOgrenildiIsaretle = async (item: SentenceItem) => {
    try {
      await cumleDeposu.cumleCalismaKaydet(kullanici?.id, item.id, true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setCumleler((oncekiler) =>
        oncekiler.map((c) => (c.id === item.id ? { ...c, dogruSeri: c.dogruSeri + 1 } : c)),
      );
      ozetiTazele();
    } catch {}
  };

  /* ── Pratik Başlat (Seçim Modalı Onayından Sonra) ── */
  const aktifListeUzunlugu = aktifSekme === 'kelime' ? kelimeler.length : cumleler.length;

  const pratikBaslat = async (mod: 'test' | 'flashcard', adet: number) => {
    setSecimModalAcik(false);
    if (aktifListeUzunlugu === 0) return;
    setSeansYukleniyor(true);

    try {
      if (aktifSekme === 'kelime') {
        const kartlar = await api.getCalismaSeansi(adet);
        setQuizOgeleri(
          kartlar.map((k) => ({
            id: k.id,
            original: k.word,
            translation: k.translation,
            context: k.context,
            dogruSeri: k.dogruSeri,
            ogrenildi: k.ogrenildi,
          })),
        );
      } else {
        const sirali = [...cumleler]
          .sort((a, b) => {
            const aPuani = a.sonCalismaAt ? (a.dogruSeri >= 2 ? 2 : 1) : 0;
            const bPuani = b.sonCalismaAt ? (b.dogruSeri >= 2 ? 2 : 1) : 0;
            return aPuani - bPuani;
          })
          .slice(0, adet);

        setQuizOgeleri(
          sirali.map((c) => ({
            id: c.id,
            original: c.sentence,
            translation: c.translation,
            context: c.context,
            dogruSeri: c.dogruSeri,
            ogrenildi: c.dogruSeri >= 2,
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

  const alanStili = {
    color: palet.onSurface,
    fontFamily: YaziTipi.govdeOrta,
    fontSize: Olcek.govde,
    backgroundColor: palet.surfaceContainer,
    borderWidth: 1,
    borderColor: palet.outlineVariant,
    borderRadius: Yaricap.md,
    paddingHorizontal: Bosluk.md,
    paddingVertical: Platform.OS === 'ios' ? Bosluk.md : Bosluk.sm,
  } as const;

  return (
    <EkranZemini>
      <UstBar
        baslik={aktifSekme === 'kelime' ? 'Kelimelerim' : 'Cümlelerim'}
        altBaslik={
          aktifSekme === 'kelime'
            ? `${ozet?.toplam ?? kelimeler.length} kelime`
            : `${cumleOzeti?.toplam ?? cumleler.length} cümle`
        }
      />

      {yukleniyor ? (
        <Yukleniyor mesaj="Yükleniyor…" />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={100}
        >
          <ScrollView
            contentContainerStyle={{
              padding: Bosluk.lg,
              paddingTop: 0,
              paddingBottom: sekmeYuksekligi + Bosluk.xl,
              gap: Bosluk.md,
            }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={tazeleniyor}
                onRefresh={() => {
                  setTazeleniyor(true);
                  yukle();
                }}
                tintColor={palet.primary}
                colors={[palet.primary]}
              />
            }
          >
            {hata ? <HataKutusu mesaj={hata} /> : null}

            {/* ── 1. SADE SEKME GEÇİŞİ ── */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: palet.surfaceContainer,
                borderRadius: Yaricap.lg,
                padding: 4,
              }}
            >
              <Pressable
                onPress={() => setAktifSekme('kelime')}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: Bosluk.xs,
                  paddingVertical: 8,
                  borderRadius: Yaricap.md,
                  backgroundColor: aktifSekme === 'kelime' ? palet.primary : 'transparent',
                }}
              >
                <BookOpen
                  size={15}
                  color={aktifSekme === 'kelime' ? palet.onPrimary : palet.onSurfaceVariant}
                />
                <Metin
                  tur="etiket"
                  renk={aktifSekme === 'kelime' ? palet.onPrimary : palet.onSurfaceVariant}
                >
                  Kelimelerim ({ozet?.toplam ?? kelimeler.length})
                </Metin>
              </Pressable>

              <Pressable
                onPress={() => setAktifSekme('cumle')}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: Bosluk.xs,
                  paddingVertical: 8,
                  borderRadius: Yaricap.md,
                  backgroundColor: aktifSekme === 'cumle' ? palet.primary : 'transparent',
                }}
              >
                <MessageSquare
                  size={15}
                  color={aktifSekme === 'cumle' ? palet.onPrimary : palet.onSurfaceVariant}
                />
                <Metin
                  tur="etiket"
                  renk={aktifSekme === 'cumle' ? palet.onPrimary : palet.onSurfaceVariant}
                >
                  Cümlelerim ({cumleOzeti?.toplam ?? cumleler.length})
                </Metin>
              </Pressable>
            </View>

            {/* ── 2. SADE İLERLEME ÖZETİ (Tıklanabilir) ── */}
            <Pressable onPress={() => setRaporModalAcik(true)}>
              <Kart dolgu={Bosluk.md} style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                  <Metin tur="minik" ikincil>
                    Toplam
                  </Metin>
                  <Metin tur="buyuk" renk={palet.primary}>
                    {aktifSekme === 'kelime'
                      ? (ozet?.toplam ?? kelimeler.length)
                      : (cumleOzeti?.toplam ?? cumleler.length)}
                  </Metin>
                </View>

                <View style={{ width: 1, backgroundColor: palet.outlineVariant }} />

                <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                  <Metin tur="minik" renk={palet.success}>
                    Bildiğim
                  </Metin>
                  <Metin tur="buyuk" renk={palet.success}>
                    {aktifSekme === 'kelime'
                      ? (ozet?.ogrenildi ?? 0)
                      : (cumleOzeti?.ogrenildi ?? 0)}
                  </Metin>
                </View>

                <View style={{ width: 1, backgroundColor: palet.outlineVariant }} />

                <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                  <Metin tur="minik" ikincil>
                    Kalan
                  </Metin>
                  <Metin tur="buyuk">
                    {aktifSekme === 'kelime'
                      ? (ozet?.hicCalisilmadi ?? 0)
                      : (cumleOzeti?.hicCalisilmadi ?? 0)}
                  </Metin>
                </View>
              </Kart>
            </Pressable>

            {/* ── 3. ANA İŞLEM BUTONLARI (Sade ve Net) ── */}
            <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
              <View style={{ flex: 1 }}>
                <Buton
                  baslik="🧠 Pratik Yap"
                  tamGenislik
                  disabled={aktifListeUzunlugu === 0}
                  onPress={() => setSecimModalAcik(true)}
                />
              </View>

              <Pressable
                onPress={() => setTopluEkleModalAcik(true)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingHorizontal: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor: alpha(palet.primary, 0.1),
                  borderWidth: 1,
                  borderColor: alpha(palet.primary, 0.25),
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <FileUp size={16} color={palet.primary} />
                <Metin tur="minik" renk={palet.primary}>
                  Toplu Ekle
                </Metin>
              </Pressable>

              <Pressable
                onPress={() => setRaporModalAcik(true)}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor: palet.surfaceContainer,
                  borderWidth: 1,
                  borderColor: palet.outlineVariant,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <BarChart3 size={16} color={palet.onSurfaceVariant} />
              </Pressable>
            </View>

            {/* ── 4. SERİ GİRİŞ ALANI (Minimal) ── */}
            {aktifSekme === 'kelime' ? (
              <Kart vurgulu style={{ gap: Bosluk.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} color={palet.primary} />
                  <Metin tur="etiket" renk={palet.primary}>
                    Hızlı Kelime Ekle
                  </Metin>
                </View>

                <TextInput
                  ref={kelimeAlaniRef}
                  value={hizliKelime}
                  onChangeText={(t) => {
                    setHizliKelime(t);
                    ceviriElleDegisti.current = false;
                  }}
                  placeholder="İngilizce kelime (örn: resilient)"
                  placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
                  autoCapitalize="none"
                  style={alanStili}
                />

                <TextInput
                  value={hizliCeviri}
                  onChangeText={(t) => {
                    setHizliCeviri(t);
                    ceviriElleDegisti.current = true;
                  }}
                  placeholder={ceviriliyor ? 'Çevriliyor…' : 'Türkçe anlamı'}
                  placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
                  style={alanStili}
                />

                <Buton
                  baslik={ekleniyor ? 'Ekleniyor…' : 'Ekle'}
                  kucuk
                  tamGenislik
                  yukleniyor={ekleniyor}
                  disabled={!hizliKelime.trim() || !hizliCeviri.trim()}
                  onPress={hizliKelimeEkle}
                />
              </Kart>
            ) : (
              <Kart vurgulu style={{ gap: Bosluk.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={14} color={palet.primary} />
                  <Metin tur="etiket" renk={palet.primary}>
                    Hızlı Cümle Ekle
                  </Metin>
                </View>

                <TextInput
                  ref={cumleAlaniRef}
                  value={hizliCumle}
                  onChangeText={(t) => {
                    setHizliCumle(t);
                    cumleElleDegisti.current = false;
                  }}
                  placeholder="İngilizce cümle"
                  placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
                  style={alanStili}
                />

                <TextInput
                  value={hizliCumleCeviri}
                  onChangeText={(t) => {
                    setHizliCumleCeviri(t);
                    cumleElleDegisti.current = true;
                  }}
                  placeholder={cumleCeviriliyor ? 'Çevriliyor…' : 'Türkçe çevirisi'}
                  placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
                  style={alanStili}
                />

                <Buton
                  baslik={cumleEkleniyor ? 'Ekleniyor…' : 'Ekle'}
                  kucuk
                  tamGenislik
                  yukleniyor={cumleEkleniyor}
                  disabled={!hizliCumle.trim() || !hizliCumleCeviri.trim()}
                  onPress={hizliCumleEkle}
                />
              </Kart>
            )}

            {/* ── 5. LİSTE KARTLARI ── */}
            {aktifSekme === 'kelime' ? (
              kelimeler.length === 0 ? (
                <BosDurum
                  simge={<Sparkles size={28} color={palet.primary} />}
                  baslik="Henüz kelime eklenmedi"
                  aciklama="Yukarıdaki kutudan ekleyebilir veya Word/Excel dosyanızdan topluca aktarabilirsiniz."
                />
              ) : (
                kelimeler.map((kayit) => {
                  const cevrildi = cevrilenler.has(kayit.id);
                  const ogrenildi = (kayit as any).dogruSeri >= 3;

                  return (
                    <Pressable key={kayit.id} onPress={() => kartiCevir(kayit.id)}>
                      <Kart vurgulu={cevrildi} style={{ gap: Bosluk.sm, minHeight: 90 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Metin
                              tur="minik"
                              renk={palet.primary}
                              style={{ fontWeight: 'bold' }}
                            >
                              {cevrildi ? 'TR' : 'EN'}
                            </Metin>
                            {ogrenildi ? (
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 2,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 4,
                                  backgroundColor: alpha(palet.success, 0.12),
                                }}
                              >
                                <GraduationCap size={10} color={palet.success} />
                                <Metin tur="minik" renk={palet.success}>
                                  Öğrenildi
                                </Metin>
                              </View>
                            ) : null}
                          </View>

                          <View style={{ flexDirection: 'row', gap: Bosluk.sm, alignItems: 'center' }}>
                            <Pressable
                              onPress={() => dogrudanOgrenildiIsaretle(kayit)}
                              hitSlop={8}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 2,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                backgroundColor: alpha(palet.success, 0.1),
                              }}
                            >
                              <Check size={11} color={palet.success} />
                              <Metin tur="minik" renk={palet.success}>
                                Bildim
                              </Metin>
                            </Pressable>
                            <Pressable
                              onPress={() => kelimeSil(kayit)}
                              hitSlop={8}
                              style={{ padding: 4 }}
                            >
                              <Trash2 size={15} color={palet.error} />
                            </Pressable>
                          </View>
                        </View>

                        {cevrildi ? (
                          <Metin tur="altBaslik" renk={palet.primary} ortala>
                            {kayit.translation}
                          </Metin>
                        ) : (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: Bosluk.sm,
                            }}
                          >
                            <Metin tur="baslik" ortala>
                              {kayit.word}
                            </Metin>
                            <Pressable
                              onPress={() => seslendir(kayit.word, KELIME_HIZI)}
                              hitSlop={8}
                            >
                              <Volume2
                                size={17}
                                color={
                                  konusuyorMu(kayit.word) ? palet.primary : palet.onSurfaceVariant
                                }
                              />
                            </Pressable>
                          </View>
                        )}

                        <Metin tur="minik" ikincil ortala style={{ fontSize: 10 }}>
                          {cevrildi ? '← Kelimeye dön' : 'Anlamı gör →'}
                        </Metin>
                      </Kart>
                    </Pressable>
                  );
                })
              )
            ) : (
              cumleler.length === 0 ? (
                <BosDurum
                  simge={<MessageSquare size={28} color={palet.primary} />}
                  baslik="Henüz cümle eklenmedi"
                  aciklama="Öğrendiğiniz cümleleri ekleyebilir veya dosyadan topluca aktarabilirsiniz."
                />
              ) : (
                cumleler.map((kayit) => {
                  const cevrildi = cevrilenler.has(kayit.id);
                  const ogrenildi = (kayit.dogruSeri || 0) >= 2;

                  return (
                    <Pressable key={kayit.id} onPress={() => kartiCevir(kayit.id)}>
                      <Kart vurgulu={cevrildi} style={{ gap: Bosluk.sm, minHeight: 90 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Metin
                              tur="minik"
                              renk={palet.primary}
                              style={{ fontWeight: 'bold' }}
                            >
                              {cevrildi ? 'TR CÜMLE' : 'EN CÜMLE'}
                            </Metin>
                            {ogrenildi ? (
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 2,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 4,
                                  backgroundColor: alpha(palet.success, 0.12),
                                }}
                              >
                                <GraduationCap size={10} color={palet.success} />
                                <Metin tur="minik" renk={palet.success}>
                                  Öğrenildi
                                </Metin>
                              </View>
                            ) : null}
                          </View>

                          <View style={{ flexDirection: 'row', gap: Bosluk.sm, alignItems: 'center' }}>
                            <Pressable
                              onPress={() => dogrudanCumleOgrenildiIsaretle(kayit)}
                              hitSlop={8}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 2,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                backgroundColor: alpha(palet.success, 0.1),
                              }}
                            >
                              <Check size={11} color={palet.success} />
                              <Metin tur="minik" renk={palet.success}>
                                Bildim
                              </Metin>
                            </Pressable>
                            <Pressable
                              onPress={() => cumleSil(kayit)}
                              hitSlop={8}
                              style={{ padding: 4 }}
                            >
                              <Trash2 size={15} color={palet.error} />
                            </Pressable>
                          </View>
                        </View>

                        {cevrildi ? (
                          <Metin tur="govde" renk={palet.primary} ortala>
                            {kayit.translation}
                          </Metin>
                        ) : (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: Bosluk.sm,
                            }}
                          >
                            <Metin tur="govde" ortala style={{ fontWeight: '600' }}>
                              {kayit.sentence}
                            </Metin>
                            <Pressable onPress={() => seslendir(kayit.sentence)} hitSlop={8}>
                              <Volume2
                                size={17}
                                color={
                                  konusuyorMu(kayit.sentence) ? palet.primary : palet.onSurfaceVariant
                                }
                              />
                            </Pressable>
                          </View>
                        )}

                        <Metin tur="minik" ikincil ortala style={{ fontSize: 10 }}>
                          {cevrildi ? '← İngilizceye dön' : 'Çeviriyi gör →'}
                        </Metin>
                      </Kart>
                    </Pressable>
                  );
                })
              )
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── 6. KULLANICININ İSTEDİĞİ SADE PRATİK SEÇİM MODALI ── */}
      {/* "ona basınca sorsun iki seçenek: testli mi, biliyorum bilmiyorum mu diye" */}
      <Modal
        visible={secimModalAcik}
        transparent
        animationType="fade"
        onRequestClose={() => setSecimModalAcik(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            padding: Bosluk.lg,
          }}
        >
          <Kart style={{ gap: Bosluk.lg, padding: Bosluk.lg }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Metin tur="altBaslik">Nasıl Çalışmak İstersin?</Metin>
              <Pressable onPress={() => setSecimModalAcik(false)} hitSlop={8}>
                <X size={20} color={palet.onSurfaceVariant} />
              </Pressable>
            </View>

            {/* İki Net Seçenek */}
            <View style={{ gap: Bosluk.sm }}>
              {/* Seçenek 1: Testli Mod */}
              <Pressable
                onPress={() => setSeciliMod('test')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Bosluk.md,
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  borderWidth: 2,
                  borderColor: seciliMod === 'test' ? palet.primary : palet.outlineVariant,
                  backgroundColor:
                    seciliMod === 'test' ? alpha(palet.primary, 0.08) : palet.surfaceContainer,
                }}
              >
                <Metin tur="baslik">🎯</Metin>
                <View style={{ flex: 1 }}>
                  <Metin tur="govde" renk={seciliMod === 'test' ? palet.primary : palet.onSurface}>
                    Test Modu (Çoktan Seçmeli)
                  </Metin>
                  <Metin tur="minik" ikincil>
                    Türkçesi yazar, 4 İngilizce şık arasından doğrusunu seçersin
                  </Metin>
                </View>
              </Pressable>

              {/* Seçenek 2: Kartlar (Biliyorum/Bilmiyorum) */}
              <Pressable
                onPress={() => setSeciliMod('flashcard')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Bosluk.md,
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  borderWidth: 2,
                  borderColor: seciliMod === 'flashcard' ? palet.primary : palet.outlineVariant,
                  backgroundColor:
                    seciliMod === 'flashcard'
                      ? alpha(palet.primary, 0.08)
                      : palet.surfaceContainer,
                }}
              >
                <Metin tur="baslik">🎴</Metin>
                <View style={{ flex: 1 }}>
                  <Metin
                    tur="govde"
                    renk={seciliMod === 'flashcard' ? palet.primary : palet.onSurface}
                  >
                    Kart Çevirme (Biliyorum / Bilmiyorum)
                  </Metin>
                  <Metin tur="minik" ikincil>
                    Klasik kart modu. Anlamını tahmin edip çevirirsin
                  </Metin>
                </View>
              </Pressable>
            </View>

            {/* Soru Sayısı */}
            <View style={{ gap: Bosluk.xs }}>
              <Metin tur="minik" ikincil>
                SORU SAYISI:
              </Metin>
              <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                {[10, 20, aktifListeUzunlugu].map((n) => {
                  const secili = seciliAdet === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setSeciliAdet(n)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: Yaricap.sm,
                        borderWidth: 1,
                        borderColor: secili ? palet.primary : palet.outlineVariant,
                        backgroundColor: secili
                          ? alpha(palet.primary, 0.12)
                          : palet.surfaceContainer,
                        alignItems: 'center',
                      }}
                    >
                      <Metin tur="minik" renk={secili ? palet.primary : palet.onSurfaceVariant}>
                        {n === aktifListeUzunlugu ? `Tümü (${n})` : `${n} Soru`}
                      </Metin>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Başlat Butonu */}
            <Buton
              baslik="Pratiğe Başla 🚀"
              tamGenislik
              onPress={() => pratikBaslat(seciliMod, seciliAdet)}
            />
          </Kart>
        </View>
      </Modal>

      {/* ── QUIZ & PRATİK SEANSI MODALI ── */}
      <QuizPratikModali
        acik={calismaModu}
        kapat={() => {
          setCalismaModu(false);
          ozetiTazele();
        }}
        mod={seciliMod}
        ogeler={quizOgeleri}
        aktifSekme={aktifSekme}
        userId={kullanici?.id}
        onCevapKaydedildi={ozetiTazele}
        tekrarDene={() => pratikBaslat(seciliMod, seciliAdet)}
        tumKelimeler={kelimeler}
        tumCumleler={cumleler}
      />

      {/* ── TOPLU İÇE AKTARMA MODALI ── */}
      <TopluEkleModal
        acik={topluEkleModalAcik}
        kapat={() => setTopluEkleModalAcik(false)}
        varsayilanHedef={aktifSekme}
        userId={kullanici?.id}
        tamamlandi={yukle}
      />

      {/* ── DETAYLI İLERLEME RAPORU MODALI ── */}
      <IlerlemeRaporuModal
        acik={raporModalAcik}
        kapat={() => setRaporModalAcik(false)}
        tur={aktifSekme}
        kelimeler={kelimeler}
        kelimeOzeti={ozet}
        cumleler={cumleler}
        cumleOzeti={cumleOzeti}
      />
    </EkranZemini>
  );
}

/**
 * Pratik Oyun Modalı
 */
function QuizPratikModali({
  acik,
  kapat,
  mod,
  ogeler,
  aktifSekme,
  userId,
  onCevapKaydedildi,
  tekrarDene,
  tumKelimeler,
  tumCumleler,
}: {
  acik: boolean;
  kapat: () => void;
  mod: 'flashcard' | 'test';
  ogeler: Array<{
    id: string | number;
    original: string;
    translation: string;
    context?: string;
    dogruSeri: number;
    ogrenildi: boolean;
  }>;
  aktifSekme: 'kelime' | 'cumle';
  userId?: number | string;
  onCevapKaydedildi: () => void;
  tekrarDene: () => void;
  tumKelimeler: WordItem[];
  tumCumleler: SentenceItem[];
}) {
  const palet = useRenk();
  const kenar = useSafeAreaInsets();
  const { seslendir, konusuyorMu } = useTelaffuz();

  const [sira, setSira] = useState(0);
  const [cevapAcik, setCevapAcik] = useState(false);
  const [skor, setSkor] = useState({ dogru: 0, yanlis: 0 });

  const [secilenSik, setSecilenSik] = useState<string | null>(null);
  const [siklarKilitli, setSiklarKilitli] = useState(false);

  const suankiOge = ogeler[sira];
  const bitti = sira >= ogeler.length;

  useEffect(() => {
    if (acik) {
      setSira(0);
      setCevapAcik(false);
      setSkor({ dogru: 0, yanlis: 0 });
      setSecilenSik(null);
      setSiklarKilitli(false);
    }
  }, [acik]);

  const siklar = useMemo(() => {
    if (!suankiOge) return [];

    const dogru = suankiOge.original;
    const digerAdaylar =
      aktifSekme === 'kelime'
        ? tumKelimeler.map((k) => k.word).filter((w) => w.toLowerCase() !== dogru.toLowerCase())
        : tumCumleler.map((c) => c.sentence).filter((s) => s.toLowerCase() !== dogru.toLowerCase());

    const havuz = [
      ...digerAdaylar,
      ...YEDEK_CELDIRICILER.map((y) => y.word).filter((w) => w.toLowerCase() !== dogru.toLowerCase()),
    ];

    const karisikHavuz = [...new Set(havuz)].sort(() => 0.5 - Math.random());
    const celdirmeler = karisikHavuz.slice(0, 3);

    return [dogru, ...celdirmeler].sort(() => 0.5 - Math.random());
  }, [suankiOge, aktifSekme, tumKelimeler, tumCumleler]);

  const kaydiArkadaGonder = (id: string | number, bildim: boolean) => {
    if (aktifSekme === 'kelime') {
      api.kaydetCalismaSonucu(Number(id), bildim).then(onCevapKaydedildi).catch(() => {});
    } else {
      cumleDeposu.cumleCalismaKaydet(userId, String(id), bildim).then(onCevapKaydedildi).catch(() => {});
    }
  };

  const sonrakiSoruyaGec = () => {
    setSira((s) => s + 1);
    setSecilenSik(null);
    setSiklarKilitli(false);
    setCevapAcik(false);
  };

  const sikSec = (secim: string) => {
    if (siklarKilitli || !suankiOge) return;
    setSiklarKilitli(true);
    setSecilenSik(secim);

    const dogruMu = secim.toLowerCase().trim() === suankiOge.original.toLowerCase().trim();

    if (dogruMu) {
      setSkor((s) => ({ ...s, dogru: s.dogru + 1 }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      setSkor((s) => ({ ...s, yanlis: s.yanlis + 1 }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }

    kaydiArkadaGonder(suankiOge.id, dogruMu);

    setTimeout(() => {
      sonrakiSoruyaGec();
    }, 800);
  };

  const flashcardCevap = (bildim: boolean) => {
    if (!suankiOge) return;
    if (bildim) {
      setSkor((s) => ({ ...s, dogru: s.dogru + 1 }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      setSkor((s) => ({ ...s, yanlis: s.yanlis + 1 }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
    }

    kaydiArkadaGonder(suankiOge.id, bildim);
    sonrakiSoruyaGec();
  };

  const basariYuzdesi =
    ogeler.length > 0 ? Math.round((skor.dogru / (skor.dogru + skor.yanlis || 1)) * 100) : 0;

  return (
    <Modal visible={acik} animationType="slide" onRequestClose={kapat}>
      <EkranZemini>
        <View
          style={{
            flex: 1,
            paddingTop: kenar.top + Bosluk.sm,
            paddingBottom: kenar.bottom + Bosluk.md,
            paddingHorizontal: Bosluk.lg,
            gap: Bosluk.md,
          }}
        >
          {/* Üst Başlık Barı */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
            <Brain size={18} color={palet.primary} />
            <Metin tur="altBaslik" renk={palet.primary} style={{ flex: 1 }}>
              {mod === 'test' ? '🎯 Çoktan Seçmeli Test' : '🎴 Flashcard'}
            </Metin>
            <Pressable onPress={kapat} hitSlop={10} style={{ padding: 4 }}>
              <X size={22} color={palet.onSurfaceVariant} />
            </Pressable>
          </View>

          {bitti ? (
            /* ── TEST SONU KARNESİ ── */
            <ScrollView contentContainerStyle={{ gap: Bosluk.lg, paddingBottom: Bosluk.xl }}>
              <Kart style={{ alignItems: 'center', gap: Bosluk.md, paddingVertical: Bosluk.xl }}>
                <Award size={48} color="#eab308" />
                <Metin tur="baslik" ortala>
                  Tebrikler, Tamamladın!
                </Metin>

                <View style={{ flexDirection: 'row', gap: Bosluk.md, alignSelf: 'stretch' }}>
                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.success, 0.12),
                    }}
                  >
                    <Metin tur="minik" renk={palet.success}>
                      DOĞRU
                    </Metin>
                    <Metin tur="devasa" renk={palet.success}>
                      {skor.dogru}
                    </Metin>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.error, 0.12),
                    }}
                  >
                    <Metin tur="minik" renk={palet.error}>
                      YANLIŞ
                    </Metin>
                    <Metin tur="devasa" renk={palet.error}>
                      {skor.yanlis}
                    </Metin>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.primary, 0.12),
                    }}
                  >
                    <Metin tur="minik" renk={palet.primary}>
                      BAŞARI
                    </Metin>
                    <Metin tur="devasa" renk={palet.primary}>
                      %{basariYuzdesi}
                    </Metin>
                  </View>
                </View>
              </Kart>

              <View style={{ flexDirection: 'row', gap: Bosluk.sm, justifyContent: 'center' }}>
                <Buton baslik="Kapat" tur="ikincil" onPress={kapat} />
                <Buton
                  baslik="Tekrar Başlat"
                  ikon={<RefreshCw size={14} color={palet.onPrimary} />}
                  onPress={tekrarDene}
                />
              </View>
            </ScrollView>
          ) : suankiOge ? (
            /* ── TEST / FLASHCARD AKIŞI ── */
            <View style={{ flex: 1, gap: Bosluk.md }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    paddingHorizontal: Bosluk.md,
                    paddingVertical: 3,
                    borderRadius: Yaricap.tam,
                    backgroundColor: alpha(palet.primary, 0.12),
                  }}
                >
                  <Metin tur="minik" renk={palet.primary}>
                    SORU {sira + 1} / {ogeler.length}
                  </Metin>
                </View>

                <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                  <Metin tur="minik" renk={palet.success}>
                    ✓ {skor.dogru}
                  </Metin>
                  <Metin tur="minik" renk={palet.error}>
                    ✗ {skor.yanlis}
                  </Metin>
                </View>
              </View>

              {mod === 'test' ? (
                /* ── ÇOKTAN SEÇMELİ TEST ── */
                <View style={{ flex: 1, gap: Bosluk.md, justifyContent: 'center' }}>
                  <Kart
                    vurgulu
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: Bosluk.xl,
                      gap: 4,
                    }}
                  >
                    <Metin tur="minik" renk={palet.primary}>
                      BU İFADENİN İNGİLİZCESİ NEDİR?
                    </Metin>
                    <Metin
                      tur={aktifSekme === 'kelime' ? 'devasa' : 'altBaslik'}
                      ortala
                      style={{ fontSize: aktifSekme === 'kelime' ? 26 : 18 }}
                    >
                      {suankiOge.translation}
                    </Metin>
                  </Kart>

                  {/* 4 Şık */}
                  <View style={{ gap: Bosluk.sm }}>
                    {siklar.map((secim, idx) => {
                      const dogruMu =
                        secim.toLowerCase().trim() === suankiOge.original.toLowerCase().trim();
                      const buSecildi = secilenSik === secim;

                      let arkaRenk = palet.surfaceContainer;
                      let kenarRenk = palet.outlineVariant;
                      let yaziRenk = palet.onSurface;

                      if (siklarKilitli) {
                        if (dogruMu) {
                          arkaRenk = alpha(palet.success, 0.18);
                          kenarRenk = palet.success;
                          yaziRenk = palet.success;
                        } else if (buSecildi) {
                          arkaRenk = alpha(palet.error, 0.18);
                          kenarRenk = palet.error;
                          yaziRenk = palet.error;
                        }
                      }

                      const harfler = ['A', 'B', 'C', 'D'];

                      return (
                        <Pressable
                          key={secim + idx}
                          disabled={siklarKilitli}
                          onPress={() => sikSec(secim)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: Bosluk.md,
                            borderRadius: Yaricap.md,
                            backgroundColor: arkaRenk,
                            borderWidth: 1.5,
                            borderColor: kenarRenk,
                            gap: Bosluk.md,
                          }}
                        >
                          <View
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: Yaricap.tam,
                              backgroundColor: buSecildi
                                ? dogruMu
                                  ? palet.success
                                  : palet.error
                                : alpha(palet.primary, 0.1),
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Metin
                              tur="minik"
                              renk={buSecildi ? '#ffffff' : palet.primary}
                            >
                              {harfler[idx]}
                            </Metin>
                          </View>

                          <Metin
                            tur="govde"
                            renk={yaziRenk}
                            style={{ flex: 1, fontWeight: '600' }}
                          >
                            {secim}
                          </Metin>

                          {siklarKilitli && dogruMu ? (
                            <CheckCircle2 size={16} color={palet.success} />
                          ) : siklarKilitli && buSecildi ? (
                            <XCircle size={16} color={palet.error} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : (
                /* ── FLASHCARD MODU ── */
                <View style={{ flex: 1, gap: Bosluk.md }}>
                  <Pressable onPress={() => setCevapAcik((a) => !a)} style={{ flex: 1 }}>
                    <Kart
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: Bosluk.md,
                      }}
                    >
                      {!cevapAcik ? (
                        <>
                          <View
                            style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.md }}
                          >
                            <Metin
                              tur={aktifSekme === 'kelime' ? 'devasa' : 'altBaslik'}
                              ortala
                              style={{ fontSize: aktifSekme === 'kelime' ? 30 : 20 }}
                            >
                              {suankiOge.original}
                            </Metin>
                            <Pressable
                              onPress={() => seslendir(suankiOge.original)}
                              hitSlop={10}
                              style={{ padding: 6 }}
                            >
                              <Volume2
                                size={22}
                                color={
                                  konusuyorMu(suankiOge.original)
                                    ? palet.primary
                                    : palet.onSurfaceVariant
                                }
                              />
                            </Pressable>
                          </View>
                          <Metin tur="minik" ikincil>
                            ANLAMI GÖRMEK İÇİN DOKUN
                          </Metin>
                        </>
                      ) : (
                        <View style={{ alignItems: 'center', gap: Bosluk.sm }}>
                          <Metin tur="etiket" renk={palet.primary}>
                            Türkçe Karşılığı
                          </Metin>
                          <Metin
                            tur={aktifSekme === 'kelime' ? 'buyuk' : 'baslik'}
                            ortala
                            style={{ fontSize: 22 }}
                          >
                            {suankiOge.translation}
                          </Metin>
                        </View>
                      )}
                    </Kart>
                  </Pressable>

                  <View style={{ flexDirection: 'row', gap: Bosluk.md }}>
                    <Buton
                      baslik="Bilmiyorum"
                      tur="tehlike"
                      style={{ flex: 1 }}
                      onPress={() => flashcardCevap(false)}
                    />
                    <Buton
                      baslik="Biliyorum"
                      style={{ flex: 1 }}
                      onPress={() => flashcardCevap(true)}
                    />
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </EkranZemini>
    </Modal>
  );
}
