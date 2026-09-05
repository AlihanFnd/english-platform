import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CumleGorunumu } from '@/components/CumleGorunumu';
import { KelimePaneli, KelimeSecimi } from '@/components/KelimePaneli';
import { Buton, EkranZemini, HataKutusu, Kart, Metin, Yukleniyor } from '@/components/ui';
import { useKimlik } from '@/context/AuthContext';
import { useRenk } from '@/context/ThemeContext';
import { Chapter, api } from '@/lib/api';
import { OkumaCumlesi, cumleleriDuzenle } from '@/lib/cumleler';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap } from '@/theme/tokens';

/** Kullanıcının seçtiği konum. `undefined` = "sunucu kaldığım yeri bulsun". */
type Konum = { tur: 'sayfa' | 'bolum'; no: number } | undefined;

const YAZI_EN_KUCUK = 14;
const YAZI_EN_BUYUK = 26;

export default function OkuyucuEkrani() {
  const palet = useRenk();
  const router = useRouter();
  const { id, kelime, ekle } = useLocalSearchParams<{ id: string; kelime?: string; ekle?: string }>();
  const kitapId = Number(id);

  const [konum, setKonum] = useState<Konum>(undefined);

  const [kitapAdi, setKitapAdi] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);
  const { kullanici } = useKimlik();
  // KURAL-17: paylaşılan analizi ezme yetkisi öğretmen/yönetimde.
  const yenidenAnalizEdebilir =
    kullanici?.role === 'teacher' || kullanici?.role === 'admin';

  const [analizEdiliyor, setAnalizEdiliyor] = useState(false);
  const [cumleler, setCumleler] = useState<OkumaCumlesi[]>([]);
  const [hata, setHata] = useState('');

  const [sayfaliMi, setSayfaliMi] = useState(false);
  const [toplamSayfa, setToplamSayfa] = useState(0);
  const [aktifSayfa, setAktifSayfa] = useState(1);

  const [bolum, setBolum] = useState<Chapter | null>(null);
  const [toplamBolum, setToplamBolum] = useState(1);
  const [aktifBolum, setAktifBolum] = useState(1);

  /** Kitap kaldığı yerden mi açıldı? Kullanıcıya bir kez bildirilir. */
  const [devamEdildi, setDevamEdildi] = useState(false);

  const [tamEkran, setTamEkran] = useState(false);
  const [yaziBoyutu, setYaziBoyutu] = useState<number>(Olcek.baslik);
  const [secim, setSecim] = useState<KelimeSecimi | null>(null);

  const kaydirmaRef = useRef<ScrollView>(null);

  const yukle = useCallback(async () => {
    if (!Number.isFinite(kitapId)) {
      setHata('Geçersiz kitap.');
      setYukleniyor(false);
      return;
    }

    setYukleniyor(true);
    setHata('');
    setCumleler([]);
    setSecim(null);

    try {
      const sayfaVerisi = await api.readPage(kitapId, konum?.tur === 'sayfa' ? konum.no : undefined);

      if (sayfaVerisi.hasPages) {
        setSayfaliMi(true);
        setKitapAdi(sayfaVerisi.bookTitle);
        setToplamSayfa(sayfaVerisi.totalPages);
        setAktifSayfa(sayfaVerisi.pageNumber);
        setBolum(null);

        if (sayfaVerisi.currentPage?.sentencesJson) {
          try {
            setCumleler(cumleleriDuzenle(JSON.parse(sayfaVerisi.currentPage.sentencesJson)));
          } catch {
            setCumleler([]);
          }
        }

        // Konum İSTENMEDİYSE ve sunucu 1'den ileri bir sayfa döndüyse,
        // kullanıcıya bunun bir "devam" olduğunu söylüyoruz. Sessizce ortadan
        // bir sayfa açmak "yanlış sayfayı açtım" hissi veriyor.
        if (!konum) setDevamEdildi(sayfaVerisi.pageNumber > 1);
      } else {
        setSayfaliMi(false);
        const bolumVerisi = await api.readChapter(
          kitapId,
          konum?.tur === 'bolum' ? konum.no : undefined,
        );
        setBolum(bolumVerisi.currentChapter);
        setKitapAdi(bolumVerisi.bookTitle);
        setToplamBolum(bolumVerisi.totalChapters);
        setAktifBolum(bolumVerisi.chapterNumber);
        if (!konum) setDevamEdildi(bolumVerisi.chapterNumber > 1);

        // Bölüm modunda çeviri KALICI DEĞİL: her okumada anlık üretilir.
        setAnalizEdiliyor(true);
        const analiz = await api.analyzeText(bolumVerisi.currentChapter.content);
        setCumleler(cumleleriDuzenle(analiz.sentences));
      }
    } catch (e) {
      setHata((e as Error).message || 'Yüklenemedi.');
    } finally {
      setYukleniyor(false);
      setAnalizEdiliyor(false);
    }
  }, [kitapId, konum]);

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
    if (analizEdiliyor || yukleniyor) return;
    setAnalizEdiliyor(true);
    try {
      if (sayfaliMi) {
        // KURAL-17: paylaşılan analizi yeniden üretmek ayrı bir POST ucudur
        // ve yalnızca öğretmen/yönetici çağırabilir. BookPage global —
        // bu çağrı BÜTÜN kullanıcıların gördüğü çeviriyi değiştirir.
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

  const konumaGit = (no: number) => {
    setKonum({ tur: sayfaliMi ? 'sayfa' : 'bolum', no });
    setDevamEdildi(false);
    kaydirmaRef.current?.scrollTo({ y: 0, animated: true });
  };

  const suanki = sayfaliMi ? aktifSayfa : aktifBolum;
  const toplam = sayfaliMi ? toplamSayfa : toplamBolum;

  if (yukleniyor) {
    return (
      <EkranZemini>
        <SafeAreaView style={{ flex: 1 }}>
          <Yukleniyor mesaj="Sayfa hazırlanıyor…" />
        </SafeAreaView>
      </EkranZemini>
    );
  }

  if (hata && cumleler.length === 0) {
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

  return (
    <EkranZemini>
      <SafeAreaView style={{ flex: 1 }} edges={tamEkran ? ['top'] : ['top', 'bottom']}>
        {/* ── Başlık şeridi ── */}
        {!tamEkran ? (
          <Animated.View
            entering={FadeIn.duration(200)}
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

        <ScrollView
          ref={kaydirmaRef}
          contentContainerStyle={{
            padding: Bosluk.lg,
            paddingBottom: secim ? 320 : Bosluk.xxxl,
            gap: Bosluk.md,
          }}
        >
          {/* Kaldığı yerden açıldığını SÖYLE. */}
          {devamEdildi ? (
            <Animated.View entering={FadeInDown.duration(280)}>
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
                <Pressable onPress={() => konumaGit(1)} hitSlop={6}>
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

          {analizEdiliyor ? (
            <Yukleniyor mesaj="Analiz yapılıyor…" />
          ) : cumleler.length === 0 ? (
            <Kart>
              <Metin tur="kucuk" ikincil ortala>
                Bu sayfada metin bulunamadı.
              </Metin>
            </Kart>
          ) : (
            /* KURAL-17: sayfa modunda "yeniden dene" PAYLAŞILAN analizi ezer —
               buton yalnızca öğretmen/yöneticiye verilir. Gizlemek TEK BAŞINA
               yetmez; asıl kontrol backend'de ([Authorize(Policy=…)]). */
            <CumleGorunumu
              cumleler={cumleler}
              kelimeSecildi={setSecim}
              yenidenDene={!sayfaliMi || yenidenAnalizEdebilir ? yenidenAnalizEt : undefined}
              yenileniyor={analizEdiliyor}
              yaziBoyutu={yaziBoyutu}
            />
          )}
        </ScrollView>

        {/* ── Alt kontrol çubuğu ── */}
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
            onPress={() => konumaGit(suanki - 1)}
            disabled={suanki <= 1}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: Bosluk.md,
              paddingVertical: Bosluk.sm,
              borderRadius: Yaricap.md,
              backgroundColor: palet.surfaceContainer,
              opacity: suanki <= 1 ? 0.4 : 1,
            }}
          >
            <ChevronLeft size={16} color={palet.onSurface} />
            <Metin tur="minik">Önceki</Metin>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
            <Pressable
              onPress={() => setYaziBoyutu((b) => Math.max(YAZI_EN_KUCUK, b - 2))}
              hitSlop={6}
              accessibilityLabel="Yazıyı küçült"
              style={{ padding: 6 }}
            >
              <Minus size={15} color={palet.onSurfaceVariant} />
            </Pressable>
            <Metin tur="minik" ikincil>
              {suanki} / {toplam || 1}
            </Metin>
            <Pressable
              onPress={() => setYaziBoyutu((b) => Math.min(YAZI_EN_BUYUK, b + 2))}
              hitSlop={6}
              accessibilityLabel="Yazıyı büyült"
              style={{ padding: 6 }}
            >
              <Plus size={15} color={palet.onSurfaceVariant} />
            </Pressable>
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
            onPress={() => konumaGit(suanki + 1)}
            disabled={toplam > 0 && suanki >= toplam}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: Bosluk.md,
              paddingVertical: Bosluk.sm,
              borderRadius: Yaricap.md,
              backgroundColor: palet.primary,
              opacity: toplam > 0 && suanki >= toplam ? 0.4 : 1,
            }}
          >
            <Metin tur="minik" renk={palet.onPrimary}>
              Sonraki
            </Metin>
            <ChevronRight size={16} color={palet.onPrimary} />
          </Pressable>
        </View>

        <KelimePaneli secim={secim} kapat={() => setSecim(null)} otoEkle={ekle === 'true'} />
      </SafeAreaView>
    </EkranZemini>
  );
}
