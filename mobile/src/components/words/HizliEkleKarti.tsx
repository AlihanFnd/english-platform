import { MessageSquare, Sparkles } from 'lucide-react-native';
import React from 'react';
import { Platform, TextInput, View } from 'react-native';

import { Buton, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

export interface HizliEkleKartiProps {
  aktifSekme: 'kelime' | 'cumle';
  hizliKelime: string;
  setHizliKelime: (t: string) => void;
  hizliCeviri: string;
  setHizliCeviri: (t: string) => void;
  ceviriliyor: boolean;
  ekleniyor: boolean;
  onHizliKelimeEkle: () => void;
  kelimeAlaniRef: React.RefObject<TextInput | null>;
  ceviriElleDegistiRef: React.MutableRefObject<boolean>;

  hizliCumle: string;
  setHizliCumle: (t: string) => void;
  hizliCumleCeviri: string;
  setHizliCumleCeviri: (t: string) => void;
  cumleCeviriliyor: boolean;
  cumleEkleniyor: boolean;
  onHizliCumleEkle: () => void;
  cumleAlaniRef: React.RefObject<TextInput | null>;
  cumleElleDegistiRef: React.MutableRefObject<boolean>;
}

export function HizliEkleKarti({
  aktifSekme,
  hizliKelime,
  setHizliKelime,
  hizliCeviri,
  setHizliCeviri,
  ceviriliyor,
  ekleniyor,
  onHizliKelimeEkle,
  kelimeAlaniRef,
  ceviriElleDegistiRef,

  hizliCumle,
  setHizliCumle,
  hizliCumleCeviri,
  setHizliCumleCeviri,
  cumleCeviriliyor,
  cumleEkleniyor,
  onHizliCumleEkle,
  cumleAlaniRef,
  cumleElleDegistiRef,
}: HizliEkleKartiProps) {
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

  if (aktifSekme === 'kelime') {
    return (
      <Kart vurgulu style={{ gap: Bosluk.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} color={palet.primary} />
          <Metin tur="etiket" renk={palet.primary}>
            Hızlı Kelime Ekle
          </Metin>
        </View>

        <TextInput
          ref={kelimeAlaniRef}
          value={hizliKelime}
          onChangeText={(t) => {
            setHizliKelime(t);
            ceviriElleDegistiRef.current = false;
          }}
          placeholder="İngilizce kelime (örn: resilient)"
          placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
          autoCapitalize="none"
          style={alanStili}
        />

        <TextInput
          value={hizliCeviri}
          onChangeText={(t) => {
            setHizliCeviri(t);
            ceviriElleDegistiRef.current = true;
          }}
          placeholder={ceviriliyor ? 'Çevriliyor…' : 'Türkçe anlamı'}
          placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
          style={alanStili}
        />

        <Buton
          baslik={ekleniyor ? 'Ekleniyor…' : 'Ekle'}
          kucuk
          tamGenislik
          yukleniyor={ekleniyor}
          disabled={!hizliKelime.trim() || !hizliCeviri.trim()}
          onPress={onHizliKelimeEkle}
        />
      </Kart>
    );
  }

  return (
    <Kart vurgulu style={{ gap: Bosluk.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <MessageSquare size={14} color={palet.primary} />
        <Metin tur="etiket" renk={palet.primary}>
          Hızlı Cümle Ekle
        </Metin>
      </View>

      <TextInput
        ref={cumleAlaniRef}
        value={hizliCumle}
        onChangeText={(t) => {
          setHizliCumle(t);
          cumleElleDegistiRef.current = false;
        }}
        placeholder="İngilizce cümle"
        placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
        style={alanStili}
      />

      <TextInput
        value={hizliCumleCeviri}
        onChangeText={(t) => {
          setHizliCumleCeviri(t);
          cumleElleDegistiRef.current = true;
        }}
        placeholder={cumleCeviriliyor ? 'Çevriliyor…' : 'Türkçe çevirisi'}
        placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
        style={alanStili}
      />

      <Buton
        baslik={cumleEkleniyor ? 'Ekleniyor…' : 'Ekle'}
        kucuk
        tamGenislik
        yukleniyor={cumleEkleniyor}
        disabled={!hizliCumle.trim() || !hizliCumleCeviri.trim()}
        onPress={onHizliCumleEkle}
      />
    </Kart>
  );
}
