import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ClipboardPaste, FileSearch, Info } from 'lucide-react-native';
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Buton, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

interface MetinGirisiProps {
  metin: string;
  setMetin: (m: string) => void;
  setHata: (h: string) => void;
  metniCozumle: () => void;
  analizEdiliyor: boolean;
}

export function MetinGirisi({
  metin,
  setMetin,
  setHata,
  metniCozumle,
  analizEdiliyor,
}: MetinGirisiProps) {
  const palet = useRenk();

  const panodanYapistir = async () => {
    try {
      const panoMetni = await Clipboard.getStringAsync();
      if (panoMetni && panoMetni.trim()) {
        setMetin(panoMetni.trim());
        setHata('');
        Haptics.selectionAsync().catch(() => {});
      } else {
        setHata('Panoda kopyalanmış herhangi bir metin bulunamadı.');
      }
    } catch {
      setHata('Pano içeriği okunamadı.');
    }
  };

  return (
    <Kart style={{ gap: Bosluk.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
        <FileSearch size={20} color={palet.primary} />
        <Metin tur="altBaslik">Metin Yükle / Tara</Metin>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: Bosluk.sm,
          padding: Bosluk.md,
          borderRadius: Yaricap.md,
          backgroundColor: alpha(palet.primary, 0.08),
          borderWidth: 1,
          borderColor: alpha(palet.primary, 0.2),
        }}
      >
        <Info size={20} color={palet.primary} />
        <Metin tur="kucuk" ikincil style={{ flex: 1 }}>
          Fotoğraftaki metni telefonunun <Metin tur="kucuk" kalin>Canlı Metin</Metin> (Live Text) özelliğiyle kopyala, burada <Metin tur="kucuk" kalin>Panodan Yapıştır</Metin>.
        </Metin>
      </View>

      <Pressable
        onPress={panodanYapistir}
        accessibilityRole="button"
        accessibilityLabel="Panodan yapıştır"
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Bosluk.sm,
            paddingVertical: Bosluk.md,
            paddingHorizontal: Bosluk.lg,
            borderRadius: Yaricap.md,
            backgroundColor: alpha(palet.tertiary, 0.12),
            borderWidth: 1,
            borderColor: alpha(palet.tertiary, 0.3),
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <ClipboardPaste size={20} color={palet.tertiary} />
        <Metin tur="govde" kalin renk={palet.tertiary}>
          Panodan Yapıştır
        </Metin>
      </Pressable>

      <View style={{ gap: Bosluk.xs }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Metin tur="minik" ikincil>
            İngilizce Metin:
          </Metin>
          {metin ? (
            <Pressable onPress={() => setMetin('')} hitSlop={6}>
              <Metin tur="minik" renk={palet.primary}>
                Temizle
              </Metin>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          value={metin}
          onChangeText={setMetin}
          placeholder="İngilizce metni buraya yapıştırın veya yazın…"
          placeholderTextColor={palet.onSurfaceVariant}
          multiline
          numberOfLines={4}
          style={{
            minHeight: 100,
            maxHeight: 180,
            padding: Bosluk.md,
            borderRadius: Yaricap.md,
            backgroundColor: palet.surfaceContainerHighest,
            color: palet.onSurface,
            fontFamily: YaziTipi.govde,
            fontSize: Olcek.kucuk,
            lineHeight: 20,
            textAlignVertical: 'top',
            borderWidth: 1,
            borderColor: palet.outlineVariant,
          }}
        />
      </View>

      <Buton
        baslik="Metni Çözümle ve Oku"
        tur="birincil"
        tamGenislik
        onPress={metniCozumle}
        yukleniyor={analizEdiliyor}
        disabled={!metin.trim() || analizEdiliyor}
      />
    </Kart>
  );
}
