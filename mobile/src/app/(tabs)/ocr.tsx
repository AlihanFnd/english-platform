import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import {
  BookOpen,
  Camera,
  ClipboardPaste,
  Clock,
  FileSearch,
  History,
  Image as ImageIcon,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CumleGorunumu } from '@/components/CumleGorunumu';
import { KelimePaneli, KelimeSecimi } from '@/components/KelimePaneli';
import { UstBar } from '@/components/UstBar';
import {
  BosDurum,
  Buton,
  EkranZemini,
  HataKutusu,
  Kart,
  Metin,
  Rozet,
  Yukleniyor,
} from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { OcrRecord, api } from '@/lib/api';
import { OkumaCumlesi, cumleleriDuzenle } from '@/lib/cumleler';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

export default function OcrEkrani() {
  const palet = useRenk();
  const sekmeYuksekligi = useBottomTabBarHeight();
  const params = useLocalSearchParams<{
    metin?: string;
    analizEt?: string;
    sekme?: string;
    kelime?: string;
  }>();

  // Metin ve analiz durumu
  const [metin, setMetin] = useState('');
  const [analizEdiliyor, setAnalizEdiliyor] = useState(false);
  const [cumleler, setCumleler] = useState<OkumaCumlesi[]>([]);
  const [secim, setSecim] = useState<KelimeSecimi | null>(null);
  const [hata, setHata] = useState('');

  // Geçmiş listesi
  const [gecmis, setGecmis] = useState<OcrRecord[]>([]);
  const [gecmisYukleniyor, setGecmisYukleniyor] = useState(true);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const [silinenId, setSilinenId] = useState<number | null>(null);

  // Görünüm sekmesi: 'tara' (metin girişi ve okuma) | 'gecmis' (tarama geçmişi)
  const [aktifMod, setAktifMod] = useState<'tara' | 'gecmis'>('tara');

  // Geçmişi yükle
  const gecmisiYukle = useCallback(async () => {
    try {
      const kayitlar = await api.getOcrRecords();
      setGecmis(kayitlar);
    } catch {
      // Hata durumunda sessizce kal
    } finally {
      setGecmisYukleniyor(false);
      setTazeleniyor(false);
    }
  }, []);

  useEffect(() => {
    gecmisiYukle();
  }, [gecmisiYukle]);

  // Metni analiz et ve geçmişe kaydet
  const metniCozumle = async (kaynaktanMetin?: string) => {
    const islenecekMetin = (kaynaktanMetin ?? metin).trim();
    if (!islenecekMetin) {
      setHata('Lütfen önce çözümlenecek bir metin girin veya yapıştırın.');
      return;
    }

    setHata('');
    setAnalizEdiliyor(true);
    setSecim(null);

    try {
      // 1. Sunucu analizi
      const analiz = await api.analyzeText(islenecekMetin);
      setCumleler(cumleleriDuzenle(analiz.sentences));
      setAktifMod('tara');

      // 2. Geçmişe kaydet
      try {
        const yeniKayit = await api.saveOcrRecord(islenecekMetin);
        setGecmis((oncekiler) => [yeniKayit, ...oncekiler]);
      } catch {
        // Geçmiş kaydı başarısız olsa bile kullanıcı analiz sonucunu görebilmeli
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setHata((e as Error).message || 'Metin çözümlenirken bir hata oluştu.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setAnalizEdiliyor(false);
    }
  };

  useEffect(() => {
    if (params.sekme === 'gecmis') {
      setAktifMod('gecmis');
    } else if (params.sekme === 'tara') {
      setAktifMod('tara');
    }
  }, [params.sekme]);

  useEffect(() => {
    if (params.metin) {
      setMetin(params.metin);
      if (params.analizEt === 'true') {
        metniCozumle(params.metin);
      }
    }
  }, [params.metin, params.analizEt]);

  useEffect(() => {
    if (params.kelime && cumleler.length > 0) {
      const ilkCumle = cumleler[0];
      const bulunanKelime = ilkCumle.words?.find(
        (w) => w.word.toLowerCase() === params.kelime?.toLowerCase()
      );
      setSecim({
        kelime: params.kelime,
        cumle: ilkCumle.original,
        tur: bulunanKelime?.type,
      });
    }
  }, [params.kelime, cumleler]);

  // Panodan yapıştır
  const panodanYapistir = async () => {
    try {
      const panoMetni = await Clipboard.getStringAsync();
      if (panoMetni && panoMetni.trim()) {
        setMetin(panoMetni.trim());
        setHata('');
        Haptics.selectionAsync().catch(() => {});
      } else {
        setHata('Panoda kopyalanmış herhangi bir metin bulunamadı.');
      }
    } catch {
      setHata('Pano içeriği okunamadı.');
    }
  };

  // Fotoğraf çek
  const fotografCek = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Kamera İzni Gerekli',
          'Metin fotoğrafı çekebilmek için lütfen kamera erişimine izin verin.',
        );
        return;
      }

      const sonuc = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.9,
      });

      if (!sonuc.canceled && sonuc.assets && sonuc.assets.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          'Fotoğraf Çekildi',
          'Fotoğraftaki metni cihazınızın Canlı Metin (Live Text) veya Google Lens özelliği ile kopyalayıp "Panodan Yapıştır" düğmesine basarak saniyeler içinde çözümleyebilirsiniz.',
          [{ text: 'Tamam' }],
        );
      }
    } catch {
      setHata('Kamera açılamadı.');
    }
  };

  // Galeriden görsel seç
  const galeridenSec = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Galeri İzni Gerekli',
          'Görsel seçebilmek için lütfen fotoğraf arşivine erişim izni verin.',
        );
        return;
      }

      const sonuc = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.9,
      });

      if (!sonuc.canceled && sonuc.assets && sonuc.assets.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          'Görsel Seçildi',
          'Görseldeki İngilizce metni cihazınızın Canlı Metin (Live Text) özelliği ile kopyalayıp "Panodan Yapıştır" düğmesini kullanarak çözümleyebilirsiniz.',
          [{ text: 'Tamam' }],
        );
      }
    } catch {
      setHata('Fotoğraf galerisi açılamadı.');
    }
  };

  // Geçmiş kaydı seçme
  const kayitSec = (kayit: OcrRecord) => {
    setMetin(kayit.extractedText);
    setAktifMod('tara');
    metniCozumle(kayit.extractedText);
  };

  // KURAL-12: Geçmiş kaydı silme
  const kayitSil = (kayit: OcrRecord) => {
    Alert.alert(
      'Kaydı Sil',
      'Bu tarama kaydını geçmişten silmek istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setSilinenId(kayit.id);
            try {
              await api.deleteOcrRecord(kayit.id);
              setGecmis((oncekiler) => oncekiler.filter((k) => k.id !== kayit.id));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            } catch (e) {
              Alert.alert('Hata', (e as Error).message || 'Kayıt silinemedi.');
            } finally {
              setSilinenId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <EkranZemini>
      <UstBar
        baslik="Metin Tara (OCR)"
        altBaslik="Görselden veya panodan İngilizce metin çözümleme"
      />

      {/* Üst Sekme Geçişi */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: Bosluk.lg,
          marginBottom: Bosluk.sm,
          backgroundColor: palet.surfaceContainerLow,
          borderRadius: Yaricap.lg,
          padding: 4,
          borderWidth: 1,
          borderColor: palet.outlineVariant,
        }}
      >
        <Pressable
          onPress={() => setAktifMod('tara')}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Bosluk.xs,
            paddingVertical: Bosluk.sm,
            borderRadius: Yaricap.md,
            backgroundColor: aktifMod === 'tara' ? palet.primary : 'transparent',
          }}
        >
          <Sparkles
            size={16}
            color={aktifMod === 'tara' ? palet.onPrimary : palet.onSurfaceVariant}
          />
          <Metin
            tur="kucuk"
            kalin
            renk={aktifMod === 'tara' ? palet.onPrimary : palet.onSurfaceVariant}
          >
            Metin & Okuma
          </Metin>
        </Pressable>

        <Pressable
          onPress={() => setAktifMod('gecmis')}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Bosluk.xs,
            paddingVertical: Bosluk.sm,
            borderRadius: Yaricap.md,
            backgroundColor: aktifMod === 'gecmis' ? palet.primary : 'transparent',
          }}
        >
          <History
            size={16}
            color={aktifMod === 'gecmis' ? palet.onPrimary : palet.onSurfaceVariant}
          />
          <Metin
            tur="kucuk"
            kalin
            renk={aktifMod === 'gecmis' ? palet.onPrimary : palet.onSurfaceVariant}
          >
            Geçmiş ({gecmis.length})
          </Metin>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Bosluk.lg,
          paddingTop: 0,
          paddingBottom: sekmeYuksekligi + Bosluk.xxl * 2,
          gap: Bosluk.md,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={tazeleniyor}
            onRefresh={() => {
              setTazeleniyor(true);
              gecmisiYukle();
            }}
            tintColor={palet.primary}
          />
        }
      >
        {hata ? <HataKutusu mesaj={hata} /> : null}

        {aktifMod === 'tara' ? (
          <>
            {/* Hızlı Eylem Kartı (Kamera, Galeri, Pano) */}
            <Kart style={{ gap: Bosluk.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                <FileSearch size={20} color={palet.primary} />
                <Metin tur="altBaslik">Metin Yükle / Tara</Metin>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: Bosluk.sm,
                }}
              >
                <Pressable
                  onPress={fotografCek}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: Bosluk.md,
                      paddingHorizontal: Bosluk.sm,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.primary, 0.08),
                      borderWidth: 1,
                      borderColor: alpha(palet.primary, 0.25),
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Camera size={20} color={palet.primary} />
                  <Metin tur="minik" kalin renk={palet.primary}>
                    Fotoğraf Çek
                  </Metin>
                </Pressable>

                <Pressable
                  onPress={galeridenSec}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: Bosluk.md,
                      paddingHorizontal: Bosluk.sm,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.primary, 0.08),
                      borderWidth: 1,
                      borderColor: alpha(palet.primary, 0.25),
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <ImageIcon size={20} color={palet.primary} />
                  <Metin tur="minik" kalin renk={palet.primary}>
                    Galeriden Seç
                  </Metin>
                </Pressable>

                <Pressable
                  onPress={panodanYapistir}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: Bosluk.md,
                      paddingHorizontal: Bosluk.sm,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.tertiary, 0.08),
                      borderWidth: 1,
                      borderColor: alpha(palet.tertiary, 0.25),
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <ClipboardPaste size={20} color={palet.tertiary} />
                  <Metin tur="minik" kalin renk={palet.tertiary}>
                    Panodan Yapıştır
                  </Metin>
                </Pressable>
              </View>

              {/* Metin Giriş Alanı */}
              <View style={{ gap: Bosluk.xs }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Metin tur="minik" ikincil>
                    İngilizce Metin:
                  </Metin>
                  {metin ? (
                    <Pressable onPress={() => setMetin('')} hitSlop={6}>
                      <Metin tur="minik" renk={palet.primary}>
                        Temizle
                      </Metin>
                    </Pressable>
                  ) : null}
                </View>

                <TextInput
                  value={metin}
                  onChangeText={setMetin}
                  placeholder="İngilizce metni buraya yapıştırın veya yazın…"
                  placeholderTextColor={palet.onSurfaceVariant}
                  multiline
                  numberOfLines={4}
                  style={{
                    minHeight: 100,
                    maxHeight: 180,
                    padding: Bosluk.md,
                    borderRadius: Yaricap.md,
                    backgroundColor: palet.surfaceContainerHighest,
                    color: palet.onSurface,
                    fontFamily: YaziTipi.govde,
                    fontSize: Olcek.kucuk,
                    lineHeight: 20,
                    textAlignVertical: 'top',
                    borderWidth: 1,
                    borderColor: palet.outlineVariant,
                  }}
                />
              </View>

              {/* Çözümle Butonu */}
              <Buton
                baslik="Metni Çözümle ve Oku"
                tur="birincil"
                tamGenislik
                onPress={() => metniCozumle()}
                yukleniyor={analizEdiliyor}
                disabled={!metin.trim() || analizEdiliyor}
              />
            </Kart>

            {/* Çözümlenmiş İnteraktif Okuyucu */}
            {cumleler.length > 0 ? (
              <Animated.View entering={FadeIn.duration(200)} style={{ gap: Bosluk.md }}>
                <Kart style={{ gap: Bosluk.md }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottomWidth: 1,
                      borderBottomColor: palet.outlineVariant,
                      paddingBottom: Bosluk.sm,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                      <BookOpen size={18} color={palet.primary} />
                      <Metin tur="altBaslik">İnteraktif Okuma</Metin>
                    </View>

                    <Rozet metin={`${cumleler.length} Cümle`} />
                  </View>

                  <CumleGorunumu
                    cumleler={cumleler}
                    kelimeSecildi={setSecim}
                    yenidenDene={() => metniCozumle()}
                    yenileniyor={analizEdiliyor}
                  />
                </Kart>
              </Animated.View>
            ) : null}
          </>
        ) : (
          /* Tarama Geçmişi Sekmesi */
          <View style={{ gap: Bosluk.md }}>
            {gecmisYukleniyor ? (
              <Yukleniyor mesaj="Geçmiş taranıyor…" />
            ) : gecmis.length === 0 ? (
              <BosDurum
                baslik="Henüz bir tarama kaydı yok"
                aciklama="Görsellerden kopyaladığınız veya yazdığınız metinleri çözümlediğinizde geçmişiniz burada saklanır."
                eylem={
                  <Buton
                    baslik="Yeni Metin Tara"
                    tur="birincil"
                    onPress={() => setAktifMod('tara')}
                  />
                }
              />
            ) : (
              gecmis.map((kayit) => (
                <Kart
                  key={kayit.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Bosluk.md,
                    padding: Bosluk.md,
                  }}
                >
                  <Pressable
                    onPress={() => kayitSec(kayit)}
                    style={{ flex: 1, gap: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Tarama kaydını oku"
                  >
                    <Metin tur="kucuk" kalin numberOfLines={2}>
                      {kayit.extractedText}
                    </Metin>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} color={palet.onSurfaceVariant} />
                      <Metin tur="minik" ikincil>
                        {new Date(kayit.scannedAt).toLocaleString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Metin>
                    </View>
                  </Pressable>

                  {/* KURAL-12: Kullanıcı kendi tarama kaydını silebilir */}
                  <Pressable
                    onPress={() => kayitSil(kayit)}
                    disabled={silinenId === kayit.id}
                    hitSlop={10}
                    accessibilityLabel="Kaydı sil"
                    style={{
                      padding: Bosluk.sm,
                      borderRadius: Yaricap.sm,
                      backgroundColor: alpha(palet.error, 0.08),
                    }}
                  >
                    {silinenId === kayit.id ? (
                      <ActivityIndicator size="small" color={palet.error} />
                    ) : (
                      <Trash2 size={16} color={palet.error} />
                    )}
                  </Pressable>
                </Kart>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Tıklanan kelime veya kalıp kartı */}
      <KelimePaneli secim={secim} kapat={() => setSecim(null)} />
    </EkranZemini>
  );
}
