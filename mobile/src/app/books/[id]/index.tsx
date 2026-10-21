import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Headphones,
  HelpCircle,
  Maximize2,
  Minimize2,
  Sparkles,
  Type,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CumleGorunumu } from '@/components/CumleGorunumu';
import { KelimePaneli, KelimeSecimi } from '@/components/KelimePaneli';
import {
  CumleKurucuPaneli,
  SeciliKelimeParcasi,
} from '@/components/okuyucu/CumleKurucuPaneli';
import { OkuyucuAyarlariModal } from '@/components/okuyucu/OkuyucuAyarlari';
import { SayfaIskeleti } from '@/components/okuyucu/SayfaIskeleti';
import { SayfaOkuyucuPaneli } from '@/components/okuyucu/SayfaOkuyucuPaneli';
import { Buton, EkranZemini, HataKutusu, Kart, Metin, Yukleniyor } from '@/components/ui';
import { useKimlik } from '@/context/AuthContext';
import { useSeri } from '@/context/SeriContext';
import { useRenk } from '@/context/ThemeContext';
import { useSayfaOkuyucu } from '@/hooks/useSayfaOkuyucu';
import { Chapter, api } from '@/lib/api';
import { kaydetSayfalar, okuSayfa } from '@/lib/cevrimdisiDepo';
import { OkumaCumlesi, cumleleriDuzenle } from '@/lib/cumleler';
import { kelimeyiAyir } from '@/lib/kelimeBicimi';
import {
  OkuyucuAyarlari as OkuyucuAyarlariTipi,
  VARSAYILAN_OKUYUCU_AYARLARI,
  okuyucuAyarlariniKaydet,
  okuyucuAyarlariniOku,
} from '@/lib/okuyucuAyarlari';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

type Konum = { tur: 'sayfa' | 'bolum'; no: number } | undefined;
type Yon = 'ileri' | 'geri' | 'atla';

