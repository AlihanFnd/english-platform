import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import {
  BookMarked,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  Flame,
  Lightbulb,
  Play,
  Zap,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { IlkAcilisModal } from '@/components/IlkAcilisModal';
import { KitapKapagi } from '@/components/KitapKapagi';
import { UstBar } from '@/components/UstBar';
import { SeriKarti } from '@/components/seri/SeriKarti';
import {
  Buton,
  EkranZemini,
  HataKutusu,
  IlerlemeCubugu,
  Kart,
  KartIskeleti,
  Metin,
  Rozet,
  Yukleniyor,
} from '@/components/ui';
import { useKimlik } from '@/context/AuthContext';
import { useSeri } from '@/context/SeriContext';
import { useRenk } from '@/context/ThemeContext';
import { KelimeOzeti, ReadingProgress, User, api } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap, golge } from '@/theme/tokens';

const GUNUN_IPUCLARI = [
  'Her gün en az 10 dakika İngilizce okumak, kelime hazneni hızla geliştirir.',
  'Bilinmeyen kelimeleri bağlam içinde öğrenmek kalıcılığı 3 kat artırır.',
  'Takıldığın kelimelere dokunarak Türkçe karşılığını görebilir ve kaydedebilirsin.',
  'Öğrendiğin kelimeleri kelime kartları ile düzenli tekrar ederek pekiştir.',
  'Bölüm sonlarındaki quizleri çözerek okuduğunu anlama düzeyini ölçebilirsin.',
];

interface PanelVerisi {
  user: User;
  recentProgress: ReadingProgress[];
  wordCount: number;
  quizCount: number;
}

function bosBaslikBuyut(metin: string) {
  if (!metin) return '';
  return metin.charAt(0).toUpperCase() + metin.slice(1);
}

