import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Award, CheckCircle2, HelpCircle, RefreshCw, XCircle } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Buton, EkranZemini, HataKutusu, Kart, Metin, Rozet, Yukleniyor } from '@/components/ui';
import { useSeri } from '@/context/SeriContext';
import { useRenk } from '@/context/ThemeContext';
import { Quiz, api } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

const HARFLER = ['A', 'B', 'C', 'D'];

interface Sonuc {
  score: number;
  total: number;
  evaluation: Array<{
    questionId: number;
    questionText: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
}

export default function QuizEkrani() {
  const palet = useRenk();
  const router = useRouter();
  const { chapterId } = useLocalSearchParams<{ id: string; chapterId?: string }>();
  const bolumId = Number(chapterId ?? 0);
  const { puanOlayi } = useSeri();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [cevaplar, setCevaplar] = useState<Record<number, string>>({});
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [uyari, setUyari] = useState('');

  const yukle = useCallback(async () => {
    if (!bolumId) {
      setHata('Geçersiz bölüm parametresi.');
      setYukleniyor(false);
      return;
    }
    setYukleniyor(true);
    try {
      setQuiz(await api.getQuiz(bolumId));
      setHata('');
    } catch (e) {
      setHata((e as Error).message || 'Quiz yüklenirken veya oluşturulurken hata oluştu.');
    } finally {
      setYukleniyor(false);
    }
  }, [bolumId]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const gonder = async () => {
    if (!quiz || sonuc) return;
    if (Object.keys(cevaplar).length < quiz.questions.length) {
      setUyari('Lütfen tüm soruları cevapla.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setUyari('');
    setGonderiliyor(true);
    try {
      const veri = await api.submitQuiz(quiz.id, cevaplar);
      setSonuc(veri);
      puanOlayi();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setUyari((e as Error).message || 'Quiz gönderilirken hata oluştu.');
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <EkranZemini>
      <SafeAreaView style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Bosluk.sm,
            paddingHorizontal: Bosluk.md,
            paddingVertical: Bosluk.sm,
            borderBottomWidth: 1,
            borderBottomColor: palet.outlineVariant,
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
            <ArrowLeft size={20} color={palet.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Metin tur="altBaslik" numberOfLines={1}>
              {quiz?.title ?? 'Quiz'}
            </Metin>
            <Metin tur="minik" ikincil>
              Okuduğun bölümle ilgili anlama testi
            </Metin>
          </View>
          <Rozet metin="Quiz Odası" ikon={<HelpCircle size={11} color={palet.primary} />} />
        </View>

        {yukleniyor ? (
          <Yukleniyor mesaj="Yapay zekâ soruları üretiyor veya yüklüyor…" />
        ) : hata ? (
          <View style={{ padding: Bosluk.lg, gap: Bosluk.lg }}>
            <HataKutusu mesaj={hata} />
            <Buton baslik="Geri Dön" tur="ikincil" onPress={() => router.back()} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: Bosluk.lg, gap: Bosluk.md, paddingBottom: Bosluk.xxxl }}
          >
            {sonuc ? (
              <>
                <Animated.View entering={FadeInDown.duration(320)}>
                  <Kart style={{ alignItems: 'center', gap: Bosluk.md }}>
                    <Award size={44} color={palet.primary} />
                    <Metin tur="baslik">Quiz Tamamlandı!</Metin>
                    <Metin tur="devasa" renk={palet.primary}>
                      {sonuc.score} / {sonuc.total}
                    </Metin>
                    <Metin tur="kucuk" ikincil>
                      Başarı oranı: %{Math.round((sonuc.score / Math.max(1, sonuc.total)) * 100)}
                    </Metin>
                    <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                      <Buton
                        baslik="Yeniden Çöz"
                        tur="ikincil"
                        kucuk
                        ikon={<RefreshCw size={14} color={palet.onSurface} />}
                        onPress={() => {
                          setSonuc(null);
                          setCevaplar({});
                        }}
                      />
                      <Buton baslik="Kitaba Dön" kucuk onPress={() => router.back()} />
                    </View>
                  </Kart>
                </Animated.View>

                <Metin tur="etiket" ikincil style={{ marginTop: Bosluk.sm }}>
                  Cevap Anahtarı
                </Metin>

                {sonuc.evaluation.map((degerlendirme, sira) => {
                  const soru = quiz?.questions.find((s) => s.id === degerlendirme.questionId);
                  return (
                    <Animated.View
                      key={degerlendirme.questionId}
                      entering={FadeInDown.duration(300).delay(Math.min(sira, 6) * 50)}
                    >
                      <Kart
                        style={{
                          gap: Bosluk.md,
                          borderColor: degerlendirme.isCorrect
                            ? alpha(palet.success, 0.4)
                            : alpha(palet.error, 0.4),
                        }}
                      >
                        <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                          <Metin tur="altBaslik" style={{ flex: 1 }}>
                            {sira + 1}. {degerlendirme.questionText}
                          </Metin>
                          {degerlendirme.isCorrect ? (
                            <CheckCircle2 size={20} color={palet.success} />
                          ) : (
                            <XCircle size={20} color={palet.error} />
                          )}
                        </View>

                        <View style={{ gap: Bosluk.sm }}>
                          {soru?.options.map((secenek, secenekSira) => {
                            const harf = HARFLER[secenekSira];
                            const kullanicininki = degerlendirme.userAnswer === harf;
                            const dogru = degerlendirme.correctAnswer === harf;

                            const cerceve = dogru
                              ? palet.success
                              : kullanicininki && !degerlendirme.isCorrect
                                ? palet.error
                                : palet.outlineVariant;
                            const zemin = dogru
                              ? alpha(palet.success, 0.14)
                              : kullanicininki && !degerlendirme.isCorrect
                                ? alpha(palet.error, 0.14)
                                : palet.surfaceContainer;

                            return (
                              <View
                                key={harf}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: Bosluk.sm,
                                  padding: Bosluk.md,
                                  borderRadius: Yaricap.md,
                                  borderWidth: 1,
                                  borderColor: cerceve,
                                  backgroundColor: zemin,
                                }}
                              >
                                <Metin tur="kucuk" kalin>
                                  {harf})
                                </Metin>
                                <Metin tur="kucuk" style={{ flex: 1 }}>
                                  {secenek}
                                </Metin>
                              </View>
                            );
                          })}
                        </View>
                      </Kart>
                    </Animated.View>
                  );
                })}
              </>
            ) : (
              <>
                {uyari ? <HataKutusu mesaj={uyari} /> : null}

                {quiz?.questions.map((soru, sira) => (
                  <Animated.View
                    key={soru.id}
                    entering={FadeInDown.duration(300).delay(Math.min(sira, 6) * 60)}
                  >
                    <Kart style={{ gap: Bosluk.md }}>
                      <Metin tur="altBaslik" style={{ lineHeight: 22 }}>
                        {sira + 1}. {soru.questionText}
                      </Metin>

                      <View style={{ gap: Bosluk.sm }}>
                        {soru.options.map((secenek, secenekSira) => {
                          const harf = HARFLER[secenekSira];
                          const secili = cevaplar[soru.id] === harf;
                          return (
                            <Pressable
                              key={harf}
                              onPress={() => {
                                setCevaplar((oncekiler) => ({ ...oncekiler, [soru.id]: harf }));
                                Haptics.selectionAsync().catch(() => {});
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`Şık ${harf}: ${secenek}`}
                              style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: Bosluk.md,
                                padding: Bosluk.md,
                                borderRadius: Yaricap.md,
                                borderWidth: 1,
                                borderColor: secili ? palet.primary : palet.outlineVariant,
                                backgroundColor: secili
                                  ? alpha(palet.primary, 0.14)
                                  : palet.surfaceContainer,
                                transform: [{ scale: pressed ? 0.99 : 1 }],
                              })}
                            >
                              <View
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: Yaricap.sm,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: secili
                                    ? palet.primary
                                    : palet.surfaceContainerHighest,
                                }}
                              >
                                <Metin
                                  tur="minik"
                                  renk={secili ? palet.onPrimary : palet.onSurfaceVariant}
                                >
                                  {harf}
                                </Metin>
                              </View>
                              <Metin tur="kucuk" style={{ flex: 1, lineHeight: 19 }}>
                                {secenek}
                              </Metin>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Kart>
                  </Animated.View>
                ))}

                <Buton
                  baslik={gonderiliyor ? 'Gönderiliyor…' : 'Cevapları Gönder ve Bitir'}
                  tamGenislik
                  yukleniyor={gonderiliyor}
                  onPress={gonder}
                />
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </EkranZemini>
  );
}
