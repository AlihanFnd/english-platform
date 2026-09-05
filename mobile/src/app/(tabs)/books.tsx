import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  FileText,
  Layers,
  Search,
  X,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { UstBar } from '@/components/UstBar';
import {
  BosDurum,
  Buton,
  EkranZemini,
  HataKutusu,
  IlerlemeCubugu,
  Kart,
  Metin,
  Rozet,
  Yukleniyor,
} from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { Book, Taxonomy, api } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi, golge } from '@/theme/tokens';

/**
 * KURAL-05 — Taksonomi sunucudan gelir, GÖRÜNÜM burada kalır.
 * Hangi seviyelerin olduğu backend whitelist'inin işi; etiket ve rengi arayüzün.
 */
const SEVIYE_GORUNUM: Record<string, { label: string; subtitle?: string }> = {
  A1: { label: 'A1', subtitle: 'Beginner' },
  'A1-A2': { label: 'A1 - A2', subtitle: 'Elementary' },
  A2: { label: 'A2', subtitle: 'Pre-Intermediate' },
  'A2-B1': { label: 'A2 - B1', subtitle: 'Pre to Inter' },
  B1: { label: 'B1', subtitle: 'Intermediate' },
  'B1-B2': { label: 'B1 - B2', subtitle: 'Upper Inter' },
  B2: { label: 'B2', subtitle: 'Upper Inter+' },
  'B2-C1': { label: 'B2 - C1', subtitle: 'Adv Transition' },
  C1: { label: 'C1', subtitle: 'Advanced' },
  'C1-C2': { label: 'C1 - C2', subtitle: 'Prof Transition' },
  C2: { label: 'C2', subtitle: 'Mastery' },
};

const KATEGORI_GORUNUM: Record<string, { label: string; Simge: typeof BookOpen }> = {
  story: { label: 'Hikayeler', Simge: BookOpen },
  article: { label: 'Makaleler', Simge: FileText },
  other: { label: 'Diğer', Simge: Bookmark },
};

/** Yalnızca taksonomi ucu erişilemezse kullanılır — filtreler asla boş kalmasın. */
const YEDEK_TAKSONOMI: Taxonomy = {
  levels: ['A1', 'A1-A2', 'A2', 'A2-B1', 'B1', 'B1-B2', 'B2', 'B2-C1', 'C1', 'C1-C2', 'C2'],
  categories: ['story', 'article', 'other'],
  languages: ['en'],
};

