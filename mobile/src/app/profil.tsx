import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { yasalBaglantiAdresi } from '@/lib/yapilandirma';
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Flame,
  Globe,
  Info,
  LogOut,
  MessageSquare,
  Moon,
  Send,
  ShieldCheck,
  Sun,
  Type,
  User as UserIcon,
  X,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { UstBar } from '@/components/UstBar';
import { OkuyucuAyarlariModal } from '@/components/okuyucu/OkuyucuAyarlari';
import { Buton, EkranZemini, HataKutusu, Kart, Metin, Rozet } from '@/components/ui';
import { useKimlik } from '@/context/AuthContext';
import { useSeri } from '@/context/SeriContext';
import { useRenk, useTema } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import {
  HatirlatmaAyari,
  getHatirlatmaAyarlari,
  saveHatirlatmaAyarlari,
  syncHatirlatmalar,
} from '@/lib/hatirlatmalar';
import {
  OkuyucuAyarlari,
  VARSAYILAN_OKUYUCU_AYARLARI,
  okuyucuAyarlariniKaydet,
  okuyucuAyarlariniOku,
} from '@/lib/okuyucuAyarlari';
import { rolEtiketi } from '@/lib/rol';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

function basHarf(ad?: string) {
  return (ad?.[0] ?? 'K').toUpperCase();
}

