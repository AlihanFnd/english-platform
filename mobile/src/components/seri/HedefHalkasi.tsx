import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTema } from '@/context/ThemeContext';

interface HedefHalkasiProps {
  xp: number;
  hedefXp: number;
  boyut?: number;
  etirKalinlik?: number;
  tamamlandi?: boolean;
}

export function HedefHalkasi({
  xp,
  hedefXp,
  boyut = 72,
  etirKalinlik = 7,
  tamamlandi = false,
}: HedefHalkasiProps) {
  const { renk } = useTema();

  const yaricap = (boyut - etirKalinlik) / 2;
  const cevre = 2 * Math.PI * yaricap;
  const oran = Math.min(1, Math.max(0, xp / Math.max(1, hedefXp)));
  const etirDoluluk = cevre * (1 - oran);

  const halkaRengi = tamamlandi ? '#22c55e' : '#6366f1';
  const arkaRengi = renk.outlineVariant;

  return (
    <View style={[stiller.kapsayici, { width: boyut, height: boyut }]}>
      <Svg width={boyut} height={boyut} style={stiller.svg}>
        {/* Arka plan halkası */}
        <Circle
          cx={boyut / 2}
          cy={boyut / 2}
          r={yaricap}
          stroke={arkaRengi}
          strokeWidth={etirKalinlik}
          fill="none"
        />
        {/* İlerleme halkası */}
        <Circle
          cx={boyut / 2}
          cy={boyut / 2}
          r={yaricap}
          stroke={halkaRengi}
          strokeWidth={etirKalinlik}
          strokeDasharray={`${cevre} ${cevre}`}
          strokeDashoffset={etirDoluluk}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${boyut / 2} ${boyut / 2})`}
        />
      </Svg>
      <View style={stiller.icerik}>
        <Text style={[stiller.xpMetin, { color: renk.onSurface }]}>{xp}</Text>
        <Text style={[stiller.hedefMetin, { color: renk.onSurfaceVariant }]}>/{hedefXp}</Text>
      </View>
    </View>
  );
}

const stiller = StyleSheet.create({
  kapsayici: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  svg: {
    position: 'absolute',
  },
  icerik: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpMetin: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    lineHeight: 18,
  },
  hedefMetin: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
});
