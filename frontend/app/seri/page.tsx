'use client';

import React, { useEffect, useState } from 'react';
import { api, SeriOzeti } from '../api';
import { useAuth } from '../context/AuthContext';
import { Flame, Target, Trophy, CheckCircle, Clock, Zap, BookOpen, BookMarked, Brain, MessageSquare, Award } from 'lucide-react';

export default function SeriPage() {
  const { user } = useAuth();
  const [seri, setSeri] = useState<SeriOzeti | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [seciliHedefXp, setSeciliHedefXp] = useState<number>(30);
  const [seciliSeviye, setSeciliSeviye] = useState<string>('B1');

  useEffect(() => {
    if (!user) return;
    async function loadSeri() {
      try {
        const data = await api.getSeri();
        setSeri(data);
        setSeciliHedefXp(data.gunlukHedefXp);
        setSeciliSeviye(data.seviye || 'B1');
      } catch (err: any) {
        setError(err.message || 'Seri bilgileri yüklenemedi.');
      } finally {
        setLoading(false);
      }
    }
    loadSeri();
  }, [user]);

  const handleAyarlariKaydet = async () => {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const guncel = await api.seriAyarlariniGuncelle({
        gunlukHedefXp: seciliHedefXp,
        saatDilimi: timezone,
        seviye: seciliSeviye,
      });
      setSeri(guncel);
      setSuccessMsg('Seri ve hedef ayarlarınız başarıyla güncellendi!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Ayarlar kaydedilirken hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  const yuzde = seri ? Math.min(100, Math.round((seri.bugun.xp / (seri.gunlukHedefXp || 1)) * 100)) : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* ── Üst Başlık Kartı ── */}
      <div className="glass-card rounded-3xl p-6 md:p-8 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-500 text-xs font-bold">
            <Flame className="h-4 w-4 fill-orange-500" />
            Günlük Seri ve İlerleme
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">
            Disiplinli Çalış, Serini Koru 🔥
          </h1>
          <p className="text-xs md:text-sm text-on-surface-variant max-w-lg">
            Her gün en az 1 XP kazanarak serini devam ettir. Günlük hedefini tamamladığında bonus tecrübe kazanırsın.
          </p>
        </div>

        {/* Seri Rozeti */}
        <div className="flex items-center gap-4 bg-surface-container/80 border border-outline-variant p-4 rounded-2xl shrink-0 z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-2xl shadow-lg shadow-orange-500/20">
            🔥
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Mevcut Seri</p>
            <p className="text-2xl font-black text-on-surface">{seri?.mevcutSeri || 0} <span className="text-xs text-orange-500 font-bold">Gün</span></p>
            <p className="text-[10px] text-on-surface-variant">En uzun: <span className="font-bold text-on-surface">{seri?.enUzunSeri || 0} gün</span></p>
          </div>
        </div>
      </div>

      {/* Mesaj Kutuları */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {successMsg}
        </div>
      )}

      {/* ── İlerleme & XP Kartı ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <h3 className="font-black text-on-surface text-base">Bugünkü İlerleme</h3>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              %{yuzde} Tamamlandı
            </span>
          </div>

          {/* İlerleme Çubuğu */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-on-surface-variant">Kazanılan XP</span>
              <span className="text-primary">{seri?.bugun.xp || 0} / {seri?.gunlukHedefXp || 30} XP</span>
            </div>
            <div className="h-3 w-full rounded-full bg-surface-container border border-outline-variant overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-700"
                style={{ width: `${yuzde}%` }}
              />
            </div>
          </div>

          {/* XP Kırılımları */}
          <div className="grid grid-cols-5 gap-2 pt-2">
            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant text-center space-y-1">
              <BookOpen className="h-3.5 w-3.5 text-primary mx-auto" />
              <p className="text-[9px] text-on-surface-variant font-medium">Okuma</p>
              <p className="text-xs font-black text-on-surface">+{seri?.bugun.kirilim.okuma || 0}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant text-center space-y-1">
              <BookMarked className="h-3.5 w-3.5 text-blue-500 mx-auto" />
              <p className="text-[9px] text-on-surface-variant font-medium">Kelime</p>
              <p className="text-xs font-black text-on-surface">+{seri?.bugun.kirilim.kelime || 0}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant text-center space-y-1">
              <Brain className="h-3.5 w-3.5 text-purple-500 mx-auto" />
              <p className="text-[9px] text-on-surface-variant font-medium">Çalışma</p>
              <p className="text-xs font-black text-on-surface">+{seri?.bugun.kirilim.calisma || 0}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant text-center space-y-1">
              <Award className="h-3.5 w-3.5 text-yellow-500 mx-auto" />
              <p className="text-[9px] text-on-surface-variant font-medium">Quiz</p>
              <p className="text-xs font-black text-on-surface">+{seri?.bugun.kirilim.quiz || 0}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant text-center space-y-1">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
              <p className="text-[9px] text-on-surface-variant font-medium">Cümle</p>
              <p className="text-xs font-black text-on-surface">+{seri?.bugun.kirilim.cumle || 0}</p>
            </div>
          </div>
        </div>

        {/* Son Günler Takvimi */}
        <div className="glass-card rounded-2xl p-6 flex flex-col justify-between space-y-3">
          <h3 className="font-black text-on-surface text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Son 7 Gün
          </h3>
          <div className="grid grid-cols-7 gap-1.5 items-center my-auto">
            {seri?.sonGunler.map((g, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                    g.hedefTamamlandi
                      ? 'bg-primary text-on-primary shadow-sm'
                      : g.xp > 0
                      ? 'bg-orange-500/20 text-orange-500 border border-orange-500/30'
                      : 'bg-surface-container text-on-surface-variant/40 border border-outline-variant'
                  }`}
                >
                  {g.hedefTamamlandi ? '✓' : g.xp > 0 ? '🔥' : '•'}
                </div>
                <span className="text-[9px] font-bold text-on-surface-variant">
                  {g.gun.slice(-2)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-on-surface-variant text-center">
            {seri?.bugunAktif ? '🟢 Bugün çalışıldı!' : '🟡 Bugün henüz çalışılmadı.'}
          </p>
        </div>
      </div>

      {/* ── Hedef ve Ayarlar Formu ── */}
      <div className="glass-card rounded-2xl p-6 md:p-8 space-y-6">
        <h3 className="font-black text-on-surface text-lg border-b border-outline-variant pb-3">
          Seri ve Hedef Ayarları
        </h3>

        {/* Günlük XP Hedefi Seçimi */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
            GÜNLÜK HEDEF (XP):
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {(seri?.hedefSecenekleri || [10, 20, 30, 50, 100]).map((hedef) => {
              const secili = seciliHedefXp === hedef;
              return (
                <button
                  key={hedef}
                  type="button"
                  onClick={() => setSeciliHedefXp(hedef)}
                  className={`py-3 px-4 rounded-xl text-xs font-black border transition-all bouncy-btn ${
                    secili
                      ? 'bg-primary text-on-primary border-primary shadow-md shadow-primary/20'
                      : 'bg-surface-container text-on-surface border-outline-variant hover:border-primary/50'
                  }`}
                >
                  {hedef} XP / Gün
                </button>
              );
            })}
          </div>
        </div>

        {/* CEFR Seviye Seçimi */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
            HEDEF DİL SEVİYESİ (CEFR):
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((sev) => {
              const secili = seciliSeviye === sev;
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeciliSeviye(sev)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all bouncy-btn ${
                    secili
                      ? 'bg-primary text-on-primary border-primary shadow-md'
                      : 'bg-surface-container text-on-surface border-outline-variant hover:border-primary/50'
                  }`}
                >
                  {sev}
                </button>
              );
            })}
          </div>
        </div>

        {/* Saat Dilimi Bilgisi */}
        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-on-surface-variant" />
            <span className="text-on-surface-variant">Otomatik Algılanan Saat Dilimi:</span>
          </div>
          <span className="font-bold text-on-surface">
            {Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}
          </span>
        </div>

        {/* Kaydet Butonu */}
        <button
          type="button"
          onClick={handleAyarlariKaydet}
          disabled={saving}
          className="w-full py-3.5 rounded-xl bg-primary text-on-primary font-black text-sm shadow-lg shadow-primary/20 bouncy-btn disabled:opacity-50 transition-all cursor-pointer"
        >
          {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet 🚀'}
        </button>
      </div>

      {/* ── Puan Tablosu Kuralları ── */}
      <div className="glass-card rounded-2xl p-6 space-y-3">
        <h4 className="font-black text-on-surface text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Puan Tablosu ve Tavan Kuralları
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {seri?.puanTablosu.map((pt, idx) => (
            <div key={idx} className="p-3 rounded-xl bg-surface-container border border-outline-variant flex justify-between items-center">
              <span className="font-bold text-on-surface">{pt.tur}</span>
              <span className="text-primary font-black">+{pt.xp} XP <span className="text-[10px] text-on-surface-variant font-normal">(Max {pt.gunlukTavan}/gün)</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
