import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Pressable, Linking, Alert, StyleSheet } from 'react-native';
import { Bell, Clock, AlertCircle } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useTema } from '@/context/ThemeContext';
import { useSeri } from '@/context/SeriContext';
import {
  HatirlatmaAyari,
  getHatirlatmaAyarlari,
  saveHatirlatmaAyarlari,
  syncHatirlatmalar,
  cancelAllHatirlatmalar,
} from '@/lib/hatirlatmalar';

const SAAT_CIPLERI = ['08:00', '12:00', '18:00', '20:00', '21:00'];

export function HatirlatmaAyarlariKarti() {
  const { renk } = useTema();
  const { ozet } = useSeri();
  const [ayar, setAyar] = useState<HatirlatmaAyari>({ acik: true, saat: '20:00' });
  const [izinDurumu, setIzinDurumu] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [yukleniyor, setYukleniyor] = useState(true);

  const izinKontrolEt = async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      setIzinDurumu(perm.granted ? 'granted' : perm.canAskAgain ? 'undetermined' : 'denied');
    } catch {
      setIzinDurumu('denied');
    }
  };

  useEffect(() => {
    (async () => {
      const mevcut = await getHatirlatmaAyarlari();
      setAyar(mevcut);
      await izinKontrolEt();
      setYukleniyor(false);
    })();
  }, []);

  const toggleAcik = async (yeniAcik: boolean) => {
    if (yeniAcik) {
      const perm = await Notifications.getPermissionsAsync();
      if (!perm.granted) {
        if (perm.canAskAgain) {
          const req = await Notifications.requestPermissionsAsync();
          if (!req.granted) {
            setIzinDurumu('denied');
            return;
          }
          setIzinDurumu('granted');
        } else {
          setIzinDurumu('denied');
          Alert.alert(
            'Bildirim İzni Kapalı',
            'Linguza bildirim gönderebilmek için cihaz ayarlarından izin vermeniz gerekiyor.',
            [
              { text: 'Vazgeç', style: 'cancel' },
              { text: "Ayarlar'ı Aç", onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }
      }
    }

    const yeni = { ...ayar, acik: yeniAcik };
    setAyar(yeni);
    await saveHatirlatmaAyarlari(yeni);

    if (yeniAcik) {
      await syncHatirlatmalar(ozet);
    } else {
      await cancelAllHatirlatmalar();
    }
  };

  const saatSec = async (yeniSaat: string) => {
    const yeni = { ...ayar, saat: yeniSaat };
    setAyar(yeni);
    await saveHatirlatmaAyarlari(yeni);
    if (yeni.acik) {
      await syncHatirlatmalar(ozet);
    }
  };

  if (yukleniyor) return null;

  return (
    <View style={[stiller.kart, { backgroundColor: renk.surfaceContainerLow, borderColor: renk.outlineVariant }]}>
      <View style={stiller.baslikSatir}>
        <View style={stiller.solBaslik}>
          <Bell size={20} color={renk.primary} />
          <Text style={[stiller.kartBasligi, { color: renk.onSurface }]}>Hatırlatma Bildirimleri</Text>
        </View>
        <Switch
          value={ayar.acik && izinDurumu === 'granted'}
          onValueChange={toggleAcik}
          trackColor={{ false: renk.outlineVariant, true: renk.primary }}
          thumbColor="#ffffff"
        />
      </View>

      <Text style={[stiller.kartAltBasligi, { color: renk.onSurfaceVariant, marginTop: 4 }]}>
        Günde en fazla 1 hatırlatma + serin riskteyse akşam uyarısı alırsın. Kilit ekranında kişisel kelimelerin görünmez.
      </Text>

      {izinDurumu === 'denied' && (
        <View style={[stiller.uyariKutusu, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
          <AlertCircle size={16} color="#ef4444" />
          <Text style={[stiller.uyariMetni, { color: '#ef4444' }]}>
            Cihaz bildirim izni kapalı.
          </Text>
          <Pressable onPress={() => Linking.openSettings()} style={stiller.ayarlarButon}>
            <Text style={{ color: renk.primary, fontSize: 12, fontWeight: '700' }}>Ayarlar’ı Aç</Text>
          </Pressable>
        </View>
      )}

      {ayar.acik && izinDurumu === 'granted' && (
        <View style={stiller.saatGrubu}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Clock size={14} color={renk.onSurfaceVariant} />
            <Text style={{ fontSize: 12, color: renk.onSurfaceVariant, fontWeight: '600' }}>Hatırlatma Saati:</Text>
          </View>

          <View style={stiller.ciplerSatiri}>
            {SAAT_CIPLERI.map((saat) => {
              const secili = ayar.saat === saat;
              return (
                <Pressable
                  key={saat}
                  onPress={() => saatSec(saat)}
                  style={[
                    stiller.saatCip,
                    {
                      backgroundColor: secili ? renk.primary : renk.background,
                      borderColor: secili ? renk.primary : renk.outlineVariant,
                    },
                  ]}
                >
                  <Text
                    style={[
                      stiller.saatCipMetin,
                      { color: secili ? '#ffffff' : renk.onSurface },
                    ]}
                  >
                    {saat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const stiller = StyleSheet.create({
  kart: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  baslikSatir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  solBaslik: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kartBasligi: {
    fontSize: 16,
    fontWeight: '700',
  },
  kartAltBasligi: {
    fontSize: 13,
    lineHeight: 18,
  },
  saatGrubu: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.15)',
  },
  ciplerSatiri: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  saatCip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  saatCipMetin: {
    fontSize: 13,
    fontWeight: '600',
  },
  uyariKutusu: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginTop: 6,
  },
  uyariMetni: {
    fontSize: 12,
    flex: 1,
  },
  ayarlarButon: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
