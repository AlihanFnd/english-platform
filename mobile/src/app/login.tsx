import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen, GraduationCap, Lock, Mail, User as UserIcon } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
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
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi, golge } from '@/theme/tokens';

export default function GirisEkrani() {
  const palet = useRenk();
  const { girisYap, kayitOl } = useKimlik();

  const [girisModu, setGirisModu] = useState(true);
  const [kullaniciAdi, setKullaniciAdi] = useState('');
  const [eposta, setEposta] = useState(__DEV__ ? 'alihanfndk35@gmail.com' : '');
  const [sifre, setSifre] = useState(__DEV__ ? 'JST097kafaVyoo6a6+nICVwb' : '');
  const [hata, setHata] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);

  useEffect(() => {
    if (__DEV__ && process.env.EXPO_PUBLIC_AUTO_LOGIN === 'true') {
      gonder();
    }
  }, []);

  const gonder = async () => {
    setHata('');
    setGonderiliyor(true);
    try {
      if (girisModu) {
        await girisYap(eposta.trim(), sifre);
      } else {
        await kayitOl(kullaniciAdi.trim(), eposta.trim(), sifre);
      }
      // Başarılıysa yönlendirmeyi useKorumaliYonlendirme yapar.
    } catch (e) {
      setHata((e as Error).message || 'Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setGonderiliyor(false);
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
                Linguza
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
                  <Metin tur="etiket" ikincil>
                    Şifre
                  </Metin>
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

                {/* KURAL-17: rol seçimi KALDIRILDI. Herkes öğrenci olarak
                    kaydolur; öğretmen yetkisini yalnızca bir yönetici verir.
                    Seçilebilir kalsaydı öğretmene bağlı her kontrol (ör.
                    paylaşılan analizi yeniden üretme) göstermelik olurdu. */}
                {!girisModu && (
                  <View style={{ flexDirection: 'row', gap: Bosluk.sm, alignItems: 'flex-start' }}>
                    <GraduationCap size={16} color={palet.onSurfaceVariant} />
                    <Metin tur="kucuk" ikincil style={{ flex: 1 }}>
                      Öğretmen hesabı mı gerekiyor? Önce öğrenci olarak kaydol,
                      sonra yöneticiden hesabını öğretmene yükseltmesini iste.
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
    </LinearGradient>
  );
}
