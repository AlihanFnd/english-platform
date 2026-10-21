import * as Haptics from 'expo-haptics';
import {
  Award,
  Brain,
  CheckCircle2,
  RefreshCw,
  Volume2,
  X,
  XCircle,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Buton, EkranZemini, Kart, Metin } from '@/components/ui';
import { useSeri } from '@/context/SeriContext';
import { useRenk } from '@/context/ThemeContext';
import { useTelaffuz } from '@/hooks/useTelaffuz';
import { CumleItem, WordItem, api } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

const YEDEK_CELDIRICILER = [
  { word: 'journey', translation: 'yolculuk' },
  { word: 'courage', translation: 'cesaret' },
  { word: 'freedom', translation: 'özgürlük' },
  { word: 'discovery', translation: 'keşif' },
  { word: 'whisper', translation: 'fısıltı' },
  { word: 'curiosity', translation: 'merak' },
  { word: 'silence', translation: 'sessizlik' },
  { word: 'promise', translation: 'söz, vaat' },
  { word: 'adventure', translation: 'macera' },
  { word: 'patience', translation: 'sabır' },
  { word: 'memory', translation: 'anı, hafıza' },
  { word: 'treasure', translation: 'hazine' },
];

/** Metinden tekrarlanabilir [0, 1) üreteci (mulberry32). Saf: aynı tohum aynı diziyi verir. */
function tohumluRastgele(tohum: string): () => number {
  let h = 1779033703 ^ tohum.length;
  for (let i = 0; i < tohum.length; i++) {
    h = Math.imul(h ^ tohum.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates. `sort(() => 0.5 - Math.random())` hem saf değil hem dağılımı yanlı. */
function karistir<T>(dizi: T[], rastgele: () => number): T[] {
  const kopya = [...dizi];
  for (let i = kopya.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    [kopya[i], kopya[j]] = [kopya[j], kopya[i]];
  }
  return kopya;
}

export interface QuizOgesi {
  id: string | number;
  original: string;
  translation: string;
  context?: string;
  dogruSeri: number;
  kutu?: number;
  ogrenildi: boolean;
}

export interface QuizPratikModaliProps {
  acik: boolean;
  kapat: () => void;
  mod: 'flashcard' | 'test';
  ogeler: QuizOgesi[];
  aktifSekme: 'kelime' | 'cumle';
  userId?: number | string;
  onCevapKaydedildi: () => void;
  tekrarDene: () => void;
  tumKelimeler: WordItem[];
  tumCumleler: CumleItem[];
}

export function QuizPratikModali({
  acik,
  kapat,
  mod,
  ogeler,
  aktifSekme,
  userId,
  onCevapKaydedildi,
  tekrarDene,
  tumKelimeler,
  tumCumleler,
}: QuizPratikModaliProps) {
  const palet = useRenk();
  const kenar = useSafeAreaInsets();
  const { seslendir, konusuyorMu } = useTelaffuz();
  const { puanOlayi } = useSeri();

  const [sira, setSira] = useState(0);
  const [cevapAcik, setCevapAcik] = useState(false);
  const [skor, setSkor] = useState({ dogru: 0, yanlis: 0 });

  const [secilenSik, setSecilenSik] = useState<string | null>(null);
  const [siklarKilitli, setSiklarKilitli] = useState(false);

  const suankiOge = ogeler[sira];
  const bitti = sira >= ogeler.length;

  useEffect(() => {
    if (acik) {
      setSira(0);
      setCevapAcik(false);
      setSkor({ dogru: 0, yanlis: 0 });
      setSecilenSik(null);
      setSiklarKilitli(false);
    }
  }, [acik]);

  const siklar = useMemo(() => {
    if (!suankiOge) return [];

    const dogru = suankiOge.original;
    const digerAdaylar =
      aktifSekme === 'kelime'
        ? tumKelimeler.map((k) => k.word).filter((w) => w.toLowerCase() !== dogru.toLowerCase())
        : tumCumleler.map((c) => c.cumle).filter((s) => s.toLowerCase() !== dogru.toLowerCase());

    const havuz = [
      ...digerAdaylar,
      ...YEDEK_CELDIRICILER.map((y) => y.word).filter((w) => w.toLowerCase() !== dogru.toLowerCase()),
    ];

    // Karıştırma SORUYA BAĞLI ve tekrarlanabilir: render içinde Math.random saf
    // değildir (React Compiler) ve aynı soru yeniden çizildiğinde şıkların yeri
    // değişirdi. Tohum sorunun kimliği ve sırasından türetilir.
    const rastgele = tohumluRastgele(`${suankiOge.id}:${sira}`);
    const karisikHavuz = karistir([...new Set(havuz)], rastgele);
    const celdirmeler = karisikHavuz.slice(0, 3);

    return karistir([dogru, ...celdirmeler], rastgele);
  }, [suankiOge, sira, aktifSekme, tumKelimeler, tumCumleler]);

  const kaydiArkadaGonder = (id: string | number, bildim: boolean) => {
    if (aktifSekme === 'kelime') {
      api.kaydetCalismaSonucu(Number(id), bildim).then(() => {
        puanOlayi();
        onCevapKaydedildi();
      }).catch(() => {});
    } else {
      api.kaydetCumleCalismaSonucu(Number(id), bildim).then(() => {
        puanOlayi();
        onCevapKaydedildi();
      }).catch(() => {});
    }
  };

  const sonrakiSoruyaGec = () => {
    setSira((s) => s + 1);
    setSecilenSik(null);
    setSiklarKilitli(false);
    setCevapAcik(false);
  };

  const sikSec = (secim: string) => {
    if (siklarKilitli || !suankiOge) return;
    setSiklarKilitli(true);
    setSecilenSik(secim);

    const dogruMu = secim.toLowerCase().trim() === suankiOge.original.toLowerCase().trim();

    if (dogruMu) {
      setSkor((s) => ({ ...s, dogru: s.dogru + 1 }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      setSkor((s) => ({ ...s, yanlis: s.yanlis + 1 }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }

    kaydiArkadaGonder(suankiOge.id, dogruMu);

    setTimeout(() => {
      sonrakiSoruyaGec();
    }, 800);
  };

  const flashcardCevap = (bildim: boolean) => {
    if (!suankiOge) return;
    if (bildim) {
      setSkor((s) => ({ ...s, dogru: s.dogru + 1 }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      setSkor((s) => ({ ...s, yanlis: s.yanlis + 1 }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
    }

    kaydiArkadaGonder(suankiOge.id, bildim);
    sonrakiSoruyaGec();
  };

  const basariYuzdesi =
    ogeler.length > 0 ? Math.round((skor.dogru / (skor.dogru + skor.yanlis || 1)) * 100) : 0;

  return (
    <Modal visible={acik} animationType="slide" onRequestClose={kapat}>
      <EkranZemini>
        <View
          style={{
            flex: 1,
            paddingTop: kenar.top + Bosluk.sm,
            paddingBottom: kenar.bottom + Bosluk.md,
            paddingHorizontal: Bosluk.lg,
            gap: Bosluk.md,
          }}
        >
          {/* Üst Başlık Barı */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
            <Brain size={18} color={palet.primary} />
            <Metin tur="altBaslik" renk={palet.primary} style={{ flex: 1 }}>
              {mod === 'test' ? '🎯 Çoktan Seçmeli Test' : '🎴 Flashcard'}
            </Metin>
            <Pressable
              onPress={kapat}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              style={{ padding: 4 }}
            >
              <X size={22} color={palet.onSurfaceVariant} />
            </Pressable>
          </View>

          {bitti ? (
            /* ── TEST SONU KARNESİ ── */
            <ScrollView contentContainerStyle={{ gap: Bosluk.lg, paddingBottom: Bosluk.xl }}>
              <Kart style={{ alignItems: 'center', gap: Bosluk.md, paddingVertical: Bosluk.xl }}>
                <Award size={48} color="#eab308" />
                <Metin tur="baslik" ortala>
                  Tebrikler, Tamamladın!
                </Metin>

                <View style={{ flexDirection: 'row', gap: Bosluk.md, alignSelf: 'stretch' }}>
                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.success, 0.12),
                    }}
                  >
                    <Metin tur="minik" renk={palet.success}>
                      DOĞRU
                    </Metin>
                    <Metin tur="devasa" renk={palet.success}>
                      {skor.dogru}
                    </Metin>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.error, 0.12),
                    }}
                  >
                    <Metin tur="minik" renk={palet.error}>
                      YANLIŞ
                    </Metin>
                    <Metin tur="devasa" renk={palet.error}>
                      {skor.yanlis}
                    </Metin>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      padding: Bosluk.md,
                      borderRadius: Yaricap.md,
                      backgroundColor: alpha(palet.primary, 0.12),
                    }}
                  >
                    <Metin tur="minik" renk={palet.primary}>
                      BAŞARI
                    </Metin>
                    <Metin tur="devasa" renk={palet.primary}>
                      %{basariYuzdesi}
                    </Metin>
                  </View>
                </View>
              </Kart>

              <View style={{ flexDirection: 'row', gap: Bosluk.sm, justifyContent: 'center' }}>
                <Buton baslik="Kapat" tur="ikincil" onPress={kapat} />
                <Buton
                  baslik="Tekrar Başlat"
                  ikon={<RefreshCw size={14} color={palet.onPrimary} />}
                  onPress={tekrarDene}
                />
              </View>
            </ScrollView>
          ) : suankiOge ? (
            /* ── TEST / FLASHCARD AKIŞI ── */
            <View style={{ flex: 1, gap: Bosluk.md }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    paddingHorizontal: Bosluk.md,
                    paddingVertical: 3,
                    borderRadius: Yaricap.tam,
                    backgroundColor: alpha(palet.primary, 0.12),
                  }}
                >
                  <Metin tur="minik" renk={palet.primary}>
                    SORU {sira + 1} / {ogeler.length}
                  </Metin>
                </View>

                <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                  <Metin tur="minik" renk={palet.success}>
                    ✓ {skor.dogru}
                  </Metin>
                  <Metin tur="minik" renk={palet.error}>
                    ✗ {skor.yanlis}
                  </Metin>
                </View>
              </View>

              {mod === 'test' ? (
                /* ── ÇOKTAN SEÇMELİ TEST ── */
                <View style={{ flex: 1, gap: Bosluk.md, justifyContent: 'center' }}>
                  <Kart
                    vurgulu
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: Bosluk.xl,
                      gap: 4,
                    }}
                  >
                    <Metin tur="minik" renk={palet.primary}>
                      BU İFADENİN İNGİLİZCESİ NEDİR?
                    </Metin>
                    <Metin
                      tur={aktifSekme === 'kelime' ? 'devasa' : 'altBaslik'}
                      ortala
                      style={{ fontSize: aktifSekme === 'kelime' ? 26 : 18 }}
                    >
                      {suankiOge.translation}
                    </Metin>
                  </Kart>

                  {/* 4 Şık */}
                  <View style={{ gap: Bosluk.sm }}>
                    {siklar.map((secim, idx) => {
                      const dogruMu =
                        secim.toLowerCase().trim() === suankiOge.original.toLowerCase().trim();
                      const buSecildi = secilenSik === secim;

                      let arkaRenk = palet.surfaceContainer;
                      let kenarRenk = palet.outlineVariant;
                      let yaziRenk = palet.onSurface;

                      if (siklarKilitli) {
                        if (dogruMu) {
                          arkaRenk = alpha(palet.success, 0.18);
                          kenarRenk = palet.success;
                          yaziRenk = palet.success;
                        } else if (buSecildi) {
                          arkaRenk = alpha(palet.error, 0.18);
                          kenarRenk = palet.error;
                          yaziRenk = palet.error;
                        }
                      }

                      const harfler = ['A', 'B', 'C', 'D'];

                      return (
                        <Pressable
                          key={secim + idx}
                          disabled={siklarKilitli}
                          onPress={() => sikSec(secim)}
                          accessibilityRole="button"
                          accessibilityLabel={`Şık ${harfler[idx]}: ${secim}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: Bosluk.md,
                            borderRadius: Yaricap.md,
                            backgroundColor: arkaRenk,
                            borderWidth: 1.5,
                            borderColor: kenarRenk,
                            gap: Bosluk.md,
                          }}
                        >
                          <View
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: Yaricap.tam,
                              backgroundColor: buSecildi
                                ? dogruMu
                                  ? palet.success
                                  : palet.error
                                : alpha(palet.primary, 0.1),
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Metin
                              tur="minik"
                              renk={buSecildi ? '#ffffff' : palet.primary}
                            >
                              {harfler[idx]}
                            </Metin>
                          </View>

                          <Metin
                            tur="govde"
                            renk={yaziRenk}
                            style={{ flex: 1, fontWeight: '600' }}
                          >
                            {secim}
                          </Metin>

                          {siklarKilitli && dogruMu ? (
                            <CheckCircle2 size={16} color={palet.success} />
                          ) : siklarKilitli && buSecildi ? (
                            <XCircle size={16} color={palet.error} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : (
                /* ── FLASHCARD MODU ── */
                <View style={{ flex: 1, gap: Bosluk.md }}>
                  <Pressable
                    onPress={() => setCevapAcik((a) => !a)}
                    accessibilityRole="button"
                    accessibilityLabel="Kartı çevir ve anlamını gör"
                    style={{ flex: 1 }}
                  >
                    <Kart
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: Bosluk.md,
                      }}
                    >
                      {!cevapAcik ? (
                        <>
                          <View
                            style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.md }}
                          >
                            <Metin
                              tur={aktifSekme === 'kelime' ? 'devasa' : 'altBaslik'}
                              ortala
                              style={{ fontSize: aktifSekme === 'kelime' ? 30 : 20 }}
                            >
                              {suankiOge.original}
                            </Metin>
                            <Pressable
                              onPress={() => seslendir(suankiOge.original)}
                              hitSlop={10}
                              accessibilityRole="button"
                              accessibilityLabel={`Sesli oku: ${suankiOge.original}`}
                              style={{ padding: 6 }}
                            >
                              <Volume2
                                size={22}
                                color={
                                  konusuyorMu(suankiOge.original)
                                    ? palet.primary
                                    : palet.onSurfaceVariant
                                }
                              />
                            </Pressable>
                          </View>
                          <Metin tur="minik" ikincil>
                            ANLAMI GÖRMEK İÇİN DOKUN
                          </Metin>
                        </>
                      ) : (
                        <View style={{ alignItems: 'center', gap: Bosluk.sm }}>
                          <Metin tur="etiket" renk={palet.primary}>
                            Türkçe Karşılığı
                          </Metin>
                          <Metin
                            tur={aktifSekme === 'kelime' ? 'buyuk' : 'baslik'}
                            ortala
                            style={{ fontSize: 22 }}
                          >
                            {suankiOge.translation}
                          </Metin>
                          {typeof suankiOge.kutu === 'number' ? (
                            <View
                              style={{
                                marginTop: 6,
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: Yaricap.tam,
                                backgroundColor: alpha(palet.primary, 0.12),
                              }}
                            >
                              <Metin tur="minik" renk={palet.primary}>
                                {suankiOge.kutu}. kutu · {suankiOge.kutu === 0 ? 'Henüz çalışılmadı' : `${[0, 1, 2, 4, 7, 15, 30, 60][Math.min(suankiOge.kutu, 7)]} gün sonra tekrar`}
                              </Metin>
                            </View>
                          ) : null}
                        </View>
                      )}
                    </Kart>
                  </Pressable>

                  <View style={{ flexDirection: 'row', gap: Bosluk.md }}>
                    <Buton
                      baslik="Bilmiyorum"
                      tur="tehlike"
                      style={{ flex: 1 }}
                      onPress={() => flashcardCevap(false)}
                    />
                    <Buton
                      baslik="Biliyorum"
                      style={{ flex: 1 }}
                      onPress={() => flashcardCevap(true)}
                    />
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </EkranZemini>
    </Modal>
  );
}
