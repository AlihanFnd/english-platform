import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useKorumaliYonlendirme } from '@/context/AuthContext';
import { ThemeProvider, useTema } from '@/context/ThemeContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Yönlendirme kararını veren iç bileşen.
 *
 * NEDEN AYRI: `useKorumaliYonlendirme` hem AuthProvider'ın hem de router'ın
 * İÇİNDE olmak zorunda. Kök bileşende çağrılırsa sağlayıcılar henüz kurulmamış olur.
 */
function Yonlendirme() {
  useKorumaliYonlendirme();
  const { renk, koyuMu } = useTema();

  return (
    <>
      <StatusBar style={koyuMu ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: renk.background },
          // iOS'ta yatay kaydırma ile geri gelme; Android'de donanım geri tuşu.
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="books/[id]/index" />
        <Stack.Screen name="books/[id]/quiz" />
      </Stack>
    </>
  );
}

export default function KokDuzen() {
  const [yaziTipleriHazir, yaziTipiHatasi] = useFonts({
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    // Yazı tipi yüklenemese bile açılış ekranı kapanmalı: sistem yazı tipiyle
    // çalışan bir uygulama, hiç açılmayan bir uygulamadan iyidir.
    if (yaziTipleriHazir || yaziTipiHatasi) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [yaziTipleriHazir, yaziTipiHatasi]);

  if (!yaziTipleriHazir && !yaziTipiHatasi) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <Yonlendirme />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
