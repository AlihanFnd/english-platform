import * as Haptics from 'expo-haptics';
import { AlertTriangle, Check, Languages, Volume2, X } from 'lucide-react-native';
import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { KelimeKutucugu } from '@/components/okuyucu/KelimeKutucugu';
import { Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import type { OkumaCumlesi } from '@/lib/cumleler';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap, YaziTipi } from '@/theme/tokens';

export interface KalipSecimi {
  cumleIndex: number;
  bas: number;
  son: number;
}

export interface CumleBloguProps {
  cumle: OkumaCumlesi;
  cumleIndex: number;
  ceviriAcik: boolean;
  yaziBoyutu: number;
  renkliKelimeler: boolean;
  seciliKelime?: string;
  kayitliKelimeler?: Set<string> | string[];
  cumleKurmaModu?: boolean;
  seciliParcalar?: Array<{ cumleIndex: number; kelimeIndex: number }>;
  onKelimeSec: (kelime: string, pos?: string, cumle?: string) => void;
  onKelimeKurmaDokun?: (cumleIndex: number, kelimeIndex: number, rawWord: string) => void;
  onTumunuSec?: (cumleIndex: number) => void;
  onCeviriToggle: () => void;
  onSeslendir: (metin: string) => void;
  konusuyorMu?: boolean;
  aktifDinleme?: boolean;
}

