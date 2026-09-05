'use client';

/**
 * KURAL-19: veri sahibinin hakları — tek ekran.
 *
 * Üç şey burada: hangi verinin neden tutulduğu (envanterden ÜRETİLİR,
 * elle yazılmaz), verinin indirilmesi, ve hesabın silinmesi.
 */

import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import { Download, ShieldAlert, Trash2, FileText } from 'lucide-react';

type Kalem = {
  tablo: string; alan: string; sinif: string;
  sebep: string; saklama: string; disaAktarilir: boolean;
};

export default function GizlilikSayfasi() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [kalemler, setKalemler] = useState<Kalem[]>([]);
  const [hata, setHata] = useState('');
  const [indiriliyor, setIndiriliyor] = useState(false);

  const [silmeAcik, setSilmeAcik] = useState(false);
  const [sifre, setSifre] = useState('');
  const [siliniyor, setSiliniyor] = useState(false);

  useEffect(() => {
    api.veriEnvanteri()
      .then((d) => setKalemler(d.kalemler))
      .catch((e: unknown) => setHata((e as Error).message || 'Envanter alınamadı.'));
  }, []);

  const indir = async () => {
    setIndiriliyor(true); setHata('');
    try {
      const veri = await api.verimiDisaAktar();
      // Dosya TARAYICIDA üretilir; sunucuda hiçbir kopya bırakılmaz.
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(veri, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `linguza-verilerim-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setHata((e as Error).message || 'Veri indirilemedi.');
    } finally {
      setIndiriliyor(false);
    }
  };

  const hesabiSil = async () => {
    setSiliniyor(true); setHata('');
    try {
      await api.hesabimiSil(sifre);
      await logout();
      router.push('/login');
    } catch (e: unknown) {
      setHata((e as Error).message || 'Hesap silinemedi.');
    } finally {
      setSiliniyor(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-on-surface">Verilerim ve gizlilik</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {user?.email} hesabında tutulan veriler.
        </p>
      </header>

      {hata && (
        <div role="alert" className="rounded-lg bg-red-500/10 text-red-400 px-4 py-3 text-sm">
          {hata}
        </div>
      )}

      {/* ── Yasal metinler ────────────────────────────────────────
          KURAL-19 ihlal 5: metinler HUKUKİ, kod yazamaz. Bağlantılar
          buraya bağlanacak; metin gelene kadar durum açıkça yazılı —
          "hazırlanıyor" demek, olmayan bir metni varmış gibi
          göstermekten dürüsttür. */}
      <section className="rounded-xl border border-outline-variant p-5 space-y-2">
        <h2 className="font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" /> Aydınlatma metni ve gizlilik politikası
        </h2>
        <p className="text-sm text-on-surface-variant">
          Bu metinler hazırlanma aşamasındadır. Hazır olduğunda bu bölümden
          erişebileceksin. Sorularını{' '}
          <a href="mailto:destek@linguza.example" className="text-primary underline">
            destek@linguza.example
          </a>{' '}
          adresine iletebilirsin.
        </p>
      </section>

      {/* ── Envanter ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-semibold">Hangi verini, neden tutuyoruz?</h2>
        <div className="overflow-x-auto rounded-xl border border-outline-variant">
          <table className="w-full text-sm">
            <thead className="bg-surface-variant/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Veri</th>
                <th className="px-4 py-2 font-medium">Neden</th>
                <th className="px-4 py-2 font-medium">Ne kadar</th>
              </tr>
            </thead>
            <tbody>
              {kalemler.map((k) => (
                <tr key={`${k.tablo}.${k.alan}`} className="border-t border-outline-variant/50">
                  <td className="px-4 py-2 font-mono text-xs">{k.tablo}.{k.alan}</td>
                  <td className="px-4 py-2 text-on-surface-variant">{k.sebep}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{k.saklama}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Dışa aktarma ─────────────────────────────────────── */}
      <section className="rounded-xl border border-outline-variant p-5 space-y-3">
        <h2 className="font-semibold">Verilerimi indir</h2>
        <p className="text-sm text-on-surface-variant">
          Bütün verin JSON dosyası olarak iner. Şifre bilgin ve hesap kurtarma
          jetonların güvenlik gereği bu dosyaya <b>dâhil edilmez</b>.
        </p>
        <button
          onClick={indir}
          disabled={indiriliyor}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {indiriliyor ? 'Hazırlanıyor…' : 'Verilerimi indir'}
        </button>
      </section>

      {/* ── Hesap silme ──────────────────────────────────────── */}
      <section className="rounded-xl border border-red-500/30 p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2 text-red-400">
          <ShieldAlert className="h-4 w-4" /> Hesabımı sil
        </h2>
        <p className="text-sm text-on-surface-variant">
          Hesabın ve <b>tüm verilerin</b> kalıcı olarak silinir. Bu işlem
          <b> geri alınamaz</b>. Silmeden önce verilerini indirmek isteyebilirsin.
        </p>

        {!silmeAcik ? (
          <button
            onClick={() => setSilmeAcik(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 text-red-400 px-4 py-2.5 text-sm font-semibold hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" /> Hesabımı silmek istiyorum
          </button>
        ) : (
          <div className="space-y-3">
            {/* Şifre YENİDEN isteniyor: giriş yapmış olmak, "hesabımı sil"
                demek değildir. Çalınmış bir token kalıcı veri kaybına
                yol açmamalı. Asıl kontrol backend'de. */}
            <label className="block text-sm">
              Onaylamak için şifreni gir:
              <input
                type="password"
                value={sifre}
                onChange={(e) => setSifre(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
                placeholder="••••••••"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={hesabiSil}
                disabled={siliniyor || !sifre}
                className="rounded-lg bg-red-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {siliniyor ? 'Siliniyor…' : 'Evet, hesabımı kalıcı olarak sil'}
              </button>
              <button
                onClick={() => { setSilmeAcik(false); setSifre(''); }}
                className="rounded-lg border border-outline-variant px-4 py-2.5 text-sm"
              >
                Vazgeç
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
