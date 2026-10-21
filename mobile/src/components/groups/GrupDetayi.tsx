import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Check,
  Clipboard as ClipboardIcon,
  Plus,
  Users,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Buton, IlerlemeCubugu, Kart, Metin, Rozet } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { GroupDetails } from '@/lib/api';
import { rolEtiketi } from '@/lib/rol';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

function tarihBicimle(ham: string): string {
  const t = new Date(ham);
  if (Number.isNaN(t.getTime())) return '—';
  return t.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface GrupDetayiProps {
  detay: GroupDetails;
  sekmeYuksekligi: number;
  setDetay: (d: GroupDetails | null) => void;
  atanacakKitap: number;
  setAtanacakKitap: (id: number) => void;
  kitapAta: () => void;
}

export function GrupDetayi({
  detay,
  sekmeYuksekligi,
  setDetay,
  atanacakKitap,
  setAtanacakKitap,
  kitapAta,
}: GrupDetayiProps) {
  const palet = useRenk();
  const [kodKopyalandi, setKodKopyalandi] = useState(false);

  const sahibiyim = detay.group.sahipMiyim;

  const koduKopyala = async (kod: string) => {
    await Clipboard.setStringAsync(kod);
    setKodKopyalandi(true);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => setKodKopyalandi(false), 2000);
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: Bosluk.lg,
        paddingTop: 0,
        paddingBottom: sekmeYuksekligi + Bosluk.xl,
        gap: Bosluk.md,
      }}
    >
      <Buton
        baslik="Gruplara Geri Dön"
        tur="hayalet"
        ikon={<ArrowLeft size={16} color={palet.onSurfaceVariant} />}
        onPress={() => setDetay(null)}
      />

      <Kart style={{ gap: Bosluk.sm }}>
        <Metin tur="baslik">{detay.group.name}</Metin>
        <Metin tur="kucuk" ikincil style={{ lineHeight: 19 }}>
          {detay.group.description || 'Açıklama belirtilmemiş.'}
        </Metin>

        {detay.group.inviteCode ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: Bosluk.sm,
              marginTop: Bosluk.sm,
              padding: Bosluk.md,
              borderRadius: Yaricap.md,
              backgroundColor: palet.surfaceContainer,
              borderWidth: 1,
              borderColor: palet.outlineVariant,
            }}
          >
            <Metin tur="minik" ikincil>
              DAVET KODU
            </Metin>
            <Metin tur="altBaslik" renk={palet.primary} style={{ flex: 1 }}>
              {detay.group.inviteCode}
            </Metin>
            <Pressable onPress={() => koduKopyala(detay.group.inviteCode!)} hitSlop={8}>
              {kodKopyalandi ? (
                <Check size={18} color={palet.success} />
              ) : (
                <ClipboardIcon size={18} color={palet.onSurfaceVariant} />
              )}
            </Pressable>
          </View>
        ) : (
          <Metin tur="minik" ikincil style={{ marginTop: Bosluk.sm }}>
            Davet kodunu yalnızca grup yöneticisi görebilir.
          </Metin>
        )}
      </Kart>

      {sahibiyim && detay.allBooks.length > 0 ? (
        <Kart style={{ gap: Bosluk.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
            <BookOpen size={16} color={palet.primary} />
            <Metin tur="altBaslik">Kitap Ata</Metin>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: Bosluk.sm }}
          >
            {detay.allBooks.map((kitap) => {
              const secili = atanacakKitap === kitap.bookId;
              return (
                <Pressable
                  key={kitap.bookId}
                  onPress={() => setAtanacakKitap(kitap.bookId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Kitap seç: ${kitap.title}`}
                  style={{
                    maxWidth: 200,
                    paddingHorizontal: Bosluk.md,
                    paddingVertical: Bosluk.sm,
                    borderRadius: Yaricap.md,
                    borderWidth: 1,
                    borderColor: secili ? palet.primary : palet.outlineVariant,
                    backgroundColor: secili
                      ? alpha(palet.primary, 0.12)
                      : palet.surfaceContainer,
                  }}
                >
                  <Metin
                    tur="kucuk"
                    numberOfLines={1}
                    renk={secili ? palet.primary : palet.onSurfaceVariant}
                  >
                    {kitap.title}
                  </Metin>
                </Pressable>
              );
            })}
          </ScrollView>
          <Buton
            baslik="Gruba Ata"
            tamGenislik
            ikon={<Plus size={15} color={palet.onPrimary} />}
            onPress={kitapAta}
          />
        </Kart>
      ) : null}

      <Kart style={{ gap: Bosluk.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
          <Users size={16} color={palet.primary} />
          <Metin tur="altBaslik" style={{ flex: 1 }}>
            Üyeler
          </Metin>
          <Rozet metin={`${detay.members.length}`} />
        </View>
        {detay.members.map((uye) => (
          <View
            key={uye.userId}
            style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: Yaricap.tam,
                backgroundColor: alpha(palet.primary, 0.15),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Metin tur="minik" renk={palet.primary}>
                {uye.username.charAt(0).toUpperCase()}
              </Metin>
            </View>
            <Metin tur="kucuk" style={{ flex: 1 }} numberOfLines={1}>
              {uye.username}
            </Metin>
            <Metin tur="minik" ikincil>
              {rolEtiketi(uye.role)}
            </Metin>
          </View>
        ))}
      </Kart>

      {detay.group.assignments.length > 0 ? (
        <Kart style={{ gap: Bosluk.sm }}>
          <Metin tur="etiket" ikincil>
            Atanan Kitaplar
          </Metin>
          {detay.group.assignments.map((atama) => (
            <View
              key={atama.bookId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}
            >
              <BookOpen size={14} color={palet.primary} />
              <Metin tur="kucuk" numberOfLines={1} style={{ flex: 1 }}>
                {atama.title}
              </Metin>
            </View>
          ))}
        </Kart>
      ) : null}

      {detay.progresses.length > 0 ? (
        <Kart style={{ gap: Bosluk.md }}>
          <Metin tur="etiket" ikincil>
            Okuma İlerlemeleri
          </Metin>
          {detay.progresses.map((ilerleme, sira) => (
            <View key={`${ilerleme.userId}-${sira}`} style={{ gap: 5 }}>
              <View style={{ flexDirection: 'row', gap: Bosluk.sm }}>
                <Metin tur="kucuk" kalin numberOfLines={1} style={{ flex: 1 }}>
                  {ilerleme.username}
                </Metin>
                <Metin tur="minik" renk={palet.primary}>
                  %{Math.round(ilerleme.progressPercent)}
                </Metin>
              </View>
              <Metin tur="minik" ikincil numberOfLines={1}>
                {ilerleme.bookTitle} · Bölüm {ilerleme.currentChapter} ·{' '}
                {tarihBicimle(ilerleme.lastRead)}
              </Metin>
              <IlerlemeCubugu yuzde={ilerleme.progressPercent} yukseklik={5} />
            </View>
          ))}
        </Kart>
      ) : null}

      {detay.quizResults.length > 0 ? (
        <Kart style={{ gap: Bosluk.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Bosluk.sm }}>
            <Award size={16} color={palet.primary} />
            <Metin tur="etiket" ikincil>
              Quiz Sonuçları
            </Metin>
          </View>
          {detay.quizResults.map((sonuc, sira) => (
            <View
              key={sira}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: Bosluk.sm,
                paddingVertical: 4,
              }}
            >
              <View style={{ flex: 1 }}>
                <Metin tur="kucuk" kalin numberOfLines={1}>
                  {sonuc.username}
                </Metin>
                <Metin tur="minik" ikincil numberOfLines={1}>
                  {sonuc.quizTitle} · {tarihBicimle(sonuc.takenAt)}
                </Metin>
              </View>
              <Rozet
                metin={`${sonuc.score}/${sonuc.totalQuestions}`}
                renk={
                  sonuc.score / Math.max(1, sonuc.totalQuestions) >= 0.6
                    ? palet.success
                    : palet.warning
                }
              />
            </View>
          ))}
        </Kart>
      ) : null}
    </ScrollView>
  );
}
