import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  Flame,
  Sparkles,
  Target,
  X,
  Zap,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';

import { KitapKapagi } from '@/components/KitapKapagi';
import { Buton, Kart, Metin, Rozet } from '@/components/ui';
import { useSeri } from '@/context/SeriContext';
import { useRenk } from '@/context/ThemeContext';
import { Book, api } from '@/lib/api';
import { saveHatirlatmaAyarlari } from '@/lib/hatirlatmalar';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

interface IlkAcilisModalProps {
  visible: boolean;
  onClose: () => void;
  userId?: number;
}

const SEVIYE_SECENEKLERI = [
  {
    id: 'A1-A2',
    baslik: 'Başlangıç (A1–A2)',
    aciklama: 'Temel cümle yapılarını anlıyorum, basit okumalar yapabilirim.',
    renk: '#10b981',
  },
  {
    id: 'B1-B2',
    baslik: 'Orta (B1–B2)',
    aciklama: 'Günlük konuları rahatça anlayabilir, karmaşık metinleri takip edebilirim.',
    renk: '#0ea5e9',
  },
  {
    id: 'C1-C2',
    baslik: 'İleri (C1–C2)',
    aciklama: 'Akıcı okuyabilir, edebi ve akademik metinleri zorlanmadan kavramabilirim.',
    renk: '#a855f7',
  },
  {
    id: null,
    baslik: 'Emin Değilim',
    aciklama: 'Şimdilik seviye seçme, bana genel öneriler sun.',
    renk: '#64748b',
  },
];

const HEDEF_SECENEKLERI = [
  {
    xp: 10,
    baslik: 'Rahat',
    sure: '~5 dk / gün',
    simge: Zap,
    onerilen: false,
  },
  {
    xp: 20,
    baslik: 'Normal',
    sure: '~10 dk / gün',
    simge: Target,
    onerilen: true,
  },
  {
    xp: 30,
    baslik: 'Ciddi',
    sure: '~15 dk / gün',
    simge: Flame,
    onerilen: false,
  },
  {
    xp: 50,
    baslik: 'Yoğun',
    sure: '~25 dk / gün',
    simge: Sparkles,
    onerilen: false,
  },
];

