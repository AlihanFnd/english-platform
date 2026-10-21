import { Check, GraduationCap, MessageSquare, Trash2, Volume2 } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { BosDurum, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { CumleItem } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk } from '@/theme/tokens';

export interface CumleListesiProps {
  cumleler: CumleItem[];
  cevrilenler: Set<string | number>;
  onKartiCevir: (id: string | number) => void;
  onDogrudanCumleOgrenildiIsaretle: (item: CumleItem) => void;
  onCumleSil: (item: CumleItem) => void;
  seslendir: (metin: string) => void;
  konusuyorMu: (metin: string) => boolean;
}

export function CumleListesi({
  cumleler,
  cevrilenler,
  onKartiCevir,
  onDogrudanCumleOgrenildiIsaretle,
  onCumleSil,
  seslendir,
  konusuyorMu,
}: CumleListesiProps) {
  const palet = useRenk();

  if (cumleler.length === 0) {
    return (
      <BosDurum
        simge={<MessageSquare size={28} color={palet.primary} />}
        baslik="Henüz cümle eklenmedi"
        aciklama="Öğrendiğiniz cümleleri ekleyebilir veya dosyadan topluca aktarabilirsiniz."
      />
    );
  }

  return (
    <>
      {cumleler.map((kayit) => {
        const cevrildi = cevrilenler.has(kayit.id);
        const ogrenildi = (kayit.dogruSeri || 0) >= 2;

        return (
          <Pressable
            key={kayit.id}
            onPress={() => onKartiCevir(kayit.id)}
            accessibilityRole="button"
            accessibilityLabel={`Cümle kartı: ${kayit.cumle}`}
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
                    {cevrildi ? 'TR CÜMLE' : 'EN CÜMLE'}
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
                    onPress={() => onDogrudanCumleOgrenildiIsaretle(kayit)}
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
                    onPress={() => onCumleSil(kayit)}
                    hitSlop={8}
                    style={{ padding: 4 }}
                  >
                    <Trash2 size={15} color={palet.error} />
                  </Pressable>
                </View>
              </View>

              {cevrildi ? (
                <Metin tur="govde" renk={palet.primary} ortala>
                  {kayit.ceviri}
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
                  <Metin tur="govde" ortala style={{ fontWeight: '600' }}>
                    {kayit.cumle}
                  </Metin>
                  <Pressable
                    onPress={() => seslendir(kayit.cumle)}
                    hitSlop={8}
                    accessibilityLabel="Cümleyi seslendir"
                    accessibilityRole="button"
                  >
                    <Volume2
                      size={17}
                      color={
                        konusuyorMu(kayit.cumle) ? palet.primary : palet.onSurfaceVariant
                      }
                    />
                  </Pressable>
                </View>
              )}

              <Metin tur="minik" ikincil ortala style={{ fontSize: 10 }}>
                {cevrildi ? '← İngilizceye dön' : 'Çeviriyi gör →'}
              </Metin>
            </Kart>
          </Pressable>
        );
      })}
    </>
  );
}
