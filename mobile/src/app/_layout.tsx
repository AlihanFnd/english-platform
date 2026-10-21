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
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AgProvider } from '@/context/AgContext';
import { AuthProvider, useKorumaliYonlendirme } from '@/context/AuthContext';
import { SeriProvider } from '@/context/SeriContext';
import { ThemeProvider, useTema } from '@/context/ThemeContext';

import { HedefKutlamasi } from '@/components/seri/HedefKutlamasi';
import { YapilandirmaHatasi, yapilandirmaOku } from '@/lib/yapilandirma';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * YH-14 §2: üretim yapılandırma sözleşmesi AÇILIŞTA bir kez denetlenir. Üretim
 * JS'inde (__DEV__ false) EXPO_PUBLIC_API_URL / GIZLILIK_URL / KOSULLAR_URL eksik
 * ya da https değilse uygulama hiçbir isteğe geçmeden hata ekranında durur —
 * sessizce localhost'a düşüp "sunucuya ulaşılamadı" döngüsüne girmez.
 * Faz 3'te denetim yazılmış ama hiçbir yerden çağrılmıyordu.
 */
const YAPILANDIRMA_HATASI: string | null = (() => {
  try {
    yapilandirmaOku();
    return null;
  } catch (e) {
    return e instanceof YapilandirmaHatasi ? e.message : 'Uygulama yapılandırması okunamadı.';
  }
})();

/** Tema sağlayıcılarından ÖNCE çizilir; bu yüzden renkler sabit. */
function YapilandirmaHatasiEkrani({ mesaj }: { mesaj: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
        backgroundColor: '#101415',
      }}
    >
      <Text style={{ color: '#ffb4ab', fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center' }}>
        Yapılandırma hatası
      </Text>
      <Text style={{ color: '#e2e2e6', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>{mesaj}</Text>
    </View>
  );
}

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
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="seri" />
        <Stack.Screen name="books/[id]/index" />
        <Stack.Screen name="books/[id]/quiz" />
      </Stack>
      <HedefKutlamasi />
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
    if (yaziTipleriHazir || yaziTipiHatasi) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [yaziTipleriHazir, yaziTipiHatasi]);

  if (YAPILANDIRMA_HATASI) return <YapilandirmaHatasiEkrani mesaj={YAPILANDIRMA_HATASI} />;

  if (!yaziTipleriHazir && !yaziTipiHatasi) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AgProvider>
            <AuthProvider>
              <SeriProvider>
                <Yonlendirme />
              </SeriProvider>
            </AuthProvider>
          </AgProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
