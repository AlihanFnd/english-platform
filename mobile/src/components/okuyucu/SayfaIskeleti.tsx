import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useRenk } from '@/context/ThemeContext';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

export function SayfaIskeleti() {
  const palet = useRenk();
  const HareketiAzalt = useReducedMotion();
  const opaklik = useSharedValue(0.3);

  useEffect(() => {
    if (!HareketiAzalt) {
      opaklik.value = withRepeat(
        withTiming(0.7, { duration: 600 }),
        -1,
        true,
      );
    } else {
      opaklik.value = 0.5;
    }
  }, [HareketiAzalt, opaklik]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opaklik.value,
  }));

  // Örnek iskelet satırları ve genişlikleri
  const satirGruplari = [
    [70, 45, 90, 60, 50],
    [55, 80, 40, 65, 75, 45],
    [90, 50, 70, 60],
    [40, 85, 50, 75, 60, 40],
    [65, 45, 80, 55, 70],
  ];

  return (
    <View style={stiller.kapsayici}>
      {satirGruplari.map((satir, sIndex) => (
        <View key={sIndex} style={stiller.satir}>
          {satir.map((genislik, kIndex) => (
            <Animated.View
              key={kIndex}
              style={[
                stiller.kutucuk,
                animatedStyle,
                {
                  width: genislik,
                  backgroundColor: alpha(palet.onSurfaceVariant, 0.16),
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const stiller = StyleSheet.create({
  kapsayici: {
    gap: Bosluk.lg,
    paddingVertical: Bosluk.md,
  },
  satir: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  kutucuk: {
    height: 26,
    borderRadius: Yaricap.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
});
