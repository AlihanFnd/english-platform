import { Check, GraduationCap, Sparkles, Trash2, Volume2 } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { BosDurum, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { KELIME_HIZI } from '@/hooks/useTelaffuz';
import { WordItem } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk } from '@/theme/tokens';

export interface KelimeListesiProps {
  kelimeler: WordItem[];
  cevrilenler: Set<string | number>;
  onKartiCevir: (id: string | number) => void;
  onDogrudanOgrenildiIsaretle: (item: WordItem) => void;
  onKelimeSil: (item: WordItem) => void;
  seslendir: (metin: string, hiz?: number) => void;
  konusuyorMu: (metin: string) => boolean;
}

export function KelimeListesi({
  kelimeler,
  cevrilenler,
  onKartiCevir,
  onDogrudanOgrenildiIsaretle,
  onKelimeSil,
  seslendir,
  konusuyorMu,
}: KelimeListesiProps) {
  const palet = useRenk();

  if (kelimeler.length === 0) {
    return (
      <BosDurum
        simge={<Sparkles size={28} color={palet.primary} />}
        baslik="Henüz kelime eklenmedi"
        aciklama="Yukarıdaki kutudan ekleyebilir veya Word/Excel dosyanızdan topluca aktarabilirsiniz."
      />
    );
  }

  return (
    <>
      {kelimeler.map((kayit) => {
        const cevrildi = cevrilenler.has(kayit.id);
        // Sunucunun bayrağı: yanıtta dogruSeri alanı hiç yoktu, eski hesap rozeti hiç göstermiyordu.
        const ogrenildi = kayit.ogrenildi;

        return (
          <Pressable
            key={kayit.id}
            onPress={() => onKartiCevir(kayit.id)}
            accessibilityRole="button"
            accessibilityLabel={`Kelime kartı: ${kayit.word}`}
          >
            <Kart vurgulu={cevrildi} style={{ gap: Bosluk.sm, minHeight: 90 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Metin
                    tur="minik"
                    renk={palet.primary}
                    style={{ fontWeight: 'bold' }}
                  >
                    {cevrildi ? 'TR' : 'EN'}
                  </Metin>
                  {ogrenildi ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 2,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        backgroundColor: alpha(palet.success, 0.12),
                      }}
                    >
                      <GraduationCap size={10} color={palet.success} />
                      <Metin tur="minik" renk={palet.success}>
                        Öğrenildi
                      </Metin>
                    </View>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', gap: Bosluk.sm, alignItems: 'center' }}>
                  <Pressable
                    onPress={() => onDogrudanOgrenildiIsaretle(kayit)}
                    hitSlop={8}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 2,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: alpha(palet.success, 0.1),
                    }}
                  >
                    <Check size={11} color={palet.success} />
                    <Metin tur="minik" renk={palet.success}>
                      Bildim
                    </Metin>
                  </Pressable>
                  <Pressable
                    onPress={() => onKelimeSil(kayit)}
                    hitSlop={8}
                    style={{ padding: 4 }}
                  >
                    <Trash2 size={15} color={palet.error} />
                  </Pressable>
                </View>
              </View>

              {cevrildi ? (
                <Metin tur="altBaslik" renk={palet.primary} ortala>
                  {kayit.translation}
                </Metin>
              ) : (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: Bosluk.sm,
                  }}
                >
                  <Metin tur="baslik" ortala>
                    {kayit.word}
                  </Metin>
                  <Pressable
                    onPress={() => seslendir(kayit.word, KELIME_HIZI)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Sesli oku: ${kayit.word}`}
                  >
                    <Volume2
                      size={17}
                      color={
                        konusuyorMu(kayit.word) ? palet.primary : palet.onSurfaceVariant
                      }
                    />
                  </Pressable>
                </View>
              )}

              <Metin tur="minik" ikincil ortala style={{ fontSize: 10 }}>
                {cevrildi ? '← Kelimeye dön' : 'Anlamı gör →'}
              </Metin>
            </Kart>
          </Pressable>
        );
      })}
    </>
  );
}
