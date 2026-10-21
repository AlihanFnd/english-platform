import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * İngilizce telaffuz — cihazın kendi ses motoruyla.
 *
 * Web'de bu `window.speechSynthesis` idi; mobilde karşılığı `expo-speech`
 * (iOS'ta AVSpeechSynthesizer, Android'de TextToSpeech). Dışarıya açılan yüzey
 * web'deki `useTelaffuz` ile BİREBİR aynı tutuldu ki ekran kodu iki istemcide
 * de aynı görünsün.
 *
 * NEDEN DIŞ SERVİS DEĞİL: cihazın motoru ücretsiz, anahtarsız ve çevrimdışı
 * çalışır. Bir TTS API'si yeni bir dış bağımlılık, yeni bir sır ve sesli
 * okunan metnin ağa çıkması demekti.
 */

/** Tek kelime için önerilen okuma hızı — biraz yavaş, harfler ayırt edilsin. */
export const KELIME_HIZI = 0.85;

export function useTelaffuz() {
  /** Şu an seslendirilen metin — buton durumunu göstermek için. */
  const [konusulan, setKonusulan] = useState<string | null>(null);
  const konusulanRef = useRef<string | null>(null);
  // Render sırasında ref yazmak React Compiler kuralına aykırı; en güncel değer
  // commit sonrası yazılır. Dokunma işleyicileri render'dan sonra çalıştığı için yeterli.
  useEffect(() => {
    konusulanRef.current = konusulan;
  }, [konusulan]);

  useEffect(() => {
    return () => {
      // Ekrandan çıkınca sesi kes: web'de okuma sayfasından çıkınca cümle
      // konuşmaya devam ediyordu, aynı hatayı buraya taşımıyoruz.
      Speech.stop().catch(() => {});
    };
  }, []);

  const durdur = useCallback(() => {
    Speech.stop().catch(() => {});
    setKonusulan(null);
  }, []);

  /**
   * Metni seslendirir.
   * @param hiz 1 = normal. Tek kelimede biraz yavaş okumak ayırt etmeyi kolaylaştırır.
   */
  const seslendir = useCallback(
    (metin: string, hiz = 1) => {
      const temiz = (metin ?? '').trim();
      if (!temiz) return;

      // Aynı metne ikinci kez basmak durdurur — kullanıcı sesi kesebilmeli.
      if (konusulanRef.current === temiz) {
        durdur();
        return;
      }

      Speech.stop().catch(() => {});
      setKonusulan(temiz);

      Speech.speak(temiz, {
        language: 'en-US',
        rate: hiz,
        onDone: () => setKonusulan(null),
        onStopped: () => setKonusulan(null),
        onError: () => setKonusulan(null),
      });
    },
    [durdur],
  );

  /** Bu metin şu anda seslendiriliyor mu? */
  const konusuyorMu = useCallback(
    (metin: string) => konusulan === (metin ?? '').trim(),
    [konusulan],
  );

  // Cihaz TTS'i her zaman vardır; alan web sürümüyle aynı kalsın diye duruyor.
  return { destekleniyor: true, seslendir, durdur, konusuyorMu };
}
