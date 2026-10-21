import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Flame } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTema } from '@/context/ThemeContext';

interface SeriAleviProps {
  mevcutSeri: number;
  bugunAktif?: boolean;
  seriRiskte?: boolean;
  boyut?: 'kucuk' | 'orta' | 'buyuk';
  onPress?: () => void;
}

export function SeriAlevi({
  mevcutSeri,
  bugunAktif = false,
  seriRiskte = false,
  boyut = 'orta',
  onPress,
}: SeriAleviProps) {
  const { renk } = useTema();
  const olcek = useSharedValue(1);
  const donus = useSharedValue(0);

  useEffect(() => {
    if (bugunAktif || seriRiskte) {
      olcek.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
      donus.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 250 }),
          withTiming(4, { duration: 250 })
        ),
        -1,
        true
      );
    } else {
      olcek.value = withTiming(1, { duration: 300 });
      donus.value = withTiming(0, { duration: 300 });
    }
  }, [seriRiskte, bugunAktif, olcek, donus]);

  const animasyonStil = useAnimatedStyle(() => ({
    transform: [{ scale: olcek.value }, { rotate: `${donus.value}deg` }],
  }));

  const simgeBoyutu = boyut === 'kucuk' ? 18 : boyut === 'buyuk' ? 38 : 26;
  const metinBoyutu = boyut === 'kucuk' ? 14 : boyut === 'buyuk' ? 26 : 17;

  const alevRenkleri: [string, string] = bugunAktif
    ? ['#ff8c00', '#ff4500']
    : seriRiskte
    ? ['#ef4444', '#b91c1c']
    : ['#9ca3af', '#4b5563'];

  const Icerik = (
    <LinearGradient
      colors={
        bugunAktif
          ? ['rgba(255, 140, 0, 0.22)', 'rgba(255, 69, 0, 0.12)']
          : seriRiskte
          ? ['rgba(239, 68, 68, 0.25)', 'rgba(185, 28, 28, 0.15)']
          : ['rgba(156, 163, 175, 0.12)', 'rgba(75, 85, 99, 0.08)']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        stiller.kapsayici,
        {
          borderColor: bugunAktif ? 'rgba(255, 140, 0, 0.4)' : seriRiskte ? 'rgba(239, 68, 68, 0.5)' : renk.outlineVariant,
          paddingHorizontal: boyut === 'buyuk' ? 18 : boyut === 'kucuk' ? 10 : 14,
          paddingVertical: boyut === 'buyuk' ? 10 : boyut === 'kucuk' ? 5 : 8,
        },
      ]}
    >
      <Animated.View style={animasyonStil}>
        <Flame size={simgeBoyutu} color={alevRenkleri[0]} fill={bugunAktif ? alevRenkleri[1] : 'transparent'} />
      </Animated.View>
      <Text style={[stiller.metin, { fontSize: metinBoyutu, color: bugunAktif ? '#ff5500' : seriRiskte ? '#ef4444' : renk.onSurfaceVariant }]}>
        {mevcutSeri}
      </Text>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        accessibilityLabel={`Seri durumu: ${mevcutSeri} gün`}
        accessibilityRole="button"
      >
        {Icerik}
      </Pressable>
    );
  }

  return Icerik;
}

const stiller = StyleSheet.create({
  kapsayici: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1.5,
    gap: 7,
    shadowColor: '#ff5500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  metin: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
