import { X } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Buton, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

export interface PratikSecimModaliProps {
  acik: boolean;
  kapat: () => void;
  seciliMod: 'test' | 'flashcard';
  setSeciliMod: (mod: 'test' | 'flashcard') => void;
  seciliAdet: number;
  setSeciliAdet: (adet: number) => void;
  aktifListeUzunlugu: number;
  onBaslat: (mod: 'test' | 'flashcard', adet: number) => void;
}

export function PratikSecimModali({
  acik,
  kapat,
  seciliMod,
  setSeciliMod,
  seciliAdet,
  setSeciliAdet,
  aktifListeUzunlugu,
  onBaslat,
}: PratikSecimModaliProps) {
  const palet = useRenk();

  return (
    <Modal
      visible={acik}
      transparent
      animationType="fade"
      onRequestClose={kapat}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          padding: Bosluk.lg,
        }}
      >
        <Kart style={{ gap: Bosluk.lg, padding: Bosluk.lg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Metin tur="altBaslik">Nasıl Çalışmak İstersin?</Metin>
            <Pressable
              onPress={kapat}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
            >
              <X size={20} color={palet.onSurfaceVariant} />
            </Pressable>
          </View>

          {/* İki Net Seçenek */}
          <View style={{ gap: Bosluk.sm }}>
            {/* Seçenek 1: Testli Mod */}
            <Pressable
              onPress={() => setSeciliMod('test')}
              accessibilityRole="button"
              accessibilityLabel="Test Modu seçeneği"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: Bosluk.md,
                padding: Bosluk.md,
                borderRadius: Yaricap.md,
                borderWidth: 2,
                borderColor: seciliMod === 'test' ? palet.primary : palet.outlineVariant,
                backgroundColor:
                  seciliMod === 'test' ? alpha(palet.primary, 0.08) : palet.surfaceContainer,
              }}
            >
              <Metin tur="baslik">🎯</Metin>
              <View style={{ flex: 1 }}>
                <Metin tur="govde" renk={seciliMod === 'test' ? palet.primary : palet.onSurface}>
                  Test Modu (Çoktan Seçmeli)
                </Metin>
                <Metin tur="minik" ikincil>
                  Türkçesi yazar, 4 İngilizce şık arasından doğrusunu seçersin
                </Metin>
              </View>
            </Pressable>

            {/* Seçenek 2: Kartlar (Biliyorum/Bilmiyorum) */}
            <Pressable
              onPress={() => setSeciliMod('flashcard')}
              accessibilityRole="button"
              accessibilityLabel="Kartlar Modu seçeneği"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: Bosluk.md,
                padding: Bosluk.md,
                borderRadius: Yaricap.md,
                borderWidth: 2,
                borderColor: seciliMod === 'flashcard' ? palet.primary : palet.outlineVariant,
                backgroundColor:
                  seciliMod === 'flashcard'
                    ? alpha(palet.primary, 0.08)
                    : palet.surfaceContainer,
              }}
            >
              <Metin tur="baslik">🎴</Metin>
              <View style={{ flex: 1 }}>
                <Metin
                  tur="govde"
                  renk={seciliMod === 'flashcard' ? palet.primary : palet.onSurface}
                >
                  Kart Çevirme (Biliyorum / Bilmiyorum)
                </Metin>
                <Metin tur="minik" ikincil>
                  Klasik kart modu. Anlamını tahmin edip çevirirsin
                </Metin>
              </View>
            </Pressable>
          </View>

          {/* Soru Sayısı */}
          <View style={{ gap: Bosluk.xs }}>
            <Metin tur="minik" ikincil>
              SORU SAYISI:
            </Metin>
            <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
              {[10, 20, aktifListeUzunlugu].map((n) => {
                const secili = seciliAdet === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setSeciliAdet(n)}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} soru seç`}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: Yaricap.sm,
                      borderWidth: 1,
                      borderColor: secili ? palet.primary : palet.outlineVariant,
                      backgroundColor: secili
                        ? alpha(palet.primary, 0.12)
                        : palet.surfaceContainer,
                      alignItems: 'center',
                    }}
                  >
                    <Metin tur="minik" renk={secili ? palet.primary : palet.onSurfaceVariant}>
                      {n === aktifListeUzunlugu ? `Tümü (${n})` : `${n} Soru`}
                    </Metin>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Başlat Butonu */}
          <Buton
            baslik="Pratiğe Başla 🚀"
            tamGenislik
            onPress={() => onBaslat(seciliMod, seciliAdet)}
          />
        </Kart>
      </View>
    </Modal>
  );
}
