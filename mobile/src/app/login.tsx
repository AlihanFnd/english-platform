import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { yasalBaglantiAdresi } from '@/lib/yapilandirma';
import { BookOpen, GraduationCap, Lock, Mail, User as UserIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Buton, HataKutusu, Kart, Metin } from '@/components/ui';
import { useKimlik } from '@/context/AuthContext';
import { useRenk } from '@/context/ThemeContext';
import { ApiHatasi, api } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi, golge } from '@/theme/tokens';

export default function GirisEkrani() {
  const palet = useRenk();
  const { girisYap, kayitOl } = useKimlik();

  const [girisModu, setGirisModu] = useState(true);
  const [kullaniciAdi, setKullaniciAdi] = useState('');
  const [eposta, setEposta] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);

  // Şifremi Unuttum State
  const [unuttumModalAcik, setUnuttumModalAcik] = useState(false);
  const [unuttumEposta, setUnuttumEposta] = useState('');
  const [unuttumHata, setUnuttumHata] = useState('');
  const [unuttumMesaj, setUnuttumMesaj] = useState('');
  const [unuttumYukleniyor, setUnuttumYukleniyor] = useState(false);

  const gonder = async () => {
    setHata('');
    setGonderiliyor(true);
    try {
      if (girisModu) {
        await girisYap(eposta.trim(), sifre);
      } else {
        await kayitOl(kullaniciAdi.trim(), eposta.trim(), sifre);
      }
    } catch (e) {
      setHata((e as Error).message || 'Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setGonderiliyor(false);
    }
  };

  const sifremiUnuttumGonder = async () => {
    setUnuttumHata('');
    setUnuttumMesaj('');
    if (!unuttumEposta.trim()) {
      setUnuttumHata('Lütfen e-posta adresinizi girin.');
      return;
    }

    setUnuttumYukleniyor(true);
    try {
      const yanit = await api.forgotPassword(unuttumEposta.trim());
      setUnuttumMesaj(
        yanit.message || 'Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.',
      );
    } catch (e) {
      const err = e as ApiHatasi;
      if (err.durum === 503) {
        setUnuttumHata('Şifre sıfırlama şu an kullanılamıyor. Lütfen daha sonra tekrar deneyin.');
      } else {
        setUnuttumHata(err.message || 'Şifre sıfırlama isteği iletilemedi.');
      }
    } finally {
      setUnuttumYukleniyor(false);
    }
  };

  const baglantiAc = async (urlKey: string, baslik: string) => {
    const url = yasalBaglantiAdresi(urlKey);
    if (url && url.trim()) {
      try {
        await WebBrowser.openBrowserAsync(url.trim());
      } catch {
        Alert.alert('Hata', `${baslik} açılamadı.`);
      }
    } else {
      Alert.alert(
        'Hazırlanıyor',
        `${baslik} henüz web üzerinde yayımlanma aşamasındadır. Yakında erişilebilir olacaktır.`,
      );
    }
  };

  const alanStili = {
    flex: 1,
    color: palet.onSurface,
    fontFamily: YaziTipi.govdeOrta,
    fontSize: Olcek.govde,
    paddingVertical: Platform.OS === 'ios' ? Bosluk.md + 2 : Bosluk.sm,
  } as const;

  const alanKabi = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Bosluk.sm,
    backgroundColor: palet.surfaceContainer,
    borderWidth: 1,
    borderColor: palet.outlineVariant,
    borderRadius: Yaricap.lg,
    paddingHorizontal: Bosluk.md,
  };

  return (
    <LinearGradient
      colors={[palet.background, palet.surfaceDim, alpha(palet.primary, 0.16)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              padding: Bosluk.xl,
              gap: Bosluk.xl,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={FadeInUp.duration(500)} style={{ alignItems: 'center', gap: Bosluk.md }}>
              <View
                style={[
                  {
                    width: 72,
                    height: 72,
                    borderRadius: Yaricap.xl,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: alpha(palet.primary, 0.14),
                    borderWidth: 1,
                    borderColor: alpha(palet.primary, 0.3),
                  },
                  golge(alpha(palet.primary, 0.4), 2),
                ]}
              >
                <BookOpen size={34} color={palet.primary} />
              </View>
              <Metin tur="devasa" ortala>
                Readixo
              </Metin>
              <Metin tur="kucuk" ikincil ortala>
                {girisModu
                  ? 'Okuma ve anlık çeviri dünyasına geri dön.'
                  : 'Kaydol ve hemen okumaya başla.'}
              </Metin>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(500).delay(120)}>
              <Kart dolgu={Bosluk.xl} style={{ gap: Bosluk.lg }}>
                {/* Mod anahtarı */}
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: palet.surfaceContainer,
                    borderRadius: Yaricap.lg,
                    padding: 4,
                    borderWidth: 1,
                    borderColor: palet.outlineVariant,
                  }}
                >
                  {[
                    { id: true, ad: 'Giriş Yap' },
                    { id: false, ad: 'Kayıt Ol' },
                  ].map((secenek) => {
                    const etkin = girisModu === secenek.id;
                    return (
                      <Pressable
                        key={String(secenek.id)}
                        onPress={() => {
                          setGirisModu(secenek.id);
                          setHata('');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${secenek.ad} sekmesini seç`}
                        style={{
                          flex: 1,
                          paddingVertical: Bosluk.sm + 2,
                          borderRadius: Yaricap.md,
                          alignItems: 'center',
                          backgroundColor: etkin ? palet.primary : 'transparent',
                        }}
                      >
                        <Metin
                          tur="kucuk"
                          kalin
                          renk={etkin ? palet.onPrimary : palet.onSurfaceVariant}
                        >
                          {secenek.ad}
                        </Metin>
                      </Pressable>
                    );
                  })}
                </View>

                {hata ? <HataKutusu mesaj={hata} /> : null}

                {!girisModu && (
                  <View style={{ gap: Bosluk.xs }}>
                    <Metin tur="etiket" ikincil>
                      Kullanıcı Adı
                    </Metin>
                    <View style={alanKabi}>
                      <UserIcon size={18} color={palet.onSurfaceVariant} />
                      <TextInput
                        value={kullaniciAdi}
                        onChangeText={setKullaniciAdi}
                        placeholder="kullaniciadi"
                        placeholderTextColor={alpha(palet.onSurfaceVariant, 0.6)}
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={alanStili}
                      />
                    </View>
                  </View>
                )}

                <View style={{ gap: Bosluk.xs }}>
                  <Metin tur="etiket" ikincil>
                    E-posta Adresi
                  </Metin>
                  <View style={alanKabi}>
                    <Mail size={18} color={palet.onSurfaceVariant} />
                    <TextInput
                      value={eposta}
                      onChangeText={setEposta}
                      placeholder="isim@ornek.com"
                      placeholderTextColor={alpha(palet.onSurfaceVariant, 0.6)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      style={alanStili}
                    />
                  </View>
                </View>

                <View style={{ gap: Bosluk.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Metin tur="etiket" ikincil>
                      Şifre
                    </Metin>
                    {girisModu && (
                      <Pressable
                        onPress={() => {
                          setUnuttumEposta(eposta);
                          setUnuttumHata('');
                          setUnuttumMesaj('');
                          setUnuttumModalAcik(true);
                        }}
                        hitSlop={6}
                      >
                        <Metin tur="minik" renk={palet.primary}>
                          Şifremi unuttum
                        </Metin>
                      </Pressable>
                    )}
                  </View>
                  <View style={alanKabi}>
                    <Lock size={18} color={palet.onSurfaceVariant} />
                    <TextInput
                      value={sifre}
                      onChangeText={setSifre}
                      placeholder="••••••••"
                      placeholderTextColor={alpha(palet.onSurfaceVariant, 0.6)}
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType={girisModu ? 'password' : 'newPassword'}
                      style={alanStili}
                      onSubmitEditing={gonder}
                      returnKeyType="go"
                    />
                  </View>
                </View>

                {/* YH-08: Kayıt ekranı hukuki onay metni */}
                {!girisModu && (
                  <View style={{ gap: Bosluk.sm }}>
                    <View style={{ flexDirection: 'row', gap: Bosluk.sm, alignItems: 'flex-start' }}>
                      <GraduationCap size={16} color={palet.onSurfaceVariant} />
                      <Metin tur="minik" ikincil style={{ flex: 1 }}>
                        Öğretmen hesabı mı gerekiyor? Önce öğrenci olarak kaydol,
                        sonra yöneticiden hesabını öğretmene yükseltmesini iste.
                      </Metin>
                    </View>

                    <Metin tur="minik" ikincil ortala style={{ lineHeight: 18 }}>
                      Kaydolarak{' '}
                      <Metin
                        tur="minik"
                        kalin
                        renk={palet.primary}
                        onPress={() => baglantiAc('EXPO_PUBLIC_KOSULLAR_URL', 'Kullanım Koşulları')}
                      >
                        Kullanım Koşulları
                      </Metin>
                      &rsquo;nı ve{' '}
                      <Metin
                        tur="minik"
                        kalin
                        renk={palet.primary}
                        onPress={() => baglantiAc('EXPO_PUBLIC_GIZLILIK_URL', 'Gizlilik Politikası')}
                      >
                        Gizlilik Politikası
                      </Metin>
                      &rsquo;nı kabul etmiş olursun.
                    </Metin>
                  </View>
                )}

                <Buton
                  baslik={girisModu ? 'Giriş Yap' : 'Kayıt Ol'}
                  onPress={gonder}
                  yukleniyor={gonderiliyor}
                  disabled={!eposta.trim() || !sifre || (!girisModu && !kullaniciAdi.trim())}
                  tamGenislik
                />

                <Pressable
                  onPress={() => {
                    setGirisModu(!girisModu);
                    setHata('');
                  }}
                  style={{ alignSelf: 'center' }}
                >
                  <Metin tur="kucuk" renk={palet.primary}>
                    {girisModu ? 'Hesabın yok mu? Kaydol' : 'Zaten hesabın var mı? Giriş yap'}
                  </Metin>
                </Pressable>
              </Kart>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Şifremi Unuttum Modalı */}
      <Modal
        visible={unuttumModalAcik}
        animationType="slide"
        transparent
        onRequestClose={() => setUnuttumModalAcik(false)}
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
              <Metin tur="altBaslik">Şifremi Unuttum</Metin>
              <Pressable onPress={() => setUnuttumModalAcik(false)}>
                <Metin tur="kucuk" renk={palet.primary}>
                  Kapat
                </Metin>
              </Pressable>
            </View>

            <Metin tur="kucuk" ikincil>
              Hesabınıza bağlı e-posta adresinizi girin. Şifre sıfırlama bağlantısını e-postanıza göndereceğiz.
            </Metin>

            {unuttumHata ? <HataKutusu mesaj={unuttumHata} /> : null}

            {unuttumMesaj ? (
              <View style={{ padding: Bosluk.md, borderRadius: Yaricap.md, backgroundColor: alpha(palet.primary, 0.1) }}>
                <Metin tur="kucuk" kalin renk={palet.primary}>
                  {unuttumMesaj}
                </Metin>
              </View>
            ) : null}

            <View style={{ gap: Bosluk.xs }}>
              <Metin tur="etiket" ikincil>
                E-posta Adresi
              </Metin>
              <View style={alanKabi}>
                <Mail size={18} color={palet.onSurfaceVariant} />
                <TextInput
                  value={unuttumEposta}
                  onChangeText={setUnuttumEposta}
                  placeholder="isim@ornek.com"
                  placeholderTextColor={alpha(palet.onSurfaceVariant, 0.6)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={alanStili}
                />
              </View>
            </View>

            <Buton
              baslik="Sıfırlama Bağlantısı Gönder"
              tur="birincil"
              tamGenislik
              onPress={sifremiUnuttumGonder}
              yukleniyor={unuttumYukleniyor}
              disabled={!unuttumEposta.trim() || unuttumYukleniyor}
            />
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}
