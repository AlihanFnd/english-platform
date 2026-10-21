import {
  LogOut,
  MessageSquare,
  Moon,
  Send,
  Sun,
  CheckCircle2,
  User as UserIcon,
  X,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Buton, HataKutusu, Metin } from '@/components/ui';
import { useKimlik } from '@/context/AuthContext';
import { useTema } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { rolEtiketi } from '@/lib/rol';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

import { useRouter } from 'expo-router';
import { SeriAlevi } from '@/components/seri/SeriAlevi';
import { useSeri } from '@/context/SeriContext';

function basHarf(ad?: string) {
  return (ad?.[0] ?? 'K').toUpperCase();
}

/**
 * Her sekmenin üstündeki şerit: sayfa adı, tema anahtarı ve profil.
 * Web'deki üst çubuk + yan menü altındaki kullanıcı bloğunun birleşimi.
 */
export function UstBar({ baslik, altBaslik }: { baslik: string; altBaslik?: string }) {
  const { renk, koyuMu, temaDegistir } = useTema();
  const { kullanici, cikisYap } = useKimlik();
  const { ozet } = useSeri();
  const router = useRouter();
  const kenar = useSafeAreaInsets();

  const [profilAcik, setProfilAcik] = useState(false);
  const [geriBildirimAcik, setGeriBildirimAcik] = useState(false);

  return (
    <>
      <View
        style={{
          paddingTop: kenar.top + Bosluk.sm,
          paddingHorizontal: Bosluk.lg,
          paddingBottom: Bosluk.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: Bosluk.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Metin tur="etiket" renk={alpha(renk.primary, 0.9)}>
            Readixo
          </Metin>
          <Metin tur="devasa" numberOfLines={1}>
            {baslik}
          </Metin>
          {altBaslik ? (
            <Metin tur="kucuk" ikincil numberOfLines={1}>
              {altBaslik}
            </Metin>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
          {ozet && (
            <SeriAlevi
              mevcutSeri={ozet.mevcutSeri}
              bugunAktif={ozet.bugunAktif}
              seriRiskte={ozet.seriRiskte}
              boyut="kucuk"
              onPress={() => router.push('/seri')}
            />
          )}

          <Pressable
            onPress={temaDegistir}
            hitSlop={8}
            accessibilityLabel={koyuMu ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
            style={{
              width: 40,
              height: 40,
              borderRadius: Yaricap.tam,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: renk.surfaceContainer,
              borderWidth: 1,
              borderColor: renk.outlineVariant,
            }}
          >
            {koyuMu ? <Sun size={18} color="#fbbf24" /> : <Moon size={18} color={renk.primary} />}
          </Pressable>

          <Pressable
            onPress={() => router.push('/profil')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Profil ve ayarlar"
            style={{
              width: 40,
              height: 40,
              borderRadius: Yaricap.tam,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: renk.primary,
            }}
          >
            <Metin tur="altBaslik" renk={renk.onPrimary}>
              {basHarf(kullanici?.username)}
            </Metin>
          </Pressable>
        </View>
      </View>

      {/* Profil sayfası */}
      <Modal
        visible={profilAcik}
        transparent
        animationType="fade"
        onRequestClose={() => setProfilAcik(false)}
      >
        <Pressable
          onPress={() => setProfilAcik(false)}
          accessibilityRole="button"
          accessibilityLabel="Menüyü kapat"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        >
          <Animated.View entering={FadeInDown.duration(220)}>
            <Pressable
              onPress={(olay) => olay.stopPropagation()}
              accessibilityLabel="Menü içeriği"
              style={{
                backgroundColor: renk.surfaceContainerLow,
                borderTopLeftRadius: Yaricap.xl,
                borderTopRightRadius: Yaricap.xl,
                padding: Bosluk.xl,
                paddingBottom: kenar.bottom + Bosluk.xl,
                gap: Bosluk.lg,
                borderTopWidth: 1,
                borderColor: renk.outlineVariant,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.md }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: Yaricap.tam,
                    backgroundColor: renk.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Metin tur="baslik" renk={renk.onPrimary}>
                    {basHarf(kullanici?.username)}
                  </Metin>
                </View>
                <View style={{ flex: 1 }}>
                  <Metin tur="baslik" numberOfLines={1}>
                    {kullanici?.username ?? 'Kullanıcı'}
                  </Metin>
                  <Metin tur="kucuk" ikincil numberOfLines={1}>
                    {kullanici?.email ?? ''}
                  </Metin>
                  <Metin tur="minik" ikincil>
                    {rolEtiketi(kullanici?.role)}
                  </Metin>
                </View>
              </View>

              <Buton
                baslik="Hesap Yönetimi & KVKK"
                tur="ikincil"
                tamGenislik
                ikon={<UserIcon size={16} color={renk.primary} />}
                onPress={() => {
                  setProfilAcik(false);
                  router.push('/hesabim');
                }}
              />

              <Buton
                baslik={koyuMu ? 'Aydınlık Tema' : 'Karanlık Tema'}
                tur="ikincil"
                tamGenislik
                ikon={
                  koyuMu ? <Sun size={16} color="#fbbf24" /> : <Moon size={16} color={renk.primary} />
                }
                onPress={temaDegistir}
              />

              <Buton
                baslik="Geri Bildirim Gönder"
                tur="ikincil"
                tamGenislik
                ikon={<MessageSquare size={16} color={renk.primary} />}
                onPress={() => {
                  setProfilAcik(false);
                  setGeriBildirimAcik(true);
                }}
              />

              <Buton
                baslik="Çıkış Yap"
                tur="tehlike"
                tamGenislik
                ikon={<LogOut size={16} color={renk.error} />}
                onPress={async () => {
                  setProfilAcik(false);
                  await cikisYap();
                }}
              />
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <GeriBildirimSayfasi acik={geriBildirimAcik} kapat={() => setGeriBildirimAcik(false)} />
    </>
  );
}

/** Geri bildirim kutusu — web'deki yüzen balonun mobil karşılığı. */
function GeriBildirimSayfasi({ acik, kapat }: { acik: boolean; kapat: () => void }) {
  const { renk } = useTema();
  const kenar = useSafeAreaInsets();

  const [mesaj, setMesaj] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gonderildi, setGonderildi] = useState(false);
  const [hata, setHata] = useState('');

  const gonder = async () => {
    if (!mesaj.trim()) return;
    setGonderiliyor(true);
    setHata('');
    try {
      await api.submitFeedback(mesaj.trim());
      setGonderildi(true);
      setMesaj('');
      setTimeout(() => {
        setGonderildi(false);
        kapat();
      }, 1600);
    } catch (e) {
      setHata((e as Error).message || 'Geri bildirim gönderilemedi.');
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Modal visible={acik} transparent animationType="slide" onRequestClose={kapat}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Animated.View
          entering={FadeIn.duration(180)}
          style={{
            backgroundColor: renk.surfaceContainerLow,
            borderTopLeftRadius: Yaricap.xl,
            borderTopRightRadius: Yaricap.xl,
            padding: Bosluk.xl,
            paddingBottom: kenar.bottom + Bosluk.xl,
            gap: Bosluk.lg,
            borderTopWidth: 1,
            borderColor: renk.outlineVariant,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <MessageSquare size={18} color={renk.primary} />
              <Metin tur="baslik">Geri Bildirim</Metin>
            </View>
            <Pressable onPress={kapat} hitSlop={10}>
              <X size={20} color={renk.onSurfaceVariant} />
            </Pressable>
          </View>

          {gonderildi ? (
            <View style={{ alignItems: 'center', gap: Bosluk.sm, paddingVertical: Bosluk.xl }}>
              <CheckCircle2 size={40} color={renk.success} />
              <Metin tur="altBaslik">Teşekkürler, iletildi.</Metin>
            </View>
          ) : (
            <>
              <Metin tur="kucuk" ikincil>
                Eksik bulduğun, hatalı çalışan ya da olmasını istediğin bir şey varsa yaz —
                doğrudan bize ulaşır.
              </Metin>

              {hata ? <HataKutusu mesaj={hata} /> : null}

              <TextInput
                value={mesaj}
                onChangeText={setMesaj}
                placeholder="Mesajın..."
                placeholderTextColor={alpha(renk.onSurfaceVariant, 0.6)}
                multiline
                numberOfLines={4}
                style={{
                  minHeight: 110,
                  textAlignVertical: 'top',
                  backgroundColor: renk.surfaceContainer,
                  borderWidth: 1,
                  borderColor: renk.outlineVariant,
                  borderRadius: Yaricap.lg,
                  padding: Bosluk.md,
                  color: renk.onSurface,
                  fontFamily: YaziTipi.govde,
                  fontSize: Olcek.govde,
                  paddingTop: Platform.OS === 'ios' ? Bosluk.md : Bosluk.sm,
                }}
              />

              <Buton
                baslik={gonderiliyor ? 'Gönderiliyor…' : 'Gönder'}
                tamGenislik
                disabled={!mesaj.trim()}
                yukleniyor={gonderiliyor}
                ikon={
                  gonderiliyor ? (
                    <ActivityIndicator size="small" color={renk.onPrimary} />
                  ) : (
                    <Send size={16} color={renk.onPrimary} />
                  )
                }
                onPress={gonder}
              />
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
