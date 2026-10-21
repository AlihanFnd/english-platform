import { GraduationCap } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BosDurum, Kart, Metin, Rozet } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { Group } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

interface GrupListesiProps {
  tumGruplar: Array<{ grup: Group; yonetici: boolean }>;
  detayiAc: (id: number) => void;
}

export function GrupListesi({ tumGruplar, detayiAc }: GrupListesiProps) {
  const palet = useRenk();

  if (tumGruplar.length === 0) {
    return (
      <BosDurum
        simge={<GraduationCap size={32} color={palet.primary} />}
        baslik="Henüz bir grupta değilsin"
        aciklama="Kendi sınıfını açabilir ya da öğretmeninden aldığın davet koduyla var olan bir gruba katılabilirsin."
      />
    );
  }

  return (
    <>
      {tumGruplar.map(({ grup, yonetici }, sira) => (
        <Animated.View
          key={grup.id}
          entering={FadeInDown.duration(300).delay(Math.min(sira, 8) * 45)}
        >
          <Pressable
            onPress={() => detayiAc(grup.id)}
            accessibilityRole="button"
            accessibilityLabel={`Grup detayları: ${grup.name}`}
          >
            <Kart style={{ gap: Bosluk.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: Yaricap.md,
                    backgroundColor: alpha(palet.primary, 0.14),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <GraduationCap size={20} color={palet.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Metin tur="altBaslik" numberOfLines={1}>
                    {grup.name}
                  </Metin>
                  <Metin tur="minik" ikincil numberOfLines={1}>
                    {grup.membersCount} üye · {grup.assignments.length} kitap
                  </Metin>
                </View>
                {yonetici ? <Rozet metin="Yönetici" /> : null}
              </View>
              {grup.description ? (
                <Metin tur="kucuk" ikincil numberOfLines={2} style={{ lineHeight: 18 }}>
                  {grup.description}
                </Metin>
              ) : null}
            </Kart>
          </Pressable>
        </Animated.View>
      ))}
    </>
  );
}
