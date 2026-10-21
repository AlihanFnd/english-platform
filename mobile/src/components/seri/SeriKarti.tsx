import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Flame, Sparkles, Trophy, Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTema } from '@/context/ThemeContext';
import { useSeri } from '@/context/SeriContext';
import { SeriAlevi } from './SeriAlevi';
import { HedefHalkasi } from './HedefHalkasi';
import { HaftaSeridi } from './HaftaSeridi';

export function SeriKarti() {
  const { renk } = useTema();
  const router = useRouter();
  const { ozet, yukleniyor } = useSeri();

  if (yukleniyor && !ozet) {
    return (
      <View style={[stiller.kart, { backgroundColor: renk.surfaceContainerLow, borderColor: renk.outlineVariant }]}>
        <Text style={[stiller.yukleniyorMetin, { color: renk.onSurfaceVariant }]}>Seri yükleniyor...</Text>
      </View>
    );
  }

  if (!ozet) return null;

  const { mevcutSeri, bugunAktif, seriRiskte, bugun, sonGunler } = ozet;
  const { xp, hedefXp, hedefTamamlandi } = bugun;

  const kalanXp = Math.max(0, hedefXp - xp);

  const durumMesaji = hedefTamamlandi
    ? '🎉 Bugünkü seri hedefini tamamladın!'
    : seriRiskte
    ? '🔥 Serin tehlikede — bugün 1 sayfa okuman yeter!'
    : kalanXp > 0
    ? `Bugün ${kalanXp} XP daha kazan → seri alevlensin`
    : 'Alevin parıldıyor, harika gidiyorsun!';

  return (
    <Pressable
      onPress={() => router.push('/seri')}
      accessibilityLabel={`Seri detayı: ${durumMesaji}`}
      accessibilityRole="button"
      style={({ pressed }) => [
        stiller.disKonteyner,
        { opacity: pressed ? 0.92 : 1 },
      ]}
    >
      <LinearGradient
        colors={
          seriRiskte
            ? ['#7f1d1d', '#450a0a']
            : bugunAktif
            ? ['#1e1b4b', '#0f172a']
            : ['#1e293b', '#0f172a']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          stiller.kart,
          {
            borderColor: seriRiskte ? '#ef4444' : bugunAktif ? '#f97316' : renk.outlineVariant,
            borderWidth: seriRiskte ? 2 : 1.5,
          },
        ]}
      >
        {/* Üst Satır Banner */}
        <View style={stiller.ustSatir}>
          <View style={stiller.seriBaslikAlani}>
            <SeriAlevi
              mevcutSeri={mevcutSeri}
              bugunAktif={bugunAktif}
              seriRiskte={seriRiskte}
              boyut="buyuk"
            />
            <View style={stiller.baslikMetinBlogu}>
              <Text style={stiller.seriEtiketi}>
                {bugunAktif ? 'SERİ ATEŞLENDİ! 🔥' : seriRiskte ? 'SERİ RİSKTE! ⚠️' : 'GÜNLÜK SERİ'}
              </Text>
              <Text style={stiller.seriSayisiMetni}>
                {mevcutSeri} <Text style={stiller.gunEki}>Günlük Seri</Text>
              </Text>
            </View>
          </View>

          <View style={stiller.sagKisim}>
            <HedefHalkasi
              xp={xp}
              hedefXp={hedefXp}
              boyut={58}
              etirKalinlik={5}
              tamamlandi={hedefTamamlandi}
            />
            <ChevronRight size={22} color="#94a3b8" />
          </View>
        </View>

        {/* Hafta Şeridi */}
        <HaftaSeridi
          sonGunler={sonGunler}
          bugunGun={bugun.gun}
          bugunAktif={bugunAktif}
          bugunHedefTamamlandi={hedefTamamlandi}
        />

        {/* Alt Motivasyon Çubuğu */}
        <View style={stiller.altSatir}>
          <Text
            style={[
              stiller.durumMetni,
              { color: seriRiskte ? '#fca5a5' : hedefTamamlandi ? '#4ade80' : '#cbd5e1' },
            ]}
            numberOfLines={1}
          >
            {durumMesaji}
          </Text>
          <View style={stiller.detayRozet}>
            <Zap size={14} color="#ff8c00" fill="#ff8c00" />
            <Text style={stiller.detayMetin}>Hedef</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const stiller = StyleSheet.create({
  disKonteyner: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 22,
    shadowColor: '#ff5500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  kart: {
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  yukleniyorMetin: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  ustSatir: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seriBaslikAlani: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  baslikMetinBlogu: {
    justifyContent: 'center',
  },
  seriEtiketi: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#ff8c00',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  seriSayisiMetni: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '800',
  },
  gunEki: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
  },
  sagKisim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  altSatir: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  durumMetni: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginRight: 8,
    fontWeight: '600',
  },
  detayRozet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.3)',
  },
  detayMetin: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#ff8c00',
  },
});
