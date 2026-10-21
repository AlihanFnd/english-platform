import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { yasalBaglantiAdresi } from '@/lib/yapilandirma';
import {
  AlertTriangle,
  ChevronRight,
  Database,
  Download,
  FileText,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { UstBar } from '@/components/UstBar';
import { BosDurum, Buton, EkranZemini, HataKutusu, Kart, Metin, Rozet } from '@/components/ui';
import { useKimlik } from '@/context/AuthContext';
import { useRenk } from '@/context/ThemeContext';
import { ApiHatasi, EnvanterKalemi, api } from '@/lib/api';
import { tumYerelVerileriTemizle } from '@/lib/yerelTemizlik';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

function rolEtiketi(role?: string): string {
  switch (role) {
    case 'admin':
      return 'Yönetici';
    case 'teacher':
      return 'Öğretmen';
    default:
      return 'Öğrenci';
  }
}

export default function HesabimEkrani() {
  const palet = useRenk();
  const router = useRouter();
  const { kullanici, cikisYap } = useKimlik();

  // Şifre Değiştirme State
  const [sifreModalAcik, setSifreModalAcik] = useState(false);
  const [mevcutSifre, setMevcutSifre] = useState('');
  const [yeniSifre, setYeniSifre] = useState('');
  const [yeniSifreTekrar, setYeniSifreTekrar] = useState('');
  const [sifreHata, setSifreHata] = useState('');
  const [sifreYukleniyor, setSifreYukleniyor] = useState(false);

  // Verilerimi İndir State
  const [indirmeYukleniyor, setIndirmeYukleniyor] = useState(false);

  // Veri Envanteri State
  const [envanterModalAcik, setEnvanterModalAcik] = useState(false);
  const [envanter, setEnvanter] = useState<EnvanterKalemi[]>([]);
  const [envanterYukleniyor, setEnvanterYukleniyor] = useState(false);

  // Hesap Silme Flow State (Adım 1: Uyarı + Tablo, Adım 2: Şifre Onayı)
  const [silmeModalAcik, setSilmeModalAcik] = useState(false);
  const [silmeAdim, setSilmeAdim] = useState<1 | 2>(1);
  const [silmeSifre, setSilmeSifre] = useState('');
  const [silmeHata, setSilmeHata] = useState('');
  const [silmeGrupHatasi, setSilmeGrupHatasi] = useState<Array<{ id: number; name: string }> | null>(null);
  const [silmeYukleniyor, setSilmeYukleniyor] = useState(false);

  // Envanter Yükle
  const envanteriYukle = async () => {
    setEnvanterYukleniyor(true);
    try {
      const veri = await api.veriEnvanteri();
      setEnvanter(veri.kalemler);
    } catch {
      /* Hata oluşursa boş listede kalınır */
    } finally {
      setEnvanterYukleniyor(false);
    }
  };

  useEffect(() => {
    envanteriYukle();
  }, []);

  // 1. Şifre Değiştirme İşlemi
  const sifreDegistir = async () => {
    setSifreHata('');
    if (!mevcutSifre) {
      setSifreHata('Lütfen mevcut şifrenizi girin.');
      return;
    }
    if (!yeniSifre) {
      setSifreHata('Lütfen yeni şifrenizi girin.');
      return;
    }
    if (yeniSifre !== yeniSifreTekrar) {
      setSifreHata('Yeni şifreler eşleşmiyor.');
      return;
    }

    setSifreYukleniyor(true);
    try {
      const yanit = await api.changePassword(mevcutSifre, yeniSifre);
      setSifreModalAcik(false);
      setMevcutSifre('');
      setYeniSifre('');
      setYeniSifreTekrar('');
      await tumYerelVerileriTemizle();
      Alert.alert(
        'Şifre Değiştirildi',
        yanit.message || 'Bütün cihazlarda oturumun kapandı. Lütfen yeni şifrenizle giriş yapın.',
        [
          {
            text: 'Giriş Yap',
            onPress: () => router.replace('/login'),
          },
        ],
      );
    } catch (e) {
      setSifreHata((e as Error).message || 'Şifre değiştirilemedi.');
    } finally {
      setSifreYukleniyor(false);
    }
  };

  // 2. Verilerimi İndir İşlemi
  const verileriIndir = async () => {
    setIndirmeYukleniyor(true);
    let geciciDosyaYolu: string | null = null;
    try {
      const veri = await api.verimiDisaAktar();
      const tarihStr = new Date().toISOString().split('T')[0];
      geciciDosyaYolu = `${FileSystem.cacheDirectory}linguza-verilerim-${tarihStr}.json`;

      await FileSystem.writeAsStringAsync(geciciDosyaYolu, JSON.stringify(veri, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(geciciDosyaYolu, {
          mimeType: 'application/json',
          dialogTitle: 'Verilerimi İndir / Paylaş',
          UTI: 'public.json',
        });
      } else {
        Alert.alert('Bilgi', 'Bu cihazda paylaşım özelliği desteklenmiyor.');
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Veriler indirilemedi.');
    } finally {
      // GEÇİCİ DOSYA SİLİNİR (web'deki "sunucuda kopya kalmaz" ilkesinin cihazdaki karşılığı)
      if (geciciDosyaYolu) {
        try {
          await FileSystem.deleteAsync(geciciDosyaYolu, { idempotent: true });
        } catch {
          /* Zaten yoksa sorun değil */
        }
      }
      setIndirmeYukleniyor(false);
    }
  };

  // 3. Gizlilik Politikası / Kullanım Koşulları Açma
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

  // 4. Hesap Silme İşlemi
  const hesabimiSil = async () => {
    setSilmeHata('');
    setSilmeGrupHatasi(null);
    if (!silmeSifre) {
      setSilmeHata('Lütfen şifrenizi girin.');
      return;
    }

    setSilmeYukleniyor(true);
    try {
      await api.hesabimiSil(silmeSifre);
      setSilmeModalAcik(false);
      await tumYerelVerileriTemizle();
      Alert.alert('Hesap Silindi', 'Hesabınız ve tüm kişisel verileriniz başarıyla silindi.', [
        {
          text: 'Tamam',
          onPress: () => router.replace('/login'),
        },
      ]);
    } catch (e) {
      const err = e as ApiHatasi;
      if (err.durum === 401) {
        setSilmeHata('Şifre hatalı.');
      } else if (err.durum === 429) {
        setSilmeHata('Çok fazla deneme yaptınız. Lütfen biraz bekleyin.');
      } else {
        setSilmeHata(err.message || 'Hesap silinemedi.');
      }
    } finally {
      setSilmeYukleniyor(false);
    }
  };

  return (
    <EkranZemini>
      <UstBar baslik="Hesabım" altBaslik="Hesap ayarları, kişisel veriler ve güvenlik" />

      <ScrollView
        contentContainerStyle={{
          padding: Bosluk.lg,
          gap: Bosluk.lg,
          paddingBottom: Bosluk.xxl * 2,
        }}
      >
        {/* Kullanıcı Profili Özet Kartı */}
        <Kart style={{ gap: Bosluk.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.md }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: Yaricap.tam,
                backgroundColor: alpha(palet.primary, 0.12),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserIcon size={24} color={palet.primary} />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <Metin tur="baslik" kalin>
                {kullanici?.username ?? 'Kullanıcı'}
              </Metin>
              <Metin tur="kucuk" ikincil numberOfLines={1}>
                {kullanici?.email ?? ''}
              </Metin>
            </View>

            <Rozet metin={rolEtiketi(kullanici?.role)} />
          </View>
        </Kart>

        {/* Hesap ve Güvenlik */}
        <Kart style={{ gap: Bosluk.xs, padding: 0 }}>
          <View
            style={{
              paddingHorizontal: Bosluk.md,
              paddingTop: Bosluk.md,
              paddingBottom: Bosluk.xs,
            }}
          >
            <Metin tur="etiket" ikincil>
              Güvenlik & Şifre
            </Metin>
          </View>

          <Pressable
            onPress={() => {
              setSifreHata('');
              setMevcutSifre('');
              setYeniSifre('');
              setYeniSifreTekrar('');
              setSifreModalAcik(true);
            }}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: Bosluk.md,
                backgroundColor: pressed ? palet.surfaceContainerHighest : 'transparent',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <KeyRound size={20} color={palet.primary} />
              <Metin tur="govde" kalin>
                Şifreyi Değiştir
              </Metin>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>
        </Kart>

        {/* KVKK ve Kişisel Veriler */}
        <Kart style={{ gap: Bosluk.xs, padding: 0 }}>
          <View
            style={{
              paddingHorizontal: Bosluk.md,
              paddingTop: Bosluk.md,
              paddingBottom: Bosluk.xs,
            }}
          >
            <Metin tur="etiket" ikincil>
              Kişisel Verilerim & Gizlilik
            </Metin>
          </View>

          {/* Verilerimi İndir */}
          <Pressable
            onPress={verileriIndir}
            disabled={indirmeYukleniyor}
            accessibilityRole="button"
            accessibilityLabel="Verilerimi indir"
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
              {indirmeYukleniyor ? (
                <ActivityIndicator size="small" color={palet.primary} />
              ) : (
                <Download size={20} color={palet.primary} />
              )}
              <View>
                <Metin tur="govde" kalin>
                  Verilerimi İndir
                </Metin>
                <Metin tur="minik" ikincil>
                  JSON formatında cihazınıza indirin veya paylaşın
                </Metin>
              </View>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>

          {/* Hangi Verilerim Tutuluyor (Envanter) */}
          <Pressable
            onPress={() => setEnvanterModalAcik(true)}
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
              <Database size={20} color={palet.primary} />
              <View>
                <Metin tur="govde" kalin>
                  Hangi Verilerim Tutuluyor?
                </Metin>
                <Metin tur="minik" ikincil>
                  Kişisel veri envanteri ve saklama süreleri
                </Metin>
              </View>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>

          {/* Gizlilik Politikası */}
          <Pressable
            onPress={() => baglantiAc('EXPO_PUBLIC_GIZLILIK_URL', 'Gizlilik Politikası')}
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
                Gizlilik Politikası
              </Metin>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>

          {/* Kullanım Koşulları */}
          <Pressable
            onPress={() => baglantiAc('EXPO_PUBLIC_KOSULLAR_URL', 'Kullanım Koşulları')}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: Bosluk.md,
                backgroundColor: pressed ? palet.surfaceContainerHighest : 'transparent',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <FileText size={20} color={palet.primary} />
              <Metin tur="govde" kalin>
                Kullanım Koşulları
              </Metin>
            </View>
            <ChevronRight size={18} color={palet.onSurfaceVariant} />
          </Pressable>
        </Kart>

        {/* Oturumu Kapat & Hesabı Sil */}
        <Kart style={{ gap: Bosluk.xs, padding: 0 }}>
          <Pressable
            onPress={async () => {
              await cikisYap();
              Haptics.selectionAsync().catch(() => {});
            }}
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
              <LogOut size={20} color={palet.onSurface} />
              <Metin tur="govde" kalin>
                Oturumu Kapat
              </Metin>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              setSilmeAdim(1);
              setSilmeSifre('');
              setSilmeHata('');
              setSilmeGrupHatasi(null);
              setSilmeModalAcik(true);
            }}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: Bosluk.md,
                backgroundColor: pressed ? alpha(palet.error, 0.08) : 'transparent',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <Trash2 size={20} color={palet.error} />
              <Metin tur="govde" kalin renk={palet.error}>
                Hesabımı Sil
              </Metin>
            </View>
            <ChevronRight size={18} color={palet.error} />
          </Pressable>
        </Kart>
      </ScrollView>

      {/* MODAL 1: Şifre Değiştirme */}
      <Modal
        visible={sifreModalAcik}
        animationType="slide"
        transparent
        onRequestClose={() => setSifreModalAcik(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: palet.surface,
              borderTopLeftRadius: Yaricap.xl,
              borderTopRightRadius: Yaricap.xl,
              padding: Bosluk.lg,
              gap: Bosluk.md,
              maxHeight: '80%',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Metin tur="altBaslik">Şifreyi Değiştir</Metin>
              <Pressable onPress={() => setSifreModalAcik(false)}>
                <Metin tur="kucuk" renk={palet.primary}>
                  Kapat
                </Metin>
              </Pressable>
            </View>

            {sifreHata ? <HataKutusu mesaj={sifreHata} /> : null}

            <View style={{ gap: Bosluk.sm }}>
              <Metin tur="minik" ikincil>
                Mevcut Şifre:
              </Metin>
              <TextInput
                value={mevcutSifre}
                onChangeText={setMevcutSifre}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                placeholder="Mevcut şifreniz"
                placeholderTextColor={palet.onSurfaceVariant}
                style={{
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor: palet.surfaceContainerHighest,
                  color: palet.onSurface,
                  fontFamily: YaziTipi.govde,
                  fontSize: Olcek.kucuk,
                  borderWidth: 1,
                  borderColor: palet.outlineVariant,
                }}
              />
            </View>

            <View style={{ gap: Bosluk.sm }}>
              <Metin tur="minik" ikincil>
                Yeni Şifre:
              </Metin>
              <TextInput
                value={yeniSifre}
                onChangeText={setYeniSifre}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Yeni şifreniz (en az 6 karakter)"
                placeholderTextColor={palet.onSurfaceVariant}
                style={{
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor: palet.surfaceContainerHighest,
                  color: palet.onSurface,
                  fontFamily: YaziTipi.govde,
                  fontSize: Olcek.kucuk,
                  borderWidth: 1,
                  borderColor: palet.outlineVariant,
                }}
              />
            </View>

            <View style={{ gap: Bosluk.sm }}>
              <Metin tur="minik" ikincil>
                Yeni Şifre Tekrar:
              </Metin>
              <TextInput
                value={yeniSifreTekrar}
                onChangeText={setYeniSifreTekrar}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Yeni şifrenizi tekrar girin"
                placeholderTextColor={palet.onSurfaceVariant}
                style={{
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor: palet.surfaceContainerHighest,
                  color: palet.onSurface,
                  fontFamily: YaziTipi.govde,
                  fontSize: Olcek.kucuk,
                  borderWidth: 1,
                  borderColor: palet.outlineVariant,
                }}
              />
            </View>

            <Buton
              baslik="Şifreyi Güncelle"
              tur="birincil"
              tamGenislik
              onPress={sifreDegistir}
              yukleniyor={sifreYukleniyor}
            />
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Kişisel Veri Envanteri */}
      <Modal
        visible={envanterModalAcik}
        animationType="slide"
        transparent
        onRequestClose={() => setEnvanterModalAcik(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: palet.surface,
              borderTopLeftRadius: Yaricap.xl,
              borderTopRightRadius: Yaricap.xl,
              padding: Bosluk.lg,
              gap: Bosluk.md,
              maxHeight: '85%',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Metin tur="altBaslik">Kişisel Veri Envanteri</Metin>
              <Pressable onPress={() => setEnvanterModalAcik(false)}>
                <Metin tur="kucuk" renk={palet.primary}>
                  Kapat
                </Metin>
              </Pressable>
            </View>

            <Metin tur="kucuk" ikincil>
              Aşağıdaki tablo, Linguza üzerinde saklanan kişisel verilerinizi, saklanma amacını ve saklama sürelerini gösterir.
            </Metin>

            <ScrollView contentContainerStyle={{ gap: Bosluk.sm }}>
              {envanterYukleniyor ? (
                <ActivityIndicator size="small" color={palet.primary} style={{ marginVertical: Bosluk.lg }} />
              ) : envanter.length === 0 ? (
                <BosDurum baslik="Envanter yüklenemedi" aciklama="Lütfen internet bağlantınızı kontrol edip tekrar deneyin." />
              ) : (
                envanter.map((item, idx) => (
                  <View
                    key={`${item.tablo}-${item.alan}-${idx}`}
                    style={{
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: palet.surfaceContainerLow,
                      borderWidth: 1,
                      borderColor: palet.outlineVariant,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Metin tur="kucuk" kalin>
                        {item.tablo} — {item.alan}
                      </Metin>
                      <Rozet metin={item.sinif} />
                    </View>
                    <Metin tur="minik" ikincil>
                      Amaç: {item.sebep}
                    </Metin>
                    <Metin tur="minik" ikincil>
                      Saklama: {item.saklama} · Dışa aktarılır: {item.disaAktarilir ? 'Evet' : 'Hayır'}
                    </Metin>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: Hesap Silme (2 Adımlı Akış) */}
      <Modal
        visible={silmeModalAcik}
        animationType="fade"
        transparent
        onRequestClose={() => setSilmeModalAcik(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            padding: Bosluk.lg,
          }}
        >
          <View
            style={{
              backgroundColor: palet.surface,
              borderRadius: Yaricap.xl,
              padding: Bosluk.lg,
              gap: Bosluk.md,
              maxHeight: '90%',
            }}
          >
            {silmeAdim === 1 ? (
              <>
                {/* Adım 1: Uyarı + Silinecekler Tablosu */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <AlertTriangle size={24} color={palet.error} />
                  <Metin tur="altBaslik" renk={palet.error}>
                    Hesabımı Kalıcı Olara Sil
                  </Metin>
                </View>

                <Metin tur="kucuk">
                  Bu işlem <Metin tur="kucuk" kalin renk={palet.error}>GERİ ALINAMAZ</Metin>. Hesabınız silindiğinde aşağıdaki tüm kişisel verileriniz sistemden kalıcı olarak temizlenecektir:
                </Metin>

                <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ gap: Bosluk.xs }}>
                  <View
                    style={{
                      padding: Bosluk.sm,
                      borderRadius: Yaricap.sm,
                      backgroundColor: alpha(palet.error, 0.08),
                    }}
                  >
                    <Metin tur="minik" kalin>
                      • Profil bilgileri, kullanıcı adı ve e-posta
                    </Metin>
                    <Metin tur="minik" kalin>
                      • Kaydedilen kelimeler, öğrenme seviyeleri ve çalışma geçmişi
                    </Metin>
                    <Metin tur="minik" kalin>
                      • Okuma ve quiz ilerlemeleri, günlük seri verileri
                    </Metin>
                    <Metin tur="minik" kalin>
                      • Kaydedilen özel cümleler ve tarama (OCR) geçmişi
                    </Metin>
                  </View>
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: Bosluk.sm, marginTop: Bosluk.sm }}>
                  <Pressable
                    onPress={() => setSilmeModalAcik(false)}
                    style={{
                      flex: 1,
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: palet.surfaceContainerHighest,
                      alignItems: 'center',
                    }}
                  >
                    <Metin tur="kucuk" kalin>
                      Vazgeç
                    </Metin>
                  </Pressable>

                  <Pressable
                    onPress={() => setSilmeAdim(2)}
                    style={{
                      flex: 1,
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: palet.error,
                      alignItems: 'center',
                    }}
                  >
                    <Metin tur="kucuk" kalin renk={palet.onError}>
                      Devam Et
                    </Metin>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                {/* Adım 2: Şifre Onayı */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                  <Lock size={22} color={palet.error} />
                  <Metin tur="altBaslik" renk={palet.error}>
                    Şifre ile Onayla
                  </Metin>
                </View>

                {silmeHata ? <HataKutusu mesaj={silmeHata} /> : null}

                <Metin tur="kucuk">
                  Güvenliğiniz için lütfen mevcut şifrenizi girerek hesap silme işlemini onaylayın.
                </Metin>

                <TextInput
                  value={silmeSifre}
                  onChangeText={setSilmeSifre}
                  secureTextEntry
                  autoComplete="password"
                  textContentType="password"
                  placeholder="Mevcut şifreniz"
                  placeholderTextColor={palet.onSurfaceVariant}
                  style={{
                    padding: Bosluk.md,
                    borderRadius: Yaricap.md,
                    backgroundColor: palet.surfaceContainerHighest,
                    color: palet.onSurface,
                    fontFamily: YaziTipi.govde,
                    fontSize: Olcek.kucuk,
                    borderWidth: 1,
                    borderColor: palet.outlineVariant,
                  }}
                />

                <View style={{ flexDirection: 'row', gap: Bosluk.sm, marginTop: Bosluk.sm }}>
                  <Pressable
                    onPress={() => setSilmeAdim(1)}
                    disabled={silmeYukleniyor}
                    style={{
                      flex: 1,
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: palet.surfaceContainerHighest,
                      alignItems: 'center',
                    }}
                  >
                    <Metin tur="kucuk" kalin>
                      Geri
                    </Metin>
                  </Pressable>

                  <Pressable
                    onPress={hesabimiSil}
                    disabled={silmeYukleniyor || !silmeSifre.trim()}
                    style={{
                      flex: 1.5,
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: palet.error,
                      alignItems: 'center',
                      opacity: silmeYukleniyor || !silmeSifre.trim() ? 0.6 : 1,
                    }}
                  >
                    {silmeYukleniyor ? (
                      <ActivityIndicator size="small" color={palet.onError} />
                    ) : (
                      <Metin tur="kucuk" kalin renk={palet.onError}>
                        Hesabımı Kalıcı Olara Sil
                      </Metin>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </EkranZemini>
  );
}
