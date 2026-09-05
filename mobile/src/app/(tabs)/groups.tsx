import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Check,
  Clipboard as ClipboardIcon,
  GraduationCap,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { UstBar } from '@/components/UstBar';
import {
  BosDurum,
  Buton,
  EkranZemini,
  HataKutusu,
  IlerlemeCubugu,
  Kart,
  Metin,
  Rozet,
  Yukleniyor,
} from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { Group, GroupDetails, api } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap, YaziTipi } from '@/theme/tokens';

function tarihBicimle(ham: string): string {
  const t = new Date(ham);
  if (Number.isNaN(t.getTime())) return '—';
  return t.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

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
  const [kodKopyalandi, setKodKopyalandi] = useState(false);
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
      // KURAL-08: allBooks yalnızca grup sahibine dolu gelir, alan adı bookId.
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

  const koduKopyala = async (kod: string) => {
    await Clipboard.setStringAsync(kod);
    setKodKopyalandi(true);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => setKodKopyalandi(false), 2000);
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

  /* ── DETAY GÖRÜNÜMÜ ── */
  if (detay) {
    // KURAL-08: kitap atama yetkisi SAHİPLİĞE bağlı (sunucu sahibi olmayana 403
    // veriyor). Arayüz de aynı koşulu kullanmalı, yoksa öğretmen rolündeki bir
    // üyeye çalışmayan bir form gösterilir.
    const sahibiyim = detay.group.sahipMiyim;

    return (
      <EkranZemini>
        <UstBar baslik={detay.group.name} altBaslik={`${detay.members.length} üye`} />
        <ScrollView
          contentContainerStyle={{
            padding: Bosluk.lg,
            paddingTop: 0,
            paddingBottom: sekmeYuksekligi + Bosluk.xl,
            gap: Bosluk.md,
          }}
        >
          <Buton
            baslik="Gruplara Geri Dön"
            tur="hayalet"
            ikon={<ArrowLeft size={16} color={palet.onSurfaceVariant} />}
            onPress={() => setDetay(null)}
          />

          <Kart style={{ gap: Bosluk.sm }}>
            <Metin tur="baslik">{detay.group.name}</Metin>
            <Metin tur="kucuk" ikincil style={{ lineHeight: 19 }}>
              {detay.group.description || 'Açıklama belirtilmemiş.'}
            </Metin>

            {/* KURAL-08: davet kodunu yalnızca grup sahibi görür. */}
            {detay.group.inviteCode ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Bosluk.sm,
                  marginTop: Bosluk.sm,
                  padding: Bosluk.md,
                  borderRadius: Yaricap.md,
                  backgroundColor: palet.surfaceContainer,
                  borderWidth: 1,
                  borderColor: palet.outlineVariant,
                }}
              >
                <Metin tur="minik" ikincil>
                  DAVET KODU
                </Metin>
                <Metin tur="altBaslik" renk={palet.primary} style={{ flex: 1 }}>
                  {detay.group.inviteCode}
                </Metin>
                <Pressable onPress={() => koduKopyala(detay.group.inviteCode!)} hitSlop={8}>
                  {kodKopyalandi ? (
                    <Check size={18} color={palet.success} />
                  ) : (
                    <ClipboardIcon size={18} color={palet.onSurfaceVariant} />
                  )}
                </Pressable>
              </View>
            ) : (
              <Metin tur="minik" ikincil style={{ marginTop: Bosluk.sm }}>
                Davet kodunu yalnızca grup yöneticisi görebilir.
              </Metin>
            )}
          </Kart>

          {sahibiyim && detay.allBooks.length > 0 ? (
            <Kart style={{ gap: Bosluk.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                <BookOpen size={16} color={palet.primary} />
                <Metin tur="altBaslik">Kitap Ata</Metin>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: Bosluk.sm }}
              >
                {detay.allBooks.map((kitap) => {
                  const secili = atanacakKitap === kitap.bookId;
                  return (
                    <Pressable
                      key={kitap.bookId}
                      onPress={() => setAtanacakKitap(kitap.bookId)}
                      style={{
                        maxWidth: 200,
                        paddingHorizontal: Bosluk.md,
                        paddingVertical: Bosluk.sm,
                        borderRadius: Yaricap.md,
                        borderWidth: 1,
                        borderColor: secili ? palet.primary : palet.outlineVariant,
                        backgroundColor: secili
                          ? alpha(palet.primary, 0.12)
                          : palet.surfaceContainer,
                      }}
                    >
                      <Metin
                        tur="kucuk"
                        numberOfLines={1}
                        renk={secili ? palet.primary : palet.onSurfaceVariant}
                      >
                        {kitap.title}
                      </Metin>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Buton
                baslik="Gruba Ata"
                tamGenislik
                ikon={<Plus size={15} color={palet.onPrimary} />}
                onPress={kitapAta}
              />
            </Kart>
          ) : null}

          <Kart style={{ gap: Bosluk.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
              <Users size={16} color={palet.primary} />
              <Metin tur="altBaslik" style={{ flex: 1 }}>
                Üyeler
              </Metin>
              <Rozet metin={`${detay.members.length}`} />
            </View>
            {detay.members.map((uye) => (
              <View
                key={uye.userId}
                style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: Yaricap.tam,
                    backgroundColor: alpha(palet.primary, 0.15),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Metin tur="minik" renk={palet.primary}>
                    {uye.username.charAt(0).toUpperCase()}
                  </Metin>
                </View>
                <Metin tur="kucuk" style={{ flex: 1 }} numberOfLines={1}>
                  {uye.username}
                </Metin>
                <Metin tur="minik" ikincil style={{ textTransform: 'capitalize' }}>
                  {uye.role}
                </Metin>
              </View>
            ))}
          </Kart>

          {detay.group.assignments.length > 0 ? (
            <Kart style={{ gap: Bosluk.sm }}>
              <Metin tur="etiket" ikincil>
                Atanan Kitaplar
              </Metin>
              {detay.group.assignments.map((atama) => (
                <View
                  key={atama.bookId}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}
                >
                  <BookOpen size={14} color={palet.primary} />
                  <Metin tur="kucuk" numberOfLines={1} style={{ flex: 1 }}>
                    {atama.title}
                  </Metin>
                </View>
              ))}
            </Kart>
          ) : null}

          {detay.progresses.length > 0 ? (
            <Kart style={{ gap: Bosluk.md }}>
              <Metin tur="etiket" ikincil>
                Okuma İlerlemeleri
              </Metin>
              {detay.progresses.map((ilerleme, sira) => (
                <View key={`${ilerleme.userId}-${sira}`} style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                    <Metin tur="kucuk" kalin numberOfLines={1} style={{ flex: 1 }}>
                      {ilerleme.username}
                    </Metin>
                    <Metin tur="minik" renk={palet.primary}>
                      %{Math.round(ilerleme.progressPercent)}
                    </Metin>
                  </View>
                  <Metin tur="minik" ikincil numberOfLines={1}>
                    {ilerleme.bookTitle} · Bölüm {ilerleme.currentChapter} ·{' '}
                    {tarihBicimle(ilerleme.lastRead)}
                  </Metin>
                  <IlerlemeCubugu yuzde={ilerleme.progressPercent} yukseklik={5} />
                </View>
              ))}
            </Kart>
          ) : null}

          {detay.quizResults.length > 0 ? (
            <Kart style={{ gap: Bosluk.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                <Award size={16} color={palet.primary} />
                <Metin tur="etiket" ikincil>
                  Quiz Sonuçları
                </Metin>
              </View>
              {detay.quizResults.map((sonuc, sira) => (
                <View
                  key={sira}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Bosluk.sm,
                    paddingVertical: 4,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Metin tur="kucuk" kalin numberOfLines={1}>
                      {sonuc.username}
                    </Metin>
                    <Metin tur="minik" ikincil numberOfLines={1}>
                      {sonuc.quizTitle} · {tarihBicimle(sonuc.takenAt)}
                    </Metin>
                  </View>
                  <Rozet
                    metin={`${sonuc.score}/${sonuc.totalQuestions}`}
                    renk={
                      sonuc.score / Math.max(1, sonuc.totalQuestions) >= 0.6
                        ? palet.success
                        : palet.warning
                    }
                  />
                </View>
              ))}
            </Kart>
          ) : null}
        </ScrollView>
      </EkranZemini>
    );
  }

  /* ── LİSTE GÖRÜNÜMÜ ── */
  const tumGruplar = [
    ...yonettiklerim.map((g) => ({ grup: g, yonetici: true })),
    ...gruplarim
      .filter((g) => !yonettiklerim.some((y) => y.id === g.id))
      .map((g) => ({ grup: g, yonetici: false })),
  ];

  return (
    <EkranZemini>
      <UstBar baslik="Gruplar" altBaslik={`${tumGruplar.length} sınıf`} />

      {yukleniyor || detayYukleniyor ? (
        <Yukleniyor mesaj={detayYukleniyor ? 'Grup açılıyor…' : 'Gruplar yükleniyor…'} />
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

            {olusturAcik ? (
              <Animated.View entering={FadeInDown.duration(240)}>
                <Kart style={{ gap: Bosluk.md }}>
                  <Metin tur="altBaslik">Yeni Grup</Metin>
                  <TextInput
                    value={olusturAd}
                    onChangeText={setOlusturAd}
                    placeholder="Grup adı"
                    placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
                    style={alanStili}
                  />
                  <TextInput
                    value={olusturAciklama}
                    onChangeText={setOlusturAciklama}
                    placeholder="Açıklama (isteğe bağlı)"
                    placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
                    multiline
                    style={[alanStili, { minHeight: 70, textAlignVertical: 'top' }]}
                  />
                  <Buton
                    baslik="Oluştur"
                    tamGenislik
                    yukleniyor={islemde}
                    disabled={!olusturAd.trim()}
                    onPress={grupOlustur}
                  />
                </Kart>
              </Animated.View>
            ) : null}

            {katilAcik ? (
              <Animated.View entering={FadeInDown.duration(240)}>
                <Kart style={{ gap: Bosluk.md }}>
                  <Metin tur="altBaslik">Davet Kodu ile Katıl</Metin>
                  <TextInput
                    value={katilKodu}
                    onChangeText={setKatilKodu}
                    placeholder="Örn. ABC123"
                    placeholderTextColor={alpha(palet.onSurfaceVariant, 0.55)}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={alanStili}
                  />
                  <Buton
                    baslik="Katıl"
                    tamGenislik
                    yukleniyor={islemde}
                    disabled={!katilKodu.trim()}
                    onPress={grubaKatil}
                  />
                </Kart>
              </Animated.View>
            ) : null}

            {tumGruplar.length === 0 ? (
              <BosDurum
                simge={<GraduationCap size={32} color={palet.primary} />}
                baslik="Henüz bir grupta değilsin"
                aciklama="Kendi sınıfını açabilir ya da öğretmeninden aldığın davet koduyla var olan bir gruba katılabilirsin."
              />
            ) : (
              tumGruplar.map(({ grup, yonetici }, sira) => (
                <Animated.View
                  key={grup.id}
                  entering={FadeInDown.duration(300).delay(Math.min(sira, 8) * 45)}
                >
                  <Pressable onPress={() => detayiAc(grup.id)}>
                    <Kart style={{ gap: Bosluk.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: Yaricap.md,
                            backgroundColor: alpha(palet.primary, 0.14),
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <GraduationCap size={20} color={palet.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Metin tur="altBaslik" numberOfLines={1}>
                            {grup.name}
                          </Metin>
                          <Metin tur="minik" ikincil numberOfLines={1}>
                            {grup.membersCount} üye · {grup.assignments.length} kitap
                          </Metin>
                        </View>
                        {yonetici ? <Rozet metin="Yönetici" /> : null}
                      </View>
                      {grup.description ? (
                        <Metin tur="kucuk" ikincil numberOfLines={2} style={{ lineHeight: 18 }}>
                          {grup.description}
                        </Metin>
                      ) : null}
                    </Kart>
                  </Pressable>
                </Animated.View>
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </EkranZemini>
  );
}
