import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useRenk } from '@/context/ThemeContext';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi, golge } from '@/theme/tokens';

/* ─── Metin ─────────────────────────────────────────────────── */

type MetinTuru = 'devasa' | 'buyuk' | 'baslik' | 'altBaslik' | 'govde' | 'kucuk' | 'minik' | 'etiket';

interface MetinProps extends TextProps {
  tur?: MetinTuru;
  /** Varsayılan `onSurface`; ikincil metinler için `ikincil` verin. */
  ikincil?: boolean;
  renk?: string;
  kalin?: boolean;
  ortala?: boolean;
}

export function Metin({
  tur = 'govde',
  ikincil,
  renk,
  kalin,
  ortala,
  style,
  children,
  ...rest
}: MetinProps) {
  const palet = useRenk();

  const turStilleri: Record<MetinTuru, TextStyle> = {
    devasa: { fontSize: Olcek.devasa, fontFamily: YaziTipi.baslik, letterSpacing: -0.5 },
    buyuk: { fontSize: Olcek.buyuk, fontFamily: YaziTipi.baslik, letterSpacing: -0.3 },
    baslik: { fontSize: Olcek.baslik, fontFamily: YaziTipi.baslikOrta, letterSpacing: -0.2 },
    altBaslik: { fontSize: Olcek.altBaslik, fontFamily: YaziTipi.govdeYariKalin },
    govde: { fontSize: Olcek.govde, fontFamily: YaziTipi.govde, lineHeight: 20 },
    kucuk: { fontSize: Olcek.kucuk, fontFamily: YaziTipi.govdeOrta },
    minik: { fontSize: Olcek.minik, fontFamily: YaziTipi.govdeYariKalin },
    etiket: {
      fontSize: Olcek.minik,
      fontFamily: YaziTipi.govdeKalin,
      letterSpacing: 0.8,
    },
  };

  const islenenCocuk = React.useMemo(() => {
    if (tur === 'etiket' && typeof children === 'string') {
      return children.toLocaleUpperCase('tr-TR');
    }
    return children;
  }, [children, tur]);

  return (
    <Text
      {...rest}
      style={[
        turStilleri[tur],
        { color: renk ?? (ikincil ? palet.onSurfaceVariant : palet.onSurface) },
        kalin && { fontFamily: YaziTipi.govdeKalin },
        ortala && { textAlign: 'center' },
        style,
      ]}
    >
      {islenenCocuk}
    </Text>
  );
}

/* ─── Kart ("cam" yüzey) ────────────────────────────────────── */

interface KartProps extends ViewProps {
  /** Kenarlığı vurgular — seçili/etkin kartlar için. */
  vurgulu?: boolean;
  dolgu?: number;
  animasyonsuz?: boolean;
}

export function Kart({ vurgulu, dolgu = Bosluk.lg, style, children, ...rest }: KartProps) {
  const palet = useRenk();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: palet.glassBg,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: vurgulu ? alpha(palet.primary, 0.45) : palet.glassBorder,
          borderRadius: Yaricap.xl,
          padding: dolgu,
        },
        golge(palet.glassShadow, 1),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ─── Buton ─────────────────────────────────────────────────── */

type ButonTuru = 'birincil' | 'ikincil' | 'hayalet' | 'tehlike';

interface ButonProps extends Omit<PressableProps, 'style'> {
  baslik: string;
  tur?: ButonTuru;
  ikon?: React.ReactNode;
  yukleniyor?: boolean;
  tamGenislik?: boolean;
  kucuk?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Buton({
  baslik,
  tur = 'birincil',
  ikon,
  yukleniyor,
  tamGenislik,
  kucuk,
  disabled,
  style,
  ...rest
}: ButonProps) {
  const palet = useRenk();
  const pasif = disabled || yukleniyor;

  const zeminler: Record<ButonTuru, ViewStyle> = {
    birincil: { backgroundColor: palet.primary },
    ikincil: {
      backgroundColor: palet.surfaceContainer,
      borderWidth: 1,
      borderColor: palet.outlineVariant,
    },
    hayalet: { backgroundColor: 'transparent' },
    tehlike: {
      backgroundColor: alpha(palet.error, 0.12),
      borderWidth: 1,
      borderColor: alpha(palet.error, 0.35),
    },
  };

  const yazilar: Record<ButonTuru, string> = {
    birincil: palet.onPrimary,
    ikincil: palet.onSurface,
    hayalet: palet.onSurfaceVariant,
    tehlike: palet.error,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? baslik}
      {...rest}
      disabled={pasif}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Bosluk.sm,
          paddingVertical: kucuk ? Bosluk.sm + 1 : Bosluk.md + 2,
          paddingHorizontal: kucuk ? Bosluk.md : Bosluk.xl,
          borderRadius: Yaricap.lg,
          alignSelf: tamGenislik ? 'stretch' : 'flex-start',
          opacity: pasif ? 0.55 : 1,
          // Bastırınca hafif küçülme — web'deki .bouncy-btn karşılığı.
          transform: [{ scale: pressed && !pasif ? 0.975 : 1 }],
        },
        zeminler[tur],
        tur === 'birincil' && !pasif ? golge(alpha(palet.primary, 0.5), 2) : null,
        style,
      ]}
    >
      {yukleniyor ? <ActivityIndicator size="small" color={yazilar[tur]} /> : ikon}
      <Text
        style={{
          color: yazilar[tur],
          fontFamily: YaziTipi.govdeKalin,
          fontSize: kucuk ? Olcek.kucuk : Olcek.govde,
        }}
      >
        {baslik}
      </Text>
    </Pressable>
  );
}

