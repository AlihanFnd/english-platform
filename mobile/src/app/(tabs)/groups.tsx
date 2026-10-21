import * as Haptics from 'expo-haptics';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { Plus, UserPlus } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { UstBar } from '@/components/UstBar';
import { GrupDetayi } from '@/components/groups/GrupDetayi';
import { GrupListesi } from '@/components/groups/GrupListesi';
import { GrupOlusturModali } from '@/components/groups/GrupOlusturModali';
import { Buton, EkranZemini, HataKutusu, KartIskeleti, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { Group, GroupDetails, api } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

export default function GruplarEkrani() {
  const palet = useRenk();
  const sekmeYuksekligi = useBottomTabBarHeight();

  const [gruplarim, setGruplarim] = useState<Group[]>([]);
  const [yonettiklerim, setYonettiklerim] = useState<Group[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const [hata, setHata] = useState('');

  const [detay, setDetay] = useState<GroupDetails | null>(null);
  const [detayYukleniyor, setDetayYukleniyor] = useState(false);

  const [olusturAd, setOlusturAd] = useState('');
  const [olusturAciklama, setOlusturAciklama] = useState('');
  const [katilKodu, setKatilKodu] = useState('');
  const [formHatasi, setFormHatasi] = useState('');
  const [formBilgisi, setFormBilgisi] = useState('');
  const [olusturAcik, setOlusturAcik] = useState(false);
  const [katilAcik, setKatilAcik] = useState(false);
  const [islemde, setIslemde] = useState(false);
  const [atanacakKitap, setAtanacakKitap] = useState(0);

  const listeyiYukle = useCallback(async () => {
    try {
      setHata('');
      const veri = await api.getGroups();
      setGruplarim(veri.myGroups);
      setYonettiklerim(veri.adminGroups);
    } catch (e) {
      setHata((e as Error).message || 'Gruplar yüklenirken hata oluştu.');
    } finally {
      setYukleniyor(false);
      setTazeleniyor(false);
    }
  }, []);

  useEffect(() => {
    listeyiYukle();
  }, [listeyiYukle]);

  const detayiAc = async (id: number) => {
    setDetayYukleniyor(true);
    try {
      const veri = await api.getGroupDetails(id);
      setDetay(veri);
      if (veri.allBooks.length > 0) setAtanacakKitap(veri.allBooks[0].bookId);
    } catch (e) {
      Alert.alert('Grup detayları yüklenemedi', (e as Error).message);
    } finally {
      setDetayYukleniyor(false);
    }
  };

  const grupOlustur = async () => {
    if (!olusturAd.trim()) return;
    setIslemde(true);
    setFormHatasi('');
    try {
      await api.createGroup(olusturAd.trim(), olusturAciklama.trim());
      setOlusturAd('');
      setOlusturAciklama('');
      setOlusturAcik(false);
      setFormBilgisi('Grup başarıyla oluşturuldu.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await listeyiYukle();
    } catch (e) {
      setFormHatasi((e as Error).message || 'Grup oluşturulamadı.');
    } finally {
      setIslemde(false);
    }
  };

  const grubaKatil = async () => {
    if (!katilKodu.trim()) return;
    setIslemde(true);
    setFormHatasi('');
    try {
      const sonuc = await api.joinGroup(katilKodu.trim());
      setKatilKodu('');
      setKatilAcik(false);
      setFormBilgisi(`"${sonuc.groupName}" grubuna başarıyla katıldın.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await listeyiYukle();
    } catch (e) {
      setFormHatasi((e as Error).message || 'Gruba katılım başarısız oldu.');
    } finally {
      setIslemde(false);
    }
  };

  const kitapAta = async () => {
    if (!detay || !atanacakKitap) return;
    try {
      await api.assignBook(detay.group.id, atanacakKitap);
      Alert.alert('Kitap gruba atandı.');
      await detayiAc(detay.group.id);
    } catch (e) {
      Alert.alert('Kitap atanamadı', (e as Error).message);
    }
  };

  if (detay) {
    return (
      <EkranZemini>
        <UstBar baslik={detay.group.name} altBaslik={`${detay.members.length} üye`} />
        <GrupDetayi
          detay={detay}
          sekmeYuksekligi={sekmeYuksekligi}
          setDetay={setDetay}
          atanacakKitap={atanacakKitap}
          setAtanacakKitap={setAtanacakKitap}
          kitapAta={kitapAta}
        />
      </EkranZemini>
    );
  }

  const tumGruplar = [
    ...yonettiklerim.map((g) => ({ grup: g, yonetici: true })),
    ...gruplarim.filter((g) => !yonettiklerim.some((y) => y.id === g.id)).map((g) => ({ grup: g, yonetici: false })),
  ];

  return (
    <EkranZemini>
      <UstBar baslik="Gruplar" altBaslik={`${tumGruplar.length} sınıf`} />

      {yukleniyor || detayYukleniyor ? (
        <KartIskeleti adet={3} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={100}
        >
          <ScrollView
            contentContainerStyle={{
              padding: Bosluk.lg,
              paddingTop: 0,
              paddingBottom: sekmeYuksekligi + Bosluk.xl,
              gap: Bosluk.md,
            }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={tazeleniyor}
                onRefresh={() => {
                  setTazeleniyor(true);
                  listeyiYukle();
                }}
                tintColor={palet.primary}
                colors={[palet.primary]}
              />
            }
          >
            {hata ? <HataKutusu mesaj={hata} /> : null}
            {formHatasi ? <HataKutusu mesaj={formHatasi} /> : null}
            {formBilgisi ? (
              <Animated.View entering={FadeIn.duration(200)}>
                <View
                  style={{
                    padding: Bosluk.md,
                    borderRadius: Yaricap.md,
                    backgroundColor: alpha(palet.success, 0.12),
                    borderWidth: 1,
                    borderColor: alpha(palet.success, 0.3),
                  }}
                >
                  <Metin tur="kucuk" renk={palet.success}>
                    {formBilgisi}
                  </Metin>
                </View>
              </Animated.View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
              <Buton
                baslik="Grup Oluştur"
                style={{ flex: 1 }}
                ikon={<Plus size={15} color={palet.onPrimary} />}
                onPress={() => {
                  setOlusturAcik((a) => !a);
                  setKatilAcik(false);
                  setFormHatasi('');
                }}
              />
              <Buton
                baslik="Gruba Katıl"
                tur="ikincil"
                style={{ flex: 1 }}
                ikon={<UserPlus size={15} color={palet.onSurface} />}
                onPress={() => {
                  setKatilAcik((a) => !a);
                  setOlusturAcik(false);
                  setFormHatasi('');
                }}
              />
            </View>

            <GrupOlusturModali
              olusturAcik={olusturAcik}
              katilAcik={katilAcik}
              olusturAd={olusturAd}
              setOlusturAd={setOlusturAd}
              olusturAciklama={olusturAciklama}
              setOlusturAciklama={setOlusturAciklama}
              katilKodu={katilKodu}
              setKatilKodu={setKatilKodu}
              islemde={islemde}
              grupOlustur={grupOlustur}
              grubaKatil={grubaKatil}
            />

            <GrupListesi tumGruplar={tumGruplar} detayiAc={detayiAc} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </EkranZemini>
  );
}