export function IlkAcilisModal({ visible, onClose, userId }: IlkAcilisModalProps) {
  const palet = useRenk();
  const router = useRouter();
  const { ayarlariGuncelle, yenile } = useSeri();

  const [adim, setAdim] = useState(1);
  const [secilenSeviye, setSecilenSeviye] = useState<string | null>(null);
  const [secilenHedefXp, setSecilenHedefXp] = useState<number>(20);
  const [bildirimIzni, setBildirimIzni] = useState<boolean | null>(null);
  const [kitaplar, setKitaplar] = useState<Book[]>([]);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    if (visible) {
      setAdim(1);
      api
        .getBooks()
        .then((b) => setKitaplar(b.slice(0, 6)))
        .catch(() => {});
    }
  }, [visible]);

  const tamamla = async (hedefKitapId?: number) => {
    if (kaydediliyor) return;
    setKaydediliyor(true);
    try {
      await ayarlariGuncelle({
        ilkAcilisTamamlandi: true,
        ...(secilenSeviye ? { seviye: secilenSeviye } : {}),
        gunlukHedefXp: secilenHedefXp,
      });
      await yenile();
    } catch {
      // Hata durumunda da kullanıcı engellenmez
    } finally {
      setKaydediliyor(false);
      onClose();
      if (hedefKitapId) {
        router.push(`/books/${hedefKitapId}`);
      }
    }
  };

  const bildirimIzniIste = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      const izinli = status === 'granted';
      setBildirimIzni(izinli);
      if (izinli) {
        await saveHatirlatmaAyarlari({ acik: true, saat: '20:00' });
      }
    } catch {
      setBildirimIzni(false);
    }
    setAdim(5);
  };

  if (!visible) return null;

  // Seviyeye uygun ilk 3 kitap
  const onerilenKitaplar = (
    secilenSeviye
      ? kitaplar.filter(
          (k) => (k.level || '').includes(secilenSeviye.split('-')[0]) || k.level === secilenSeviye,
        )
      : kitaplar
  ).slice(0, 3);

  const gosterilenKitaplar = onerilenKitaplar.length > 0 ? onerilenKitaplar : kitaplar.slice(0, 3);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={() => tamamla()}>
      <View style={{ flex: 1, backgroundColor: palet.surface }}>
        {/* Üst Bar: 5 Noktalı İlerleme + Geç Butonu */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Bosluk.lg,
            paddingTop: Bosluk.xl + 8,
            paddingBottom: Bosluk.md,
            borderBottomWidth: 1,
            borderBottomColor: palet.outlineVariant,
          }}
        >
          {/* 5 Noktalı İlerleme Göstergesi */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((i) => {
              const aktif = adim === i;
              const tamam = adim > i;
              return (
                <View
                  key={i}
                  style={{
                    width: aktif ? 20 : 8,
                    height: 8,
                    borderRadius: Yaricap.tam,
                    backgroundColor: aktif
                      ? palet.primary
                      : tamam
                        ? alpha(palet.primary, 0.4)
                        : palet.surfaceContainerHighest,
                  }}
                />
              );
            })}
          </View>

          {/* Geç (Skip) Butonu */}
          <Pressable
            onPress={() => tamamla()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Tüm adımları geç"
            style={{
              paddingHorizontal: Bosluk.md,
              paddingVertical: Bosluk.xs,
              borderRadius: Yaricap.md,
              backgroundColor: palet.surfaceContainer,
            }}
          >
            <Metin tur="kucuk" kalin renk={palet.onSurfaceVariant}>
              Geç
            </Metin>
          </Pressable>
        </View>

        {/* Ekran İçeriği (Adımlar) */}
        <ScrollView
          contentContainerStyle={{
            padding: Bosluk.lg,
            paddingBottom: Bosluk.xxl,
            gap: Bosluk.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {adim === 1 && (
            <Animated.View entering={FadeInRight.duration(280)} exiting={FadeOutLeft.duration(280)} style={{ gap: Bosluk.lg }}>
              <View style={{ alignItems: 'center', gap: Bosluk.xs, marginTop: Bosluk.md }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: Yaricap.tam,
                    backgroundColor: alpha(palet.primary, 0.12),
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: Bosluk.xs,
                  }}
                >
                  <Compass size={32} color={palet.primary} />
                </View>
                <Metin tur="baslik" ortala>
                  Readixo’ya Hoş Geldin!
                </Metin>
                <Metin tur="govde" ikincil ortala style={{ lineHeight: 22 }}>
                  İngilizce okuma ve öğrenme yolculuğunda sana özel harika bir deneyim hazırladık.
                </Metin>
              </View>

              <Kart style={{ gap: Bosluk.md, padding: Bosluk.lg }}>
                <View style={{ flexDirection: 'row', gap: Bosluk.md, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha('#10b981', 0.12),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <BookOpen size={22} color="#10b981" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Metin tur="altBaslik">1. Oku</Metin>
                    <Metin tur="kucuk" ikincil style={{ lineHeight: 18 }}>
                      Seviyene uygun İngilizce kitap ve makaleler oku, okuduğunu anlama becerini geliştir.
                    </Metin>
                  </View>
                </View>

                <View
                  style={{
                    height: 1,
                    backgroundColor: palet.outlineVariant,
                  }}
                />

                <View style={{ flexDirection: 'row', gap: Bosluk.md, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha('#0ea5e9', 0.12),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Sparkles size={22} color="#0ea5e9" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Metin tur="altBaslik">2. Kelimeni Kaydet</Metin>
                    <Metin tur="kucuk" ikincil style={{ lineHeight: 18 }}>
                      Takıldığın kelimelere dokunarak Türkçe karşılığını gör ve aralıklı tekrar sistemine ekle.
                    </Metin>
                  </View>
                </View>

                <View
                  style={{
                    height: 1,
                    backgroundColor: palet.outlineVariant,
                  }}
                />

                <View style={{ flexDirection: 'row', gap: Bosluk.md, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha('#f59e0b', 0.12),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Flame size={22} color="#f59e0b" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Metin tur="altBaslik">3. Her Gün Biraz</Metin>
                    <Metin tur="kucuk" ikincil style={{ lineHeight: 18 }}>
                      Günlük hedefine ulaşarak seri alevini koru ve kalıcı öğrenme alışkanlığı kazan.
                    </Metin>
                  </View>
                </View>
              </Kart>

              <Buton
                baslik="Başlayalım"
                tamGenislik
                ikon={<ArrowRight size={18} color={palet.onPrimary} />}
                onPress={() => setAdim(2)}
              />
            </Animated.View>
          )}

          {adim === 2 && (
            <Animated.View entering={FadeInRight.duration(280)} exiting={FadeOutLeft.duration(280)} style={{ gap: Bosluk.lg }}>
              <View style={{ gap: Bosluk.xs }}>
                <Metin tur="baslik">İngilizce Seviyen</Metin>
                <Metin tur="govde" ikincil>
                  Sana en uygun kitap ve makaleleri ilk sırada önerebilmemiz için seviyeni seç.
                </Metin>
              </View>

              <View style={{ gap: Bosluk.md }}>
                {SEVIYE_SECENEKLERI.map((s) => {
                  const secili = secilenSeviye === s.id;
                  return (
                    <Pressable key={s.id ?? 'none'} onPress={() => setSecilenSeviye(s.id)}>
                      <Kart
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: Bosluk.md,
                          padding: Bosluk.md,
                          borderColor: secili ? palet.primary : palet.outlineVariant,
                          borderWidth: secili ? 2 : 1,
                          backgroundColor: secili ? alpha(palet.primary, 0.06) : palet.surfaceContainer,
                        }}
                      >
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: Yaricap.tam,
                            borderWidth: 2,
                            borderColor: secili ? palet.primary : palet.outlineVariant,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {secili ? (
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: Yaricap.tam,
                                backgroundColor: palet.primary,
                              }}
                            />
                          ) : null}
                        </View>

                        <View style={{ flex: 1, gap: 2 }}>
                          <Metin tur="altBaslik" renk={secili ? palet.primary : palet.onSurface}>
                            {s.baslik}
                          </Metin>
                          <Metin tur="kucuk" ikincil style={{ lineHeight: 18 }}>
                            {s.aciklama}
                          </Metin>
                        </View>
                      </Kart>
                    </Pressable>
                  );
                })}
              </View>

              <Buton
                baslik="Devam Et"
                tamGenislik
                ikon={<ArrowRight size={18} color={palet.onPrimary} />}
                onPress={() => setAdim(3)}
              />
            </Animated.View>
          )}

          {adim === 3 && (
            <Animated.View entering={FadeInRight.duration(280)} exiting={FadeOutLeft.duration(280)} style={{ gap: Bosluk.lg }}>
              <View style={{ gap: Bosluk.xs }}>
                <Metin tur="baslik">Günlük Okuma Hedefin</Metin>
                <Metin tur="govde" ikincil>
                  Her gün tamamlamak istediğin çalışma miktarını belirle. İstediğin zaman değiştirebilirsin.
                </Metin>
              </View>

              <View style={{ gap: Bosluk.md }}>
                {HEDEF_SECENEKLERI.map((h) => {
                  const secili = secilenHedefXp === h.xp;
                  const Simge = h.simge;
                  return (
                    <Pressable key={h.xp} onPress={() => setSecilenHedefXp(h.xp)}>
                      <Kart
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: Bosluk.md,
                          padding: Bosluk.md,
                          borderColor: secili ? palet.primary : palet.outlineVariant,
                          borderWidth: secili ? 2 : 1,
                          backgroundColor: secili ? alpha(palet.primary, 0.06) : palet.surfaceContainer,
                        }}
                      >
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: Yaricap.md,
                            backgroundColor: secili ? alpha(palet.primary, 0.16) : palet.surfaceContainerHighest,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Simge size={20} color={secili ? palet.primary : palet.onSurfaceVariant} />
                        </View>

                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Metin tur="altBaslik" renk={secili ? palet.primary : palet.onSurface}>
                              {h.baslik} ({h.xp} XP)
                            </Metin>
                            {h.onerilen ? <Rozet metin="Önerilen" renk={palet.primary} /> : null}
                          </View>
                          <Metin tur="kucuk" ikincil>
                            {h.sure}
                          </Metin>
                        </View>

                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: Yaricap.tam,
                            borderWidth: 2,
                            borderColor: secili ? palet.primary : palet.outlineVariant,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {secili ? (
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: Yaricap.tam,
                                backgroundColor: palet.primary,
                              }}
                            />
                          ) : null}
                        </View>
                      </Kart>
                    </Pressable>
                  );
                })}
              </View>

              <Buton
                baslik="Devam Et"
                tamGenislik
                ikon={<ArrowRight size={18} color={palet.onPrimary} />}
                onPress={() => setAdim(4)}
              />
            </Animated.View>
          )}

          {adim === 4 && (
            <Animated.View entering={FadeInRight.duration(280)} exiting={FadeOutLeft.duration(280)} style={{ gap: Bosluk.lg }}>
              <View style={{ alignItems: 'center', gap: Bosluk.xs, marginTop: Bosluk.md }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: Yaricap.tam,
                    backgroundColor: alpha(palet.primary, 0.12),
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: Bosluk.xs,
                  }}
                >
                  <Bell size={32} color={palet.primary} />
                </View>
                <Metin tur="baslik" ortala>
                  Hatırlatma Bildirimi
                </Metin>
                <Metin tur="govde" ikincil ortala style={{ lineHeight: 22 }}>
                  Günlük hedefini ve serini kaybetmemen için her akşam 20:00’de sana nazik bir hatırlatma gönderelim.
                </Metin>
              </View>

              <Kart style={{ gap: Bosluk.sm, padding: Bosluk.lg, backgroundColor: palet.surfaceContainerLow }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <CheckCircle2 size={18} color={palet.success} />
                  <Metin tur="kucuk" kalin>
                    Günde sadece 1 bildirim
                  </Metin>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <CheckCircle2 size={18} color={palet.success} />
                  <Metin tur="kucuk" kalin>
                    Hedefini tamamlayınca otomatik susar
                  </Metin>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <CheckCircle2 size={18} color={palet.success} />
                  <Metin tur="kucuk" kalin>
                    Profil ayarlarından saatini değiştirebilirsin
                  </Metin>
                </View>
              </Kart>

              <View style={{ gap: Bosluk.sm }}>
                <Buton
                  baslik="Bildirimleri Aç"
                  tamGenislik
                  ikon={<Bell size={18} color={palet.onPrimary} />}
                  onPress={bildirimIzniIste}
                />
                <Buton
                  baslik="Şimdi Değil"
                  tur="ikincil"
                  tamGenislik
                  onPress={() => setAdim(5)}
                />
              </View>
            </Animated.View>
          )}

          {adim === 5 && (
            <Animated.View entering={FadeInRight.duration(280)} exiting={FadeOutLeft.duration(280)} style={{ gap: Bosluk.lg }}>
              <View style={{ gap: Bosluk.xs }}>
                <Metin tur="baslik">Sana Uygun İlk Kitabın</Metin>
                <Metin tur="govde" ikincil>
                  Seviyene ve tercihlerine göre seçtiğimiz bu kitaplardan biriyle okumaya başla.
                </Metin>
              </View>

              <View style={{ gap: Bosluk.md }}>
                {gosterilenKitaplar.map((kitap) => (
                  <Pressable key={kitap.id} onPress={() => tamamla(kitap.id)}>
                    <Kart
                      style={{
                        flexDirection: 'row',
                        gap: Bosluk.md,
                        alignItems: 'center',
                        padding: Bosluk.md,
                      }}
                    >
                      <KitapKapagi
                        baslik={kitap.title}
                        yazar={kitap.author}
                        renk={kitap.coverColor}
                        seviye={kitap.level}
                        kategori={kitap.category}
                      />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Rozet metin={kitap.level || 'A1'} renk={palet.primary} />
                        <Metin tur="altBaslik" numberOfLines={1}>
                          {kitap.title}
                        </Metin>
                        <Metin tur="kucuk" ikincil numberOfLines={1}>
                          {kitap.author || 'Bilinmiyor'}
                        </Metin>
                      </View>
                      <ChevronRight size={20} color={palet.onSurfaceVariant} />
                    </Kart>
                  </Pressable>
                ))}
              </View>

              <Buton
                baslik="Panolara Geç"
                tur="ikincil"
                tamGenislik
                onPress={() => tamamla()}
              />
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
