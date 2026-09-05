import * as Haptics from 'expo-haptics';
import { AlertTriangle, Check, Languages, RefreshCw, Volume2, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { KelimeSecimi } from '@/components/KelimePaneli';
import { Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { useTelaffuz } from '@/hooks/useTelaffuz';
import type { OkumaCumlesi } from '@/lib/cumleler';
import { kelimeRengi } from '@/lib/cumleler';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

interface KalipSecimi {
  cumle: number;
  bas: number;
  son: number;
}

/**
 * Okunabilir metin gövdesi — kitap okuyucusunun ve OCR ekranının ortak parçası.
 *
 * ÜÇ ETKİLEŞİM:
 *  • Cümleye dokun → altında Türkçesi açılır/kapanır.
 *  • Kelimeye dokun → kelime kartı açılır (çeviri, telaffuz, listeye ekle).
 *  • Kelimeye BASILI TUT → kalıp seçimi başlar; komşu kelimelere dokunarak
 *    seçimi genişletir, "Çevir" ile çok kelimeli ifadeyi çevirtirsin.
 *
 * Sonuncusu web'deki "metni fareyle seç" davranışının mobil karşılığıdır:
 * React Native seçilen metni koda vermediği için seçim dokunmayla yapılıyor.
 */
export function CumleGorunumu({
  cumleler,
  kelimeSecildi,
  yenidenDene,
  yenileniyor,
  yaziBoyutu = Olcek.baslik,
}: {
  cumleler: OkumaCumlesi[];
  kelimeSecildi: (secim: KelimeSecimi) => void;
  /** KURAL-06 uyarısındaki "Yeniden dene" — verilmezse düğme çıkmaz. */
  yenidenDene?: () => void;
  yenileniyor?: boolean;
  yaziBoyutu?: number;
}) {
  const palet = useRenk();
  const { seslendir, konusuyorMu } = useTelaffuz();

  const [acikCeviri, setAcikCeviri] = useState<number | null>(null);
  const [kalip, setKalip] = useState<KalipSecimi | null>(null);

  // KURAL-06: bu sayfada kaç satır çevrilemedi?
  const cevrilemeyen = useMemo(
    () => cumleler.filter((c) => c.ceviriBasarili === false).length,
    [cumleler],
  );

  const kalipMetni = (() => {
    if (!kalip) return '';
    const c = cumleler[kalip.cumle];
    if (!c) return '';
    return c.words
      .slice(kalip.bas, kalip.son + 1)
      .map((k) => k.word)
      .join(' ')
      .trim();
  })();

  const kelimeyeDokun = (cumleIndex: number, kelimeIndex: number, cumle: OkumaCumlesi) => {
    if (kalip && kalip.cumle === cumleIndex) {
      // Kalıp modundayız: seçimi bu kelimeye kadar genişlet.
      setKalip({
        cumle: cumleIndex,
        bas: Math.min(kalip.bas, kelimeIndex),
        son: Math.max(kalip.son, kelimeIndex),
      });
      Haptics.selectionAsync().catch(() => {});
      return;
    }

    const kelime = cumle.words[kelimeIndex];
    if (!kelime?.word?.trim()) return;
    kelimeSecildi({
      kelime: kelime.word.trim(),
      cumle: cumle.original,
      tur: kelime.word.trim().includes(' ') ? 'kalıp' : kelime.type,
    });
  };

  const kelimeyeBas = (cumleIndex: number, kelimeIndex: number) => {
    setKalip({ cumle: cumleIndex, bas: kelimeIndex, son: kelimeIndex });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  return (
    <View style={{ gap: Bosluk.md }}>
      {/* KURAL-06: çeviri servisi patladığında özgün İngilizce metin "çeviri"
          gibi görünüyordu. Artık açıkça söyleniyor. */}
      {cevrilemeyen > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            gap: Bosluk.sm,
            alignItems: 'flex-start',
            padding: Bosluk.md,
            borderRadius: Yaricap.lg,
            backgroundColor: alpha(palet.warning, 0.12),
            borderWidth: 1,
            borderColor: alpha(palet.warning, 0.35),
          }}
        >
          <AlertTriangle size={16} color={palet.warning} />
          <View style={{ flex: 1, gap: Bosluk.sm }}>
            <Metin tur="kucuk" renk={palet.warning} style={{ lineHeight: 18 }}>
              {cevrilemeyen === cumleler.length
                ? 'Bu sayfa çevrilemedi — çeviri servisine ulaşılamadı.'
                : `${cevrilemeyen} satır çevrilemedi — çeviri servisine ulaşılamadı.`}{' '}
              Aşağıda o satırların İngilizcesi görünüyor.
            </Metin>
            {yenidenDene ? (
              <Pressable
                onPress={yenidenDene}
                disabled={yenileniyor}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  alignSelf: 'flex-start',
                  paddingHorizontal: Bosluk.md,
                  paddingVertical: 6,
                  borderRadius: Yaricap.sm,
                  backgroundColor: alpha(palet.warning, 0.18),
                }}
              >
                {yenileniyor ? (
                  <ActivityIndicator size="small" color={palet.warning} />
                ) : (
                  <RefreshCw size={12} color={palet.warning} />
                )}
                <Metin tur="minik" renk={palet.warning}>
                  {yenileniyor ? 'Deneniyor…' : 'Yeniden dene'}
                </Metin>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {cumleler.map((cumle, cumleIndex) => {
        const acik = acikCeviri === cumleIndex;
        const buCumledeKalip = kalip?.cumle === cumleIndex ? kalip : null;

        return (
          <View
            key={`${cumleIndex}-${cumle.original.slice(0, 12)}`}
            style={{
              paddingLeft: cumle.indentation ? cumle.indentation * 12 : 0,
              gap: Bosluk.sm,
            }}
          >
            <Pressable
              onPress={() => {
                if (buCumledeKalip) return;
                setAcikCeviri(acik ? null : cumleIndex);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: Bosluk.sm,
                paddingVertical: Bosluk.sm,
                paddingHorizontal: Bosluk.sm,
                borderRadius: Yaricap.md,
                backgroundColor: acik ? alpha(palet.primary, 0.07) : 'transparent',
              }}
            >
              <Text
                style={{
                  flex: 1,
                  textAlign: cumle.alignment === 'center' ? 'center' : cumle.alignment,
                  fontFamily: cumle.isHeading ? YaziTipi.baslik : YaziTipi.govde,
                  fontSize: cumle.isHeading ? yaziBoyutu + 3 : yaziBoyutu,
                  lineHeight: Math.round((cumle.isHeading ? yaziBoyutu + 3 : yaziBoyutu) * 1.75),
                  color: palet.onSurface,
                }}
              >
                {cumle.words.map((kelime, kelimeIndex) => {
                  const secili =
                    buCumledeKalip !== null &&
                    kelimeIndex >= buCumledeKalip.bas &&
                    kelimeIndex <= buCumledeKalip.son;

                  return (
                    <Text
                      key={kelimeIndex}
                      onPress={() => kelimeyeDokun(cumleIndex, kelimeIndex, cumle)}
                      onLongPress={() => kelimeyeBas(cumleIndex, kelimeIndex)}
                      suppressHighlighting
                      style={{
                        color: palet.onSurface,
                        backgroundColor: secili ? alpha(palet.primary, 0.22) : 'transparent',
                        textDecorationLine: cumle.isHeading ? 'none' : 'underline',
                        // Android alt çizgi rengini yok sayar; orada çizgi metin
                        // renginde çıkar. Tür ayrımı iOS'ta görünür kalır.
                        textDecorationColor: kelimeRengi(kelime.type),
                        ...(Platform.OS === 'ios' ? { textDecorationStyle: 'solid' as const } : null),
                      }}
                    >
                      {kelime.word}
                      {kelimeIndex < cumle.words.length - 1 ? ' ' : ''}
                    </Text>
                  );
                })}
              </Text>

              <Pressable
                onPress={() => seslendir(cumle.original)}
                hitSlop={8}
                accessibilityLabel="Cümleyi sesli oku"
                style={{
                  padding: 6,
                  marginTop: 2,
                  borderRadius: Yaricap.sm,
                  backgroundColor: konusuyorMu(cumle.original)
                    ? alpha(palet.primary, 0.18)
                    : alpha(palet.onSurfaceVariant, 0.08),
                }}
              >
                <Volume2
                  size={13}
                  color={konusuyorMu(cumle.original) ? palet.primary : palet.onSurfaceVariant}
                />
              </Pressable>
            </Pressable>

            {/* Kalıp seçimi çubuğu */}
            {buCumledeKalip ? (
              <Animated.View
                entering={FadeIn.duration(160)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Bosluk.sm,
                  padding: Bosluk.sm,
                  borderRadius: Yaricap.md,
                  backgroundColor: alpha(palet.primary, 0.1),
                  borderWidth: 1,
                  borderColor: alpha(palet.primary, 0.3),
                }}
              >
                <Metin tur="minik" ikincil style={{ flex: 1 }} numberOfLines={1}>
                  “{kalipMetni}”
                </Metin>
                <Pressable
                  onPress={() => {
                    const metin = kalipMetni;
                    setKalip(null);
                    if (metin) {
                      kelimeSecildi({
                        kelime: metin,
                        cumle: cumle.original,
                        tur: metin.includes(' ') ? 'kalıp' : 'kelime',
                      });
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: Bosluk.md,
                    paddingVertical: 6,
                    borderRadius: Yaricap.sm,
                    backgroundColor: palet.primary,
                  }}
                >
                  <Check size={12} color={palet.onPrimary} />
                  <Metin tur="minik" renk={palet.onPrimary}>
                    Çevir
                  </Metin>
                </Pressable>
                <Pressable onPress={() => setKalip(null)} hitSlop={8}>
                  <X size={16} color={palet.onSurfaceVariant} />
                </Pressable>
              </Animated.View>
            ) : null}

            {/* Türkçe karşılığı */}
            {acik ? (
              <Animated.View
                entering={FadeIn.duration(180)}
                style={{
                  flexDirection: 'row',
                  gap: Bosluk.sm,
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor:
                    cumle.ceviriBasarili === false
                      ? alpha(palet.warning, 0.1)
                      : alpha(palet.primary, 0.08),
                  borderLeftWidth: 3,
                  borderLeftColor:
                    cumle.ceviriBasarili === false ? palet.warning : palet.primary,
                }}
              >
                {cumle.ceviriBasarili === false ? (
                  <>
                    <AlertTriangle size={14} color={palet.warning} />
                    <Metin tur="kucuk" renk={palet.warning} style={{ flex: 1, lineHeight: 19 }}>
                      Bu satır çevrilemedi. Yukarıdaki “Yeniden dene” ile tekrar deneyebilirsin.
                    </Metin>
                  </>
                ) : (
                  <>
                    <Languages size={14} color={palet.primary} />
                    <Metin tur="kucuk" style={{ flex: 1, lineHeight: 20 }}>
                      {cumle.translation}
                    </Metin>
                  </>
                )}
              </Animated.View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
