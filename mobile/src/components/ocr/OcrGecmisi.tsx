import { Clock, Trash2 } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { BosDurum, Buton, Kart, Metin, Yukleniyor } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { OcrRecord } from '@/lib/api';
import { alpha } from '@/theme/palette';
import { Bosluk, Yaricap } from '@/theme/tokens';

interface OcrGecmisiProps {
  gecmisYukleniyor: boolean;
  gecmis: OcrRecord[];
  silinenId: number | null;
  kayitSec: (k: OcrRecord) => void;
  kayitSil: (k: OcrRecord) => void;
  setAktifMod: (m: 'tara' | 'gecmis') => void;
}

export function OcrGecmisi({
  gecmisYukleniyor,
  gecmis,
  silinenId,
  kayitSec,
  kayitSil,
  setAktifMod,
}: OcrGecmisiProps) {
  const palet = useRenk();

  return (
    <View style={{ gap: Bosluk.md }}>
      {gecmisYukleniyor ? (
        <Yukleniyor mesaj="Geçmiş taranıyor…" />
      ) : gecmis.length === 0 ? (
        <BosDurum
          baslik="Henüz bir tarama kaydı yok"
          aciklama="Görsellerden kopyaladığınız veya yazdığınız metinleri çözümlediğinizde geçmişiniz burada saklanır."
          eylem={
            <Buton
              baslik="Yeni Metin Tara"
              tur="birincil"
              onPress={() => setAktifMod('tara')}
            />
          }
        />
      ) : (
        gecmis.map((kayit) => (
          <Kart
            key={kayit.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: Bosluk.md,
              padding: Bosluk.md,
            }}
          >
            <Pressable
              onPress={() => kayitSec(kayit)}
              style={{ flex: 1, gap: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Tarama kaydını oku"
            >
              <Metin tur="kucuk" kalin numberOfLines={2}>
                {kayit.extractedText}
              </Metin>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock size={12} color={palet.onSurfaceVariant} />
                <Metin tur="minik" ikincil>
                  {new Date(kayit.scannedAt).toLocaleString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Metin>
              </View>
            </Pressable>

            {/* KURAL-12: Kullanıcı kendi tarama kaydını silebilir */}
            <Pressable
              onPress={() => kayitSil(kayit)}
              disabled={silinenId === kayit.id}
              hitSlop={10}
              accessibilityLabel="Kaydı sil"
              style={{
                padding: Bosluk.sm,
                borderRadius: Yaricap.sm,
                backgroundColor: alpha(palet.error, 0.08),
              }}
            >
              {silinenId === kayit.id ? (
                <ActivityIndicator size="small" color={palet.error} />
              ) : (
                <Trash2 size={16} color={palet.error} />
              )}
            </Pressable>
          </Kart>
        ))
      )}
    </View>
  );
}