export default function ProfilEkrani() {
  const palet = useRenk();
  const router = useRouter();
  const { kullanici, cikisYap } = useKimlik();
  const { ozet } = useSeri();
  const { seciliMod, temaAyarla } = useTema();

  // Modallar
  const [hatirlatmaModalAcik, setHatirlatmaModalAcik] = useState(false);
  const [hatirlatmaAyari, setHatirlatmaAyari] = useState<HatirlatmaAyari>({
    acik: true,
    saat: '20:00',
  });

  const [okuyucuModalAcik, setOkuyucuModalAcik] = useState(false);
  const [okuyucuAyarlari, setOkuyucuAyarlari] = useState<OkuyucuAyarlari>(VARSAYILAN_OKUYUCU_AYARLARI);

  const [geriBildirimAcik, setGeriBildirimAcik] = useState(false);

  // Hatırlatma ve okuyucu ayarlarını yükle
  useEffect(() => {
    getHatirlatmaAyarlari().then(setHatirlatmaAyari);
    okuyucuAyarlariniOku().then(setOkuyucuAyarlari);
  }, []);

  const hatirlatmaKaydet = async (yeni: HatirlatmaAyari) => {
    setHatirlatmaAyari(yeni);
    await saveHatirlatmaAyarlari(yeni);
    await syncHatirlatmalar(ozet);
  };

  const okuyucuAyariGuncelle = async (yeni: Partial<OkuyucuAyarlari>) => {
    const guncel = { ...okuyucuAyarlari, ...yeni };
    setOkuyucuAyarlari(guncel);
    await okuyucuAyarlariniKaydet(guncel);
  };

  const baglantiAc = async (urlKey: string, baslik: string) => {
    const url = yasalBaglantiAdresi(urlKey);
    if (url && url.trim()) {
      try {
        await WebBrowser.openBrowserAsync(url.trim());
      } catch {
        Alert.alert('Hata', `${baslik} sayfası açılamadı.`);
      }
    } else {
      Alert.alert(
        'Hazırlanıyor',
        `${baslik} henüz web üzerinde yayımlanma aşamasındadır. Yakında erişilebilir olacaktır.`,
      );
    }
  };

  return (
    <EkranZemini>
      <UstBar baslik="Profil ve Ayarlar" altBaslik="Hesap tercihlerinizi ve görünümünüzü özelleştirin" />

      <ScrollView
        contentContainerStyle={{
          padding: Bosluk.lg,
          gap: Bosluk.lg,
          paddingBottom: Bosluk.xxl * 2,
        }}
      >
        {/* Kullanıcı Kartı */}
        <Kart style={{ gap: Bosluk.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.md }}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: Yaricap.tam,
                backgroundColor: palet.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Metin tur="baslik" renk={palet.onPrimary}>
                {basHarf(kullanici?.username)}
              </Metin>
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <Metin tur="baslik" kalin numberOfLines={1}>
                {kullanici?.username ?? 'Kullanıcı'}
              </Metin>
              <Metin tur="kucuk" ikincil numberOfLines={1}>
                {kullanici?.email ?? ''}
              </Metin>
            </View>

            <Rozet metin={rolEtiketi(kullanici?.role)} />
          </View>
        </Kart>

        {/* ── 1. ÖĞRENME VE OKUMA TERCİHLERİ ── */}
        <Kart style={{ gap: Bosluk.xs, padding: 0 }}>
          <View
            style={{
              paddingHorizontal: Bosluk.md,
              paddingTop: Bosluk.md,
              paddingBottom: Bosluk.xs,
            }}
          >
            <Metin tur="etiket" ikincil>
              Öğrenme & Okuma
            </Metin>
          </View>

          {/* Günlük Hedef */}
          <Pressable
            onPress={() => router.push('/seri')}
            accessibilityRole="button"
            accessibilityLabel="Günlük hedef ayarları"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: Bosluk.md,
                backgroundColor: pressed ? palet.surfaceContainerHighest : 'transparent',
                borderBottomWidth: 1,
                borderBottomColor: palet.outlineVariant,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <Flame size={20} color="#f97316" />
              <View>
                <Metin tur="govde" kalin>
                  Günlük Hedef
                </Metin>
                <Metin tur="minik" ikincil>
                  {ozet?.bugun ? `${ozet.bugun.hedefXp} XP / Gün` : '20 XP / Gün'}
                </Metin>
              </View>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>

          {/* Hatırlatmalar */}
          <Pressable
            onPress={() => setHatirlatmaModalAcik(true)}
            accessibilityRole="button"
            accessibilityLabel="Hatırlatma bildirim ayarları"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: Bosluk.md,
                backgroundColor: pressed ? palet.surfaceContainerHighest : 'transparent',
                borderBottomWidth: 1,
                borderBottomColor: palet.outlineVariant,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <Bell size={20} color={palet.primary} />
              <View>
                <Metin tur="govde" kalin>
                  Hatırlatma Bildirimleri
                </Metin>
                <Metin tur="minik" ikincil>
                  {hatirlatmaAyari.acik ? `Açık · Saat ${hatirlatmaAyari.saat}` : 'Kapalı'}
                </Metin>
              </View>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>

          {/* Okuyucu Ayarları */}
          <Pressable
            onPress={() => setOkuyucuModalAcik(true)}
            accessibilityRole="button"
            accessibilityLabel="Okuyucu ayarları"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: Bosluk.md,
                backgroundColor: pressed ? palet.surfaceContainerHighest : 'transparent',
                borderBottomWidth: 1,
                borderBottomColor: palet.outlineVariant,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <Type size={20} color={palet.primary} />
              <View>
                <Metin tur="govde" kalin>
                  Okuyucu Ayarları
                </Metin>
                <Metin tur="minik" ikincil>
                  Yazı boyutu, renkli kelimeler ve tür vurgusu
                </Metin>
              </View>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>

          {/* Görünüm (Sistem / Açık / Koyu) */}
          <View style={{ padding: Bosluk.md, gap: Bosluk.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <Sun size={20} color={palet.primary} />
              <Metin tur="govde" kalin>
                Görünüm Teması
              </Metin>
            </View>

            <View
              style={{
                flexDirection: 'row',
                backgroundColor: palet.surfaceContainerLow,
                borderRadius: Yaricap.md,
                padding: 3,
                borderWidth: 1,
                borderColor: palet.outlineVariant,
              }}
            >
              {[
                { id: 'system', ad: 'Sistem', ikon: Globe },
                { id: 'light', ad: 'Açık', ikon: Sun },
                { id: 'dark', ad: 'Koyu', ikon: Moon },
              ].map((mod) => {
                const etkin = seciliMod === mod.id;
                const IkonBileseni = mod.ikon;
                return (
                  <Pressable
                    key={mod.id}
                    onPress={() => {
                      temaAyarla(mod.id as 'system' | 'light' | 'dark');
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${mod.ad} temayı seç`}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      paddingVertical: Bosluk.sm,
                      borderRadius: Yaricap.sm,
                      backgroundColor: etkin ? palet.primary : 'transparent',
                    }}
                  >
                    <IkonBileseni size={14} color={etkin ? palet.onPrimary : palet.onSurfaceVariant} />
                    <Metin
                      tur="minik"
                      kalin
                      renk={etkin ? palet.onPrimary : palet.onSurfaceVariant}
                    >
                      {mod.ad}
                    </Metin>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Kart>

        {/* ── 2. HESAP VE YASAL BİLGİLER ── */}
        <Kart style={{ gap: Bosluk.xs, padding: 0 }}>
          <View
            style={{
              paddingHorizontal: Bosluk.md,
              paddingTop: Bosluk.md,
              paddingBottom: Bosluk.xs,
            }}
          >
            <Metin tur="etiket" ikincil>
              Hesap & Destek
            </Metin>
          </View>

          {/* Hesabım */}
          <Pressable
            onPress={() => router.push('/hesabim')}
            accessibilityRole="button"
            accessibilityLabel="Hesabım ve şifre yönetimi"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: Bosluk.md,
                backgroundColor: pressed ? palet.surfaceContainerHighest : 'transparent',
                borderBottomWidth: 1,
                borderBottomColor: palet.outlineVariant,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <UserIcon size={20} color={palet.primary} />
              <View>
                <Metin tur="govde" kalin>
                  Hesabım & KVKK
                </Metin>
                <Metin tur="minik" ikincil>
                  Şifre değiştir, verileri indir ve hesap silme
                </Metin>
              </View>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>

          {/* Gizlilik ve Koşullar */}
          <Pressable
            onPress={() => baglantiAc('EXPO_PUBLIC_GIZLILIK_URL', 'Gizlilik Politikası')}
            accessibilityRole="button"
            accessibilityLabel="Gizlilik Politikası"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: Bosluk.md,
                backgroundColor: pressed ? palet.surfaceContainerHighest : 'transparent',
                borderBottomWidth: 1,
                borderBottomColor: palet.outlineVariant,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <ShieldCheck size={20} color={palet.primary} />
              <Metin tur="govde" kalin>
                Gizlilik Politikası ve Koşullar
              </Metin>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>

          {/* Geri bildirim */}
          <Pressable
            onPress={() => setGeriBildirimAcik(true)}
            accessibilityRole="button"
            accessibilityLabel="Geri bildirim gönder"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: Bosluk.md,
                backgroundColor: pressed ? palet.surfaceContainerHighest : 'transparent',
                borderBottomWidth: 1,
                borderBottomColor: palet.outlineVariant,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <MessageSquare size={20} color={palet.primary} />
              <Metin tur="govde" kalin>
                Geri Bildirim Gönder
              </Metin>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>

          {/* Hakkında */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: Bosluk.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <Info size={20} color={palet.onSurfaceVariant} />
              <Metin tur="govde" kalin>
                Uygulama Sürümü
              </Metin>
            </View>
            <Metin tur="kucuk" ikincil>
              1.0.0 (12)
            </Metin>
          </View>
        </Kart>

        {/* Oturumu Kapat */}
        <Kart style={{ padding: 0 }}>
          <Pressable
            onPress={async () => {
              await cikisYap();
              Haptics.selectionAsync().catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel="Oturumu kapat"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: Bosluk.sm,
                padding: Bosluk.md,
                backgroundColor: pressed ? alpha(palet.error, 0.08) : 'transparent',
                borderRadius: Yaricap.xl,
              },
            ]}
          >
            <LogOut size={20} color={palet.error} />
            <Metin tur="govde" kalin renk={palet.error}>
              Oturumu Kapat
            </Metin>
          </Pressable>
        </Kart>
      </ScrollView>

      {/* MODAL 1: Hatırlatıcı Bildirim Ayarları */}
      <Modal
        visible={hatirlatmaModalAcik}
        animationType="slide"
        transparent
        onRequestClose={() => setHatirlatmaModalAcik(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: palet.surface,
              borderTopLeftRadius: Yaricap.xl,
              borderTopRightRadius: Yaricap.xl,
              padding: Bosluk.lg,
              gap: Bosluk.md,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Metin tur="altBaslik">Hatırlatma Ayarları</Metin>
              <Pressable
                onPress={() => setHatirlatmaModalAcik(false)}
                accessibilityRole="button"
                accessibilityLabel="Kapat"
              >
                <Metin tur="kucuk" renk={palet.primary}>
                  Bitti
                </Metin>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Metin tur="govde" kalin>
                Günlük Bildirimler
              </Metin>
              <Switch
                value={hatirlatmaAyari.acik}
                onValueChange={(acik) => hatirlatmaKaydet({ ...hatirlatmaAyari, acik })}
              />
            </View>

            {hatirlatmaAyari.acik && (
              <View style={{ gap: Bosluk.sm }}>
                <Metin tur="minik" ikincil>
                  Hatırlatma Saati:
                </Metin>
                <View style={{ flexDirection: 'row', gap: Bosluk.sm, flexWrap: 'wrap' }}>
                  {['18:00', '20:00', '21:00', '22:00'].map((s) => {
                    const secili = hatirlatmaAyari.saat === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => hatirlatmaKaydet({ ...hatirlatmaAyari, saat: s })}
                        accessibilityRole="button"
                        accessibilityLabel={`Hatırlatma saatini ${s} yap`}
                        style={{
                          paddingHorizontal: Bosluk.md,
                          paddingVertical: Bosluk.sm,
                          borderRadius: Yaricap.md,
                          backgroundColor: secili ? palet.primary : palet.surfaceContainerHighest,
                        }}
                      >
                        <Metin
                          tur="kucuk"
                          kalin
                          renk={secili ? palet.onPrimary : palet.onSurface}
                        >
                          {s}
                        </Metin>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Okuyucu Ayarları Modalı */}
      <OkuyucuAyarlariModal
        acik={okuyucuModalAcik}
        ayarlar={okuyucuAyarlari}
        onGuncelle={okuyucuAyariGuncelle}
        onKapat={() => setOkuyucuModalAcik(false)}
      />

      {/* MODAL 3: Geri Bildirim Modalı */}
      <ProfilGeriBildirimModal acik={geriBildirimAcik} kapat={() => setGeriBildirimAcik(false)} />
    </EkranZemini>
  );
}

function ProfilGeriBildirimModal({ acik, kapat }: { acik: boolean; kapat: () => void }) {
  const palet = useRenk();
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
      }, 1500);
    } catch (e) {
      setHata((e as Error).message || 'Geri bildirim gönderilemedi.');
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Modal visible={acik} transparent animationType="slide" onRequestClose={kapat}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: palet.surface,
            borderTopLeftRadius: Yaricap.xl,
            borderTopRightRadius: Yaricap.xl,
            padding: Bosluk.lg,
            gap: Bosluk.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <MessageSquare size={18} color={palet.primary} />
              <Metin tur="altBaslik">Geri Bildirim</Metin>
            </View>
            <Pressable onPress={kapat} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
              <X size={20} color={palet.onSurfaceVariant} />
            </Pressable>
          </View>

          {gonderildi ? (
            <View style={{ alignItems: 'center', gap: Bosluk.sm, paddingVertical: Bosluk.xl }}>
              <CheckCircle2 size={40} color={palet.success} />
              <Metin tur="altBaslik">Geri bildiriminiz alındı, teşekkürler!</Metin>
            </View>
          ) : (
            <>
              {hata ? <HataKutusu mesaj={hata} /> : null}
              <TextInput
                value={mesaj}
                onChangeText={setMesaj}
                placeholder="Görüş ve önerilerinizi buraya yazın..."
                placeholderTextColor={palet.onSurfaceVariant}
                multiline
                numberOfLines={4}
                style={{
                  minHeight: 110,
                  textAlignVertical: 'top',
                  backgroundColor: palet.surfaceContainerHighest,
                  borderRadius: Yaricap.md,
                  padding: Bosluk.md,
                  color: palet.onSurface,
                  fontFamily: YaziTipi.govde,
                  fontSize: Olcek.kucuk,
                }}
              />
              <Buton
                baslik="Gönder"
                tamGenislik
                disabled={!mesaj.trim() || gonderiliyor}
                yukleniyor={gonderiliyor}
                onPress={gonder}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
