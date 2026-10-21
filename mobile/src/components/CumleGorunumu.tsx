import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { KelimeSecimi } from '@/components/KelimePaneli';
import { CumleBlogu } from '@/components/okuyucu/CumleBlogu';
import { Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { useTelaffuz } from '@/hooks/useTelaffuz';
import type { OkumaCumlesi } from '@/lib/cumleler';
import { alpha } from '@/theme/palette';
import { Bosluk, Olcek, Yaricap } from '@/theme/tokens';

export function CumleGorunumu({
  cumleler,
  kelimeSecildi,
  yenidenDene,
  yenileniyor,
  yaziBoyutu = Olcek.baslik,
  renkliKelimeler = true,
  kayitliKelimeler,
  cumleKurmaModu = false,
  seciliParcalar = [],
  onKelimeKurmaDokun,
  onTumunuSec,
  aktifDinlemeCumleIndex,
}: {
  cumleler: OkumaCumlesi[];
  kelimeSecildi: (secim: KelimeSecimi) => void;
  /** KURAL-06 uyarısındaki "Yeniden dene" — verilmezse düğme çıkmaz. */
  yenidenDene?: () => void;
  yenileniyor?: boolean;
  yaziBoyutu?: number;
  renkliKelimeler?: boolean;
  kayitliKelimeler?: Set<string> | string[];
  cumleKurmaModu?: boolean;
  seciliParcalar?: Array<{ cumleIndex: number; kelimeIndex: number; word: string; govde: string; son?: string }>;
  onKelimeKurmaDokun?: (cumleIndex: number, kelimeIndex: number, rawWord: string) => void;
  onTumunuSec?: (cumleIndex: number) => void;
  aktifDinlemeCumleIndex?: number | null;
}) {
  const palet = useRenk();
  const { seslendir, konusuyorMu } = useTelaffuz();

  const [acikCeviri, setAcikCeviri] = useState<number | null>(null);
  const [seciliKelime, setSeciliKelime] = useState<string | undefined>(undefined);

  // KURAL-06: bu sayfada kaç satır çevrilemedi?
  const cevrilemeyen = useMemo(
    () => cumleler.filter((c) => c.ceviriBasarili === false).length,
    [cumleler],
  );

  const handleKelimeSec = useCallback(
    (rawWord: string, pos?: string, cumleOriginal?: string) => {
      const kelimeStr = rawWord.trim();
      if (!kelimeStr) return;
      setSeciliKelime(kelimeStr);
      kelimeSecildi({
        kelime: kelimeStr,
        cumle: cumleOriginal || '',
        tur: pos === 'kalıp' || kelimeStr.includes(' ') ? 'kalıp' : pos,
      });
    },
    [kelimeSecildi],
  );

  const handleCeviriToggle = useCallback((cumleIndex: number) => {
    setAcikCeviri((prev) => (prev === cumleIndex ? null : cumleIndex));
  }, []);

  return (
    <View style={{ gap: Bosluk.md }}>
      {/* KURAL-06: çeviri servisi patladığında uyarı kutusu */}
      {cevrilemeyen > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            gap: Bosluk.sm,
            alignItems: 'flex-start',
            padding: Bosluk.md,
            borderRadius: Yaricap.lg,
            backgroundColor: alpha(palet.warning, 0.12),
            borderWidth: 1,
            borderColor: alpha(palet.warning, 0.35),
          }}
        >
          <AlertTriangle size={16} color={palet.warning} />
          <View style={{ flex: 1, gap: Bosluk.sm }}>
            <Metin tur="kucuk" renk={palet.warning} style={{ lineHeight: 18 }}>
              {cevrilemeyen === cumleler.length
                ? 'Bu sayfa çevrilemedi — çeviri servisine ulaşılamadı.'
                : `${cevrilemeyen} satır çevrilemedi — çeviri servisine ulaşılamadı.`}{' '}
              Aşağıda o satırların İngilizcesi görünüyor.
            </Metin>
            {yenidenDene ? (
              <Pressable
                onPress={yenidenDene}
                disabled={yenileniyor}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  alignSelf: 'flex-start',
                  paddingHorizontal: Bosluk.md,
                  paddingVertical: 6,
                  borderRadius: Yaricap.sm,
                  backgroundColor: alpha(palet.warning, 0.18),
                }}
              >
                {yenileniyor ? (
                  <ActivityIndicator size="small" color={palet.warning} />
                ) : (
                  <RefreshCw size={12} color={palet.warning} />
                )}
                <Metin tur="minik" renk={palet.warning}>
                  {yenileniyor ? 'Deneniyor…' : 'Yeniden dene'}
                </Metin>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {cumleler.map((cumle, cumleIndex) => (
        <CumleBlogu
          key={`${cumleIndex}-${cumle.original.slice(0, 12)}`}
          cumle={cumle}
          cumleIndex={cumleIndex}
          ceviriAcik={acikCeviri === cumleIndex}
          yaziBoyutu={yaziBoyutu}
          renkliKelimeler={renkliKelimeler}
          seciliKelime={seciliKelime}
          kayitliKelimeler={kayitliKelimeler}
          cumleKurmaModu={cumleKurmaModu}
          seciliParcalar={seciliParcalar}
          onKelimeSec={handleKelimeSec}
          onKelimeKurmaDokun={onKelimeKurmaDokun}
          onTumunuSec={onTumunuSec}
          onCeviriToggle={() => handleCeviriToggle(cumleIndex)}
          onSeslendir={seslendir}
          konusuyorMu={konusuyorMu(cumle.original)}
          aktifDinleme={aktifDinlemeCumleIndex === cumleIndex}
        />
      ))}
    </View>
  );
}
