import * as Haptics from 'expo-haptics';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTema } from '@/context/ThemeContext';
import { kelimeyiAyir, turEtiketi, turRengi } from '@/lib/kelimeBicimi';
import { siraRozeti } from '@/lib/cumleKurucu';
import { alpha } from '@/theme/palette';
import { Yaricap, YaziTipi } from '@/theme/tokens';

export interface KelimeKutucuguProps {
  rawWord: string;
  pos?: string;
  renkliKelimeler?: boolean;
  yaziBoyutu?: number;
  secili?: boolean;
  kayitli?: boolean;
  siraNo?: number;
  onPress: (rawWord: string, pos?: string) => void;
  onLongPress?: () => void;
}

export const KelimeKutucugu = memo(function KelimeKutucugu({
  rawWord,
  pos,
  renkliKelimeler = true,
  yaziBoyutu = 18,
  secili = false,
  kayitli = false,
  siraNo,
  onPress,
  onLongPress,
}: KelimeKutucuguProps) {
  const { renk: palet, koyuMu } = useTema();
  const HareketiAzalt = useReducedMotion();
  const { width: ekranGenisligi } = useWindowDimensions();

  const scale = useSharedValue(1);
  const { on, govde, son } = kelimeyiAyir(rawWord);

  const posColor = turRengi(pos);
  const posTag = turEtiketi(pos);

  const handlePressIn = useCallback(() => {
    if (!HareketiAzalt) {
      scale.value = withSpring(0.94, { damping: 15, stiffness: 300 });
    }
  }, [HareketiAzalt, scale]);

  const handlePressOut = useCallback(() => {
    if (!HareketiAzalt) {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    }
  }, [HareketiAzalt, scale]);

  const handlePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onPress(rawWord, pos);
  }, [onPress, rawWord, pos]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (onLongPress) onLongPress();
  }, [onLongPress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Kutucuk Zemin & Kenarlık Renkleri
  const zeminRengi = renkliKelimeler
    ? secili
      ? alpha(posColor, 0.3)
      : alpha(posColor, koyuMu ? 0.18 : 0.12)
    : secili
      ? alpha(palet.primary, 0.2)
      : palet.surfaceContainer;

  const altKenarRengi = renkliKelimeler ? alpha(posColor, 0.7) : palet.outlineVariant;

  const kenarCizgisi = secili
    ? { borderWidth: 1, borderColor: renkliKelimeler ? posColor : palet.primary }
    : {};

  if (!govde) {
    // Sadece noktalama veya bosluk
    return (
      <Text
        style={{
          fontFamily: YaziTipi.govde,
          fontSize: yaziBoyutu,
          lineHeight: yaziBoyutu * 1.6,
          color: palet.onSurface,
        }}
      >
        {rawWord}
      </Text>
    );
  }

  return (
    <View style={stiller.kapsayici}>
      {on ? (
        <Text
          style={[
            stiller.noktalamaMetni,
            { fontSize: yaziBoyutu, lineHeight: yaziBoyutu * 1.6, color: palet.onSurface },
          ]}
        >
          {on}
        </Text>
      ) : null}

      <Animated.View style={[animatedStyle, { maxWidth: ekranGenisligi - 40, flexShrink: 1 }]}>
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel={`${govde}, ${posTag}`}
          accessibilityHint="Anlamını gösterir"
          style={[
            stiller.kutucuk,
            {
              backgroundColor: zeminRengi,
              borderBottomColor: altKenarRengi,
            },
            kenarCizgisi,
          ]}
        >
          <Text
            style={[
              stiller.govdeMetni,
              {
                fontSize: yaziBoyutu,
                lineHeight: Math.round(yaziBoyutu * 1.4),
                color: palet.onSurface,
              },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {siraNo ? `${siraRozeti(siraNo)} ` : ''}{govde}
          </Text>

          {/* Kelimelerimde Kayıtlı Noktası */}
          {kayitli && !siraNo ? (
            <View style={[stiller.kayitliNoktasi, { backgroundColor: palet.primary }]} />
          ) : null}
        </Pressable>
      </Animated.View>

      {son ? (
        <Text
          style={[
            stiller.noktalamaMetni,
            { fontSize: yaziBoyutu, lineHeight: yaziBoyutu * 1.6, color: palet.onSurface },
          ]}
        >
          {son}
        </Text>
      ) : null}
    </View>
  );
});

const stiller = StyleSheet.create({
  kapsayici: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginHorizontal: 2,
    marginVertical: 3,
  },
  noktalamaMetni: {
    fontFamily: YaziTipi.govde,
  },
  kutucuk: {
    borderRadius: Yaricap.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomWidth: 2.5,
    position: 'relative',
  },
  govdeMetni: {
    fontFamily: YaziTipi.govdeOrta,
  },
  kayitliNoktasi: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
