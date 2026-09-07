import * as Haptics from 'expo-haptics';
import { BookMarked, CheckCircle, Volume2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { useTelaffuz, KELIME_HIZI } from '@/hooks/useTelaffuz';
import { api } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap, golge } from '@/theme/tokens';

export interface KelimeSecimi {
  /** Tıklanan kelime ya da seçilen kalıp. */
  kelime: string;
  /** İçinde geçtiği cümle — bağlamlı çeviri ve kayıt için. */
  cumle: string;
  /** Sunucudan gelen tür bilgisi (varsa) — panel açılır açılmaz gösterilir. */
  tur?: string;
}

interface Cozum {
  translation: string;
  type: string;
  generalMeaning?: string;
  synonyms?: string;
}

/**
 * Kelime kartı — okuma ve OCR ekranlarının ortak parçası.
 *
 * Web'de bu `bk-word-panel`di: sağ altta sabit duran, kelimenin anlamını,
 * telaffuzunu ve "Kelimelerime Ekle" düğmesini taşıyan kutu. Mobilde ekranın
 * altına yerleşiyor; tek elle ulaşılabilir yer orası.
 */
export function KelimePaneli({
  secim,
  kapat,
  otoEkle,
}: {
  secim: KelimeSecimi | null;
  kapat: () => void;
  otoEkle?: boolean;
}) {
  const palet = useRenk();
  const kenar = useSafeAreaInsets();
  const { seslendir, konusuyorMu } = useTelaffuz();

  const [cozum, setCozum] = useState<Cozum | null>(null);
  const [ceviriliyor, setCeviriliyor] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [eklenenler, setEklenenler] = useState<Record<string, boolean>>({});

  /** Hızlı hızlı kelimeye basınca ESKİ yanıt yenisini ezmesin. */
  const istekSirasi = useRef(0);

  useEffect(() => {
    if (!secim) {
      setCozum(null);
      return;
    }

    const benimSiram = ++istekSirasi.current;
    setCozum(null);
    setCeviriliyor(true);

    api
      .translateWord(secim.kelime, secim.cumle, false)
      .then((yanit) => {
        if (benimSiram !== istekSirasi.current) return;
        setCozum({
          translation: yanit.translation,
          type: secim.tur === 'kalıp' ? 'kalıp' : yanit.type,
          generalMeaning: yanit.generalMeaning,
          synonyms: yanit.synonyms,
        });
      })
      .catch(() => {
        if (benimSiram !== istekSirasi.current) return;
        setCozum({ translation: 'Çevrilemedi', type: secim.tur ?? 'default' });
      })
      .finally(() => {
        if (benimSiram === istekSirasi.current) setCeviriliyor(false);
      });
  }, [secim]);

  const kaydet = useCallback(async () => {
    if (!secim || !cozum) return;
    const anahtar = secim.kelime.toLowerCase();
    if (eklenenler[anahtar]) return;
    setKaydediliyor(true);
    try {
      const metin = cozum.generalMeaning
        ? `${cozum.generalMeaning}${cozum.synonyms ? '\n\nEş Anlamlılar:\n' + cozum.synonyms : ''}`
        : cozum.translation;
      await api.addWord(secim.kelime, metin, secim.cumle);
      setEklenenler((oncekiler) => ({ ...oncekiler, [anahtar]: true }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      // Kayıt düşerse kullanıcı yeniden deneyebilir
    } finally {
      setKaydediliyor(false);
    }
  }, [secim, cozum, eklenenler]);

  useEffect(() => {
    if (otoEkle && cozum && secim) {
      const anahtar = secim.kelime.toLowerCase();
      if (!eklenenler[anahtar] && !kaydediliyor) {
        kaydet();
      }
    }
  }, [otoEkle, cozum, secim, eklenenler, kaydediliyor, kaydet]);

  if (!secim) return null;

  const anahtar = secim.kelime.toLowerCase();
  const eklendi = eklenenler[anahtar];

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(160)}
      style={[
        {
          position: 'absolute',
          left: Bosluk.md,
          right: Bosluk.md,
          bottom: kenar.bottom + Bosluk.md,
          backgroundColor: palet.surfaceContainerLow,
          borderRadius: Yaricap.xl,
          borderWidth: 1,
          borderColor: alpha(palet.primary, 0.3),
          padding: Bosluk.lg,
          gap: Bosluk.md,
          maxHeight: 320,
        },
        golge(palet.glassShadow, 3),
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Bosluk.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Metin tur="etiket" renk={palet.primary}>
            {cozum?.type || secim.tur || 'kelime'}
          </Metin>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
            <Metin tur="baslik" style={{ flexShrink: 1 }}>
              {secim.kelime}
            </Metin>
            <Pressable
              onPress={() => seslendir(secim.kelime, KELIME_HIZI)}
              hitSlop={8}
              accessibilityLabel={`${secim.kelime} telaffuzunu dinle`}
              style={{
                padding: 6,
                borderRadius: Yaricap.sm,
                backgroundColor: alpha(palet.primary, 0.12),
              }}
            >
              <Volume2
                size={15}
                color={konusuyorMu(secim.kelime) ? palet.primary : palet.onSurfaceVariant}
              />
            </Pressable>
          </View>
        </View>

        <Pressable onPress={kapat} hitSlop={10} accessibilityLabel="Kelime kartını kapat">
          <X size={20} color={palet.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
        {ceviriliyor ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
            <ActivityIndicator size="small" color={palet.primary} />
            <Metin tur="kucuk" ikincil>
              Çevriliyor…
            </Metin>
          </View>
        ) : (
          <View style={{ gap: Bosluk.sm }}>
            <Metin tur="altBaslik" renk={palet.primary}>
              {cozum?.generalMeaning || cozum?.translation}
            </Metin>
            {cozum?.synonyms ? (
              <Metin tur="kucuk" ikincil style={{ lineHeight: 18 }}>
                {cozum.synonyms}
              </Metin>
            ) : null}
            {secim.cumle ? (
              <Metin tur="kucuk" ikincil style={{ fontStyle: 'italic', lineHeight: 18 }}>
                “{secim.cumle}”
              </Metin>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={kaydet}
        disabled={eklendi || kaydediliyor || ceviriliyor}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Bosluk.sm,
          paddingVertical: Bosluk.md,
          borderRadius: Yaricap.lg,
          backgroundColor: eklendi ? alpha(palet.success, 0.15) : palet.primary,
          opacity: kaydediliyor || ceviriliyor ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        {eklendi ? (
          <>
            <CheckCircle size={16} color={palet.success} />
            <Metin tur="kucuk" kalin renk={palet.success}>
              Eklendi
            </Metin>
          </>
        ) : (
          <>
            <BookMarked size={16} color={palet.onPrimary} />
            <Metin tur="kucuk" kalin renk={palet.onPrimary}>
              {kaydediliyor ? 'Ekleniyor…' : 'Kelimelerime Ekle'}
            </Metin>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}
