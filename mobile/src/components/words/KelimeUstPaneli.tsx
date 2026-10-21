import { BarChart3, BookOpen, FileUp, MessageSquare } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Buton, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { CumleItem, CumleOzeti, KelimeOzeti, WordItem } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

export interface KelimeUstPaneliProps {
  aktifSekme: 'kelime' | 'cumle';
  setAktifSekme: (sekme: 'kelime' | 'cumle') => void;
  kelimeler: WordItem[];
  ozet: KelimeOzeti | null;
  cumleler: CumleItem[];
  cumleOzeti: CumleOzeti | null;
  aktifListeUzunlugu: number;
  onPratikBaslatModalAc: () => void;
  onTopluEkleAc: () => void;
  onRaporAc: () => void;
}

export function KelimeUstPaneli({
  aktifSekme,
  setAktifSekme,
  kelimeler,
  ozet,
  cumleler,
  cumleOzeti,
  aktifListeUzunlugu,
  onPratikBaslatModalAc,
  onTopluEkleAc,
  onRaporAc,
}: KelimeUstPaneliProps) {
  const palet = useRenk();

  return (
    <>
      {/* 1. SADE SEKME GEÇİŞİ */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: palet.surfaceContainer,
          borderRadius: Yaricap.lg,
          padding: 4,
        }}
      >
        <Pressable
          onPress={() => setAktifSekme('kelime')}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Bosluk.xs,
            paddingVertical: 8,
            borderRadius: Yaricap.md,
            backgroundColor: aktifSekme === 'kelime' ? palet.primary : 'transparent',
          }}
        >
          <BookOpen
            size={15}
            color={aktifSekme === 'kelime' ? palet.onPrimary : palet.onSurfaceVariant}
          />
          <Metin
            tur="etiket"
            renk={aktifSekme === 'kelime' ? palet.onPrimary : palet.onSurfaceVariant}
          >
            Kelimelerim ({ozet?.toplam ?? kelimeler.length})
          </Metin>
        </Pressable>

        <Pressable
          onPress={() => setAktifSekme('cumle')}
          accessibilityRole="button"
          accessibilityLabel="Cümlelerim sekmesine geç"
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Bosluk.xs,
            paddingVertical: 8,
            borderRadius: Yaricap.md,
            backgroundColor: aktifSekme === 'cumle' ? palet.primary : 'transparent',
          }}
        >
          <MessageSquare
            size={15}
            color={aktifSekme === 'cumle' ? palet.onPrimary : palet.onSurfaceVariant}
          />
          <Metin
            tur="etiket"
            renk={aktifSekme === 'cumle' ? palet.onPrimary : palet.onSurfaceVariant}
          >
            Cümlelerim ({cumleOzeti?.toplam ?? cumleler.length})
          </Metin>
        </Pressable>
      </View>

      {/* 2. SADE İLERLEME ÖZETİ */}
      <Pressable onPress={onRaporAc}>
        <Kart dolgu={Bosluk.md} style={{ flexDirection: 'row', gap: Bosluk.sm }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Metin tur="minik" ikincil>Toplam</Metin>
            <Metin tur="buyuk" renk={palet.primary}>
              {aktifSekme === 'kelime' ? (ozet?.toplam ?? kelimeler.length) : (cumleOzeti?.toplam ?? cumleler.length)}
            </Metin>
          </View>
          <View style={{ width: 1, backgroundColor: palet.outlineVariant }} />
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Metin tur="minik" renk={palet.success}>Bildiğim</Metin>
            <Metin tur="buyuk" renk={palet.success}>
              {aktifSekme === 'kelime' ? (ozet?.ogrenildi ?? 0) : (cumleOzeti?.ogrenildi ?? 0)}
            </Metin>
          </View>
          <View style={{ width: 1, backgroundColor: palet.outlineVariant }} />
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Metin tur="minik" ikincil>Kalan</Metin>
            <Metin tur="buyuk">
              {aktifSekme === 'kelime' ? (ozet?.hicCalisilmadi ?? 0) : (cumleOzeti?.hicCalisilmadi ?? 0)}
            </Metin>
          </View>
        </Kart>
      </Pressable>

      {/* 3. ANA İŞLEM BUTONLARI */}
      <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
        <View style={{ flex: 1 }}>
          <Buton
            baslik="🧠 Pratik Yap"
            tamGenislik
            disabled={aktifListeUzunlugu === 0}
            onPress={onPratikBaslatModalAc}
          />
        </View>

        <Pressable
          onPress={onTopluEkleAc}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingHorizontal: Bosluk.md,
            borderRadius: Yaricap.md,
            backgroundColor: alpha(palet.primary, 0.1),
            borderWidth: 1,
            borderColor: alpha(palet.primary, 0.25),
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <FileUp size={16} color={palet.primary} />
          <Metin tur="minik" renk={palet.primary}>Toplu Ekle</Metin>
        </Pressable>

        <Pressable
          onPress={onRaporAc}
          accessibilityRole="button"
          accessibilityLabel="İlerleme raporunu göster"
          style={({ pressed }) => ({
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: Bosluk.md,
            borderRadius: Yaricap.md,
            backgroundColor: palet.surfaceContainer,
            borderWidth: 1,
            borderColor: palet.outlineVariant,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <BarChart3 size={16} color={palet.onSurfaceVariant} />
        </Pressable>
      </View>
    </>
  );
}
