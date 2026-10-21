import React from 'react';
import { Platform, TextInput } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Buton, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

interface GrupOlusturModaliProps {
  olusturAcik: boolean;
  katilAcik: boolean;
  olusturAd: string;
  setOlusturAd: (s: string) => void;
  olusturAciklama: string;
  setOlusturAciklama: (s: string) => void;
  katilKodu: string;
  setKatilKodu: (s: string) => void;
  islemde: boolean;
  grupOlustur: () => void;
  grubaKatil: () => void;
}

export function GrupOlusturModali({
  olusturAcik,
  katilAcik,
  olusturAd,
  setOlusturAd,
  olusturAciklama,
  setOlusturAciklama,
  katilKodu,
  setKatilKodu,
  islemde,
  grupOlustur,
  grubaKatil,
}: GrupOlusturModaliProps) {
  const palet = useRenk();

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

  if (olusturAcik) {
    return (
      <Animated.View entering={FadeInDown.duration(240)}>
        <Kart style={{ gap: Bosluk.md }}>
          <Metin tur="altBaslik">Yeni Grup</Metin>
          <TextInput
            value={olusturAd}
            onChangeText={setOlusturAd}
            placeholder="Grup adı"
            placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
            style={alanStili}
          />
          <TextInput
            value={olusturAciklama}
            onChangeText={setOlusturAciklama}
            placeholder="Açıklama (isteğe bağlı)"
            placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
            multiline
            style={[alanStili, { minHeight: 70, textAlignVertical: 'top' }]}
          />
          <Buton
            baslik="Oluştur"
            tamGenislik
            yukleniyor={islemde}
            disabled={!olusturAd.trim()}
            onPress={grupOlustur}
          />
        </Kart>
      </Animated.View>
    );
  }

  if (katilAcik) {
    return (
      <Animated.View entering={FadeInDown.duration(240)}>
        <Kart style={{ gap: Bosluk.md }}>
          <Metin tur="altBaslik">Davet Kodu ile Katıl</Metin>
          <TextInput
            value={katilKodu}
            onChangeText={setKatilKodu}
            placeholder="Örn. ABC123"
            placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
            autoCapitalize="characters"
            autoCorrect={false}
            style={alanStili}
          />
          <Buton
            baslik="Katıl"
            tamGenislik
            yukleniyor={islemde}
            disabled={!katilKodu.trim()}
            onPress={grubaKatil}
          />
        </Kart>
      </Animated.View>
    );
  }

  return null;
}
