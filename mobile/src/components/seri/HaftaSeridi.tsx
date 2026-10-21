import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, Flame } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTema } from '@/context/ThemeContext';
import { SonGunOzeti } from '@/lib/api';

interface HaftaSeridiProps {
  sonGunler: SonGunOzeti[];
  bugunGun: string; // YYYY-MM-DD
  bugunAktif: boolean;
  bugunHedefTamamlandi: boolean;
}

const GUN_ETIKETLERI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function HaftaSeridi({
  sonGunler,
  bugunGun,
  bugunAktif,
  bugunHedefTamamlandi,
}: HaftaSeridiProps) {
  const { renk } = useTema();

  const bugunTarih = new Date(bugunGun + 'T00:00:00Z');
  const gunIndeks = (bugunTarih.getUTCDay() + 6) % 7; // 0=Pzt...6=Paz

  const haftaninGunleri = GUN_ETIKETLERI.map((etiket, i) => {
    const fark = i - gunIndeks;
    const gTarih = new Date(bugunTarih);
    gTarih.setUTCDate(gTarih.getUTCDate() + fark);
    const isoGun = gTarih.toISOString().split('T')[0];

    const bugunMu = isoGun === bugunGun;
    const kayit = sonGunler.find((s) => s.gun === isoGun);

    const aktif = bugunMu ? bugunAktif : (kayit?.xp ?? 0) > 0;
    const hedefTamam = bugunMu ? bugunHedefTamamlandi : (kayit?.hedefTamamlandi ?? false);

    return {
      etiket,
      isoGun,
      bugunMu,
      aktif,
      hedefTamam,
    };
  });

  return (
    <View style={stiller.kapsayici}>
      {haftaninGunleri.map((item, idx) => (
        <View key={idx} style={stiller.gunSutunu}>
          <Text
            style={[
              stiller.etiketMetin,
              { color: item.bugunMu ? '#ff5500' : renk.onSurfaceVariant },
              item.bugunMu && stiller.bugunEtiket,
            ]}
          >
            {item.etiket}
          </Text>

          {item.hedefTamam ? (
            <LinearGradient
              colors={['#22c55e', '#16a34a']}
              style={[stiller.daire, stiller.parlama]}
            >
              <Check size={15} color="#ffffff" strokeWidth={3.5} />
            </LinearGradient>
          ) : item.aktif ? (
            <LinearGradient
              colors={['#ff8c00', '#ff4500']}
              style={[stiller.daire, stiller.parlamaAlev]}
            >
              <Flame size={15} color="#ffffff" fill="#ffffff" />
            </LinearGradient>
          ) : item.bugunMu ? (
            <View style={[stiller.daire, stiller.bugunBosDaire, { borderColor: '#ff5500' }]}>
              <View style={stiller.bugunAlevNokta} />
            </View>
          ) : (
            <View style={[stiller.daire, { backgroundColor: renk.surfaceContainerHigh, borderColor: renk.outlineVariant }]} />
          )}
        </View>
      ))}
    </View>
  );
}

const stiller = StyleSheet.create({
  kapsayici: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  gunSutunu: {
    alignItems: 'center',
    gap: 6,
  },
  etiketMetin: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  bugunEtiket: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontWeight: '800',
  },
  daire: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  parlama: {
    borderColor: '#4ade80',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 3,
  },
  parlamaAlev: {
    borderColor: '#ffaa00',
    shadowColor: '#ff5500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  bugunBosDaire: {
    borderWidth: 2.5,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255, 85, 0, 0.08)',
  },
  bugunAlevNokta: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff5500',
  },
});