/* ─── Rozet ─────────────────────────────────────────────────── */

export function Rozet({
  metin,
  renk,
  zemin,
  ikon,
  style,
}: {
  metin: string;
  renk?: string;
  zemin?: string;
  ikon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palet = useRenk();
  const yazi = renk ?? palet.primary;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: Bosluk.sm + 2,
          paddingVertical: 4,
          borderRadius: Yaricap.tam,
          backgroundColor: zemin ?? alpha(yazi, 0.12),
          borderWidth: 1,
          borderColor: alpha(yazi, 0.28),
        },
        style,
      ]}
    >
      {ikon}
      <Text style={{ color: yazi, fontFamily: YaziTipi.govdeKalin, fontSize: Olcek.minik }}>
        {metin}
      </Text>
    </View>
  );
}

/* ─── İlerleme çubuğu ───────────────────────────────────────── */

export function IlerlemeCubugu({
  yuzde,
  tamamlandi,
  yukseklik = 8,
}: {
  yuzde: number;
  tamamlandi?: boolean;
  yukseklik?: number;
}) {
  const palet = useRenk();
  const guvenli = Math.max(0, Math.min(100, Number.isFinite(yuzde) ? yuzde : 0));
  return (
    <View
      style={{
        height: yukseklik,
        borderRadius: Yaricap.tam,
        backgroundColor: palet.surfaceContainerHighest,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={
          tamamlandi
            ? [palet.success, palet.success]
            : [palet.primary, palet.primaryContainer]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: `${guvenli}%`, height: '100%', borderRadius: Yaricap.tam }}
      />
    </View>
  );
}

/* ─── Durum ekranları ───────────────────────────────────────── */

export function Yukleniyor({ mesaj }: { mesaj?: string }) {
  const palet = useRenk();
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Bosluk.md, padding: Bosluk.xl }}
    >
      <ActivityIndicator size="large" color={palet.primary} />
      {mesaj ? (
        <Metin tur="kucuk" ikincil ortala>
          {mesaj}
        </Metin>
      ) : null}
    </Animated.View>
  );
}

export function KartIskeleti({ adet = 3 }: { adet?: number }) {
  const palet = useRenk();
  const HareketiAzalt = useReducedMotion();
  const opaklik = useSharedValue(0.3);

  React.useEffect(() => {
    if (!HareketiAzalt) {
      opaklik.value = withRepeat(
        withTiming(0.7, { duration: 600 }),
        -1,
        true,
      );
    } else {
      opaklik.value = 0.5;
    }
  }, [HareketiAzalt, opaklik]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opaklik.value,
  }));

  return (
    <View style={{ gap: Bosluk.md, padding: Bosluk.md }}>
      {Array.from({ length: adet }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            animatedStyle,
            {
              height: 72,
              borderRadius: Yaricap.lg,
              backgroundColor: alpha(palet.onSurfaceVariant, 0.14),
            },
          ]}
        />
      ))}
    </View>
  );
}

export function HataKutusu({ mesaj, style }: { mesaj: string; style?: StyleProp<ViewStyle> }) {
  const palet = useRenk();
  return (
    <View
      style={[
        {
          padding: Bosluk.lg,
          borderRadius: Yaricap.lg,
          backgroundColor: alpha(palet.error, 0.12),
          borderWidth: 1,
          borderColor: alpha(palet.error, 0.3),
        },
        style,
      ]}
    >
      <Metin tur="kucuk" renk={palet.error}>
        {mesaj}
      </Metin>
    </View>
  );
}

export function BosDurum({
  simge,
  baslik,
  aciklama,
  eylem,
}: {
  simge?: React.ReactNode;
  baslik: string;
  aciklama?: string;
  eylem?: React.ReactNode;
}) {
  return (
    <Kart dolgu={Bosluk.xxl} style={{ alignItems: 'center', gap: Bosluk.md }}>
      {simge}
      <Metin tur="baslik" ortala>
        {baslik}
      </Metin>
      {aciklama ? (
        <Metin tur="kucuk" ikincil ortala style={{ lineHeight: 18 }}>
          {aciklama}
        </Metin>
      ) : null}
      {eylem}
    </Kart>
  );
}

/* ─── Ekran zemini ──────────────────────────────────────────── */

/**
 * Tüm sekmelerin ortak zemini. Web'de bu, gövdeye uygulanan 135° gradyandı;
 * burada da aynı üç durak kullanılıyor.
 */
export function EkranZemini({ children }: { children: React.ReactNode }) {
  const palet = useRenk();
  return (
    <LinearGradient
      colors={[palet.background, palet.surfaceDim, palet.surfaceVariant]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      {children}
    </LinearGradient>
  );
}
