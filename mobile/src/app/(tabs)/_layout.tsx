import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router/js-tabs';
import { BookMarked, BookOpen, FileSearch, GraduationCap, LayoutDashboard } from 'lucide-react-native';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useTema } from '@/context/ThemeContext';
import { useEtkinlikTakibi } from '@/hooks/useEtkinlikTakibi';
import { alpha } from '@/theme/palette';
import { Olcek, YaziTipi } from '@/theme/tokens';

/**
 * Alt sekme çubuğu — web'deki yan menünün mobil karşılığı.
 * Sıra ve adlar web'deki `navItems` ile birebir aynı tutuldu.
 */
export default function SekmeDuzeni() {
  const { renk, koyuMu } = useTema();

  // Etkinlik nabzı burada kuruluyor: bütün sekmeler bu düzenin altında.
  useEtkinlikTakibi();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: renk.primary,
        tabBarInactiveTintColor: renk.onSurfaceVariant,
        tabBarLabelStyle: { fontFamily: YaziTipi.govdeYariKalin, fontSize: Olcek.minik },
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: renk.outlineVariant,
          // Bulanık zemin ancak arkası saydamsa görünür.
          backgroundColor: Platform.OS === 'android' ? renk.surfaceContainerLow : 'transparent',
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView
              tint={koyuMu ? 'dark' : 'light'}
              intensity={70}
              style={[StyleSheet.absoluteFill, { backgroundColor: alpha(renk.surface, 0.35) }]}
            />
          ) : null,
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="books"
        options={{
          title: 'Kitaplık',
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="words"
        options={{
          title: 'Kelimelerim',
          tabBarIcon: ({ color, size }) => <BookMarked size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ocr"
        options={{
          title: 'Metin Tara',
          tabBarIcon: ({ color, size }) => <FileSearch size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Gruplar',
          tabBarIcon: ({ color, size }) => <GraduationCap size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
