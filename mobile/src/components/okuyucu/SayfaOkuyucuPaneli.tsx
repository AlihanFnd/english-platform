import { Headphones, Pause, Play, SkipBack, SkipForward, Volume2, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import type { HizTipi, ReaderDurum } from '@/hooks/useSayfaOkuyucu';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap, golge } from '@/theme/tokens';
import type * as Speech from 'expo-speech';

interface SayfaOkuyucuPaneliProps {
  durum: ReaderDurum;
  aktifCumle: number;
  toplamCumle: number;
  hiz: HizTipi;
  ses: string | null;
  mevcutSesler: Speech.Voice[];
  onOynatDuraklat: () => void;
  onOnceki: () => void;
  onSonraki: () => void;
  onHizDegistir: (hiz: HizTipi) => void;
  onSesDegistir: (ses: string | null) => void;
  onKapat: () => void;
}

const HIZ_SEÇENEKLERİ: HizTipi[] = [0.75, 1, 1.25];

export function SayfaOkuyucuPaneli({
  durum,
  aktifCumle,
  toplamCumle,
  hiz,
  ses,
  mevcutSesler,
  onOynatDuraklat,
  onOnceki,
  onSonraki,
  onHizDegistir,
  onSesDegistir,
  onKapat,
}: SayfaOkuyucuPaneliProps) {
  const palet = useRenk();
  const kenar = useSafeAreaInsets();
  const [sesSeciciAcik, setSesSeciciAcik] = useState(false);

  const caliyor = durum === 'caliyor';

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(150)}
      style={[
        {
          position: 'absolute',
          left: Bosluk.md,
          right: Bosluk.md,
          bottom: kenar.bottom + Bosluk.md,
          backgroundColor: palet.surfaceContainerHigh,
          borderRadius: Yaricap.xl,
          borderWidth: 1,
          borderColor: alpha(palet.primary, 0.35),
          paddingHorizontal: Bosluk.md,
          paddingVertical: Bosluk.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: Bosluk.xs,
          zIndex: 100,
        },
        golge(palet.glassShadow, 3),
      ]}
    >
      {/* Sol: İlerleme Göstergesi */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
        <Headphones size={16} color={palet.primary} />
        <Metin tur="minik" kalin renk={palet.primary}>
          {toplamCumle > 0 ? `${aktifCumle + 1} / ${toplamCumle}` : 'Dinleme'}
        </Metin>
      </View>

      {/* Orta: Kontroller (Önceki, Oynat/Duraklat, Sonraki) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
        <Pressable
          onPress={onOnceki}
          hitSlop={8}
          accessibilityLabel="Önceki cümle"
          style={{ padding: 6 }}
        >
          <SkipBack size={18} color={palet.onSurface} />
        </Pressable>

        <Pressable
          onPress={onOynatDuraklat}
          hitSlop={8}
          accessibilityLabel={caliyor ? 'Duraklat' : 'Oynat'}
          style={{
            width: 38,
            height: 38,
            borderRadius: Yaricap.tam,
            backgroundColor: palet.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {caliyor ? (
            <Pause size={18} color={palet.onPrimary} />
          ) : (
            <Play size={18} color={palet.onPrimary} style={{ marginLeft: 2 }} />
          )}
        </Pressable>

        <Pressable
          onPress={onSonraki}
          hitSlop={8}
          accessibilityLabel="Sonraki cümle"
          style={{ padding: 6 }}
        >
          <SkipForward size={18} color={palet.onSurface} />
        </Pressable>
      </View>

      {/* Sağ: Hız Çipi, Ses Seçimi ve Kapat */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {/* Hız Butonu */}
        <Pressable
          onPress={() => {
            const sonrakiIndex = (HIZ_SEÇENEKLERİ.indexOf(hiz) + 1) % HIZ_SEÇENEKLERİ.length;
            onHizDegistir(HIZ_SEÇENEKLERİ[sonrakiIndex] ?? 1);
          }}
          hitSlop={6}
          accessibilityLabel={`Okuma hızı ${hiz} katı`}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: Yaricap.sm,
            backgroundColor: alpha(palet.primary, 0.15),
          }}
        >
          <Metin tur="minik" kalin renk={palet.primary}>
            {hiz}×
          </Metin>
        </Pressable>

        {/* Ses Seçim Butonu (Cihazda birden fazla en-* ses varsa) */}
        {mevcutSesler.length > 1 ? (
          <Pressable
            onPress={() => setSesSeciciAcik(true)}
            hitSlop={6}
            accessibilityLabel="Ses seçimi"
            style={{
              padding: 6,
              borderRadius: Yaricap.sm,
              backgroundColor: ses ? alpha(palet.primary, 0.2) : 'transparent',
            }}
          >
            <Volume2 size={16} color={ses ? palet.primary : palet.onSurfaceVariant} />
          </Pressable>
        ) : null}

        {/* Kapat / Durdur */}
        <Pressable
          onPress={onKapat}
          hitSlop={8}
          accessibilityLabel="Dinlemeyi kapat"
          style={{ padding: 6 }}
        >
          <X size={18} color={palet.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* Ses Seçim Modalı */}
      {sesSeciciAcik ? (
        <Modal
          visible={sesSeciciAcik}
          transparent
          animationType="fade"
          onRequestClose={() => setSesSeciciAcik(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: Bosluk.lg,
            }}
            onPress={() => setSesSeciciAcik(false)}
          >
            <Pressable
              style={{
                width: '100%',
                maxHeight: 300,
                backgroundColor: palet.surfaceContainerHigh,
                borderRadius: Yaricap.lg,
                padding: Bosluk.md,
                gap: Bosluk.sm,
              }}
              onPress={(e) => e.stopPropagation()}
            >
              <Metin tur="altBaslik" kalin>
                Okuma Sesi Seç
              </Metin>
              <ScrollView style={{ maxHeight: 220 }}>
                <Pressable
                  onPress={() => {
                    onSesDegistir(null);
                    setSesSeciciAcik(false);
                  }}
                  style={{
                    paddingVertical: Bosluk.sm,
                    paddingHorizontal: Bosluk.md,
                    borderRadius: Yaricap.sm,
                    backgroundColor: !ses ? alpha(palet.primary, 0.15) : 'transparent',
                  }}
                >
                  <Metin tur="govde" kalin={!ses}>
                    Varsayılan Sistem Sesi
                  </Metin>
                </Pressable>
                {mevcutSesler.map((v) => {
                  const secili = ses === v.identifier;
                  return (
                    <Pressable
                      key={v.identifier}
                      onPress={() => {
                        onSesDegistir(v.identifier);
                        setSesSeciciAcik(false);
                      }}
                      style={{
                        paddingVertical: Bosluk.sm,
                        paddingHorizontal: Bosluk.md,
                        borderRadius: Yaricap.sm,
                        backgroundColor: secili ? alpha(palet.primary, 0.15) : 'transparent',
                      }}
                    >
                      <Metin tur="govde" kalin={secili}>
                        {v.name} ({v.language})
                      </Metin>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Animated.View>
  );
}
