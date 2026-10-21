import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { BookOpen, History, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CumleGorunumu } from '@/components/CumleGorunumu';
import { KelimePaneli, KelimeSecimi } from '@/components/KelimePaneli';
import { UstBar } from '@/components/UstBar';
import { MetinGirisi } from '@/components/ocr/MetinGirisi';
import { OcrGecmisi } from '@/components/ocr/OcrGecmisi';
import { EkranZemini, HataKutusu, Kart, Metin, Rozet } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { OcrRecord, api } from '@/lib/api';
import { OkumaCumlesi, cumleleriDuzenle } from '@/lib/cumleler';
import { Bosluk, Yaricap } from '@/theme/tokens';

export default function OcrEkrani() {
  const palet = useRenk();
  const sekmeYuksekligi = useBottomTabBarHeight();
  const params = useLocalSearchParams<{
    metin?: string;
    analizEt?: string;
    sekme?: string;
    kelime?: string;
  }>();

  const [metin, setMetin] = useState('');
  const [analizEdiliyor, setAnalizEdiliyor] = useState(false);
  const [cumleler, setCumleler] = useState<OkumaCumlesi[]>([]);
  const [secim, setSecim] = useState<KelimeSecimi | null>(null);
  const [hata, setHata] = useState('');

  const [gecmis, setGecmis] = useState<OcrRecord[]>([]);
  const [gecmisYukleniyor, setGecmisYukleniyor] = useState(true);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const [silinenId, setSilinenId] = useState<number | null>(null);
  const [aktifMod, setAktifMod] = useState<'tara' | 'gecmis'>('tara');

  const gecmisiYukle = useCallback(async () => {
    try {
      const kayitlar = await api.getOcrRecords();
      setGecmis(kayitlar);
    } catch {
      // Hata durumunda yutulur
    } finally {
      setGecmisYukleniyor(false);
      setTazeleniyor(false);
    }
  }, []);

  useEffect(() => {
    gecmisiYukle();
  }, [gecmisiYukle]);

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
      const analiz = await api.analyzeText(islenecekMetin);
      setCumleler(cumleleriDuzenle(analiz.sentences));
      setAktifMod('tara');

      try {
        const yeniKayit = await api.saveOcrRecord(islenecekMetin);
        setGecmis((oncekiler) => [yeniKayit, ...oncekiler]);
      } catch {
        // Yutulur
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
    if (params.sekme === 'gecmis') setAktifMod('gecmis');
    else if (params.sekme === 'tara') setAktifMod('tara');
  }, [params.sekme]);

  useEffect(() => {
    if (params.metin) {
      setMetin(params.metin);
      if (params.analizEt === 'true') metniCozumle(params.metin);
    }
  }, [params.metin, params.analizEt]);

  useEffect(() => {
    if (params.kelime && cumleler.length > 0) {
      const ilkCumle = cumleler[0];
      const bulunanKelime = ilkCumle.words?.find(
        (w) => w.word.toLowerCase() === params.kelime?.toLowerCase(),
      );
      setSecim({
        kelime: params.kelime,
        cumle: ilkCumle.original,
        tur: bulunanKelime?.type,
      });
    }
  }, [params.kelime, cumleler]);

  const kayitSec = (kayit: OcrRecord) => {
    setMetin(kayit.extractedText);
    setAktifMod('tara');
    metniCozumle(kayit.extractedText);
  };

  const kayitSil = (kayit: OcrRecord) => {
    Alert.alert('Kaydı Sil', 'Bu tarama kaydını geçmişten silmek istediğinize emin misiniz?', [
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
    ]);
  };

  return (
    <EkranZemini>
      <UstBar baslik="Metin Tara (OCR)" altBaslik="Görselden veya panodan İngilizce metin çözümleme" />

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
          <Sparkles size={16} color={aktifMod === 'tara' ? palet.onPrimary : palet.onSurfaceVariant} />
          <Metin tur="kucuk" kalin renk={aktifMod === 'tara' ? palet.onPrimary : palet.onSurfaceVariant}>
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
          <History size={16} color={aktifMod === 'gecmis' ? palet.onPrimary : palet.onSurfaceVariant} />
          <Metin tur="kucuk" kalin renk={aktifMod === 'gecmis' ? palet.onPrimary : palet.onSurfaceVariant}>
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
            <MetinGirisi
              metin={metin}
              setMetin={setMetin}
              setHata={setHata}
              metniCozumle={() => metniCozumle()}
              analizEdiliyor={analizEdiliyor}
            />

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
          <OcrGecmisi
            gecmisYukleniyor={gecmisYukleniyor}
            gecmis={gecmis}
            silinenId={silinenId}
            kayitSec={kayitSec}
            kayitSil={kayitSil}
            setAktifMod={setAktifMod}
          />
        )}
      </ScrollView>

      <KelimePaneli secim={secim} kapat={() => setSecim(null)} />
    </EkranZemini>
  );
}