export default function KitaplikEkrani() {
  const palet = useRenk();
  const router = useRouter();
  const sekmeYuksekligi = useBottomTabBarHeight();

  const [kitaplar, setKitaplar] = useState<Book[]>([]);
  const [arama, setArama] = useState('');
  const [kategori, setKategori] = useState('all');
  const [seviye, setSeviye] = useState('all');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const [hata, setHata] = useState('');
  const [taksonomi, setTaksonomi] = useState<Taxonomy>(YEDEK_TAKSONOMI);

  const yukle = async () => {
    try {
      setHata('');
      setKitaplar(await api.getBooks());
    } catch (e) {
      setHata((e as Error).message || 'Kitaplar yüklenirken hata oluştu.');
    } finally {
      setYukleniyor(false);
      setTazeleniyor(false);
    }
  };

  useEffect(() => {
    yukle();
    // Taksonomi AYRI yüklenir: başarısız olursa kitap listesi yine de gelsin.
    api
      .getTaxonomy()
      .then((t) => {
        if (t?.levels?.length) setTaksonomi(t);
      })
      .catch(() => {
        /* yedekte kalınır */
      });
  }, []);

  const seviyeler = useMemo(
    () => [
      { id: 'all', label: 'Tüm Seviyeler' },
      ...taksonomi.levels.map((id) => ({ id, label: SEVIYE_GORUNUM[id]?.label ?? id })),
    ],
    [taksonomi],
  );

  const kategoriler = useMemo(
    () => [
      { id: 'all', label: 'Tümü', Simge: Layers },
      ...taksonomi.categories.map((id) => ({
        id,
        label: KATEGORI_GORUNUM[id]?.label ?? id,
        Simge: KATEGORI_GORUNUM[id]?.Simge ?? Bookmark,
      })),
    ],
    [taksonomi],
  );

  const suzulmus = useMemo(() => {
    const q = arama.toLowerCase();
    return kitaplar.filter((k) => {
      const aramaUyar =
        (k.title || '').toLowerCase().includes(q) ||
        (k.author || '').toLowerCase().includes(q) ||
        (k.description || '').toLowerCase().includes(q);

      const kategoriUyar =
        kategori === 'all' ||
        (kategori === 'story' && (!k.category || k.category === 'story')) ||
        k.category === kategori;

      const seviyeUyar =
        seviye === 'all' || (seviye === 'A1' && !k.level) || k.level === seviye;

      return aramaUyar && kategoriUyar && seviyeUyar;
    });
  }, [kitaplar, arama, kategori, seviye]);

  function seviyeRengi(seviyeMetni?: string): string {
    const s = seviyeMetni || 'A1';
    if (s.includes('A1') || s.includes('A2')) return '#10b981';
    if (s.includes('B1')) return '#0ea5e9';
    if (s.includes('B2')) return '#6366f1';
    if (s.includes('C1') || s.includes('C2')) return '#a855f7';
    return palet.primary;
  }

  return (
    <EkranZemini>
      <UstBar baslik="Kitaplık" altBaslik={`${kitaplar.length} içerik`} />

      {yukleniyor ? (
        <Yukleniyor mesaj="Kitaplık hazırlanıyor…" />
      ) : (
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
          {/* Arama */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: Bosluk.sm,
              backgroundColor: palet.surfaceContainer,
              borderWidth: 1,
              borderColor: palet.outlineVariant,
              borderRadius: Yaricap.lg,
              paddingHorizontal: Bosluk.md,
            }}
          >
            <Search size={16} color={palet.primary} />
            <TextInput
              value={arama}
              onChangeText={setArama}
              placeholder="Kitap veya yazar ara…"
              placeholderTextColor={alpha(palet.onSurfaceVariant, 0.6)}
              style={{
                flex: 1,
                paddingVertical: Bosluk.md,
                color: palet.onSurface,
                fontFamily: YaziTipi.govdeOrta,
                fontSize: Olcek.govde,
              }}
            />
            {arama ? (
              <Pressable onPress={() => setArama('')} hitSlop={10}>
                <X size={16} color={palet.onSurfaceVariant} />
              </Pressable>
            ) : null}
          </View>

          {/* Kategori kabarcıkları */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: Bosluk.sm, paddingRight: Bosluk.lg }}
          >
            {kategoriler.map(({ id, label, Simge }) => {
              const etkin = kategori === id;
              const adet =
                id === 'all'
                  ? kitaplar.length
                  : kitaplar.filter((k) =>
                      id === 'story' ? !k.category || k.category === 'story' : k.category === id,
                    ).length;
              return (
                <Pressable
                  key={id}
                  onPress={() => setKategori(id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: Bosluk.md,
                    paddingVertical: Bosluk.sm,
                    borderRadius: Yaricap.tam,
                    backgroundColor: etkin ? palet.primary : palet.surfaceContainer,
                    borderWidth: 1,
                    borderColor: etkin ? palet.primary : palet.outlineVariant,
                  }}
                >
                  <Simge size={14} color={etkin ? palet.onPrimary : palet.primary} />
                  <Metin tur="kucuk" kalin renk={etkin ? palet.onPrimary : palet.onSurfaceVariant}>
                    {label}
                  </Metin>
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: Yaricap.tam,
                      backgroundColor: etkin ? 'rgba(0,0,0,0.22)' : palet.surfaceContainerHighest,
                    }}
                  >
                    <Metin
                      tur="minik"
                      renk={etkin ? palet.onPrimary : palet.onSurfaceVariant}
                    >
                      {adet}
                    </Metin>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Seviye kabarcıkları */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: Bosluk.sm, paddingRight: Bosluk.lg }}
          >
            {seviyeler.map(({ id, label }) => {
              const etkin = seviye === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setSeviye(id)}
                  style={{
                    paddingHorizontal: Bosluk.md,
                    paddingVertical: 6,
                    borderRadius: Yaricap.tam,
                    backgroundColor: etkin ? alpha(palet.primary, 0.16) : 'transparent',
                    borderWidth: 1,
                    borderColor: etkin ? palet.primary : palet.outlineVariant,
                  }}
                >
                  <Metin tur="minik" renk={etkin ? palet.primary : palet.onSurfaceVariant}>
                    {label}
                  </Metin>
                </Pressable>
              );
            })}
          </ScrollView>

          {hata ? <HataKutusu mesaj={hata} /> : null}

          {suzulmus.length === 0 ? (
            <BosDurum
              simge={<BookOpen size={34} color={palet.primary} />}
              baslik="Kriterlerine uygun içerik bulunamadı"
              aciklama="Seçtiğin kategori veya CEFR seviyesi için henüz bir kitap eklenmemiş ya da aramanla eşleşmiyor."
              eylem={
                <Buton
                  baslik="Tüm Filtreleri Temizle"
                  tur="ikincil"
                  kucuk
                  onPress={() => {
                    setArama('');
                    setKategori('all');
                    setSeviye('all');
                  }}
                />
              }
            />
          ) : (
            suzulmus.map((kitap, sira) => {
              const ilerleme = kitap.progress ?? 0;
              const basladi = ilerleme > 0;
              const bitti = ilerleme >= 99;
              const svRenk = seviyeRengi(kitap.level);
              const kategoriEtiketi =
                kitap.category === 'article'
                  ? 'Makale'
                  : kitap.category === 'other'
                    ? 'Diğer'
                    : 'Hikaye';

              return (
                <Animated.View
                  key={kitap.id}
                  entering={FadeInDown.duration(320).delay(Math.min(sira, 8) * 45)}
                >
                  <Kart style={{ gap: Bosluk.md }}>
                    <View style={{ flexDirection: 'row', gap: Bosluk.md }}>
                      <LinearGradient
                        colors={[
                          kitap.coverColor || palet.primary,
                          alpha(kitap.coverColor || palet.primary, 0.55),
                        ]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          {
                            width: 72,
                            height: 104,
                            borderRadius: Yaricap.md,
                            padding: Bosluk.sm,
                            justifyContent: 'space-between',
                          },
                          golge(palet.glassShadow, 2),
                        ]}
                      >
                        <Metin
                          tur="minik"
                          renk="#ffffff"
                          numberOfLines={4}
                          style={{ lineHeight: 12 }}
                        >
                          {kitap.title}
                        </Metin>
                        <Metin
                          tur="minik"
                          renk="rgba(255,255,255,0.85)"
                          numberOfLines={1}
                          style={{ fontSize: 8 }}
                        >
                          {kitap.author || 'Anonim'}
                        </Metin>
                      </LinearGradient>

                      <View style={{ flex: 1, gap: 6 }}>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          <Rozet metin={kategoriEtiketi} renk={palet.onSurfaceVariant} />
                          <Rozet metin={kitap.level || 'A1'} renk={svRenk} />
                        </View>
                        <Metin tur="altBaslik" numberOfLines={2}>
                          {kitap.title}
                        </Metin>
                        <Metin tur="kucuk" ikincil numberOfLines={1}>
                          {kitap.author || 'Bilinmiyor'}
                        </Metin>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <BookOpen size={12} color={palet.primary} />
                          <Metin tur="minik" ikincil>
                            {/* KURAL-08: sayfa modundaki kitapların chaptersCount'u 0'dır. */}
                            {kitap.pagesCount && kitap.pagesCount > 0
                              ? `${kitap.pagesCount} Sayfa`
                              : `${kitap.chaptersCount || 1} Bölüm`}
                          </Metin>
                        </View>
                      </View>
                    </View>

                    {kitap.description ? (
                      <Metin tur="kucuk" ikincil numberOfLines={3} style={{ lineHeight: 18 }}>
                        {kitap.description}
                      </Metin>
                    ) : null}

                    {basladi ? (
                      <View style={{ gap: 5 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {bitti ? <CheckCircle2 size={12} color={palet.success} /> : null}
                            <Metin tur="minik" ikincil>
                              {bitti ? 'Tamamlandı' : 'İlerleme'}
                            </Metin>
                          </View>
                          <Metin tur="minik" renk={palet.primary}>
                            %{Math.round(ilerleme)}
                          </Metin>
                        </View>
                        <IlerlemeCubugu yuzde={ilerleme} tamamlandi={bitti} yukseklik={6} />
                      </View>
                    ) : null}

                    <Buton
                      /* Konum verilmiyor: sunucu kaldığı yeri kendisi çözer.
                         Sayfa modundaki kitaplar ?chapter= ile hiç devam etmiyordu. */
                      baslik={basladi ? (bitti ? 'Tekrar Oku' : 'Okumaya Devam Et') : 'Hemen Başla'}
                      tamGenislik
                      ikon={<ArrowRight size={15} color={palet.onPrimary} />}
                      onPress={() => router.push(`/books/${kitap.id}`)}
                    />
                  </Kart>
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      )}
    </EkranZemini>
  );
}
