import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { jetonSil } from './api';

import { temizleCevrimdisiDepo } from './cevrimdisiDepo';
import { temizleKuyruk } from './yazmaKuyrugu';

/**
 * YH-08: Tek yerel temizlik kancası.
 * Hesaptan çıkışta veya hesap silindiğinde cihaz üzerinde saklanan tüm
 * kişisel verileri, jetonları, ayarları ve bildirimleri temizler.
 */
export async function tumYerelVerileriTemizle(): Promise<void> {
  // 1. SecureStore jetonunu ve bellek içi kopyayı sil
  await jetonSil();

  // 2. Cihazdaki tüm AsyncStorage anahtarlarını temizle
  try {
    const tumAnahtarlar = await AsyncStorage.getAllKeys();
    const linguzaAnahtarlari = tumAnahtarlar.filter(
      (a) => a.startsWith('@linguza') || a.startsWith('linguza'),
    );
    if (linguzaAnahtarlari.length > 0) {
      await AsyncStorage.multiRemove(linguzaAnahtarlari);
    }
  } catch {
    /* Depolama hatasında sessizce ilerle */
  }

  // 3. Çevrimdışı önbelleği ve yazma kuyruğunu temizle (YH-13)
  try {
    await temizleCevrimdisiDepo();
    await temizleKuyruk();
  } catch {
    /* Hata durumunda yutulur */
  }

  // 4. Planlanmış bildirimleri iptal et (YH-07)
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* Bildirim modülü yoksa veya izin yoksa sorun değil */
  }
}