export default function OkuyucuEkrani() {
  const palet = useRenk();
  const router = useRouter();
  const HareketiAzalt = useReducedMotion();
  const { id, kelime, ekle } = useLocalSearchParams<{ id: string; kelime?: string; ekle?: string }>();
  const kitapId = Number(id);
  const { puanOlayi } = useSeri();

  const [konum, setKonum] = useState<Konum>(undefined);
  const [yon, setYon] = useState<Yon>('atla');

  const [kitapAdi, setKitapAdi] = useState('');
  const [ilkYukleme, setIlkYukleme] = useState(true);
  const [sayfaDegisiyor, setSayfaDegisiyor] = useState(false);

  const { kullanici } = useKimlik();
  const yenidenAnalizEdebilir = kullanici?.role === 'teacher' || kullanici?.role === 'admin';

  const [analizEdiliyor, setAnalizEdiliyor] = useState(false);
  const [cumleler, setCumleler] = useState<OkumaCumlesi[]>([]);
  const [hata, setHata] = useState('');

  const [sayfaliMi, setSayfaliMi] = useState(false);
  const [toplamSayfa, setToplamSayfa] = useState(0);
  const [aktifSayfa, setAktifSayfa] = useState(1);

  const [bolum, setBolum] = useState<Chapter | null>(null);
  const [toplamBolum, setToplamBolum] = useState(1);
  const [aktifBolum, setAktifBolum] = useState(1);

  const [devamEdildi, setDevamEdildi] = useState(false);
  const [tamEkran, setTamEkran] = useState(false);
  const [secim, setSecim] = useState<KelimeSecimi | null>(null);

  // Sesli Sayfa Okuyucu (YH-12)
  const [dinlemeAcik, setDinlemeAcik] = useState(false);
  const sayfaOkuyucu = useSayfaOkuyucu();

  // Cümle Kurucu Modu & Seçili Parçalar (YH-03)
  const [cumleKurmaModu, setCumleKurmaModu] = useState(false);
  const [seciliParcalar, setSeciliParcalar] = useState<SeciliKelimeParcasi[]>([]);

  // Okuyucu Ayarları (Aa)
  const [ayarlar, setAyarlar] = useState<OkuyucuAyarlariTipi>(VARSAYILAN_OKUYUCU_AYARLARI);
  const [ayarlarAcik, setAyarlarAcik] = useState(false);

  // Kayıtlı Kelimeler (Sağ Üst Nokta İçin)
  const [kayitliKelimeler, setKayitliKelimeler] = useState<Set<string>>(new Set());
  const [indiriliyor, setIndiriliyor] = useState(false);

  const handleCevrimdisiIndir = useCallback(async () => {
    if (indiriliyor || !kitapId) return;
    setIndiriliyor(true);
    try {
      const sayfalar = await api.getPagesBulk(kitapId, 1, 50);
      if (sayfalar && sayfalar.length > 0) {
        const eklenen = await kaydetSayfalar(kitapId, sayfalar);
        Alert.alert('Çevrimdışı İndirildi', `${eklenen} sayfa çevrimdışı okuma için kaydedildi.`);
      } else {
        Alert.alert('Çevrimdışı İndirme', 'İndirilebilir hazır sayfa bulunamadı.');
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Çevrimdışı indirilemedi.');
    } finally {
      setIndiriliyor(false);
    }
  }, [kitapId, indiriliyor]);

  // Çift İstek ve Yanıt Sırası Koruması (Race condition guard)
  const istekSayaciRef = useRef(0);
  const kaydirmaRef = useRef<ScrollView>(null);

  // Üst İlerleme Çizgisi Animasyonu
  const ilerlemeAnim = useSharedValue(0);

  // Okuyucu Ayarlarını AsyncStorage'dan Oku
  useEffect(() => {
    (async () => {
      const kayitli = await okuyucuAyarlariniOku();
      setAyarlar(kayitli);
    })();
  }, []);

  // Kayıtlı Kelimeleri Sunucudan Çek (Salt Okunur)
  useEffect(() => {
    (async () => {
      try {
        const kelimeListesi = await api.getWords();
        const set = new Set(
          kelimeListesi.map((w: any) => (w.word || w.kelime || '').toLowerCase().trim()),
        );
        setKayitliKelimeler(set);
      } catch {
        // Hata durumunda akış kesintiye uğramaz
      }
    })();
  }, []);

  const ayarGuncelle = useCallback(async (yeni: Partial<OkuyucuAyarlariTipi>) => {
    setAyarlar((prev) => {
      const guncel = { ...prev, ...yeni };
      okuyucuAyarlariniKaydet(guncel).catch(() => {});
      return guncel;
    });
  }, []);

  const yukle = useCallback(async () => {
    if (!Number.isFinite(kitapId)) {
      setHata('Geçersiz kitap.');
      setIlkYukleme(false);
      setSayfaDegisiyor(false);
      return;
    }

    const suankiIstekNo = ++istekSayaciRef.current;

    if (ilkYukleme) {
      setSayfaDegisiyor(false);
    } else {
      setSayfaDegisiyor(true);
    }

    setHata('');
    setSecim(null);

    try {
      let sayfaVerisi;
      try {
        sayfaVerisi = await api.readPage(kitapId, konum?.tur === 'sayfa' ? konum.no : undefined);

        if (sayfaVerisi.hasPages && sayfaVerisi.currentPage) {
          void kaydetSayfalar(kitapId, [
            {
              pageNumber: sayfaVerisi.currentPage.pageNumber,
              content: sayfaVerisi.currentPage.content,
              sentencesJson: sayfaVerisi.currentPage.sentencesJson,
              analizBekliyor: sayfaVerisi.analizBekliyor,
            },
          ]).catch(() => {});
        }
      } catch (err) {
        const sayfaNo = konum?.tur === 'sayfa' ? konum.no : 1;
        const yerel = await okuSayfa(kitapId, sayfaNo);
        if (yerel) {
          sayfaVerisi = {
            bookId: kitapId,
            bookTitle: kitapAdi || `Kitap #${kitapId}`,
            hasPages: true,
            currentPage: {
              id: yerel.pageNumber,
              pageNumber: yerel.pageNumber,
              content: yerel.content,
              sentencesJson: yerel.sentencesJson || '[]',
            },
            totalPages: 50,
            pageNumber: yerel.pageNumber,
            analizBekliyor: yerel.analizBekliyor,
          };
        } else {
          throw new Error('Bu sayfa çevrimdışı hazır değil.');
        }
      }

      if (suankiIstekNo !== istekSayaciRef.current) return;
      puanOlayi();

      if (sayfaVerisi.hasPages) {
        setSayfaliMi(true);
        setKitapAdi(sayfaVerisi.bookTitle);
        setToplamSayfa(sayfaVerisi.totalPages);
        setAktifSayfa(sayfaVerisi.pageNumber);
        setBolum(null);

        // Reanimated'ın derleyici uyumlu yazımı: `.value =` ataması React Compiler'da
        // "bu değer değiştirilemez" hatasıdır.
        ilerlemeAnim.set(withTiming(sayfaVerisi.pageNumber / (sayfaVerisi.totalPages || 1), {
          duration: 360,
        }));

        if (sayfaVerisi.currentPage?.sentencesJson) {
          try {
            setCumleler(cumleleriDuzenle(JSON.parse(sayfaVerisi.currentPage.sentencesJson)));
          } catch {
            setCumleler([]);
          }
        } else {
          setCumleler([]);
        }

        if (!konum) setDevamEdildi(sayfaVerisi.pageNumber > 1);
      } else {
        setSayfaliMi(false);
        const bolumVerisi = await api.readChapter(
          kitapId,
          konum?.tur === 'bolum' ? konum.no : undefined,
        );

        if (suankiIstekNo !== istekSayaciRef.current) return;

        setBolum(bolumVerisi.currentChapter);
        setKitapAdi(bolumVerisi.bookTitle);
        setToplamBolum(bolumVerisi.totalChapters);
        setAktifBolum(bolumVerisi.chapterNumber);

        ilerlemeAnim.set(withTiming(
          bolumVerisi.chapterNumber / (bolumVerisi.totalChapters || 1),
          { duration: 360 },
        ));

        if (!konum) setDevamEdildi(bolumVerisi.chapterNumber > 1);

        setAnalizEdiliyor(true);
        const analiz = await api.analyzeText(bolumVerisi.currentChapter.content);

        if (suankiIstekNo !== istekSayaciRef.current) return;
        setCumleler(cumleleriDuzenle(analiz.sentences));
      }
    } catch (e) {
      if (suankiIstekNo === istekSayaciRef.current) {
        setHata((e as Error).message || 'Yüklenemedi.');
      }
    } finally {
      if (suankiIstekNo === istekSayaciRef.current) {
        setIlkYukleme(false);
        setSayfaDegisiyor(false);
        setAnalizEdiliyor(false);
      }
    }
  }, [kitapId, konum, ilkYukleme, ilerlemeAnim, kitapAdi, puanOlayi]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  useEffect(() => {
    if (kelime && cumleler.length > 0 && !secim) {
      const bulunan = cumleler.find((c) =>
        c.words.some((w) => w.word.toLowerCase().replace(/[^a-z]/g, '') === kelime.toLowerCase()),
      );
      if (bulunan) {
        const w = bulunan.words.find(
          (x) => x.word.toLowerCase().replace(/[^a-z]/g, '') === kelime.toLowerCase(),
        );
        setSecim({
          kelime: w?.word ?? kelime,
          cumle: bulunan.original,
          tur: w?.type ?? 'sıfat',
        });
      }
    }
  }, [kelime, cumleler, secim]);

  const yenidenAnalizEt = async () => {
    if (analizEdiliyor || sayfaDegisiyor || ilkYukleme) return;
    setAnalizEdiliyor(true);
    try {
      if (sayfaliMi) {
        const veri = await api.reanalyzePage(kitapId, aktifSayfa);
        if (veri.sentencesJson && veri.sentencesJson !== '[]') {
          setCumleler(cumleleriDuzenle(JSON.parse(veri.sentencesJson)));
        }
      } else if (bolum?.content) {
        const analiz = await api.analyzeText(bolum.content);
        setCumleler(cumleleriDuzenle(analiz.sentences));
      }
    } catch (e) {
      setHata((e as Error).message || 'Yeniden analiz yapılamadı.');
    } finally {
      setAnalizEdiliyor(false);
    }
  };

  const suanki = sayfaliMi ? aktifSayfa : aktifBolum;
  const toplam = sayfaliMi ? toplamSayfa : toplamBolum;

  const konumaGit = (no: number, hedefYon: Yon = 'atla') => {
    if (no < 1 || (toplam > 0 && no > toplam)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setYon(hedefYon);
    setSeciliParcalar([]); // Sayfa değişince eski seçimi temizle
    setKonum({ tur: sayfaliMi ? 'sayfa' : 'bolum', no });
    setDevamEdildi(false);
    kaydirmaRef.current?.scrollTo({ y: 0, animated: !HareketiAzalt });
  };

  const sonraki = () => konumaGit(suanki + 1, 'ileri');
  const onceki = () => konumaGit(suanki - 1, 'geri');

  // Cümle Kurucu İşleyicileri (YH-03)
  const handleKelimeKurmaDokun = useCallback(
    (cumleIndex: number, kelimeIndex: number, rawWord: string) => {
      const { govde, son } = kelimeyiAyir(rawWord);
      if (!govde) return;

      setSeciliParcalar((prev) => {
        const varIndex = prev.findIndex(
          (p) => p.cumleIndex === cumleIndex && p.kelimeIndex === kelimeIndex,
        );
        if (varIndex >= 0) {
          return prev.filter((_, i) => i !== varIndex);
        }
        return [
          ...prev,
          {
            cumleIndex,
            kelimeIndex,
            word: rawWord,
            govde,
            son,
          },
        ];
      });
    },
    [],
  );

  const handleTumunuSec = useCallback(
    (cumleIndex: number) => {
      const hedefCumle = cumleler[cumleIndex];
      if (!hedefCumle || !hedefCumle.words) return;

      setSeciliParcalar((prev) => {
        const digerleri = prev.filter((p) => p.cumleIndex !== cumleIndex);

        const yeniParcalar: SeciliKelimeParcasi[] = hedefCumle.words
          .map((w, kIndex) => {
            const { govde, son } = kelimeyiAyir(w.word);
            if (!govde) return null;
            return {
              cumleIndex,
              kelimeIndex: kIndex,
              word: w.word,
              govde,
              son,
            };
          })
          .filter(Boolean) as SeciliKelimeParcasi[];

        return [...digerleri, ...yeniParcalar];
      });
    },
    [cumleler],
  );

  const handleParcaCikar = useCallback((index: number) => {
    setSeciliParcalar((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleKurmaTemizle = useCallback(() => {
    setSeciliParcalar([]);
  }, []);

  // Parmakla Sayfa Çevirme Jesti (Gesture.Pan)
  // Jest nesnesi her render'da yeniden kurulmaz (RNGH önerisi); render sırasında
  // kurulan jest React Compiler'da "render sırasında ref erişimi" hatası veriyor.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-30, 30])
        .failOffsetY([-18, 18])
        // Geri çağırım render sırasında DEĞİL, parmak kalktığında çalışır; derleyici bir
        // nesne yöntemine verilen fonksiyonun hemen çağrılıp çağrılmadığını ayırt edemiyor.
        // Bu bileşen derleyici tarafından optimize edilmeden bırakılır (güvenli geri düşüş).
        // eslint-disable-next-line react-hooks/refs
        .onEnd((e) => {
          if (e.translationX < -80 || e.velocityX < -650) {
            sonraki();
          } else if (e.translationX > 80 || e.velocityX > 650) {
            onceki();
          }
        }),
    [sonraki, onceki],
  );

  const ilerlemeCizgisiStili = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, ilerlemeAnim.value * 100))}%`,
  }));

  const getEnteringAnimation = () => {
    if (HareketiAzalt) return undefined;
    if (yon === 'ileri') return FadeInRight.duration(280);
    if (yon === 'geri') return FadeInLeft.duration(280);
    return FadeIn.duration(220);
  };

  const getExitingAnimation = () => {
    if (HareketiAzalt) return undefined;
    if (yon === 'ileri') return FadeOutLeft.duration(160);
    if (yon === 'geri') return FadeOutRight.duration(160);
    return undefined;
  };

  if (ilkYukleme) {
    return (
      <EkranZemini>
        <SafeAreaView style={{ flex: 1 }}>
          <Yukleniyor mesaj="Sayfa hazırlanıyor…" />
        </SafeAreaView>
      </EkranZemini>
    );
  }

  if (hata && cumleler.length === 0 && !sayfaDegisiyor) {
    return (
      <EkranZemini>
        <SafeAreaView style={{ flex: 1, padding: Bosluk.lg, gap: Bosluk.lg }}>
          <HataKutusu mesaj={hata} />
          <Buton
            baslik="Kitaplığa Dön"
            tur="ikincil"
            ikon={<ArrowLeft size={15} color={palet.onSurface} />}
            onPress={() => router.back()}
          />
        </SafeAreaView>
      </EkranZemini>
    );
  }

  const suankiCumleBaglami =
    seciliParcalar.length > 0 && cumleler[seciliParcalar[0].cumleIndex]
      ? cumleler[seciliParcalar[0].cumleIndex].original
      : undefined;

  const kitapKonumBilgisi = `${kitapAdi}, ${sayfaliMi ? `s. ${aktifSayfa}` : `bölüm ${aktifBolum}`}`;

  return (
    <EkranZemini>
      <SafeAreaView style={{ flex: 1 }} edges={tamEkran ? ['top'] : ['top', 'bottom']}>
        {/* ── Başlık Şeridi ── */}
        {!tamEkran ? (
          <Animated.View
            entering={HareketiAzalt ? undefined : FadeIn.duration(200)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: Bosluk.sm,
              paddingHorizontal: Bosluk.md,
              paddingVertical: Bosluk.sm,
              borderBottomWidth: 1,
              borderBottomColor: palet.outlineVariant,
            }}
          >
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityLabel="Kitaplığa dön"
              style={{ padding: 6 }}
            >
              <ArrowLeft size={20} color={palet.onSurface} />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Metin tur="altBaslik" numberOfLines={1}>
                {kitapAdi}
              </Metin>
              <Metin tur="minik" ikincil>
                {sayfaliMi
                  ? `Sayfa ${aktifSayfa} / ${toplamSayfa}`
                  : `Bölüm ${aktifBolum} / ${toplamBolum}`}
              </Metin>
            </View>

            {/* ✨ Cümle Kur Modu Düğmesi (YH-03) */}
            <Pressable
              onPress={() => {
                const yeniMod = !cumleKurmaModu;
                setCumleKurmaModu(yeniMod);
                if (!yeniMod) setSeciliParcalar([]);
                Haptics.selectionAsync().catch(() => {});
              }}
              hitSlop={6}
              accessibilityLabel="Cümle kur modunu aç veya kapat"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: Yaricap.md,
                backgroundColor: cumleKurmaModu ? palet.primary : alpha(palet.primary, 0.12),
              }}
            >
              <Sparkles
                size={15}
                color={cumleKurmaModu ? palet.onPrimary : palet.primary}
              />
              <Metin
                tur="minik"
                kalin
                renk={cumleKurmaModu ? palet.onPrimary : palet.primary}
              >
                Cümle Kur
              </Metin>
            </Pressable>

            {/* Aa Ayarlar Düğmesi */}
            <Pressable
              onPress={() => setAyarlarAcik(true)}
              hitSlop={8}
              accessibilityLabel="Okuma ayarları"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: Yaricap.md,
                backgroundColor: alpha(palet.primary, 0.12),
              }}
            >
              <Type size={15} color={palet.primary} />
              <Metin tur="minik" kalin renk={palet.primary}>
                Aa
              </Metin>
            </Pressable>

            <Pressable
              onPress={() => {
                if (!dinlemeAcik) {
                  setDinlemeAcik(true);
                  const metinler = cumleler.map((c) => c.original);
                  sayfaOkuyucu.baslat(metinler, 0);
                } else {
                  setDinlemeAcik(false);
                  sayfaOkuyucu.durdur();
                }
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: Bosluk.md,
                paddingVertical: 6,
                borderRadius: Yaricap.tam,
                backgroundColor: dinlemeAcik ? alpha(palet.primary, 0.25) : alpha(palet.primary, 0.12),
                borderWidth: 1,
                borderColor: alpha(palet.primary, 0.3),
              }}
            >
              <Headphones size={13} color={palet.primary} />
              <Metin tur="minik" renk={palet.primary}>
                Dinle
              </Metin>
            </Pressable>

            {!sayfaliMi && bolum ? (
              <Pressable
                onPress={() => router.push(`/books/${kitapId}/quiz?chapterId=${bolum.id}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: Bosluk.md,
                  paddingVertical: 6,
                  borderRadius: Yaricap.tam,
                  backgroundColor: alpha(palet.primary, 0.12),
                  borderWidth: 1,
                  borderColor: alpha(palet.primary, 0.3),
                }}
              >
                <HelpCircle size={13} color={palet.primary} />
                <Metin tur="minik" renk={palet.primary}>
                  Quiz
                </Metin>
              </Pressable>
            ) : null}

            {sayfaliMi ? (
              <Pressable
                onPress={handleCevrimdisiIndir}
                disabled={indiriliyor}
                hitSlop={8}
                accessibilityLabel="Çevrimdışı indir"
                style={{ padding: 6, opacity: indiriliyor ? 0.4 : 1 }}
              >
                <Download size={17} color={palet.primary} />
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => setTamEkran(true)}
              hitSlop={8}
              accessibilityLabel="Tam ekran okuma"
              style={{ padding: 6 }}
            >
              <Maximize2 size={17} color={palet.onSurfaceVariant} />
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Üst İlerleme Çizgisi (3px) */}
        <View style={{ height: 3, backgroundColor: palet.outlineVariant, width: '100%' }}>
          <Animated.View
            style={[
              { height: 3, backgroundColor: palet.primary },
              ilerlemeCizgisiStili,
            ]}
          />
        </View>

        {/* Cümle Kurma Modu Üst İnce Bilgi Bandı */}
        {cumleKurmaModu ? (
          <Animated.View
            entering={HareketiAzalt ? undefined : FadeInDown.duration(180)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: Bosluk.md,
              paddingVertical: 6,
              backgroundColor: alpha(palet.primary, 0.12),
            }}
          >
            <Metin tur="minik" kalin renk={palet.primary}>
              ✨ Cümle kurma modu aktif — Kelimelere sırayla dokun
            </Metin>
            <Pressable
              onPress={() => {
                setCumleKurmaModu(false);
                setSeciliParcalar([]);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Cümle kurma modunu kapat"
            >
              <X size={14} color={palet.primary} />
            </Pressable>
          </Animated.View>
        ) : null}

        {/* ── İçerik Alanı (Pan Gesture Destekli) ── */}
        <GestureDetector gesture={panGesture}>
          <ScrollView
            ref={kaydirmaRef}
            contentContainerStyle={{
              padding: Bosluk.lg,
              paddingBottom: seciliParcalar.length > 0 ? 360 : secim ? 320 : Bosluk.xxxl,
              gap: Bosluk.md,
            }}
          >
            {/* Kaldığı Yerin Bildirimi */}
            {devamEdildi ? (
              <Animated.View entering={HareketiAzalt ? undefined : FadeInDown.duration(280)}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Bosluk.sm,
                    padding: Bosluk.md,
                    borderRadius: Yaricap.lg,
                    backgroundColor: alpha(palet.primary, 0.1),
                    borderWidth: 1,
                    borderColor: alpha(palet.primary, 0.28),
                  }}
                >
                  <BookOpen size={16} color={palet.primary} />
                  <Metin tur="minik" style={{ flex: 1, lineHeight: 16 }}>
                    Kaldığın yerden devam ediyorsun —{' '}
                    <Metin tur="minik" kalin renk={palet.primary}>
                      {sayfaliMi ? `sayfa ${aktifSayfa}` : `bölüm ${aktifBolum}`}
                    </Metin>
                  </Metin>
                  <Pressable onPress={() => konumaGit(1, 'atla')} hitSlop={6}>
                    <Metin tur="minik" renk={palet.primary}>
                      Baştan başla
                    </Metin>
                  </Pressable>
                  <Pressable
                    onPress={() => setDevamEdildi(false)}
                    hitSlop={8}
                    accessibilityLabel="Bildirimi kapat"
                  >
                    <X size={14} color={palet.onSurfaceVariant} />
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            {hata ? <HataKutusu mesaj={hata} /> : null}

            {sayfaDegisiyor ? (
              <SayfaIskeleti />
            ) : (
              <Animated.View
                key={`${sayfaliMi ? aktifSayfa : aktifBolum}-${yon}`}
                entering={getEnteringAnimation()}
                exiting={getExitingAnimation()}
              >
                {analizEdiliyor ? (
                  <Yukleniyor mesaj="Analiz yapılıyor…" />
                ) : cumleler.length === 0 ? (
                  <Kart>
                    <Metin tur="kucuk" ikincil ortala>
                      Bu sayfada metin bulunamadı.
                    </Metin>
                  </Kart>
                ) : (
                  <CumleGorunumu
                    cumleler={cumleler}
                    kelimeSecildi={setSecim}
                    yenidenDene={!sayfaliMi || yenidenAnalizEdebilir ? yenidenAnalizEt : undefined}
                    yenileniyor={analizEdiliyor}
                    yaziBoyutu={ayarlar.yaziBoyutu}
                    renkliKelimeler={ayarlar.renkliKelimeler}
                    kayitliKelimeler={kayitliKelimeler}
                    cumleKurmaModu={cumleKurmaModu}
                    seciliParcalar={seciliParcalar}
                    onKelimeKurmaDokun={handleKelimeKurmaDokun}
                    onTumunuSec={handleTumunuSec}
                    aktifDinlemeCumleIndex={dinlemeAcik && sayfaOkuyucu.durum !== 'bos' ? sayfaOkuyucu.aktifCumle : null}
                  />
                )}
              </Animated.View>
            )}
          </ScrollView>
        </GestureDetector>

        {/* ── Alt Kontrol Çubuğu ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: Bosluk.sm,
            paddingHorizontal: Bosluk.md,
            paddingVertical: Bosluk.sm,
            borderTopWidth: 1,
            borderTopColor: palet.outlineVariant,
            backgroundColor: palet.surfaceContainerLow,
          }}
        >
          <Pressable
            onPress={onceki}
            disabled={suanki <= 1 || sayfaDegisiyor}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: Bosluk.md,
              paddingVertical: Bosluk.sm,
              borderRadius: Yaricap.md,
              backgroundColor: palet.surfaceContainer,
              opacity: suanki <= 1 || sayfaDegisiyor ? 0.4 : 1,
            }}
          >
            <ChevronLeft size={16} color={palet.onSurface} />
            <Metin tur="minik">Önceki</Metin>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
            <Metin tur="minik" ikincil>
              {suanki} / {toplam || 1}
            </Metin>

            {tamEkran ? (
              <Pressable
                onPress={() => setTamEkran(false)}
                hitSlop={6}
                accessibilityLabel="Normal ekran"
                style={{ padding: 6 }}
              >
                <Minimize2 size={15} color={palet.onSurfaceVariant} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={sonraki}
            disabled={(toplam > 0 && suanki >= toplam) || sayfaDegisiyor}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: Bosluk.md,
              paddingVertical: Bosluk.sm,
              borderRadius: Yaricap.md,
              backgroundColor: palet.primary,
              opacity: (toplam > 0 && suanki >= toplam) || sayfaDegisiyor ? 0.4 : 1,
            }}
          >
            <Metin tur="minik" renk={palet.onPrimary}>
              Sonraki
            </Metin>
            <ChevronRight size={16} color={palet.onPrimary} />
          </Pressable>
        </View>

        {/* Cümle Kurucu Paneli (YH-03) */}
        {cumleKurmaModu ? (
          <CumleKurucuPaneli
            seciliParcalar={seciliParcalar}
            baglamMetni={suankiCumleBaglami}
            kitapBilgisi={kitapKonumBilgisi}
            onParcaCikar={handleParcaCikar}
            onTemizle={handleKurmaTemizle}
            onKapat={() => setCumleKurmaModu(false)}
          />
        ) : null}

        {/* Aa Ayarlar Modalı */}
        <OkuyucuAyarlariModal
          acik={ayarlarAcik}
          ayarlar={ayarlar}
          onGuncelle={ayarGuncelle}
          onKapat={() => setAyarlarAcik(false)}
        />

        {/* Sesli Sayfa Okuyucu Paneli (YH-12) */}
        {dinlemeAcik ? (
          <SayfaOkuyucuPaneli
            durum={sayfaOkuyucu.durum}
            aktifCumle={sayfaOkuyucu.aktifCumle}
            toplamCumle={cumleler.length}
            hiz={sayfaOkuyucu.hiz}
            ses={sayfaOkuyucu.ses}
            mevcutSesler={sayfaOkuyucu.mevcutSesler}
            onOynatDuraklat={() => {
              if (sayfaOkuyucu.durum === 'caliyor') {
                sayfaOkuyucu.duraklat();
              } else if (sayfaOkuyucu.durum === 'duraklatildi') {
                sayfaOkuyucu.devam();
              } else {
                const metinler = cumleler.map((c) => c.original);
                sayfaOkuyucu.baslat(metinler, 0);
              }
            }}
            onOnceki={sayfaOkuyucu.onceki}
            onSonraki={sayfaOkuyucu.sonraki}
            onHizDegistir={sayfaOkuyucu.hizDegistir}
            onSesDegistir={sayfaOkuyucu.sesDegistir}
            onKapat={() => {
              setDinlemeAcik(false);
              sayfaOkuyucu.durdur();
            }}
          />
        ) : null}

        <KelimePaneli secim={secim} kapat={() => setSecim(null)} otoEkle={ekle === 'true'} />
      </SafeAreaView>
    </EkranZemini>
  );
}