export default function PanelEkrani() {
  const palet = useRenk();
  const router = useRouter();
  const { kullanici } = useKimlik();
  const { ozet } = useSeri();
  const sekmeYuksekligi = useBottomTabBarHeight();

  const [veri, setVeri] = useState<PanelVerisi | null>(null);
  const [kelimeOzeti, setKelimeOzeti] = useState<KelimeOzeti | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const [hata, setHata] = useState('');
  const [ilkAcilisGoster, setIlkAcilisGoster] = useState(false);

  useEffect(() => {
    if (kullanici && ozet && ozet.ilkAcilisTamamlandi === false) {
      AsyncStorage.getItem(`linguza_ilk_acilis_${kullanici.id}`).then((val) => {
        if (!val) {
          setIlkAcilisGoster(true);
        }
      });
    }
  }, [kullanici, ozet]);

  const yukle = useCallback(async () => {
    try {
      setHata('');
      const [v, o] = await Promise.all([
        api.getDashboardStats(),
        api.getKelimeOzeti().catch(() => null),
      ]);
      setVeri(v);
      setKelimeOzeti(o);
    } catch (e) {
      setHata((e as Error).message || 'İstatistikler yüklenirken bir hata oluştu.');
    } finally {
      setYukleniyor(false);
      setTazeleniyor(false);
    }
  }, []);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const suanki = veri?.recentProgress?.[0] ?? null;
  const yuzde = suanki?.progressPercent ?? 0;

  const hizliErisim = [
    { ad: 'Kitap Okuma', ust: 'Kütüphane', yol: '/books' as const, Simge: BookOpen, dolu: true },
    { ad: 'Kelimelerim', ust: 'Kayıtlı', yol: '/words' as const, Simge: BookMarked, dolu: false },
    { ad: 'Metin Tara', ust: 'OCR', yol: '/ocr' as const, Simge: FileSearch, dolu: false },
  ];

  return (
    <EkranZemini>
      <UstBar baslik="Panel" altBaslik={`Merhaba ${bosBaslikBuyut(kullanici?.username ?? '')}`} />

      {yukleniyor ? (
        <KartIskeleti adet={4} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: Bosluk.lg,
            paddingTop: 0,
            paddingBottom: sekmeYuksekligi + Bosluk.xl,
            gap: Bosluk.md,
          }}
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
          {/* ── DUOLINGO-STYLE GÜNLÜK SERİ KARTI (YH-04) ── */}
          <SeriKarti />

          {hata ? <HataKutusu mesaj={hata} /> : null}

          {/* ── 0. BUGÜN TEKRAR KARTI (YH-06) ── */}
          {kelimeOzeti && kelimeOzeti.bugunTekrar > 0 ? (
            <Animated.View entering={FadeInDown.duration(300)}>
              <Kart style={{ backgroundColor: alpha(palet.primary, 0.08), borderColor: alpha(palet.primary, 0.3), gap: Bosluk.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm, flex: 1 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: Yaricap.md,
                        backgroundColor: alpha(palet.primary, 0.15),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Brain size={20} color={palet.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Metin tur="altBaslik">📚 Bugün {kelimeOzeti.bugunTekrar} Tekrar</Metin>
                      <Metin tur="minik" ikincil numberOfLines={1}>Aralıklı tekrar zamanı gelen kelimelerin var.</Metin>
                    </View>
                  </View>
                  <Buton
                    baslik="Tekrar Et"
                    kucuk
                    onPress={() => router.push('/words')}
                  />
                </View>
              </Kart>
            </Animated.View>
          ) : kelimeOzeti && kelimeOzeti.toplam > 0 ? (
            <Animated.View entering={FadeInDown.duration(300)}>
              <Kart style={{ gap: Bosluk.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <CheckCircle2 size={18} color={palet.success} />
                  <Metin tur="kucuk" style={{ flex: 1 }}>
                    Bugünlük tekrar bitti 🎉 · Yarın {kelimeOzeti.yarinTekrar} tekrar seni bekliyor.
                  </Metin>
                </View>
              </Kart>
            </Animated.View>
          ) : null}

          {/* ── 1. Okumaya devam et ── */}
          <Animated.View entering={FadeInDown.duration(360)}>
            {suanki ? (
              <Kart style={{ gap: Bosluk.lg }}>
                <View style={{ flexDirection: 'row', gap: Bosluk.lg }}>
                  <KitapKapagi
                    baslik={suanki.bookTitle}
                    renk={suanki.coverColor}
                    seviye={suanki.level}
                    kategori={suanki.category}
                    genislik={64}
                    yukseklik={92}
                  />

                  <View style={{ flex: 1, gap: Bosluk.sm }}>
                    <Rozet
                      metin="Okumaya Devam Et"
                      ikon={<Zap size={10} color={palet.primary} />}
                      style={{ alignSelf: 'flex-start' }}
                    />
                    <Metin tur="baslik" numberOfLines={2}>
                      {suanki.bookTitle}
                    </Metin>
                    <Metin tur="kucuk" ikincil>
                      {suanki.hasPages
                        ? `Sayfa ${suanki.currentChapter}${suanki.totalPages ? ` / ${suanki.totalPages}` : ''}`
                        : `Bölüm ${suanki.currentChapter}${suanki.totalChapters ? ` / ${suanki.totalChapters}` : ''}`}
                    </Metin>
                  </View>
                </View>

                <View style={{ gap: Bosluk.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Metin tur="minik" ikincil>
                      İLERLEME
                    </Metin>
                    <Metin tur="minik" renk={palet.primary}>
                      %{Math.round(yuzde)}
                    </Metin>
                  </View>
                  <IlerlemeCubugu yuzde={yuzde} />
                </View>

                <Buton
                  baslik="Okumaya Devam Et"
                  tamGenislik
                  ikon={<Play size={15} color={palet.onPrimary} fill={palet.onPrimary} />}
                  onPress={() => router.push(`/books/${suanki.bookId}`)}
                />
              </Kart>
            ) : (
              <Kart style={{ gap: Bosluk.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.md }}>
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: Yaricap.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: alpha(palet.primary, 0.12),
                    }}
                  >
                    <BookOpen size={22} color={palet.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Metin tur="altBaslik">Aktif Okuma Yok</Metin>
                    <Metin tur="kucuk" ikincil>
                      Kütüphaneden bir kitap seçerek başlayabilirsin.
                    </Metin>
                  </View>
                </View>
                <Buton baslik="Kitaplığa Git" tamGenislik onPress={() => router.push('/books')} />
              </Kart>
            )}
          </Animated.View>

          {/* ── 2. Sayaçlar + hızlı erişim ── */}
          <Animated.View entering={FadeInDown.duration(360).delay(80)}>
            <Kart style={{ gap: Bosluk.lg }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: Bosluk.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm, flex: 1 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: Yaricap.tam,
                      backgroundColor: palet.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Metin tur="kucuk" renk={palet.onPrimary}>
                      {(kullanici?.username?.[0] ?? 'K').toUpperCase()}
                    </Metin>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Metin tur="altBaslik" numberOfLines={1}>
                      {bosBaslikBuyut(kullanici?.username ?? '')}
                    </Metin>
                    <Metin tur="minik" ikincil>
                      Readixo
                    </Metin>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                  <View
                    style={{
                      paddingHorizontal: Bosluk.md,
                      paddingVertical: Bosluk.sm,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.primary, 0.1),
                      borderWidth: 1,
                      borderColor: alpha(palet.primary, 0.24),
                      alignItems: 'center',
                    }}
                  >
                    <Metin tur="altBaslik" renk={palet.primary}>
                      {veri?.wordCount ?? 0}
                    </Metin>
                    <Metin tur="minik" ikincil>
                      Kelime
                    </Metin>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: Bosluk.md,
                      paddingVertical: Bosluk.sm,
                      borderRadius: Yaricap.md,
                      backgroundColor: palet.surfaceContainer,
                      borderWidth: 1,
                      borderColor: palet.outlineVariant,
                      alignItems: 'center',
                    }}
                  >
                    <Metin tur="altBaslik">{veri?.quizCount ?? 0}</Metin>
                    <Metin tur="minik" ikincil>
                      Quiz
                    </Metin>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                {hizliErisim.map(({ ad, ust, yol, Simge, dolu }) => (
                  <Pressable
                    key={yol}
                    onPress={() => router.push(yol)}
                    accessibilityRole="button"
                    accessibilityLabel={`Hızlı erişim: ${ad}`}
                    style={({ pressed }) => ({
                      flex: 1,
                      gap: Bosluk.sm,
                      padding: Bosluk.md,
                      borderRadius: Yaricap.lg,
                      backgroundColor: dolu ? palet.primary : palet.surfaceContainer,
                      borderWidth: 1,
                      borderColor: dolu ? palet.primary : palet.outlineVariant,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    })}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: Yaricap.sm,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: dolu ? 'rgba(255,255,255,0.22)' : alpha(palet.primary, 0.12),
                      }}
                    >
                      <Simge size={15} color={dolu ? '#ffffff' : palet.primary} />
                    </View>
                    <View>
                      <Metin
                        tur="minik"
                        renk={dolu ? 'rgba(255,255,255,0.75)' : palet.onSurfaceVariant}
                      >
                        {ust}
                      </Metin>
                      <Metin tur="kucuk" kalin renk={dolu ? '#ffffff' : palet.onSurface}>
                        {ad}
                      </Metin>
                    </View>
                  </Pressable>
                ))}
              </View>
            </Kart>
          </Animated.View>

          {/* ── 3. İpucu + hedef ── */}
          <Animated.View entering={FadeInDown.duration(360).delay(160)} style={{ gap: Bosluk.md }}>
            <Kart style={{ flexDirection: 'row', gap: Bosluk.md }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: Yaricap.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: alpha(palet.primary, 0.12),
                }}
              >
                <Lightbulb size={18} color={palet.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Metin tur="etiket" ikincil>
                  Günün İpucu
                </Metin>
                <Metin tur="kucuk" style={{ lineHeight: 19 }}>
                  {GUNUN_IPUCLARI[new Date().getDate() % GUNUN_IPUCLARI.length]}
                </Metin>
              </View>
            </Kart>
          </Animated.View>

          {suanki && veri && veri.recentProgress.length > 1 ? (
            <Animated.View entering={FadeInDown.duration(360).delay(220)} style={{ gap: Bosluk.sm }}>
              <Metin tur="etiket" ikincil style={{ marginTop: Bosluk.sm }}>
                Son Okumaların
              </Metin>
              {veri.recentProgress.slice(1).map((ilerleme) => (
                <Pressable
                  key={`${ilerleme.bookId}-${ilerleme.lastRead}`}
                  onPress={() => router.push(`/books/${ilerleme.bookId}`)}
                >
                  <Kart dolgu={Bosluk.md} style={{ gap: Bosluk.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                      <BookOpen size={16} color={palet.primary} />
                      <Metin tur="kucuk" kalin numberOfLines={1} style={{ flex: 1 }}>
                        {ilerleme.bookTitle}
                      </Metin>
                      <Metin tur="minik" renk={palet.primary}>
                        %{Math.round(ilerleme.progressPercent)}
                      </Metin>
                      <ChevronRight size={14} color={palet.onSurfaceVariant} />
                    </View>
                    <IlerlemeCubugu yuzde={ilerleme.progressPercent} yukseklik={5} />
                  </Kart>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}
        </ScrollView>
      )}
      <IlkAcilisModal
        visible={ilkAcilisGoster}
        onClose={() => {
          if (kullanici) {
            AsyncStorage.setItem(`linguza_ilk_acilis_${kullanici.id}`, '1');
          }
          setIlkAcilisGoster(false);
        }}
        userId={kullanici?.id}
      />
    </EkranZemini>
  );
}
