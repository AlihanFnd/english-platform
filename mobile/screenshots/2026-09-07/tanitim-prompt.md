# Linguza — Tanıtım Videosu Promptu (drone / FPV geçişli)

Kaynak kareler: `mobile/screenshots/2026-09-07/*.png` (1206x2622, iPhone 17 Pro)
Hedef: 35–45 sn, 9:16 dikey (ayrıca 16:9 varyantı), 24 fps, sinematik.

---

## 1. MASTER PROMPT (tek parça üretim / text-to-video)

**English (üretici modeller İngilizce promptta daha tutarlı):**

> Cinematic FPV drone commercial for a mobile language-learning app called **Linguza**.
> A single floating iPhone 17 Pro hovers in a soft, out-of-focus studio void — warm off-white
> gradient background, subtle volumetric light, gentle dust motes. The drone camera flies in
> one continuous unbroken take: it swoops around the phone, dives toward the screen, pushes
> *through* the glass into the UI, glides across the interface as if it were an architectural
> space, then pulls back out and rotates to the next screen.
> The app UI is deep forest green (#0B6B3A family) on near-white surfaces, rounded cards,
> Inter / Plus Jakarta Sans typography, soft layered shadows.
> Camera language: smooth gimbal motion, slight parallax, shallow depth of field, natural
> motion blur, no shake. Speed ramps: fast whip between screens, slow ease-in when a screen
> is being read.
> Transitions: cards lift and separate in 3D layers (parallax dolly), UI elements slide in
> with 200 ms spring easing, whip-pan blur between sections, one match-cut through a
> progress bar, one transition where the phone rotates on its Y axis and the next screen is
> already alive on the other side.
> Lighting: soft key from top-left, cool rim light on the phone edges, screen glow spilling
> onto the phone bezel.
> Mood: premium, calm, confident — Apple-style product film, not a hype ad.
> No text overlays other than the UI itself. No people. No hands. No logos other than Linguza.

**Türkçe (aracın Türkçe kabul ettiği durumlar için):**

> Linguza adlı mobil İngilizce okuma uygulaması için sinematik FPV drone reklamı. Yumuşak,
> odak dışı bir stüdyo boşluğunda havada asılı duran tek bir iPhone. Drone kamera tek bir
> kesintisiz çekimde telefonun etrafında süzülüyor, ekrana dalıyor, camın içinden arayüze
> giriyor, arayüzü bir mimari mekân gibi kat ediyor, sonra geri çekilip bir sonraki ekrana
> dönüyor. Arayüz koyu orman yeşili + kırık beyaz, yuvarlatılmış kartlar, yumuşak gölgeler.
> Kamera: pürüzsüz gimbal, hafif paralaks, sığ alan derinliği, doğal motion blur, titreme yok.
> Ton: premium, sakin, kendinden emin. İnsan yok, el yok, yazı bindirmesi yok.

---

## 2. SHOT LİSTESİ (image-to-video: her satır 1 görsel + 1 prompt)

| # | Görsel | Süre | Shot promptu (İngilizce) |
|---|---|---|---|
| 01 | `01-panel.png` | 4 sn | Drone rises from below the floating phone, tilts up and eases into a straight-on hero framing. The dashboard cards settle in with a soft spring; the progress bar fills from 0% to 11% as the camera stops. Slow push-in. |
| 02 | `02-kitaplik.png` | 3 sn | Whip-pan to the right with motion blur; camera flies low across the library list like a drone over rooftops, book cards passing beneath the lens in parallax. Ends centered on the search bar. |
| 03 | `09-kitap-okuyucu.png` | 4 sn | Camera dives *into* a book card and emerges inside the reader. Slow vertical crane down the English paragraphs, text lines sliding past in shallow focus, one sentence highlighting green as the camera passes it. |
| 04 | `10-kelime-paneli.png` | 3 sn | A word on the page pulses; camera snaps down and the translation card rises from the bottom edge into frame with a soft spring, camera settling into a slight low-angle hero shot of the card. |
| 05 | `03-kelimelerim.png` | 3 sn | Pull back out of the reader, phone rotates 180° on its Y axis, and the vocabulary screen is already alive on the other side. Stat counters (3 / 1 / 0) roll up like odometers. |
| 06 | `12-kelime-pratigi.png` | 3 sn | Camera orbits the flashcard as it flips in 3D from English to Turkish; shallow depth of field, card edge catching a rim light. |
| 07 | `11-quiz.png` | 3 sn | Fast dolly down the quiz options; each answer row lights up in sequence with a green glow, camera ends on the submit button as it pulses once. |
| 08 | `04-metin-tara.png` | 3 sn | Drone swoops in from the top; a scanning line sweeps across the OCR screen, phone tilting slightly toward camera as if catching light. |
| 09 | `05-gruplar.png` | 2.5 sn | Lateral drift shot, camera gliding sideways past the empty-state card; the two action buttons slide in from opposite edges. |
| 10 | `06-profil.png` | 2.5 sn | Camera tilts down as the profile sheet slides up from the bottom of the phone, overshooting slightly then settling. |
| 11 | `07-profil-karanlik.png` → `08-panel-karanlik.png` | 3 sn | Match-cut on the theme toggle: the entire UI ripples from light to dark in a circular wipe originating at the moon icon, camera pushing in through the ripple onto the dark dashboard. |
| 12 | `01-panel.png` | 4 sn | Final pull-out: drone retreats and rises, phone shrinks to center frame, background fades to deep green; slow, calm, ending on stillness. Room at bottom third for a logo lockup. |

---

## 3. GEÇİŞ SÖZLÜĞÜ (araca ayrı ayrı verilebilir)

- **whip pan** — hızlı yatay kaydırma + motion blur (ekranlar arası)
- **screen dive** — kamera ekran camından içeri girer (kitaplık → okuyucu)
- **Y-axis flip** — telefon kendi ekseninde döner, arka yüzde sonraki ekran hazır
- **parallax dolly** — kartlar 3B katmanlar halinde ayrışır, kamera aralarından geçer
- **circular ripple wipe** — tema değişimi (ay ikonundan yayılan dalga)
- **speed ramp** — geçişte hızlan, okunacak ekranda yavaşla

## 4. SES / MÜZİK
> Minimal ambient electronic, warm analog pad, soft sub-bass pulse at 90 BPM. Subtle UI
> foley: soft taps, a light whoosh on each transition, one warm chime on the final pull-out.
> No voiceover.

## 5. NEGATIVE PROMPT
> no warped or gibberish text, no melting UI, no extra fingers or hands, no people, no
> distorted phone geometry, no logo hallucination, no camera shake, no lens flare spam,
> no oversaturated colors, no watermark, no subtitles
