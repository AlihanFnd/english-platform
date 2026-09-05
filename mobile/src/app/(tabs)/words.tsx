import * as Haptics from 'expo-haptics';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import {
  Award,
  Brain,
  Check,
  Edit3,
  GraduationCap,

  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  Volume2,
  X,
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
import { useRenk } from '@/context/ThemeContext';
import { useTelaffuz, KELIME_HIZI } from '@/hooks/useTelaffuz';
import { CalismaKarti, KelimeOzeti, WordItem, api } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

/**
 * Sunucudan gelen eş anlamlı metnini tekil önerilere ayırır.
 * Biçim: "• sıfat: esnek, elastik, çabuk iyileşen" (birden çok satır olabilir).
 */
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

const SEANS_SECENEKLERI = [10, 20, 30, 50];

export default function KelimelerimEkrani() {
  const palet = useRenk();
  const sekmeYuksekligi = useBottomTabBarHeight();
  const { seslendir, konusuyorMu } = useTelaffuz();

  const [kelimeler, setKelimeler] = useState<WordItem[]>([]);
  const [ozet, setOzet] = useState<KelimeOzeti | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const [hata, setHata] = useState('');

  /* Hızlı ekleme */
  const [hizliKelime, setHizliKelime] = useState('');
  const [hizliCeviri, setHizliCeviri] = useState('');
  const [ceviriliyor, setCeviriliyor] = useState(false);
  const [ekleniyor, setEkleniyor] = useState(false);
  const [alternatifler, setAlternatifler] = useState<string[]>([]);
  const kelimeAlaniRef = useRef<TextInput>(null);

  /* Kart durumu */
  const [cevrilenler, setCevrilenler] = useState<Set<number>>(new Set());
  const [duzenlenenId, setDuzenlenenId] = useState<number | null>(null);
  const [duzKelime, setDuzKelime] = useState('');
  const [duzCeviri, setDuzCeviri] = useState('');
  const [duzBaglam, setDuzBaglam] = useState('');
  const [guncellenenId, setGuncellenenId] = useState<number | null>(null);

  /* Çalışma seansı */
  const [calismaModu, setCalismaModu] = useState(false);
  const [seansKartlari, setSeansKartlari] = useState<CalismaKarti[]>([]);
  const [kartSirasi, setKartSirasi] = useState(0);
  const [cevapAcik, setCevapAcik] = useState(false);
  const [seansSayaci, setSeansSayaci] = useState({ bildim: 0, bilemedim: 0 });
  const [seansBoyu, setSeansBoyu] = useState(20);
  const [seansYukleniyor, setSeansYukleniyor] = useState(false);

  const yukle = useCallback(async () => {
    try {
      setHata('');
      const [liste, o] = await Promise.all([api.getWords(), api.getKelimeOzeti()]);
      setKelimeler(liste);
      setOzet(o);
    } catch (e) {
      setHata((e as Error).message || 'Kelimeler yüklenirken bir hata oluştu.');
    } finally {
      setYukleniyor(false);
      setTazeleniyor(false);
    }
  }, []);

  /** Özeti tek başına tazele — seans bitince tüm listeyi çekmeye gerek yok. */
  const ozetiTazele = useCallback(async () => {
    try {
      setOzet(await api.getKelimeOzeti());
    } catch {
      /* Özet tazelenemezse eski sayı görünür; akışı kesmeye değmez. */
    }
  }, []);

  useEffect(() => {
    yukle();
  }, [yukle]);

  // Seçenekleri LİSTE BOYUNA göre türet. 8 kelimesi olan birine "20 kelime"
  // göstermek, seçilemeyen bir varsayılan bırakır.
  const seansSecenekleri = useMemo(() => {
    const uygun = SEANS_SECENEKLERI.filter((n) => n < kelimeler.length);
    return kelimeler.length > 0 ? [...uygun, kelimeler.length] : [];
  }, [kelimeler.length]);

  useEffect(() => {
    if (kelimeler.length > 0 && seansBoyu > kelimeler.length) setSeansBoyu(kelimeler.length);
  }, [kelimeler.length, seansBoyu]);

  /* ── YAZARKEN anlık çeviri ─────────────────────────────────
     Üç şey hızlı hissettiriyor:
       1. 350 ms bekleme — her tuşta istek atmak hem yavaş hem hız sınırını yer.
       2. Oturum önbelleği — aynı kelimeye dönmek AĞA HİÇ ÇIKMAZ.
       3. Yarış koruması — hızlı yazarken ESKİ yanıt yenisini EZEMEZ. */
  const ceviriOnbellegi = useRef<Map<string, { ana: string; alt: string[] }>>(new Map());
  const istekSayaci = useRef(0);
  /** Kullanıcı çeviri alanına elle dokunduysa üstüne yazma. */
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

        // ANA karşılık ile alternatifleri AYIR: 'translation' alanı eş anlamlı
        // listesini de taşıyor, olduğu gibi kaydetmek listeye gürültü yazar.
        const ana = (yanit.generalMeaning || yanit.translation || '').split('\n')[0].trim();
        const alt = altAnlamlariAyikla(yanit.synonyms);

        ceviriOnbellegi.current.set(kelime, { ana, alt });
        if (!ceviriElleDegisti.current) {
          setHizliCeviri(ana);
          setAlternatifler(alt);
        }
      } catch {
        // Çeviri gelmezse kullanıcı elle yazabilir; akışı kesmeye değmez.
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

  const hizliEkle = async () => {
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

  const duzenlemeyeBasla = (kayit: WordItem) => {
    setDuzenlenenId(kayit.id);
    setDuzKelime(kayit.word);
    setDuzCeviri(kayit.translation);
    setDuzBaglam(kayit.context || '');
  };

  const guncelle = async (id: number) => {
    if (!duzKelime.trim() || !duzCeviri.trim()) return;
    setGuncellenenId(id);
    try {
      await api.updateWord(id, duzKelime.trim(), duzCeviri.trim(), duzBaglam.trim());
      setDuzenlenenId(null);
      await yukle();
    } catch (e) {
      Alert.alert('Güncellenemedi', (e as Error).message);
    } finally {
      setGuncellenenId(null);
    }
  };

  const sil = (kayit: WordItem) => {
    Alert.alert('Kelimeyi sil', `“${kayit.word}” listenden kaldırılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteWord(kayit.id);
            setKelimeler((oncekiler) => oncekiler.filter((k) => k.id !== kayit.id));
            setSeansKartlari((oncekiler) => oncekiler.filter((k) => k.id !== kayit.id));
            ozetiTazele();
          } catch (e) {
            Alert.alert('Kelime silinemedi', (e as Error).message);
          }
        },
      },
    ]);
  };

  const kartiCevir = (id: number) => {
    if (duzenlenenId === id) return;
    setCevrilenler((oncekiler) => {
      const yeni = new Set(oncekiler);
      if (yeni.has(id)) yeni.delete(id);
      else yeni.add(id);
      return yeni;
    });
  };

  /* Seansı SUNUCUDAN al: karıştırma istemcide değil. Sunucu önce hiç
     çalışılmamışları veriyor; 200 kelimelik listede her seans farklı kartlar
     geliyor ama liste bitmeden hiçbiri tekrar etmiyor. */
  const seansBaslat = async () => {
    if (kelimeler.length === 0 || seansYukleniyor) return;
    setSeansYukleniyor(true);
    try {
      const kartlar = await api.getCalismaSeansi(seansBoyu);
      if (kartlar.length === 0) {
        Alert.alert('Çalışılacak kelime bulunamadı.');
        return;
      }
      setSeansKartlari(kartlar);
      setKartSirasi(0);
      setCevapAcik(false);
      setSeansSayaci({ bildim: 0, bilemedim: 0 });
      setCalismaModu(true);
    } catch (e) {
      Alert.alert('Çalışma seansı başlatılamadı', (e as Error).message);
    } finally {
      setSeansYukleniyor(false);
    }
  };

  const seansCevabi = async (bildim: boolean) => {
    const kart = seansKartlari[kartSirasi];
    if (!kart) return;

    // Ekranı BEKLETME: kart hemen ilerlesin, kayıt arkada gitsin.
    setSeansSayaci((s) => ({
      bildim: s.bildim + (bildim ? 1 : 0),
      bilemedim: s.bilemedim + (bildim ? 0 : 1),
    }));
    Haptics.impactAsync(
      bildim ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Rigid,
    ).catch(() => {});

    const sonKart = kartSirasi + 1 >= seansKartlari.length;
    setKartSirasi(kartSirasi + 1);
    setCevapAcik(false);

    try {
      await api.kaydetCalismaSonucu(kart.id, bildim);
      if (sonKart) await ozetiTazele();
    } catch {
      /* Tek bir kartın kaydı düşerse seansı kesmiyoruz; o kelime bir sonraki
         seansta yine "hiç çalışılmamış" bandında gelir. */
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
      <UstBar baslik="Kelimelerim" altBaslik={`${ozet?.toplam ?? kelimeler.length} kelime`} />

      {yukleniyor ? (
        <Yukleniyor mesaj="Kelimelerin yükleniyor…" />
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

            {/* ── Kalıcı ilerleme özeti ── */}
            <Animated.View entering={FadeInDown.duration(320)}>
              <Kart dolgu={Bosluk.md} style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                {[
                  { etiket: 'Toplam', deger: ozet?.toplam ?? kelimeler.length, renk: palet.primary },
                  {
                    etiket: 'Bildiğim',
                    deger: ozet?.ogrenildi ?? 0,
                    renk: palet.success,
                    Simge: GraduationCap,
                  },
                  {
                    etiket: 'Kalan',
                    deger: ozet?.hicCalisilmadi ?? 0,
                    renk: palet.onSurface,
                    Simge: Target,
                  },
                ].map(({ etiket, deger, renk, Simge }) => (
                  <View key={etiket} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {Simge ? <Simge size={12} color={renk} /> : null}
                      <Metin tur="minik" ikincil>
                        {etiket}
                      </Metin>
                    </View>
                    <Metin tur="devasa" renk={renk}>
                      {deger}
                    </Metin>
                  </View>
                ))}
              </Kart>
            </Animated.View>

            {/* ── Pratik ── */}
            {kelimeler.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(320).delay(60)}>
                <Kart style={{ gap: Bosluk.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                    <Brain size={16} color={palet.primary} />
                    <Metin tur="altBaslik" style={{ flex: 1 }}>
                      Kelime Pratiği
                    </Metin>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: Bosluk.sm }}
                  >
                    {seansSecenekleri.map((n) => {
                      const secili = Math.min(seansBoyu, kelimeler.length) === n;
                      return (
                        <Pressable
                          key={n}
                          onPress={() => setSeansBoyu(n)}
                          style={{
                            paddingHorizontal: Bosluk.md,
                            paddingVertical: 6,
                            borderRadius: Yaricap.tam,
                            borderWidth: 1,
                            borderColor: secili ? palet.primary : palet.outlineVariant,
                            backgroundColor: secili
                              ? alpha(palet.primary, 0.14)
                              : palet.surfaceContainer,
                          }}
                        >
                          <Metin tur="minik" renk={secili ? palet.primary : palet.onSurfaceVariant}>
                            {n === kelimeler.length ? `Tümü (${n})` : `${n} kelime`}
                          </Metin>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <Buton
                    baslik={seansYukleniyor ? 'Hazırlanıyor…' : 'Pratik Yap (Kartlar)'}
                    tamGenislik
                    yukleniyor={seansYukleniyor}
                    ikon={<Brain size={16} color={palet.onPrimary} />}
                    onPress={seansBaslat}
                  />
                </Kart>
              </Animated.View>
            ) : null}

            {/* ── Seri kelime girişi ── */}
            <Animated.View entering={FadeInDown.duration(320).delay(120)}>
              <Kart vurgulu style={{ gap: Bosluk.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <Sparkles size={15} color={palet.primary} />
                  <Metin tur="etiket" renk={palet.primary} style={{ flex: 1 }}>
                    Seri Kelime Girişi
                  </Metin>
                </View>

                <Metin tur="minik" ikincil style={{ lineHeight: 16 }}>
                  Bilmediğin kelimeyi yaz — anlamı sen yazarken gelir.
                </Metin>

                <View style={{ gap: Bosluk.xs }}>
                  <Metin tur="minik" ikincil>
                    İNGİLİZCE KELİME
                  </Metin>
                  <TextInput
                    ref={kelimeAlaniRef}
                    value={hizliKelime}
                    onChangeText={(t) => {
                      setHizliKelime(t);
                      ceviriElleDegisti.current = false;
                    }}
                    placeholder="mysterious"
                    placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={alanStili}
                  />
                </View>

                <View style={{ gap: Bosluk.xs }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Metin tur="minik" renk={palet.primary}>
                      TÜRKÇE ANLAMI
                    </Metin>
                    {ceviriliyor ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <ActivityIndicator size="small" color={palet.primary} />
                        <Metin tur="minik" ikincil>
                          çevriliyor
                        </Metin>
                      </View>
                    ) : hizliCeviri && !ceviriElleDegisti.current ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Sparkles size={11} color={palet.primary} />
                        <Metin tur="minik" ikincil>
                          otomatik
                        </Metin>
                      </View>
                    ) : null}
                  </View>
                  <TextInput
                    value={hizliCeviri}
                    onChangeText={(t) => {
                      setHizliCeviri(t);
                      ceviriElleDegisti.current = true;
                    }}
                    placeholder="gizemli, esrarengiz"
                    placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
                    multiline
                    style={[alanStili, { minHeight: 60, textAlignVertical: 'top' }]}
                  />
                </View>

                {/* Alternatifler ALANA DOLDURULMAZ, öneri olarak durur. */}
                {alternatifler.length > 0 && !ceviriliyor ? (
                  <Animated.View entering={FadeIn.duration(200)} style={{ gap: Bosluk.sm }}>
                    <Metin tur="minik" ikincil>
                      Diğer anlamlar — eklemek için dokun
                    </Metin>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {alternatifler.map((alt) => {
                        const zatenVar = hizliCeviri
                          .toLowerCase()
                          .split(',')
                          .some((p) => p.trim() === alt.toLowerCase());
                        return (
                          <Pressable
                            key={alt}
                            disabled={zatenVar}
                            onPress={() => {
                              setHizliCeviri((v) => (v.trim() ? `${v.trim()}, ${alt}` : alt));
                              ceviriElleDegisti.current = true;
                            }}
                            style={{
                              paddingHorizontal: Bosluk.md,
                              paddingVertical: 5,
                              borderRadius: Yaricap.sm,
                              borderWidth: 1,
                              borderColor: zatenVar
                                ? alpha(palet.primary, 0.4)
                                : palet.outlineVariant,
                              backgroundColor: zatenVar
                                ? alpha(palet.primary, 0.12)
                                : 'transparent',
                            }}
                          >
                            <Metin
                              tur="minik"
                              renk={zatenVar ? palet.primary : palet.onSurfaceVariant}
                            >
                              {zatenVar ? '✓ ' : '+ '}
                              {alt}
                            </Metin>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Animated.View>
                ) : null}

                <Buton
                  baslik={ekleniyor ? 'Kaydediliyor…' : 'Sözlüğe Kaydet'}
                  tamGenislik
                  yukleniyor={ekleniyor}
                  disabled={!hizliKelime.trim() || !hizliCeviri.trim()}
                  ikon={<Plus size={16} color={palet.onPrimary} />}
                  onPress={hizliEkle}
                />
              </Kart>
            </Animated.View>

            {/* ── Kartlar ── */}
            {kelimeler.length === 0 ? (
              <BosDurum
                simge={<Sparkles size={30} color={palet.primary} />}
                baslik="Henüz kelime kaydetmedin"
                aciklama="Kitap okurken bilmediğin kelimeye dokunarak ya da yukarıdaki seri giriş panelinden ekleyebilirsin."
              />
            ) : (
              kelimeler.map((kayit, sira) => {
                const cevrildi = cevrilenler.has(kayit.id);
                const duzenleniyor = duzenlenenId === kayit.id;

                return (
                  <Animated.View
                    key={kayit.id}
                    entering={FadeInDown.duration(300).delay(Math.min(sira, 8) * 40)}
                  >
                    <Pressable onPress={() => kartiCevir(kayit.id)}>
                      <Kart vurgulu={cevrildi} style={{ gap: Bosluk.md, minHeight: 120 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <View
                            style={{
                              paddingHorizontal: Bosluk.sm,
                              paddingVertical: 3,
                              borderRadius: Yaricap.sm,
                              backgroundColor: alpha(palet.primary, 0.12),
                            }}
                          >
                            <Metin tur="minik" renk={palet.primary}>
                              {cevrildi ? 'TR' : 'EN'}
                            </Metin>
                          </View>

                          <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                            <Pressable
                              onPress={() => duzenlemeyeBasla(kayit)}
                              hitSlop={8}
                              accessibilityLabel="Kelimeyi düzenle"
                              style={{ padding: 4 }}
                            >
                              <Edit3 size={16} color={palet.onSurfaceVariant} />
                            </Pressable>
                            <Pressable
                              onPress={() => sil(kayit)}
                              hitSlop={8}
                              accessibilityLabel="Kelimeyi sil"
                              style={{ padding: 4 }}
                            >
                              <Trash2 size={16} color={palet.error} />
                            </Pressable>
                          </View>
                        </View>

                        {duzenleniyor ? (
                          <View style={{ gap: Bosluk.sm }}>
                            <TextInput
                              value={duzKelime}
                              onChangeText={setDuzKelime}
                              placeholder="Kelime"
                              placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
                              style={alanStili}
                            />
                            <TextInput
                              value={duzCeviri}
                              onChangeText={setDuzCeviri}
                              placeholder="Türkçe çeviri"
                              placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
                              style={alanStili}
                            />
                            <TextInput
                              value={duzBaglam}
                              onChangeText={setDuzBaglam}
                              placeholder="Kullanım cümlesi"
                              placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
                              style={alanStili}
                            />
                            <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                              <Buton
                                baslik="Vazgeç"
                                tur="ikincil"
                                kucuk
                                ikon={<X size={13} color={palet.onSurface} />}
                                onPress={() => setDuzenlenenId(null)}
                              />
                              <Buton
                                baslik="Kaydet"
                                kucuk
                                yukleniyor={guncellenenId === kayit.id}
                                ikon={<Check size={13} color={palet.onPrimary} />}
                                onPress={() => guncelle(kayit.id)}
                              />
                            </View>
                          </View>
                        ) : cevrildi ? (
                          <View style={{ alignItems: 'center', gap: 4 }}>
                            <Metin tur="minik" ikincil>
                              TÜRKÇE KARŞILIĞI
                            </Metin>
                            <Metin tur="baslik" renk={palet.primary} ortala>
                              {kayit.translation}
                            </Metin>
                          </View>
                        ) : (
                          <View style={{ alignItems: 'center', gap: Bosluk.sm }}>
                            <View
                              style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}
                            >
                              <Metin tur="devasa" ortala>
                                {kayit.word}
                              </Metin>
                              <Pressable
                                onPress={() => seslendir(kayit.word, KELIME_HIZI)}
                                hitSlop={8}
                                accessibilityLabel={`${kayit.word} telaffuzunu dinle`}
                                style={{ padding: 4 }}
                              >
                                <Volume2
                                  size={17}
                                  color={
                                    konusuyorMu(kayit.word) ? palet.primary : palet.onSurfaceVariant
                                  }
                                />
                              </Pressable>
                            </View>
                            {kayit.context ? (
                              <Metin
                                tur="kucuk"
                                ikincil
                                ortala
                                numberOfLines={2}
                                style={{ fontStyle: 'italic' }}
                              >
                                “{kayit.context}”
                              </Metin>
                            ) : null}
                          </View>
                        )}

                        {!duzenleniyor ? (
                          <Metin tur="minik" ikincil ortala>
                            {cevrildi ? '← KELİMEYE DÖN' : 'ANLAMI GÖSTER →'}
                          </Metin>
                        ) : null}
                      </Kart>
                    </Pressable>
                  </Animated.View>
                );
              })
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <CalismaSayfasi
        acik={calismaModu}
        kapat={() => setCalismaModu(false)}
        kartlar={seansKartlari}
        sira={kartSirasi}
        cevapAcik={cevapAcik}
        cevabiAc={() => setCevapAcik((a) => !a)}
        cevapla={seansCevabi}
        sayac={seansSayaci}
        ozet={ozet}
        tekrarDene={seansBaslat}
      />
    </EkranZemini>
  );
}

/** Tam ekran çalışma seansı — web'deki "STUDY MODE" panelinin karşılığı. */
function CalismaSayfasi({
  acik,
  kapat,
  kartlar,
  sira,
  cevapAcik,
  cevabiAc,
  cevapla,
  sayac,
  ozet,
  tekrarDene,
}: {
  acik: boolean;
  kapat: () => void;
  kartlar: CalismaKarti[];
  sira: number;
  cevapAcik: boolean;
  cevabiAc: () => void;
  cevapla: (bildim: boolean) => void;
  sayac: { bildim: number; bilemedim: number };
  ozet: KelimeOzeti | null;
  tekrarDene: () => void;
}) {
  const palet = useRenk();
  const kenar = useSafeAreaInsets();
  const { seslendir, konusuyorMu } = useTelaffuz();

  const kart = kartlar[sira];
  const bitti = sira >= kartlar.length;

  return (
    <Modal visible={acik} animationType="slide" onRequestClose={kapat}>
      <EkranZemini>
        <View
          style={{
            flex: 1,
            paddingTop: kenar.top + Bosluk.md,
            paddingBottom: kenar.bottom + Bosluk.lg,
            paddingHorizontal: Bosluk.lg,
            gap: Bosluk.lg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
            <Brain size={18} color={palet.primary} />
            <Metin tur="altBaslik" renk={palet.primary} style={{ flex: 1 }}>
              Kelime Pratiği
            </Metin>
            <Pressable onPress={kapat} hitSlop={10} accessibilityLabel="Seanstan çık">
              <X size={20} color={palet.onSurfaceVariant} />
            </Pressable>
          </View>

          {bitti ? (
            <ScrollView contentContainerStyle={{ gap: Bosluk.lg, paddingBottom: Bosluk.xl }}>
              <Kart style={{ alignItems: 'center', gap: Bosluk.md }}>
                <Award size={48} color="#eab308" />
                <Metin tur="baslik">Harika İş!</Metin>
                <Metin tur="kucuk" ikincil>
                  Çalışma seansını tamamladın.
                </Metin>

                <View style={{ flexDirection: 'row', gap: Bosluk.md, alignSelf: 'stretch' }}>
                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.success, 0.12),
                      borderWidth: 1,
                      borderColor: alpha(palet.success, 0.3),
                    }}
                  >
                    <Metin tur="minik" renk={palet.success}>
                      BİLDİM
                    </Metin>
                    <Metin tur="devasa" renk={palet.success}>
                      {sayac.bildim}
                    </Metin>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.error, 0.12),
                      borderWidth: 1,
                      borderColor: alpha(palet.error, 0.3),
                    }}
                  >
                    <Metin tur="minik" renk={palet.error}>
                      BİLEMEDİM
                    </Metin>
                    <Metin tur="devasa" renk={palet.error}>
                      {sayac.bilemedim}
                    </Metin>
                  </View>
                </View>
              </Kart>

              {/* Asıl yenilik: bu sayılar ekranı kapatınca SIFIRLANMAZ. */}
              {ozet ? (
                <Kart style={{ gap: Bosluk.md }}>
                  <Metin tur="etiket" ikincil>
                    Toplam İlerlemen
                  </Metin>
                  <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                    {[
                      { etiket: 'Öğrenildi', deger: ozet.ogrenildi, renk: palet.success },
                      { etiket: 'Çalışılıyor', deger: ozet.calisiliyor, renk: palet.onSurface },
                      { etiket: 'Hiç çıkmadı', deger: ozet.hicCalisilmadi, renk: palet.onSurface },
                    ].map(({ etiket, deger, renk }) => (
                      <View
                        key={etiket}
                        style={{
                          flex: 1,
                          alignItems: 'center',
                          padding: Bosluk.md,
                          borderRadius: Yaricap.md,
                          backgroundColor: palet.surfaceContainer,
                          borderWidth: 1,
                          borderColor: palet.outlineVariant,
                        }}
                      >
                        <Metin tur="minik" ikincil ortala>
                          {etiket}
                        </Metin>
                        <Metin tur="buyuk" renk={renk}>
                          {deger}
                        </Metin>
                      </View>
                    ))}
                  </View>
                  {ozet.hicCalisilmadi > 0 ? (
                    <Metin tur="minik" ikincil style={{ lineHeight: 16 }}>
                      Sonraki seansta önce hiç çıkmamış kelimeler gelir.
                    </Metin>
                  ) : ozet.calisiliyor > 0 ? (
                    <Metin tur="minik" ikincil style={{ lineHeight: 16 }}>
                      Listenin tamamını gördün. Sırada henüz öğrenilmemiş kelimeler var.
                    </Metin>
                  ) : null}
                </Kart>
              ) : null}

              <View style={{ flexDirection: 'row', gap: Bosluk.sm, justifyContent: 'center' }}>
                <Buton baslik="Kapat" tur="ikincil" onPress={kapat} />
                <Buton
                  baslik="Tekrar Dene"
                  ikon={<RefreshCw size={14} color={palet.onPrimary} />}
                  onPress={tekrarDene}
                />
              </View>
            </ScrollView>
          ) : kart ? (
            <View style={{ flex: 1, gap: Bosluk.lg }}>
              <View style={{ flexDirection: 'row', gap: Bosluk.sm, justifyContent: 'center' }}>
                <View
                  style={{
                    paddingHorizontal: Bosluk.md,
                    paddingVertical: 4,
                    borderRadius: Yaricap.tam,
                    backgroundColor: alpha(palet.primary, 0.12),
                  }}
                >
                  <Metin tur="minik" renk={palet.primary}>
                    KART {sira + 1} / {kartlar.length}
                  </Metin>
                </View>
                {kart.ogrenildi ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: Bosluk.md,
                      paddingVertical: 4,
                      borderRadius: Yaricap.tam,
                      backgroundColor: alpha(palet.success, 0.12),
                    }}
                  >
                    <GraduationCap size={11} color={palet.success} />
                    <Metin tur="minik" renk={palet.success}>
                      Öğrenildi — tekrar
                    </Metin>
                  </View>
                ) : kart.dogruSeri > 0 ? (
                  <View
                    style={{
                      paddingHorizontal: Bosluk.md,
                      paddingVertical: 4,
                      borderRadius: Yaricap.tam,
                      backgroundColor: palet.surfaceContainer,
                    }}
                  >
                    <Metin tur="minik" ikincil>
                      Seri: {kart.dogruSeri}
                    </Metin>
                  </View>
                ) : null}
              </View>

              <Pressable onPress={cevabiAc} style={{ flex: 1 }}>
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
                        <Metin tur="devasa" ortala style={{ fontSize: 32 }}>
                          {kart.word}
                        </Metin>
                        <Pressable
                          onPress={() => seslendir(kart.word, KELIME_HIZI)}
                          hitSlop={10}
                          style={{ padding: 6 }}
                        >
                          <Volume2
                            size={22}
                            color={konusuyorMu(kart.word) ? palet.primary : palet.onSurfaceVariant}
                          />
                        </Pressable>
                      </View>
                      <Metin tur="minik" ikincil>
                        ANLAMINI GÖRMEK İÇİN DOKUN
                      </Metin>
                    </>
                  ) : (
                    <Animated.View
                      entering={FadeIn.duration(200)}
                      style={{ alignItems: 'center', gap: Bosluk.sm }}
                    >
                      <Metin tur="etiket" renk={palet.primary}>
                        Türkçe Karşılığı
                      </Metin>
                      <Metin tur="buyuk" ortala>
                        {kart.translation}
                      </Metin>
                      {kart.context ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: Bosluk.sm,
                            paddingHorizontal: Bosluk.lg,
                          }}
                        >
                          <Metin
                            tur="kucuk"
                            ikincil
                            ortala
                            style={{ fontStyle: 'italic', flexShrink: 1 }}
                          >
                            “{kart.context}”
                          </Metin>
                          <Pressable
                            /* Cümle NORMAL hızda: yavaşlatmak tonlamayı bozar,
                               oysa tek kelimede yavaşlık harfleri ayırt ettiriyor. */
                            onPress={() => seslendir(kart.context)}
                            hitSlop={8}
                          >
                            <Volume2
                              size={15}
                              color={
                                konusuyorMu(kart.context) ? palet.primary : palet.onSurfaceVariant
                              }
                            />
                          </Pressable>
                        </View>
                      ) : null}
                    </Animated.View>
                  )}
                </Kart>
              </Pressable>

              <View style={{ flexDirection: 'row', gap: Bosluk.md }}>
                <Buton
                  baslik="Bilmiyorum"
                  tur="tehlike"
                  style={{ flex: 1 }}
                  onPress={() => cevapla(false)}
                />
                <Buton baslik="Biliyorum" style={{ flex: 1 }} onPress={() => cevapla(true)} />
              </View>
            </View>
          ) : null}
        </View>
      </EkranZemini>
    </Modal>
  );
}
