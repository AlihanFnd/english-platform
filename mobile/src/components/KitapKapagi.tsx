import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen, FileText, Sparkles } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap, golge } from '@/theme/tokens';

interface KitapKapagiProps {
  baslik: string;
  yazar?: string;
  renk?: string;
  seviye?: string;
  kategori?: string;
  genislik?: number;
  yukseklik?: number;
}

/**
 * YH-09: Yeniden Tasarlanan Kitap Kapagı Bileşeni.
 * - Başlık kelime ortasından bölünmez (`numberOfLines={2}` + `adjustsFontSizeToFit` + `minimumFontScale={0.7}`).
 * - Gradyan zemin, CEFR seviye rozeti ve kategori ikonu taşır.
 */
export function KitapKapagi({
  baslik,
  yazar,
  renk,
  seviye,
  kategori,
  genislik = 76,
  yukseklik = 108,
}: KitapKapagiProps) {
  const palet = useRenk();
  const anaRenk = renk && renk.trim() ? renk.trim() : palet.primary;

  const KategoriIkon =
    kategori === 'article' ? FileText : kategori === 'other' ? Sparkles : BookOpen;

  return (
    <LinearGradient
      colors={[anaRenk, alpha(anaRenk, 0.6)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        {
          width: genislik,
          height: yukseklik,
          borderRadius: Yaricap.md,
          padding: Bosluk.xs + 2,
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.2)',
        },
        golge(palet.glassShadow, 2),
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <KategoriIkon size={12} color="#ffffff" />
        {seviye ? (
          <Metin
            tur="minik"
            kalin
            renk="#ffffff"
            style={{ fontSize: 9, opacity: 0.9 }}
          >
            {seviye}
          </Metin>
        ) : null}
      </View>

      <Metin
        tur="minik"
        kalin
        renk="#ffffff"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ lineHeight: 13 }}
      >
        {baslik}
      </Metin>

      {yazar ? (
        <Metin
          tur="minik"
          renk="rgba(255,255,255,0.85)"
          numberOfLines={1}
          style={{ fontSize: 8 }}
        >
          {yazar}
        </Metin>
      ) : (
        <View />
      )}
    </LinearGradient>
  );
}
