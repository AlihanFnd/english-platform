import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import {
  AlertCircle,
  Check,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  FileUp,
  Plus,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Buton, EkranZemini, HataKutusu, Kart, Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { AyristirilmisOge, dosyadanAyristir, metniAyristir } from '@/lib/dosyaAyristirici';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

interface TopluEkleModalProps {
  acik: boolean;
  kapat: () => void;
  varsayilanHedef?: 'kelime' | 'cumle';
  userId?: number | string;
  tamamlandi: () => void;
}

export function TopluEkleModal({
  acik,
  kapat,
  varsayilanHedef = 'kelime',
  userId,
  tamamlandi,
}: TopluEkleModalProps) {
  const palet = useRenk();
  const kenar = useSafeAreaInsets();

  const [girisModu, setGirisModu] = useState<'dosya' | 'metin'>('dosya');
  const [hedef, setHedef] = useState<'kelime' | 'cumle'>(varsayilanHedef);

  /* Dosya ve ayrıştırma durumu */
  const [ayristiriliyor, setAyristiriliyor] = useState(false);
  const [dosyaAdi, setDosyaAdi] = useState('');
  const [yapistirilanMetin, setYapistirilanMetin] = useState('');
  const [ogeler, setOgeler] = useState<AyristirilmisOge[]>([]);
  const [hata, setHata] = useState('');

  /* Çeviri ve içe aktarma ilerlemesi */
  const [ceviriYapiliyor, setCeviriYapiliyor] = useState(false);
  const [ceviriAdim, setCeviriAdim] = useState({ yapilan: 0, toplam: 0 });
  const [aktariliyor, setAktariliyor] = useState(false);
  const [aktarilanAdet, setAktarilanAdet] = useState(0);

  const secilenAdet = ogeler.filter((o) => o.selected).length;

  const sifirla = () => {
    setOgeler([]);
    setDosyaAdi('');
    setYapistirilanMetin('');
    setHata('');
    setCeviriYapiliyor(false);
    setAktariliyor(false);
    setAktarilanAdet(0);
  };

  const modalKapat = () => {
    if (aktariliyor || ceviriYapiliyor) return;
    sifirla();
    kapat();
  };

  const otomatikCevir = async (hedefListe?: AyristirilmisOge[]) => {
    const kaynak = hedefListe || ogeler;
    const eksikler = kaynak.filter((o) => !o.translation.trim());
    if (eksikler.length === 0) return;

    setCeviriYapiliyor(true);
    setCeviriAdim({ yapilan: 0, toplam: eksikler.length });

    let sayac = 0;
    for (const item of eksikler) {
      try {
        let tr = '';
        if (hedef === 'kelime') {
          const res = await api.translateWord(item.original.trim());
          tr = res.generalMeaning || res.translation || '';
        } else {
          const res = await api.translateSentence(item.original.trim());
          tr = res.translation || '';
        }
        if (tr) {
          setOgeler((oncekiler) =>
            oncekiler.map((o) => (o.id === item.id ? { ...o, translation: tr } : o)),
          );
        }
      } catch {
        /* Tekil hata durumunda diğer kelimelerin çevrilmesini engelleme */
      }
      sayac++;
      setCeviriAdim({ yapilan: sayac, toplam: eksikler.length });
      await new Promise((r) => setTimeout(r, 40));
    }
    setCeviriYapiliyor(false);
  };

  const dosyaSec = async () => {
    try {
      setHata('');
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/plain',
          'text/csv',
          'text/tab-separated-values',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const secilen = res.assets[0];
      setDosyaAdi(secilen.name);
      setAyristiriliyor(true);

      const liste = await dosyadanAyristir(secilen.uri, secilen.name);
      if (liste.length === 0) {
        setHata('Dosyada geçerli kelime veya cümle bulunamadı.');
      } else {
        setOgeler(liste);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const eksikSayisi = liste.filter((o) => !o.translation.trim()).length;
        if (eksikSayisi > 0) {
          setTimeout(() => {
            otomatikCevir(liste);
          }, 350);
        }
      }
    } catch (e) {
      setHata((e as Error).message || 'Dosya okunurken bir hata oluştu.');
    } finally {
      setAyristiriliyor(false);
    }
  };

  const metniIsle = () => {
    setHata('');
    if (!yapistirilanMetin.trim()) {
      setHata('Lütfen ayrıştırılacak metni yapıştırın.');
      return;
    }
    const liste = metniAyristir(yapistirilanMetin);
    if (liste.length === 0) {
      setHata('Yapıştırılan metinde geçerli kelime veya cümle bulunamadı.');
      return;
    }
    setOgeler(liste);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const eksikSayisi = liste.filter((o) => !o.translation.trim()).length;
    if (eksikSayisi > 0) {
      setTimeout(() => {
        otomatikCevir(liste);
      }, 350);
    }
  };

  const tumunuSecToggle = () => {
    const hepsiSecili = ogeler.every((o) => o.selected);
    setOgeler((oncekiler) => oncekiler.map((o) => ({ ...o, selected: !hepsiSecili })));
  };

  const ogeSecToggle = (id: string) => {
    setOgeler((oncekiler) =>
      oncekiler.map((o) => (o.id === id ? { ...o, selected: !o.selected } : o)),
    );
  };

  const ogeGuncelle = (id: string, alan: 'original' | 'translation', deger: string) => {
    setOgeler((oncekiler) =>
      oncekiler.map((o) => (o.id === id ? { ...o, [alan]: deger } : o)),
    );
  };

  const ogeSil = (id: string) => {
    setOgeler((oncekiler) => oncekiler.filter((o) => o.id !== id));
  };

  const topluIceAktar = async () => {
    const secilenler = ogeler.filter((o) => o.selected && o.original.trim());
    if (secilenler.length === 0) {
      Alert.alert('Uyarı', 'Lütfen içe aktarılacak en az bir geçerli satır seçin.');
      return;
    }

    setAktariliyor(true);
    setAktarilanAdet(0);
    let basarili = 0;

    try {
      if (hedef === 'kelime') {
        for (let i = 0; i < secilenler.length; i++) {
          const item = secilenler[i];
          let tr = item.translation.trim();
          if (!tr) {
            try {
              const res = await api.translateWord(item.original.trim());
              tr = res.generalMeaning || res.translation || item.original.trim();
            } catch {
              tr = item.original.trim();
            }
          }
          try {
            await api.addWord(item.original.trim(), tr, item.context || '');
            basarili++;
          } catch {
            /* Çift kelime veya tekil hata durumunda diğerlerini aksatmayalım */
          }
          setAktarilanAdet(i + 1);
        }
      } else {
        // Cümlelerim
        const eklenecekler = [];
        for (let i = 0; i < secilenler.length; i++) {
          const s = secilenler[i];
          let tr = s.translation.trim();
          if (!tr) {
            try {
              const res = await api.translateSentence(s.original.trim());
              tr = res.translation || s.original.trim();
            } catch {
              tr = s.original.trim();
            }
          }
          eklenecekler.push({
            sentence: s.original.trim(),
            translation: tr,
            context: s.context,
          });
          setAktarilanAdet(i + 1);
        }
        const sonuc = await api.topluCumleEkle(
          eklenecekler.map((e) => ({ cumle: e.sentence, ceviri: e.translation, baglam: e.context })),
        );
        basarili = sonuc.eklenen;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Başarılı',
        `${basarili} adet ${hedef === 'kelime' ? 'kelime' : 'cümle'} listenize eklendi!`,
        [
          {
            text: 'Tamam',
            onPress: () => {
              tamamlandi();
              modalKapat();
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('İçe aktarma hatası', (e as Error).message);
    } finally {
      setAktariliyor(false);
    }
  };

  const alanStili = {
    color: palet.onSurface,
    fontFamily: YaziTipi.govdeOrta,
    fontSize: Olcek.govde,
    backgroundColor: palet.surfaceContainer,
    borderWidth: 1,
    borderColor: palet.outlineVariant,
    borderRadius: Yaricap.md,
    paddingHorizontal: Bosluk.md,
    paddingVertical: Platform.OS === 'ios' ? Bosluk.md : Bosluk.sm,
  } as const;

  return (
    <Modal visible={acik} animationType="slide" onRequestClose={modalKapat}>
      <EkranZemini>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={20}
        >
          <View
            style={{
              flex: 1,
              paddingTop: kenar.top + Bosluk.sm,
              paddingBottom: kenar.bottom + Bosluk.md,
              paddingHorizontal: Bosluk.lg,
              gap: Bosluk.md,
            }}
          >
            {/* Üst Başlık */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: Yaricap.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: alpha(palet.primary, 0.12),
                }}
              >
                <FileUp size={20} color={palet.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Metin tur="altBaslik">Toplu İçe Aktarma</Metin>
                <Metin tur="minik" ikincil>
                  Excel, Word veya metin listesinden kelime/cümle ekle
                </Metin>
              </View>
              <Pressable
                onPress={modalKapat}
                disabled={aktariliyor}
                hitSlop={10}
                style={{ padding: 4 }}
                accessibilityLabel="Kapat"
                accessibilityRole="button"
              >
                <X size={22} color={palet.onSurfaceVariant} />
              </Pressable>
            </View>

            {hata ? <HataKutusu mesaj={hata} /> : null}

            {ogeler.length === 0 ? (
              <ScrollView
                contentContainerStyle={{ gap: Bosluk.lg, paddingBottom: Bosluk.xl }}
                keyboardShouldPersistTaps="handled"
              >
                {/* Giriş Yöntemi Seçimi */}
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: palet.surfaceContainer,
                    borderRadius: Yaricap.md,
                    padding: 4,
                  }}
                >
                  <Pressable
                    onPress={() => setGirisModu('dosya')}
                    style={{
                      flex: 1,
                      paddingVertical: Bosluk.sm,
                      borderRadius: Yaricap.sm,
                      alignItems: 'center',
                      backgroundColor: girisModu === 'dosya' ? palet.surface : 'transparent',
                    }}
                  >
                    <Metin
                      tur="minik"
                      renk={girisModu === 'dosya' ? palet.primary : palet.onSurfaceVariant}
                    >
                      Dosya Yükle (.xlsx, .docx)
                    </Metin>
                  </Pressable>
                  <Pressable
                    onPress={() => setGirisModu('metin')}
                    style={{
                      flex: 1,
                      paddingVertical: Bosluk.sm,
                      borderRadius: Yaricap.sm,
                      alignItems: 'center',
                      backgroundColor: girisModu === 'metin' ? palet.surface : 'transparent',
                    }}
                  >
                    <Metin
                      tur="minik"
                      renk={girisModu === 'metin' ? palet.primary : palet.onSurfaceVariant}
                    >
                      Metin / Liste Yapıştır
                    </Metin>
                  </Pressable>
                </View>

                {girisModu === 'dosya' ? (
                  <Kart style={{ alignItems: 'center', gap: Bosluk.md, paddingVertical: Bosluk.xl }}>
                    <View
                      style={{
                        width: 68,
                        height: 68,
                        borderRadius: Yaricap.tam,
                        backgroundColor: alpha(palet.primary, 0.1),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <UploadCloud size={34} color={palet.primary} />
                    </View>

                    <Metin tur="altBaslik" ortala>
                      Excel veya Word Belgesi Seç
                    </Metin>

                    <Metin tur="kucuk" ikincil ortala style={{ lineHeight: 20 }}>
                      • Word (.docx) tablosu veya satırları{'\n'}
                      • Excel (.xlsx, .xls) sütunları (A: İngilizce, B: Türkçe){'\n'}
                      • .csv veya .txt metin dosyaları
                    </Metin>

                    {dosyaAdi ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: Bosluk.sm,
                          paddingHorizontal: Bosluk.md,
                          paddingVertical: Bosluk.sm,
                          borderRadius: Yaricap.md,
                          backgroundColor: alpha(palet.primary, 0.1),
                        }}
                      >
                        <FileText size={16} color={palet.primary} />
                        <Metin tur="kucuk" renk={palet.primary} numberOfLines={1}>
                          {dosyaAdi}
                        </Metin>
                      </View>
                    ) : null}

                    <Buton
                      baslik={ayristiriliyor ? 'Dosya Okunuyor…' : 'Cihazdan Dosya Seç'}
                      yukleniyor={ayristiriliyor}
                      ikon={<FileSpreadsheet size={16} color={palet.onPrimary} />}
                      onPress={dosyaSec}
                    />
                  </Kart>
                ) : (
                  <Kart style={{ gap: Bosluk.md }}>
                    <Metin tur="etiket" renk={palet.primary}>
                      Metin veya Tablo Yapıştır
                    </Metin>
                    <Metin tur="minik" ikincil>
                      Her satıra bir kelime/cümle ve anlamı yazın. Örnek:{'\n'}
                      car - araba{'\n'}
                      apple - elma{'\n'}
                      I like to read. - Okumayı severim.
                    </Metin>
                    <TextInput
                      value={yapistirilanMetin}
                      onChangeText={setYapistirilanMetin}
                      placeholder={`car - araba\nbreak the ice - buzları eritmek\nShe goes to school. - O okula gider.`}
                      placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
                      multiline
                      style={[alanStili, { minHeight: 180, textAlignVertical: 'top' }]}
                    />
                    <Buton
                      baslik="Metni Çözümle ve Listele"
                      ikon={<Check size={16} color={palet.onPrimary} />}
                      disabled={!yapistirilanMetin.trim()}
                      onPress={metniIsle}
                    />
                  </Kart>
                )}
              </ScrollView>
            ) : (
              /* Önizleme ve İçe Aktarma Ekranı */
              <View style={{ flex: 1, gap: Bosluk.md }}>
                {/* Hedef Seçimi (Kelimelerim / Cümlelerim) */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Metin tur="etiket" ikincil>
                    HEDEF LİSTE:
                  </Metin>
                  <View
                    style={{
                      flexDirection: 'row',
                      backgroundColor: palet.surfaceContainer,
                      borderRadius: Yaricap.md,
                      padding: 2,
                    }}
                  >
                    <Pressable
                      onPress={() => setHedef('kelime')}
                      style={{
                        paddingHorizontal: Bosluk.md,
                        paddingVertical: 4,
                        borderRadius: Yaricap.sm,
                        backgroundColor: hedef === 'kelime' ? palet.primary : 'transparent',
                      }}
                    >
                      <Metin
                        tur="minik"
                        renk={hedef === 'kelime' ? palet.onPrimary : palet.onSurfaceVariant}
                      >
                        📖 Kelimelerim
                      </Metin>
                    </Pressable>
                    <Pressable
                      onPress={() => setHedef('cumle')}
                      style={{
                        paddingHorizontal: Bosluk.md,
                        paddingVertical: 4,
                        borderRadius: Yaricap.sm,
                        backgroundColor: hedef === 'cumle' ? palet.primary : 'transparent',
                      }}
                    >
                      <Metin
                        tur="minik"
                        renk={hedef === 'cumle' ? palet.onPrimary : palet.onSurfaceVariant}
                      >
                        💬 Cümlelerim
                      </Metin>
                    </Pressable>
                  </View>
                </View>

                {/* Kontrol Çubuğu */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Pressable
                    onPress={tumunuSecToggle}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    {secilenAdet === ogeler.length ? (
                      <CheckSquare size={18} color={palet.primary} />
                    ) : (
                      <Square size={18} color={palet.onSurfaceVariant} />
                    )}
                    <Metin tur="kucuk" ikincil>
                      Tümünü Seç ({secilenAdet}/{ogeler.length})
                    </Metin>
                  </Pressable>

                  <Pressable onPress={sifirla} style={{ padding: 4 }}>
                    <Metin tur="minik" renk={palet.error}>
                      Farklı Dosya Seç
                    </Metin>
                  </Pressable>
                </View>

                {/* Otomatik Çeviri Bildirimi / Butonu */}
                {ceviriYapiliyor ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: Bosluk.sm,
                      paddingHorizontal: Bosluk.md,
                      paddingVertical: Bosluk.sm,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.primary, 0.1),
                    }}
                  >
                    <ActivityIndicator size="small" color={palet.primary} />
                    <Metin tur="minik" renk={palet.primary} style={{ flex: 1 }}>
                      Translate ile eksikler çevriliyor ({ceviriAdim.yapilan}/{ceviriAdim.toplam})…
                    </Metin>
                  </View>
                ) : ogeler.some((o) => !o.translation.trim()) ? (
                  <Pressable
                    onPress={() => otomatikCevir()}
                    accessibilityRole="button"
                    accessibilityLabel="Eksik çevirileri tamamla"
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 7,
                      paddingHorizontal: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.primary, 0.1),
                      borderWidth: 1,
                      borderColor: alpha(palet.primary, 0.25),
                    }}
                  >
                    <Sparkles size={14} color={palet.primary} />
                    <Metin tur="minik" renk={palet.primary} kalin>
                      Eksik Çevirileri Translate ile Doldur
                    </Metin>
                  </Pressable>
                ) : null}

                {/* Liste */}
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ gap: Bosluk.sm, paddingBottom: Bosluk.md }}
                  keyboardShouldPersistTaps="handled"
                >
                  {ogeler.map((item, index) => (
                    <Animated.View
                      key={item.id}
                      entering={FadeInDown.duration(200).delay(Math.min(index, 10) * 25)}
                    >
                      <Kart
                        vurgulu={item.selected}
                        dolgu={Bosluk.sm}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}
                      >
                        <Pressable
                          onPress={() => ogeSecToggle(item.id)}
                          hitSlop={8}
                          accessibilityLabel={item.selected ? "Seçimi kaldır" : "Öğeyi seç"}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: item.selected }}
                        >
                          {item.selected ? (
                            <CheckSquare size={20} color={palet.primary} />
                          ) : (
                            <Square size={20} color={palet.outlineVariant} />
                          )}
                        </Pressable>

                        <View style={{ flex: 1, gap: 4 }}>
                          <TextInput
                            value={item.original}
                            onChangeText={(t) => ogeGuncelle(item.id, 'original', t)}
                            placeholder="İngilizce"
                            placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
                            style={[
                              alanStili,
                              {
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                                fontSize: Olcek.kucuk,
                              },
                            ]}
                          />
                          <TextInput
                            value={item.translation}
                            onChangeText={(t) => ogeGuncelle(item.id, 'translation', t)}
                            placeholder="Türkçe karşılığı"
                            placeholderTextColor={alpha(palet.onSurfaceVariant, 0.5)}
                            style={[
                              alanStili,
                              {
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                                fontSize: Olcek.kucuk,
                                color: palet.primary,
                              },
                            ]}
                          />
                        </View>

                        <Pressable
                          onPress={() => ogeSil(item.id)}
                          hitSlop={8}
                          style={{ padding: 4 }}
                          accessibilityLabel="Öğeyi sil"
                          accessibilityRole="button"
                        >
                          <Trash2 size={16} color={palet.error} />
                        </Pressable>
                      </Kart>
                    </Animated.View>
                  ))}
                </ScrollView>

                {/* İçe Aktar Butonu ve İlerleme */}
                {aktariliyor ? (
                  <View style={{ gap: Bosluk.xs, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                      <ActivityIndicator size="small" color={palet.primary} />
                      <Metin tur="kucuk" renk={palet.primary}>
                        İçe aktarılıyor: {aktarilanAdet} / {secilenAdet}
                      </Metin>
                    </View>
                  </View>
                ) : (
                  <Buton
                    baslik={`${secilenAdet} Öğeyi ${hedef === 'kelime' ? 'Kelimelerime' : 'Cümlelerime'} Aktar`}
                    ikon={<Plus size={16} color={palet.onPrimary} />}
                    tamGenislik
                    disabled={secilenAdet === 0}
                    onPress={topluIceAktar}
                  />
                )}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </EkranZemini>
    </Modal>
  );
}
