import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { SeriOzeti, api } from './api';

export interface HatirlatmaAyari {
  acik: boolean;
  saat: string; // "08:00", "12:00", "18:00", "20:00", "21:00"
}

export interface PlanliBildirim {
  tur: 'hatirlatma' | 'risk';
  baslik: string;
  govde: string;
  zaman: Date;
}

const STORAGE_KEY = 'linguza_hatirlatma';
const VARSAYILAN_AYAR: HatirlatmaAyari = {
  acik: true,
  saat: '20:00',
};

// Bildirim davranış ayarı
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Saf planlama işlevi (YH-07)
 */
export function hatirlatmaPlani(
  ozet: SeriOzeti,
  simdi: Date,
  ayar: HatirlatmaAyari
): PlanliBildirim[] {
  if (!ayar.acik) return [];

  const [hStr, mStr] = (ayar.saat || '20:00').split(':');
  const h = parseInt(hStr || '20', 10);
  const m = parseInt(mStr || '0', 10);

  const bugunSaat = new Date(simdi);
  bugunSaat.setHours(h, m, 0, 0);

  const yarinSaat = new Date(simdi);
  yarinSaat.setDate(yarinSaat.getDate() + 1);
  yarinSaat.setHours(h, m, 0, 0);

  const planlar: PlanliBildirim[] = [];
  const hedefTamamlandi = ozet.bugun?.hedefTamamlandi ?? false;

  // Bugün hedef tamamlandıysa bugün uyarısı çıkmaz, sadece yarın ayar.saat'e hatırlatma kurulur
  if (hedefTamamlandi) {
    planlar.push({
      tur: 'hatirlatma',
      baslik: 'Linguza 📖',
      govde: 'Bugünkü 5 dakikan seni bekliyor.',
      zaman: yarinSaat,
    });
    return planlar;
  }

  // Bugün hedef henüz tamamlanmadı
  if (simdi < bugunSaat) {
    planlar.push({
      tur: 'hatirlatma',
      baslik: 'Linguza 📖',
      govde: 'Bugünkü 5 dakikan seni bekliyor.',
      zaman: bugunSaat,
    });
  }

  // Seri riskteyse (veya seri > 0 ise) ve bugün 21:30 geçmediyse risk uyarısı eklenir
  if (ozet.seriRiskte || ozet.mevcutSeri > 0) {
    const bugun2130 = new Date(simdi);
    bugun2130.setHours(21, 30, 0, 0);

    if (simdi < bugun2130) {
      planlar.push({
        tur: 'risk',
        baslik: `🔥 ${ozet.mevcutSeri} günlük serin`,
        govde: 'Bugün bir sayfa okuman seriyi korur.',
        zaman: bugun2130,
      });
    }
  }

  // Yarın için hatırlatma
  planlar.push({
    tur: 'hatirlatma',
    baslik: 'Linguza 📖',
    govde: 'Bugünkü 5 dakikan seni bekliyor.',
    zaman: yarinSaat,
  });

  return planlar;
}

export async function getHatirlatmaAyarlari(): Promise<HatirlatmaAyari> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return VARSAYILAN_AYAR;
    return JSON.parse(raw);
  } catch {
    return VARSAYILAN_AYAR;
  }
}

export async function saveHatirlatmaAyarlari(ayar: HatirlatmaAyari): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ayar));
  } catch {}
}

export async function cancelAllHatirlatmalar(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

export async function syncHatirlatmalar(ozetParam?: SeriOzeti | null): Promise<void> {
  try {
    // YH-07 zorunluluğu: Önce tüm mevcut planlanmış bildirimler iptal edilir
    await Notifications.cancelAllScheduledNotificationsAsync();

    const ayar = await getHatirlatmaAyarlari();
    if (!ayar.acik) return;

    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;

    const ozet = ozetParam ?? (await api.getSeri().catch(() => null));
    if (!ozet) return;

    // Android kanal ayarı
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('gunluk-hatirlatma', {
        name: 'Günlük Hatırlatma',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const planlar = hatirlatmaPlani(ozet, new Date(), ayar);
    for (const item of planlar) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: item.baslik,
          body: item.govde,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.zaman,
        },
      });
    }
  } catch (err) {
    console.warn('Bildirim senkronizasyon hatası:', err);
  }
}
