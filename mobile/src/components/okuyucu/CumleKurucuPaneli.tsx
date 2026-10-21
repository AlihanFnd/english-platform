import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  Check,
  CheckCircle2,
  Edit2,
  Languages,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Buton, Kart, Metin } from '@/components/ui';
import { useKimlik } from '@/context/AuthContext';
import { useRenk } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { cumleyiBicimle, siraRozeti } from '@/lib/cumleKurucu';
import { cumleKaydet } from '@/lib/cumleKaydet';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap, YaziTipi } from '@/theme/tokens';

export interface SeciliKelimeParcasi {
  cumleIndex: number;
  kelimeIndex: number;
  word: string;
  govde: string;
  son?: string;
}

export interface CumleKurucuPaneliProps {
  seciliParcalar: SeciliKelimeParcasi[];
  baglamMetni?: string;
  kitapBilgisi?: string;
  onParcaCikar: (index: number) => void;
  onTemizle: () => void;
  onKapat: () => void;
}

// Bellek içi çeviri önbelleği (Maliyet önleme)
const ceviriOnbellegi = new Map<string, string>();

export function CumleKurucuPaneli({
  seciliParcalar,
  baglamMetni,
  kitapBilgisi,
  onParcaCikar,
  onTemizle,
  onKapat,
}: CumleKurucuPaneliProps) {
  const palet = useRenk();
  const router = useRouter();
  const { kullanici } = useKimlik();

  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [duzenlenmisCumle, setDuzenlenmisCumle] = useState('');
  const [ceviri, setCeviri] = useState('');
  const [ceviriYukleniyor, setCeviriYukleniyor] = useState(false);
  const [ceviriElleDegisti, setCeviriElleDegisti] = useState(false);
  const [ceviriHatasi, setCeviriHatasi] = useState(false);

  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [basarili, setBasarili] = useState(false);

  const sonIstekNoRef = useRef(0);

  // Biçimlendirilmiş Cümle Metni
  const otomatikCumle = cumleyiBicimle(seciliParcalar);
  const gosterilenCumle = duzenlemeModu ? duzenlenmisCumle : otomatikCumle;

  // Çeviri İsteği (700 ms Debounce)
  useEffect(() => {
    if (seciliParcalar.length < 2 || !otomatikCumle.trim()) {
      if (!ceviriElleDegisti) setCeviri('');
      setCeviriYukleniyor(false);
      return;
    }

    if (ceviriElleDegisti) return;

    const arananMetin = otomatikCumle.trim();

    // Önbellek Kontrolü (Maliyet Önleme)
    if (ceviriOnbellegi.has(arananMetin)) {
      setCeviri(ceviriOnbellegi.get(arananMetin)!);
      setCeviriHatasi(false);
      setCeviriYukleniyor(false);
      return;
    }

    const suankiIstekNo = ++sonIstekNoRef.current;
    setCeviriYukleniyor(true);
    setCeviriHatasi(false);

    const zamanlayici = setTimeout(async () => {
      try {
        const yanit = await api.translateSentence(arananMetin);
        if (suankiIstekNo !== sonIstekNoRef.current) return;

        if (yanit && yanit.translation) {
          ceviriOnbellegi.set(arananMetin, yanit.translation);
          setCeviri(yanit.translation);
          setCeviriHatasi(false);
        } else {
          setCeviriHatasi(true);
        }
      } catch {
        if (suankiIstekNo === sonIstekNoRef.current) {
          setCeviriHatasi(true);
        }
      } finally {
        if (suankiIstekNo === sonIstekNoRef.current) {
          setCeviriYukleniyor(false);
        }
      }
    }, 700);

    return () => clearTimeout(zamanlayici);
  }, [otomatikCumle, seciliParcalar.length, ceviriElleDegisti]);

  const handleKaydet = useCallback(async () => {
    if (kaydediliyor || basarili) return;

    const kaydedilecekCumle = (duzenlemeModu ? duzenlenmisCumle : otomatikCumle).trim();
    if (!kaydedilecekCumle) return;

    setKaydediliyor(true);

    try {
      const tamBaglam = [
        baglamMetni ? `"${baglamMetni}"` : '',
        kitapBilgisi ? ` — ${kitapBilgisi}` : '',
      ]
        .join('')
        .trim();

      await cumleKaydet({
        userId: kullanici?.id,
        cumle: kaydedilecekCumle,
        ceviri: ceviri.trim(),
        baglam: tamBaglam,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setBasarili(true);

      setTimeout(() => {
        setBasarili(false);
        onTemizle();
      }, 1600);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setKaydediliyor(false);
    }
  }, [
    kaydediliyor,
    basarili,
    duzenlemeModu,
    duzenlenmisCumle,
    otomatikCumle,
    baglamMetni,
    kitapBilgisi,
    kullanici?.id,
    ceviri,
    onTemizle,
  ]);

  if (seciliParcalar.length === 0) return null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={stiller.panelKonumu}
    >
      <Animated.View
        entering={FadeInDown.duration(240)}
        style={[stiller.panelKabi, { backgroundColor: palet.surface }]}
      >
        {/* Üst Bar */}
        <View style={stiller.ustBar}>
          <View style={stiller.ustSol}>
            <Sparkles size={16} color={palet.primary} />
            <Metin tur="kucuk" kalin>
              Cümle Kurucu
            </Metin>
            <View style={[stiller.sayacRozeti, { backgroundColor: alpha(palet.primary, 0.14) }]}>
              <Metin tur="minik" renk={palet.primary} kalin>
                {seciliParcalar.length} kelime
              </Metin>
            </View>
          </View>

          <Pressable
            onPress={onKapat}
            hitSlop={10}
            accessibilityLabel="Cümle kurucuyu kapat"
            accessibilityRole="button"
          >
            <X size={18} color={palet.onSurfaceVariant} />
          </Pressable>
        </View>

        {/* Seçili Kelimeler Çip Satırı */}
        <View style={stiller.cipSatiri}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
          >
            {seciliParcalar.map((p, index) => (
              <Pressable
                key={`${index}-${p.cumleIndex}-${p.kelimeIndex}`}
                onPress={() => onParcaCikar(index)}
                style={[
                  stiller.cip,
                  {
                    backgroundColor: alpha(palet.primary, 0.12),
                    borderColor: alpha(palet.primary, 0.3),
                  },
                ]}
              >
                <Metin tur="minik" renk={palet.primary} kalin>
                  {siraRozeti(index + 1)} {p.govde}
                </Metin>
                <X size={12} color={palet.primary} />
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Önizleme veya Düzenleme Alanı */}
        <View style={[stiller.onizlemeKabi, { backgroundColor: palet.surfaceContainer }]}>
          {duzenlemeModu ? (
            <TextInput
              value={duzenlenmisCumle}
              onChangeText={setDuzenlenmisCumle}
              autoFocus
              multiline
              style={[stiller.girdiStili, { color: palet.onSurface }]}
            />
          ) : (
            <Metin tur="govde" kalin style={{ flex: 1, lineHeight: 22 }}>
              {otomatikCumle || 'Kelimelere dokunarak cümleni kur…'}
            </Metin>
          )}

          <Pressable
            onPress={() => {
              if (!duzenlemeModu) setDuzenlenmisCumle(otomatikCumle);
              setDuzenlemeModu(!duzenlemeModu);
            }}
            hitSlop={6}
            style={stiller.duzenleDugmesi}
            accessibilityLabel={duzenlemeModu ? "Düzenlemeyi onayla" : "Cümleyi düzenle"}
            accessibilityRole="button"
          >
            {duzenlemeModu ? (
              <Check size={16} color={palet.primary} />
            ) : (
              <Edit2 size={15} color={palet.onSurfaceVariant} />
            )}
          </Pressable>
        </View>

        {/* Türkçe Çeviri Alanı */}
        <View style={[stiller.ceviriAlani, { backgroundColor: palet.surfaceContainerLow }]}>
          <Languages size={15} color={palet.primary} />
          {ceviriYukleniyor ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color={palet.primary} />
              <Metin tur="minik" ikincil>
                Çevriliyor…
              </Metin>
            </View>
          ) : (
            <TextInput
              value={ceviri}
              onChangeText={(text) => {
                setCeviri(text);
                setCeviriElleDegisti(true);
              }}
              placeholder={ceviriHatasi ? 'Çevrilemedi — kendin yazabilirsin' : 'Türkçe çevirisi…'}
              placeholderTextColor={alpha(palet.onSurfaceVariant, 0.6)}
              style={[stiller.ceviriGirdiStili, { color: palet.onSurface }]}
            />
          )}
        </View>

        {/* Alt Butonlar ve Başarı Durumu */}
        {basarili ? (
          <Animated.View entering={ZoomIn.duration(200)} style={stiller.basariKabi}>
            <CheckCircle2 size={24} color={palet.primary} />
            <Metin tur="kucuk" kalin renk={palet.primary} style={{ flex: 1 }}>
              Cümlelerime eklendi 🎉
            </Metin>
            <Pressable
              onPress={() => {
                onKapat();
                router.push('/(tabs)/words');
              }}
              style={[stiller.gorDugmesi, { backgroundColor: palet.primary }]}
            >
              <Metin tur="minik" renk={palet.onPrimary} kalin>
                Gör
              </Metin>
            </Pressable>
          </Animated.View>
        ) : (
          <View style={stiller.altAltAltBar}>
            <Pressable
              onPress={onTemizle}
              style={[stiller.temizleDugmesi, { borderColor: palet.outlineVariant }]}
            >
              <Trash2 size={15} color={palet.onSurfaceVariant} />
              <Metin tur="kucuk" ikincil>
                Temizle
              </Metin>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Buton
                baslik="Kaydet"
                onPress={handleKaydet}
                yukleniyor={kaydediliyor}
                disabled={!gosterilenCumle.trim()}
                tamGenislik
              />
            </View>
          </View>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const stiller = StyleSheet.create({
  panelKonumu: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  panelKabi: {
    borderTopLeftRadius: Yaricap.xl,
    borderTopRightRadius: Yaricap.xl,
    padding: Bosluk.lg,
    gap: Bosluk.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  ustBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ustSol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Bosluk.xs,
  },
  sayacRozeti: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Yaricap.tam,
  },
  cipSatiri: {
    maxHeight: 44,
  },
  cip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Yaricap.sm,
    borderWidth: 1,
  },
  onizlemeKabi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Bosluk.sm,
    padding: Bosluk.md,
    borderRadius: Yaricap.md,
    minHeight: 52,
  },
  girdiStili: {
    flex: 1,
    fontFamily: YaziTipi.govdeOrta,
    fontSize: 16,
    padding: 0,
  },
  duzenleDugmesi: {
    padding: 4,
  },
  ceviriAlani: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Bosluk.sm,
    paddingHorizontal: Bosluk.md,
    paddingVertical: Bosluk.xs,
    borderRadius: Yaricap.md,
  },
  ceviriGirdiStili: {
    flex: 1,
    fontFamily: YaziTipi.govde,
    fontSize: 14,
    paddingVertical: 4,
  },
  altAltAltBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Bosluk.md,
    marginTop: 4,
  },
  temizleDugmesi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Bosluk.md,
    paddingVertical: Bosluk.sm + 2,
    borderRadius: Yaricap.md,
    borderWidth: 1,
  },
  basariKabi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Bosluk.md,
    paddingVertical: Bosluk.xs,
  },
  gorDugmesi: {
    paddingHorizontal: Bosluk.lg,
    paddingVertical: 8,
    borderRadius: Yaricap.md,
  },
});
