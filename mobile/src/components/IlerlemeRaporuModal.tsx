import {
  BarChart3,
  CheckCircle2,
  Flame,
  GraduationCap,
  Target,
  X,
} from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Buton, EkranZemini, IlerlemeCubugu, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { CumleItem, CumleOzeti, KelimeOzeti, WordItem } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

interface IlerlemeRaporuModalProps {
  acik: boolean;
  kapat: () => void;
  tur: 'kelime' | 'cumle';
  kelimeler: WordItem[];
  kelimeOzeti: KelimeOzeti | null;
  cumleler: CumleItem[];
  cumleOzeti: CumleOzeti | null;
}

export function IlerlemeRaporuModal({
  acik,
  kapat,
  tur,
  kelimeler,
  kelimeOzeti,
  cumleler,
  cumleOzeti,
}: IlerlemeRaporuModalProps) {
  const palet = useRenk();
  const kenar = useSafeAreaInsets();

  const isKelime = tur === 'kelime';
  const toplam = isKelime
    ? (kelimeOzeti?.toplam ?? kelimeler.length)
    : (cumleOzeti?.toplam ?? cumleler.length);

  const ogrenildi = isKelime
    ? (kelimeOzeti?.ogrenildi ?? 0)
    : (cumleOzeti?.ogrenildi ?? 0);

  const calisiliyor = isKelime
    ? (kelimeOzeti?.calisiliyor ?? 0)
    : (cumleOzeti?.calisiliyor ?? 0);

  const hicCalisilmadi = isKelime
    ? (kelimeOzeti?.hicCalisilmadi ?? 0)
    : (cumleOzeti?.hicCalisilmadi ?? 0);

  const ogrenilmeYuzdesi = toplam > 0 ? Math.round((ogrenildi / toplam) * 100) : 0;

  return (
    <Modal visible={acik} animationType="slide" onRequestClose={kapat}>
      <EkranZemini>
        <View
          style={{
            flex: 1,
            paddingTop: kenar.top + Bosluk.md,
            paddingBottom: kenar.bottom + Bosluk.lg,
            paddingHorizontal: Bosluk.lg,
            gap: Bosluk.lg,
          }}
        >
          {/* Sade Başlık */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <BarChart3 size={22} color={palet.primary} />
              <Metin tur="altBaslik">
                {isKelime ? 'Kelime İlerleme Durumu' : 'Cümle İlerleme Durumu'}
              </Metin>
            </View>
            <Pressable
              onPress={kapat}
              hitSlop={10}
              style={{ padding: 4 }}
              accessibilityLabel="Kapat"
              accessibilityRole="button"
            >
              <X size={22} color={palet.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: Bosluk.lg }}>
            {/* Büyük Başarı Göstergesi */}
            <Kart vurgulu style={{ alignItems: 'center', gap: Bosluk.sm, paddingVertical: Bosluk.xl }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: Yaricap.tam,
                  backgroundColor: alpha(palet.success, 0.12),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <GraduationCap size={30} color={palet.success} />
              </View>

              <Metin tur="minik" ikincil>
                ÖĞRENİLME ORANI
              </Metin>
              <Metin tur="devasa" renk={palet.success}>
                %{ogrenilmeYuzdesi}
              </Metin>
              <Metin tur="kucuk" ikincil>
                {toplam} kayıttan {ogrenildi} tanesi tam öğrenildi
              </Metin>

              <View style={{ width: '100%', marginTop: Bosluk.sm }}>
                <IlerlemeCubugu yuzde={ogrenilmeYuzdesi} />
              </View>
            </Kart>

            {/* 3 Sade Sayı Kartı */}
            <View style={{ gap: Bosluk.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor: alpha(palet.success, 0.1),
                  borderWidth: 1,
                  borderColor: alpha(palet.success, 0.25),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <CheckCircle2 size={18} color={palet.success} />
                  <Metin tur="govde" renk={palet.success}>
                    Bildiğim (Öğrenildi)
                  </Metin>
                </View>
                <Metin tur="baslik" renk={palet.success}>
                  {ogrenildi}
                </Metin>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor: alpha(palet.primary, 0.08),
                  borderWidth: 1,
                  borderColor: alpha(palet.primary, 0.2),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <Flame size={18} color={palet.primary} />
                  <Metin tur="govde" renk={palet.primary}>
                    Çalışılıyor
                  </Metin>
                </View>
                <Metin tur="baslik" renk={palet.primary}>
                  {calisiliyor}
                </Metin>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor: palet.surfaceContainer,
                  borderWidth: 1,
                  borderColor: palet.outlineVariant,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <Target size={18} color={palet.onSurfaceVariant} />
                  <Metin tur="govde">Henüz Karşılaşılmadı</Metin>
                </View>
                <Metin tur="baslik">{hicCalisilmadi}</Metin>
              </View>
            </View>

            {/* Leitner Kutu Dağılımı Çubuk Grafiği */}
            {(isKelime ? kelimeOzeti?.kutuDagilimi : cumleOzeti?.kutuDagilimi) ? (
              <Kart style={{ gap: Bosluk.sm }}>
                <Metin tur="etiket" ikincil>
                  Leitner Hafıza Kutuları (0 - 7)
                </Metin>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    height: 70,
                    paddingTop: 8,
                  }}
                >
                  {(isKelime ? kelimeOzeti?.kutuDagilimi : cumleOzeti?.kutuDagilimi)?.map((sayi, index) => {
                    const dagilim = isKelime ? kelimeOzeti?.kutuDagilimi! : cumleOzeti?.kutuDagilimi!;
                    const enBüyük = Math.max(...dagilim, 1);
                    const yuzdeYukseklik = Math.round((sayi / enBüyük) * 100);
                    return (
                      <View key={index} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                        <Metin tur="minik" style={{ fontSize: 9 }}>{sayi}</Metin>
                        <View
                          style={{
                            width: 14,
                            height: 38,
                            backgroundColor: palet.surfaceContainerHighest,
                            borderRadius: 3,
                            justifyContent: 'flex-end',
                            overflow: 'hidden',
                          }}
                        >
                          <View
                            style={{
                              width: '100%',
                              height: `${Math.max(yuzdeYukseklik, sayi > 0 ? 10 : 2)}%`,
                              backgroundColor: index >= 4 ? palet.success : palet.primary,
                            }}
                          />
                        </View>
                        <Metin tur="minik" ikincil style={{ fontSize: 9 }}>K{index}</Metin>
                      </View>
                    );
                  })}
                </View>
              </Kart>
            ) : null}

            <Buton baslik="Tamam" tur="ikincil" onPress={kapat} />
          </ScrollView>
        </View>
      </EkranZemini>
    </Modal>
  );
}
