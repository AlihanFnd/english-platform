import { Sliders, Type, X } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Buton, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import {
  GEÇERLI_YAZI_BOYUTLARI,
  OkuyucuAyarlari as OkuyucuAyarlariTipi,
} from '@/lib/okuyucuAyarlari';
import { TUR_ETIKETLERI, TUR_RENKLERI, TurKodu } from '@/lib/kelimeBicimi';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

export interface OkuyucuAyarlariProps {
  acik: boolean;
  ayarlar: OkuyucuAyarlariTipi;
  onGuncelle: (yeni: Partial<OkuyucuAyarlariTipi>) => void;
  onKapat: () => void;
}

export function OkuyucuAyarlariModal({
  acik,
  ayarlar,
  onGuncelle,
  onKapat,
}: OkuyucuAyarlariProps) {
  const palet = useRenk();

  const turListesi: TurKodu[] = [
    'isim',
    'fiil',
    'sifat',
    'zarf',
    'edat',
    'baglac',
    'zamir',
    'diger',
  ];

  return (
    <Modal
      visible={acik}
      transparent
      animationType="slide"
      onRequestClose={onKapat}
    >
      <Pressable style={stiller.arkaplanArkaPlan} onPress={onKapat}>
        <Pressable
          style={[stiller.modalKabi, { backgroundColor: palet.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Başlık ve Kapat */}
          <View style={stiller.baslikSatiri}>
            <View style={stiller.baslikSol}>
              <Type size={20} color={palet.primary} />
              <Metin tur="altBaslik" kalin>
                Okuma Ayarları
              </Metin>
            </View>

            <Pressable onPress={onKapat} hitSlop={10}>
              <X size={20} color={palet.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={stiller.icerikScroll}>
            {/* Yazı Boyutu Seçimi */}
            <View style={stiller.ayarBolumu}>
              <Metin tur="etiket" ikincil>
                YAZI BOYUTU
              </Metin>

              <View style={stiller.boyutButonlari}>
                {GEÇERLI_YAZI_BOYUTLARI.map((boyut) => {
                  const secili = ayarlar.yaziBoyutu === boyut;
                  return (
                    <Pressable
                      key={boyut}
                      onPress={() => onGuncelle({ yaziBoyutu: boyut })}
                      style={[
                        stiller.boyutDugmesi,
                        {
                          backgroundColor: secili
                            ? palet.primary
                            : palet.surfaceContainer,
                          borderColor: secili
                            ? palet.primary
                            : palet.outlineVariant,
                        },
                      ]}
                    >
                      <Metin
                        tur="kucuk"
                        kalin={secili}
                        renk={secili ? palet.onPrimary : palet.onSurface}
                      >
                        {boyut}
                      </Metin>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Renkli Kelimeler Anahtarı */}
            <View style={[stiller.ayarBolumu, stiller.anahtarSatiri]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Metin tur="altBaslik" kalin>
                  Renkli Kelimeler
                </Metin>
                <Metin tur="minik" ikincil>
                  Kelimeleri kelime türlerine (isim, fiil vb.) göre renklendirir.
                </Metin>
              </View>

              <Switch
                value={ayarlar.renkliKelimeler}
                onValueChange={(val) => onGuncelle({ renkliKelimeler: val })}
                trackColor={{
                  false: palet.surfaceContainerHighest,
                  true: palet.primary,
                }}
                thumbColor={palet.surface}
              />
            </View>

            {/* Kelime Türleri Renk Rehberi (Salt Bilgi) */}
            {ayarlar.renkliKelimeler ? (
              <View style={stiller.ayarBolumu}>
                <Metin tur="etiket" ikincil>
                  KELİME TÜRLERİ REHBERİ
                </Metin>

                <View style={stiller.rehberGrid}>
                  {turListesi.map((tur) => {
                    const renk = TUR_RENKLERI[tur];
                    const etiket = TUR_ETIKETLERI[tur];
                    return (
                      <View
                        key={tur}
                        style={[
                          stiller.rehberElemani,
                          {
                            backgroundColor: alpha(renk, 0.12),
                            borderBottomColor: alpha(renk, 0.7),
                          },
                        ]}
                      >
                        <View style={[stiller.renkNoktasi, { backgroundColor: renk }]} />
                        <Metin tur="minik" kalin renk={palet.onSurface}>
                          {etiket}
                        </Metin>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={stiller.altButonKabi}>
            <Buton baslik="Tamam" onPress={onKapat} tamGenislik />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const stiller = StyleSheet.create({
  arkaplanArkaPlan: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalKabi: {
    borderTopLeftRadius: Yaricap.xl,
    borderTopRightRadius: Yaricap.xl,
    paddingTop: Bosluk.lg,
    paddingHorizontal: Bosluk.lg,
    paddingBottom: Bosluk.xl,
    maxHeight: '80%',
    gap: Bosluk.md,
  },
  baslikSatiri: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Bosluk.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  baslikSol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Bosluk.sm,
  },
  icerikScroll: {
    gap: Bosluk.lg,
    paddingVertical: Bosluk.sm,
  },
  ayarBolumu: {
    gap: Bosluk.xs,
  },
  boyutButonlari: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  boyutDugmesi: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Yaricap.md,
    borderWidth: 1,
    minWidth: 40,
    alignItems: 'center',
  },
  anahtarSatiri: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rehberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  rehberElemani: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Yaricap.sm,
    borderBottomWidth: 2,
  },
  renkNoktasi: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  altButonKabi: {
    paddingTop: Bosluk.sm,
  },
});