export const CumleBlogu = memo(function CumleBlogu({
  cumle,
  cumleIndex,
  ceviriAcik,
  yaziBoyutu,
  renkliKelimeler,
  seciliKelime,
  kayitliKelimeler,
  cumleKurmaModu = false,
  seciliParcalar = [],
  onKelimeSec,
  onKelimeKurmaDokun,
  onTumunuSec,
  onCeviriToggle,
  onSeslendir,
  konusuyorMu = false,
  aktifDinleme = false,
}: CumleBloguProps) {
  const palet = useRenk();
  const [kalip, setKalip] = useState<KalipSecimi | null>(null);

  const kayitliSet = React.useMemo(() => {
    if (!kayitliKelimeler) return new Set<string>();
    if (kayitliKelimeler instanceof Set) return kayitliKelimeler;
    return new Set(kayitliKelimeler.map((k) => k.toLowerCase()));
  }, [kayitliKelimeler]);

  const kalipMetni = React.useMemo(() => {
    if (!kalip) return '';
    return cumle.words
      .slice(kalip.bas, kalip.son + 1)
      .map((k) => k.word)
      .join(' ')
      .trim();
  }, [kalip, cumle.words]);

  const handleKelimeDokun = (kelimeIndex: number, rawWord: string, pos?: string) => {
    if (kalip) {
      setKalip({
        cumleIndex,
        bas: Math.min(kalip.bas, kelimeIndex),
        son: Math.max(kalip.son, kelimeIndex),
      });
      Haptics.selectionAsync().catch(() => {});
      return;
    }

    onKelimeSec(rawWord, pos, cumle.original);
  };

  const handleKelimeBas = (kelimeIndex: number) => {
    setKalip({ cumleIndex, bas: kelimeIndex, son: kelimeIndex });
  };

  return (
    <View
      style={[
        stiller.cumleKabi,
        {
          paddingLeft: cumle.indentation ? cumle.indentation * 12 : 0,
          ...(aktifDinleme
            ? {
                borderLeftWidth: 4,
                borderLeftColor: palet.primary,
                backgroundColor: alpha(palet.primary, 0.08),
                borderRadius: Yaricap.md,
                padding: Bosluk.xs,
              }
            : {}),
        },
      ]}
    >
      <View style={stiller.icerikSatiri}>
        {/* Kelimeler Akışı Veya Başlık */}
        <View style={stiller.kelimelerAkisi}>
          {cumle.isHeading ? (
            <Text
              style={{
                fontFamily: YaziTipi.baslik,
                fontSize: yaziBoyutu + 4,
                lineHeight: (yaziBoyutu + 4) * 1.5,
                color: palet.onSurface,
                textAlign: cumle.alignment === 'center' ? 'center' : 'left',
                marginVertical: Bosluk.xs,
              }}
            >
              {cumle.original}
            </Text>
          ) : (
            <View style={stiller.kutucukSatirlari}>
              {cumle.words.map((k, kIndex) => {
                const govde = k.word.trim().toLowerCase();

                let secili = false;
                let siraNo: number | undefined = undefined;

                if (cumleKurmaModu) {
                  const secilenIndex = seciliParcalar.findIndex(
                    (p) => p.cumleIndex === cumleIndex && p.kelimeIndex === kIndex,
                  );
                  if (secilenIndex >= 0) {
                    secili = true;
                    siraNo = secilenIndex + 1;
                  }
                } else {
                  secili =
                    Boolean(seciliKelime && seciliKelime.toLowerCase() === govde) ||
                    (kalip !== null && kIndex >= kalip.bas && kIndex <= kalip.son);
                }

                const kayitli = kayitliSet.has(govde);

                return (
                  <KelimeKutucugu
                    key={`${kIndex}-${k.word}`}
                    rawWord={k.word}
                    pos={k.type || (k as any).pos}
                    renkliKelimeler={renkliKelimeler}
                    yaziBoyutu={yaziBoyutu}
                    secili={secili}
                    kayitli={kayitli}
                    siraNo={siraNo}
                    onPress={(_raw, pos) => {
                      if (cumleKurmaModu) {
                        if (onKelimeKurmaDokun) {
                          onKelimeKurmaDokun(cumleIndex, kIndex, k.word);
                        }
                      } else {
                        handleKelimeDokun(kIndex, k.word, pos);
                      }
                    }}
                    onLongPress={() => {
                      if (!cumleKurmaModu) handleKelimeBas(kIndex);
                    }}
                  />
                );
              })}
            </View>
          )}
        </View>

        {/* Sağ Dikey Eylemler */}
        <View style={stiller.eylemCubugu}>
          {cumleKurmaModu && onTumunuSec ? (
            <Pressable
              onPress={() => onTumunuSec(cumleIndex)}
              hitSlop={6}
              accessibilityLabel="Bu cümlenin tüm kelimelerini seç"
              style={[
                stiller.eylemDugmesi,
                { backgroundColor: alpha(palet.primary, 0.16) },
              ]}
            >
              <Metin tur="minik" kalin renk={palet.primary}>
                Tümü
              </Metin>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => onSeslendir(cumle.original)}
            hitSlop={6}
            accessibilityLabel="Cümleyi sesli oku"
            style={[
              stiller.eylemDugmesi,
              {
                backgroundColor: konusuyorMu
                  ? alpha(palet.primary, 0.2)
                  : alpha(palet.onSurfaceVariant, 0.08),
              },
            ]}
          >
            <Volume2
              size={14}
              color={konusuyorMu ? palet.primary : palet.onSurfaceVariant}
            />
          </Pressable>

          <Pressable
            onPress={onCeviriToggle}
            hitSlop={6}
            accessibilityLabel="Cümle çevirisini aç veya kapat"
            style={[
              stiller.eylemDugmesi,
              {
                backgroundColor: ceviriAcik
                  ? palet.primary
                  : alpha(palet.onSurfaceVariant, 0.08),
              },
            ]}
          >
            <Languages
              size={14}
              color={ceviriAcik ? palet.onPrimary : palet.onSurfaceVariant}
            />
          </Pressable>
        </View>
      </View>

      {/* Kalıp Seçimi Çubuğu */}
      {kalip ? (
        <Animated.View entering={FadeIn.duration(160)} style={[stiller.kalipKabi, { backgroundColor: alpha(palet.primary, 0.1), borderColor: alpha(palet.primary, 0.3) }]}>
          <Metin tur="minik" ikincil style={{ flex: 1 }} numberOfLines={1}>
            “{kalipMetni}”
          </Metin>
          <Pressable
            onPress={() => {
              const metin = kalipMetni;
              setKalip(null);
              if (metin) {
                onKelimeSec(metin, 'kalıp', cumle.original);
              }
            }}
            style={[stiller.kalipCevirDugmesi, { backgroundColor: palet.primary }]}
          >
            <Check size={12} color={palet.onPrimary} />
            <Metin tur="minik" renk={palet.onPrimary}>
              Çevir
            </Metin>
          </Pressable>
          <Pressable
            onPress={() => setKalip(null)}
            hitSlop={8}
            accessibilityLabel="Kalıbı kapat"
            accessibilityRole="button"
          >
            <X size={16} color={palet.onSurfaceVariant} />
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Türkçe Çeviri Paneli */}
      {ceviriAcik ? (
        <Animated.View
          entering={FadeInDown.duration(200)}
          style={[
            stiller.ceviriKutusu,
            {
              backgroundColor:
                cumle.ceviriBasarili === false
                  ? alpha(palet.warning, 0.1)
                  : alpha(palet.primary, 0.08),
              borderLeftColor:
                cumle.ceviriBasarili === false ? palet.warning : palet.primary,
            },
          ]}
        >
          {cumle.ceviriBasarili === false ? (
            <>
              <AlertTriangle size={14} color={palet.warning} />
              <Metin tur="kucuk" renk={palet.warning} style={{ flex: 1, lineHeight: 19 }}>
                Bu satır çevrilemedi — çeviri servisine ulaşılamadı.
              </Metin>
            </>
          ) : (
            <>
              <Languages size={14} color={palet.primary} />
              <Metin tur="kucuk" style={{ flex: 1, lineHeight: 20 }}>
                {cumle.translation}
              </Metin>
            </>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
});

const stiller = StyleSheet.create({
  cumleKabi: {
    marginVertical: Bosluk.xs,
    gap: Bosluk.xs,
  },
  icerikSatiri: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Bosluk.xs,
  },
  kelimelerAkisi: {
    flex: 1,
  },
  kutucukSatirlari: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  eylemCubugu: {
    flexDirection: 'column',
    gap: 6,
    paddingTop: 2,
  },
  eylemDugmesi: {
    padding: 6,
    borderRadius: Yaricap.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kalipKabi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Bosluk.sm,
    padding: Bosluk.sm,
    borderRadius: Yaricap.md,
    borderWidth: 1,
    marginTop: 4,
  },
  kalipCevirDugmesi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Bosluk.md,
    paddingVertical: 6,
    borderRadius: Yaricap.sm,
  },
  ceviriKutusu: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Bosluk.sm,
    padding: Bosluk.md,
    borderRadius: Yaricap.md,
    borderLeftWidth: 3,
    marginTop: 4,
  },
});
