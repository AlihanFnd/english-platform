import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView } from 'react-native';

import { IlerlemeRaporuModal } from '@/components/IlerlemeRaporuModal';
import { TopluEkleModal } from '@/components/TopluEkleModal';
import { UstBar } from '@/components/UstBar';
import { EkranZemini, HataKutusu, KartIskeleti } from '@/components/ui';
import { CumleListesi } from '@/components/words/CumleListesi';
import { HizliEkleKarti } from '@/components/words/HizliEkleKarti';
import { KelimeListesi } from '@/components/words/KelimeListesi';
import { KelimeUstPaneli } from '@/components/words/KelimeUstPaneli';
import { PratikSecimModali } from '@/components/words/PratikSecimModali';
import { QuizPratikModali } from '@/components/words/QuizPratikModali';
import { useRenk } from '@/context/ThemeContext';
import { useKelimelerim } from '@/hooks/useKelimelerim';
import { useTelaffuz } from '@/hooks/useTelaffuz';
import { Bosluk } from '@/theme/tokens';

export default function KelimelerimEkrani() {
  const palet = useRenk();
  const sekmeYuksekligi = useBottomTabBarHeight();
  const { seslendir, konusuyorMu } = useTelaffuz();

  const {
    kullanici,
    aktifSekme,
    setAktifSekme,
    kelimeler,
    ozet,
    cumleler,
    cumleOzeti,
    yukleniyor,
    tazeleniyor,
    setTazeleniyor,
    hata,
    yukle,
    ozetiTazele,
    topluEkleModalAcik,
    setTopluEkleModalAcik,
    raporModalAcik,
    setRaporModalAcik,
    secimModalAcik,
    setSecimModalAcik,
    hizliKelime,
    setHizliKelime,
    hizliCeviri,
    setHizliCeviri,
    ceviriliyor,
    ekleniyor,
    kelimeAlaniRef,
    ceviriElleDegisti,
    hizliKelimeEkle,
    hizliCumle,
    setHizliCumle,
    hizliCumleCeviri,
    setHizliCumleCeviri,
    cumleCeviriliyor,
    cumleEkleniyor,
    cumleAlaniRef,
    cumleElleDegisti,
    hizliCumleEkle,
    cevrilenler,
    kartiCevir,
    kelimeSil,
    cumleSil,
    dogrudanOgrenildiIsaretle,
    dogrudanCumleOgrenildiIsaretle,
    seciliMod,
    setSeciliMod,
    seciliAdet,
    setSeciliAdet,
    calismaModu,
    setCalismaModu,
    quizOgeleri,
    aktifListeUzunlugu,
    pratikBaslat,
  } = useKelimelerim();

  return (
    <EkranZemini>
      <UstBar
        baslik={aktifSekme === 'kelime' ? 'Kelimelerim' : 'Cümlelerim'}
        altBaslik={
          aktifSekme === 'kelime'
            ? `${ozet?.toplam ?? kelimeler.length} kelime`
            : `${cumleOzeti?.toplam ?? cumleler.length} cümle`
        }
      />

      {yukleniyor ? (
        <KartIskeleti adet={5} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={100}
        >
          <ScrollView
            contentContainerStyle={{
              padding: Bosluk.lg,
              paddingTop: 0,
              paddingBottom: sekmeYuksekligi + Bosluk.xl,
              gap: Bosluk.md,
            }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={tazeleniyor}
                onRefresh={() => {
                  setTazeleniyor(true);
                  yukle();
                }}
                tintColor={palet.primary}
                colors={[palet.primary]}
              />
            }
          >
            {hata ? <HataKutusu mesaj={hata} /> : null}

            {/* ÜST PANEL: Sekme Geçişi, İlerleme Özeti, Ana Butonlar */}
            <KelimeUstPaneli
              aktifSekme={aktifSekme}
              setAktifSekme={setAktifSekme}
              kelimeler={kelimeler}
              ozet={ozet}
              cumleler={cumleler}
              cumleOzeti={cumleOzeti}
              aktifListeUzunlugu={aktifListeUzunlugu}
              onPratikBaslatModalAc={() => setSecimModalAcik(true)}
              onTopluEkleAc={() => setTopluEkleModalAcik(true)}
              onRaporAc={() => setRaporModalAcik(true)}
            />

            {/* HIZLI EKLE KARTI */}
            <HizliEkleKarti
              aktifSekme={aktifSekme}
              hizliKelime={hizliKelime}
              setHizliKelime={setHizliKelime}
              hizliCeviri={hizliCeviri}
              setHizliCeviri={setHizliCeviri}
              ceviriliyor={ceviriliyor}
              ekleniyor={ekleniyor}
              onHizliKelimeEkle={hizliKelimeEkle}
              kelimeAlaniRef={kelimeAlaniRef}
              ceviriElleDegistiRef={ceviriElleDegisti}
              hizliCumle={hizliCumle}
              setHizliCumle={setHizliCumle}
              hizliCumleCeviri={hizliCumleCeviri}
              setHizliCumleCeviri={setHizliCumleCeviri}
              cumleCeviriliyor={cumleCeviriliyor}
              cumleEkleniyor={cumleEkleniyor}
              onHizliCumleEkle={hizliCumleEkle}
              cumleAlaniRef={cumleAlaniRef}
              cumleElleDegistiRef={cumleElleDegisti}
            />

            {/* LİSTE KARTLARI */}
            {aktifSekme === 'kelime' ? (
              <KelimeListesi
                kelimeler={kelimeler}
                cevrilenler={cevrilenler}
                onKartiCevir={kartiCevir}
                onDogrudanOgrenildiIsaretle={dogrudanOgrenildiIsaretle}
                onKelimeSil={kelimeSil}
                seslendir={seslendir}
                konusuyorMu={konusuyorMu}
              />
            ) : (
              <CumleListesi
                cumleler={cumleler}
                cevrilenler={cevrilenler}
                onKartiCevir={kartiCevir}
                onDogrudanCumleOgrenildiIsaretle={dogrudanCumleOgrenildiIsaretle}
                onCumleSil={cumleSil}
                seslendir={seslendir}
                konusuyorMu={konusuyorMu}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* MODALLAR */}
      <PratikSecimModali
        acik={secimModalAcik}
        kapat={() => setSecimModalAcik(false)}
        seciliMod={seciliMod}
        setSeciliMod={setSeciliMod}
        seciliAdet={seciliAdet}
        setSeciliAdet={setSeciliAdet}
        aktifListeUzunlugu={aktifListeUzunlugu}
        onBaslat={pratikBaslat}
      />

      <QuizPratikModali
        acik={calismaModu}
        kapat={() => {
          setCalismaModu(false);
          ozetiTazele();
        }}
        mod={seciliMod}
        ogeler={quizOgeleri}
        aktifSekme={aktifSekme}
        userId={kullanici?.id}
        onCevapKaydedildi={ozetiTazele}
        tekrarDene={() => pratikBaslat(seciliMod, seciliAdet)}
        tumKelimeler={kelimeler}
        tumCumleler={cumleler}
      />

      <TopluEkleModal
        acik={topluEkleModalAcik}
        kapat={() => setTopluEkleModalAcik(false)}
        varsayilanHedef={aktifSekme}
        userId={kullanici?.id}
        tamamlandi={yukle}
      />

      <IlerlemeRaporuModal
        acik={raporModalAcik}
        kapat={() => setRaporModalAcik(false)}
        tur={aktifSekme}
        kelimeler={kelimeler}
        kelimeOzeti={ozet}
        cumleler={cumleler}
        cumleOzeti={cumleOzeti}
      />
    </EkranZemini>
  );
}
