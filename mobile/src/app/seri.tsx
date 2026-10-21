import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Check, Info, Target, Zap } from 'lucide-react-native';
import { useTema } from '@/context/ThemeContext';
import { useSeri } from '@/context/SeriContext';
import { SeriAlevi } from '@/components/seri/SeriAlevi';
import { HedefHalkasi } from '@/components/seri/HedefHalkasi';
import { HatirlatmaAyarlariKarti } from '@/components/HatirlatmaAyarlariKarti';

const HEDEF_SECENEKLERI = [
  { xp: 10, etiket: 'Rahat' },
  { xp: 20, etiket: 'Normal' },
  { xp: 30, etiket: 'Ciddi' },
  { xp: 50, etiket: 'Yoğun' },
];

export default function SeriEkrani() {
  const { renk } = useTema();
  const router = useRouter();
  const { ozet, yukleniyor, ayarlariGuncelle } = useSeri();
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [bilgiNotu, setBilgiNotu] = useState<string | null>(null);

  if (yukleniyor && !ozet) {
    return (
      <View style={[stiller.merkez, { backgroundColor: renk.background }]}>
        <ActivityIndicator size="large" color={renk.primary} />
      </View>
    );
  }

  if (!ozet) {
    return (
      <View style={[stiller.merkez, { backgroundColor: renk.background }]}>
        <Text style={{ color: renk.onSurfaceVariant }}>Seri bilgileri yüklenemedi.</Text>
      </View>
    );
  }

  const {
    mevcutSeri,
    enUzunSeri,
    bugunAktif,
    seriRiskte,
    bugun,
    sonGunler,
    gunlukHedefXp,
    puanTablosu,
  } = ozet;

  const hedefSec = async (yeniHedef: number) => {
    if (yeniHedef === gunlukHedefXp) return;
    setKaydediliyor(true);
    setBilgiNotu(null);
    try {
      await ayarlariGuncelle({ gunlukHedefXp: yeniHedef });
      setBilgiNotu('Yeni hedefin yarından geçerli.');
    } catch {
      Alert.alert('Hata', 'Günlük hedef güncellenemedi.');
    } finally {
      setKaydediliyor(false);
    }
  };

  const kirilimListesi = [
    { baslik: 'Okuma İlerlemesi', xp: bugun.kirilim.okuma, tavan: 60, birim: '5 XP / konum' },
    { baslik: 'Yeni Kelime Ekleme', xp: bugun.kirilim.kelime, tavan: 20, birim: '2 XP / kelime' },
    { baslik: 'Kelime Kartı Çalışma', xp: bugun.kirilim.calisma, tavan: 40, birim: '1 XP / kart' },
    { baslik: 'Quiz Tamamlama', xp: bugun.kirilim.quiz, tavan: 40, birim: '10 XP / quiz' },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Günlük Seri ve Hedef',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Geri dön"
              style={{ padding: 8 }}
            >
              <ArrowLeft size={22} color={renk.onSurface} />
            </Pressable>
          ),
          headerStyle: { backgroundColor: renk.surfaceContainerLow },
          headerTintColor: renk.onSurface,
          headerShadowVisible: false,
        }}
      />
      <ScrollView style={[stiller.kapsayici, { backgroundColor: renk.background }]} contentContainerStyle={stiller.icerik}>
        {/* 1. Bölüm: Büyük Alev ve Seri Özeti */}
        <View style={[stiller.kart, { backgroundColor: renk.surfaceContainerLow, borderColor: renk.outlineVariant }]}>
          <View style={stiller.alevMerkez}>
            <SeriAlevi
              mevcutSeri={mevcutSeri}
              bugunAktif={bugunAktif}
              seriRiskte={seriRiskte}
              boyut="buyuk"
            />
            <Text style={[stiller.seriBaslik, { color: renk.onSurface }]}>
              {mevcutSeri} Günlük Seri
            </Text>
            <Text style={[stiller.enUzunMetin, { color: renk.onSurfaceVariant }]}>
              En uzun seri: {enUzunSeri} gün
            </Text>
          </View>
        </View>

        {/* 2. Bölüm: Bugünün XP Durumu ve Kırılımı */}
        <View style={[stiller.kart, { backgroundColor: renk.surfaceContainerLow, borderColor: renk.outlineVariant }]}>
          <View style={stiller.baslikSatir}>
            <Target size={20} color={renk.primary} />
            <Text style={[stiller.kartBasligi, { color: renk.onSurface }]}>Bugünün İlerlemesi</Text>
          </View>

          <View style={stiller.bugunDetaySatir}>
            <HedefHalkasi
              xp={bugun.xp}
              hedefXp={bugun.hedefXp}
              boyut={88}
              etirKalinlik={8}
              tamamlandi={bugun.hedefTamamlandi}
            />
            <View style={stiller.bugunOzetMetinler}>
              <Text style={[stiller.bugunDurumBaslik, { color: renk.onSurface }]}>
                {bugun.hedefTamamlandi
                  ? '🎉 Hedef Tamamlandı!'
                  : bugun.xp > 0
                  ? `${bugun.hedefXp - bugun.xp} XP daha gerekli`
                  : 'Henüz başlanmadı'}
              </Text>
              <Text style={[stiller.bugunDurumAlt, { color: renk.onSurfaceVariant }]}>
                Hedef: {bugun.hedefXp} XP · Kazanılan: {bugun.xp} XP
              </Text>
            </View>
          </View>

          {/* Kırılım Listesi */}
          <View style={[stiller.kirilimListesi, { borderTopColor: renk.outlineVariant }]}>
            {kirilimListesi.map((item, idx) => (
              <View key={idx} style={stiller.kirilimSatir}>
                <Text style={[stiller.kirilimEtiket, { color: renk.onSurface }]}>{item.baslik}</Text>
                <Text style={[stiller.kirilimDeger, { color: renk.onSurfaceVariant }]}>
                  {item.xp} / {item.tavan} XP
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 3. Bölüm: 30 Günlük Aktivite Izgarası */}
        <View style={[stiller.kart, { backgroundColor: renk.surfaceContainerLow, borderColor: renk.outlineVariant }]}>
          <Text style={[stiller.kartBasligi, { color: renk.onSurface, marginBottom: 12 }]}>
            Son 30 Günlük Etkinlik
          </Text>
          <View style={stiller.izgara}>
            {sonGunler.map((item, idx) => {
              const aktif = item.xp > 0;
              const tamam = item.hedefTamamlandi;

              return (
                <View
                  key={idx}
                  style={[
                    stiller.izgaraKutusu,
                    {
                      backgroundColor: tamam
                        ? '#22c55e'
                        : aktif
                        ? '#f97316'
                        : renk.outlineVariant,
                    },
                  ]}
                >
                  {tamam && <Check size={10} color="#ffffff" strokeWidth={3} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* 4. Bölüm: Günlük Hedef Seçimi */}
        <View style={[stiller.kart, { backgroundColor: renk.surfaceContainerLow, borderColor: renk.outlineVariant }]}>
          <Text style={[stiller.kartBasligi, { color: renk.onSurface, marginBottom: 4 }]}>
            Günlük Hedef Tercihi
          </Text>
          <Text style={[stiller.kartAltBasligi, { color: renk.onSurfaceVariant, marginBottom: 14 }]}>
            Kendine uygun bir günlük XP hedefi seç.
          </Text>

          <View style={stiller.hedefSecenekleriGrubu}>
            {HEDEF_SECENEKLERI.map((secenek) => {
              const secili = secenek.xp === gunlukHedefXp;
              return (
                <Pressable
                  key={secenek.xp}
                  disabled={kaydediliyor}
                  onPress={() => hedefSec(secenek.xp)}
                  style={({ pressed }) => [
                    stiller.hedefButon,
                    {
                      borderColor: secili ? renk.primary : renk.outlineVariant,
                      backgroundColor: secili ? 'rgba(99, 102, 241, 0.12)' : renk.background,
                      opacity: pressed || kaydediliyor ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      stiller.hedefEtiket,
                      { color: secili ? renk.primary : renk.onSurface },
                    ]}
                  >
                    {secenek.etiket}
                  </Text>
                  <Text
                    style={[
                      stiller.hedefXpText,
                      { color: secili ? renk.primary : renk.onSurfaceVariant },
                    ]}
                  >
                    {secenek.xp} XP
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {bilgiNotu && (
            <View style={stiller.bilgiKutusu}>
              <Info size={16} color={renk.primary} />
              <Text style={[stiller.bilgiMetni, { color: renk.primary }]}>{bilgiNotu}</Text>
            </View>
          )}
        </View>

        {/* 5. Bölüm: Hatırlatma Bildirim Ayarları (YH-07) */}
        <HatirlatmaAyarlariKarti />

        {/* 6. Bölüm: Sunucudan Gelen XP Puan Tablosu */}
        {puanTablosu && puanTablosu.length > 0 && (
          <View style={[stiller.kart, { backgroundColor: renk.surfaceContainerLow, borderColor: renk.outlineVariant }]}>
            <View style={stiller.baslikSatir}>
              <Zap size={20} color="#f59e0b" />
              <Text style={[stiller.kartBasligi, { color: renk.onSurface }]}>XP Nasıl Kazanılır?</Text>
            </View>

            <View style={stiller.puanTablosu}>
              {puanTablosu.map((item, idx) => (
                <View key={idx} style={[stiller.puanSatir, { borderBottomColor: renk.outlineVariant }]}>
                  <Text style={[stiller.puanTur, { color: renk.onSurface }]}>
                    {item.tur === 'okuma'
                      ? 'Sayfa İlerlemesi'
                      : item.tur === 'kelime'
                      ? 'Yeni Kelime Kaydı'
                      : item.tur === 'calisma'
                      ? 'Kelime Kartı Çalışması'
                      : item.tur === 'quiz'
                      ? 'Quiz Tamamlama'
                      : item.tur}
                  </Text>
                  <Text style={[stiller.puanDetay, { color: renk.primary }]}>
                    +{item.xp} XP (Tavan: {item.gunlukTavan} XP/gün)
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const stiller = StyleSheet.create({
  kapsayici: {
    flex: 1,
  },
  icerik: {
    padding: 16,
    gap: 16,
  },
  merkez: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kart: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  alevMerkez: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  seriBaslik: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 24,
    marginTop: 4,
  },
  enUzunMetin: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  baslikSatir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  kartBasligi: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  kartAltBasligi: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  bugunDetaySatir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginVertical: 8,
  },
  bugunOzetMetinler: {
    flex: 1,
    gap: 4,
  },
  bugunDurumBaslik: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  bugunDurumAlt: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  kirilimListesi: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  kirilimSatir: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kirilimEtiket: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  kirilimDeger: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  izgara: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
  },
  izgaraKutusu: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hedefSecenekleriGrubu: {
    flexDirection: 'row',
    gap: 8,
  },
  hedefButon: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 2,
  },
  hedefEtiket: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  hedefXpText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  bilgiKutusu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 8,
  },
  bilgiMetni: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  puanTablosu: {
    gap: 10,
  },
  puanSatir: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  puanTur: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  puanDetay: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
});
