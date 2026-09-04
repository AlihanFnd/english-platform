'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * İngilizce telaffuz — tarayıcının kendi ses motoruyla.
 *
 * NEDEN TEK HOOK: aynı `speak` işlevi okuyucu ve OCR sayfalarında birebir
 * kopyalanmıştı. Üçüncü kopyayı eklemek yerine tek yere taşındı; ses seçimi
 * ya da bir tarayıcı hatasının çözümü artık bir yerde düzeltiliyor.
 *
 * NEDEN DIŞ SERVİS DEĞİL: `speechSynthesis` tarayıcının içinde. Ücretsiz,
 * anahtarsız, çevrimdışı çalışır ve CSP'ye dokunmaz. Bir TTS API'si eklemek
 * yeni bir dış bağımlılık, yeni bir sır ve yeni bir hata yolu demekti.
 */

/** Tercih sırası: doğal İngilizce sesler önce. */
const TERCIHLI_SESLER = [
  'Google US English',
  'Google UK English Female',
  'Samantha',          // macOS
  'Microsoft Zira',    // Windows
  'Daniel',            // macOS en-GB
];

export function useTelaffuz() {
  const [destekleniyor, setDestekleniyor] = useState(false);
  /** Şu an seslendirilen metin — buton durumunu göstermek için. */
  const [konusulan, setKonusulan] = useState<string | null>(null);
  const sesRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    setDestekleniyor(true);

    // Chrome'da getVoices() ilk çağrıda BOŞ döner ve sesler asenkron yüklenir.
    // Bunu ele almazsak ilk tıklamada hep varsayılan (çoğu zaman kötü) ses çıkar.
    const sesleriSec = () => {
      const sesler = window.speechSynthesis.getVoices();
      if (sesler.length === 0) return;

      const ingilizce = sesler.filter(s => s.lang.toLowerCase().startsWith('en'));
      if (ingilizce.length === 0) return;

      sesRef.current =
        TERCIHLI_SESLER.map(ad => ingilizce.find(s => s.name.includes(ad))).find(Boolean) ??
        ingilizce.find(s => s.lang === 'en-US') ??
        ingilizce[0];
    };

    sesleriSec();
    window.speechSynthesis.addEventListener('voiceschanged', sesleriSec);

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', sesleriSec);
      // Sayfadan çıkınca sesi kes: eski uygulamada okuma sayfasından
      // çıktıktan sonra cümle konuşmaya devam ediyordu.
      window.speechSynthesis.cancel();
    };
  }, []);

  const durdur = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setKonusulan(null);
  }, []);

  /**
   * Metni seslendirir.
   * @param hiz 1 = normal. Tek kelimede biraz yavaş okumak ayırt etmeyi kolaylaştırır.
   */
  const seslendir = useCallback((metin: string, hiz = 1) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const temiz = metin.trim();
    if (!temiz) return;

    // Aynı metne ikinci kez basmak durdurur — kullanıcı sesi kesebilmeli.
    if (konusulan === temiz) {
      durdur();
      return;
    }

    window.speechSynthesis.cancel();

    const soyleme = new SpeechSynthesisUtterance(temiz);
    soyleme.lang = sesRef.current?.lang ?? 'en-US';
    if (sesRef.current) soyleme.voice = sesRef.current;
    soyleme.rate = hiz;

    soyleme.onend = () => setKonusulan(null);
    soyleme.onerror = () => setKonusulan(null);

    setKonusulan(temiz);
    window.speechSynthesis.speak(soyleme);
  }, [konusulan, durdur]);

  /** Bu metin şu anda seslendiriliyor mu? */
  const konusuyorMu = useCallback(
    (metin: string) => konusulan === metin.trim(),
    [konusulan],
  );

  return { destekleniyor, seslendir, durdur, konusuyorMu };
}

/** Tek kelime için önerilen okuma hızı — biraz yavaş, harfler ayırt edilsin. */
export const KELIME_HIZI = 0.85;
