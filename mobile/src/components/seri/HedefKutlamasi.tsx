import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Flame, Trophy, X } from 'lucide-react-native';
import { useTema } from '@/context/ThemeContext';
import { useSeri } from '@/context/SeriContext';

export function HedefKutlamasi() {
  const { renk } = useTema();
  const { ozet, gosterKutlama, kutlamayiKapat } = useSeri();

  const olcek = useSharedValue(0.5);
  const opaklik = useSharedValue(0);

  useEffect(() => {
    if (gosterKutlama) {
      olcek.value = withSpring(1, { damping: 12, stiffness: 100 });
      opaklik.value = withTiming(1, { duration: 300 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      olcek.value = 0.5;
      opaklik.value = 0;
    }
  }, [gosterKutlama, olcek, opaklik]);

  const animasyonStil = useAnimatedStyle(() => ({
    opacity: opaklik.value,
    transform: [{ scale: olcek.value }],
  }));

  if (!gosterKutlama || !ozet) return null;

  return (
    <Modal transparent animationType="fade" visible={gosterKutlama} onRequestClose={kutlamayiKapat}>
      <View style={stiller.karartma}>
        <Animated.View
          style={[
            stiller.kart,
            { backgroundColor: renk.surfaceContainerLow, borderColor: renk.outlineVariant },
            animasyonStil,
          ]}
        >
          <Pressable onPress={kutlamayiKapat} style={stiller.kapatButon}>
            <X size={20} color={renk.onSurfaceVariant} />
          </Pressable>

          <View style={stiller.simgeAlani}>
            <Flame size={64} color="#f97316" fill="#f97316" />
            <View style={stiller.rozet}>
              <Trophy size={20} color="#ffffff" />
            </View>
          </View>

          <Text style={[stiller.baslik, { color: renk.onSurface }]}>
            Günlük Hedef Tamamlandı!
          </Text>

          <Text style={[stiller.aciklama, { color: renk.onSurfaceVariant }]}>
            Tebrikler! Bugüne ait {ozet.bugun.hedefXp} XP hedefini başarıyla tamamladın. 🔥 {ozet.mevcutSeri} Günlük Serin Korundu!
          </Text>

          <Pressable
            onPress={kutlamayiKapat}
            style={({ pressed }) => [
              stiller.devamButon,
              { backgroundColor: renk.primary, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={stiller.devamMetin}>Harika, Devam Et!</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const stiller = StyleSheet.create({
  karartma: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  kart: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  kapatButon: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 6,
  },
  simgeAlani: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  rozet: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  baslik: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  aciklama: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  devamButon: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  devamMetin: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#ffffff',
  },
});
