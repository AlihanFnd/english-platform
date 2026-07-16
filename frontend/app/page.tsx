'use client';

import React, { useEffect, useState } from 'react';
import { api, ReadingProgress, User } from './api';
import { useAuth } from './context/AuthContext';
import { BookOpen, BookMarked, FileSearch, ChevronRight, Play, Zap, Flame, Lightbulb, Target } from 'lucide-react';
import Link from 'next/link';

function capitalize(str: string) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{
    user: User;
    recentProgress: ReadingProgress[];
    wordCount: number;
    quizCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await api.getDashboardStats();
        setStats(data);
      } catch (err: any) {
        setError(err.message || 'İstatistikler yüklenirken bir hata oluştu.');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-medium">
        {error}
      </div>
    );
  }

  const hasProgress = stats?.recentProgress && stats.recentProgress.length > 0;
  const currentProgress = hasProgress ? stats.recentProgress[0] : null;
  const progressPercent = hasProgress ? stats.recentProgress[0].progressPercent : 0;

  return (
    <div className="w-full space-y-4">

      {/* ── 1. KISIM: Okumaya Devam Et ── */}
      {hasProgress && currentProgress ? (
        <div className="glass-card rounded-2xl p-4 md:p-5">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
            {/* Kitap kapağı ikonu — mobilde büyük, ortada */}
            <div
              className="w-20 h-28 md:w-14 md:h-20 rounded-xl relative flex flex-col justify-between p-2.5 md:p-2 text-white shrink-0 shadow-lg"
              style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 60%, #000) 100%)',
              }}
            >
              <div className="absolute inset-y-0 right-0 w-1 bg-black/25 rounded-r-xl" />
              <BookOpen className="h-4 w-4 md:h-3 md:w-3 text-white/80 self-end" />
              <p className="text-[8px] md:text-[7px] font-black leading-tight uppercase tracking-tight line-clamp-3 text-left pr-1">
                {currentProgress.bookTitle}
              </p>
            </div>

            {/* Bilgi + Progress */}
            <div className="flex-1 min-w-0 space-y-2.5 w-full text-center md:text-left">
              <div>
                <span
                  className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border mb-1"
                  style={{
                    color: 'var(--primary)',
                    background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--primary) 20%, transparent)',
                  }}
                >
                  <Zap className="h-2 w-2 fill-current" />
                  Okumaya Devam Et
                </span>
                <h4 className="text-sm font-black text-on-surface leading-tight line-clamp-1">
                  {currentProgress.bookTitle}
                </h4>
                <p className="text-[10px] text-on-surface-variant mt-0.5">
                  Bölüm <span className="font-bold text-on-surface">{currentProgress.currentChapter}</span>
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-on-surface-variant">İlerleme</span>
                  <span style={{ color: 'var(--primary)' }}>%{Math.round(progressPercent)}</span>
                </div>
                <div className="h-2.5 md:h-2 w-full rounded-full bg-surface-container border border-outline-variant/20 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${progressPercent}%`,
                      background: 'var(--primary)',
                    }}
                  />
                </div>
              </div>

              {/* Buton */}
              <Link
                href={`/books/${currentProgress.bookId}?chapter=${currentProgress.currentChapter}`}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm text-on-primary bouncy-btn transition-all hover:opacity-90 md:w-auto md:inline-flex md:px-5 md:py-2.5"
                style={{
                  background: 'var(--primary)',
                  boxShadow: '0 3px 10px color-mix(in srgb, var(--primary) 28%, transparent)',
                }}
              >
                <Play className="h-3.5 w-3.5 fill-white" />
                Okumaya Devam Et
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
          >
            <BookOpen className="h-6 w-6" style={{ color: 'var(--primary)' }} />
          </div>
          <div className="space-y-0.5 text-center sm:text-left">
            <h4 className="font-black text-on-surface text-sm">Aktif Okuma Yok</h4>
            <p className="text-xs text-on-surface-variant">Kütüphaneden bir kitap seçerek başlayabilirsin.</p>
          </div>
          <Link
            href="/books"
            className="ml-auto shrink-0 text-on-primary font-black py-2.5 px-6 rounded-xl text-xs bouncy-btn"
            style={{ background: 'var(--primary)' }}
          >
            Kitaplığa Git
          </Link>
        </div>
      )}

      {/* ── 2. KISIM: Avatar + Sayaçlar + Hızlı Erişim ── */}
      <div className="glass-card rounded-2xl p-4">

        {/* Avatar + İsim + Sayaçlar – tek satır */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-primary text-xs font-black shadow-sm shrink-0"
              style={{ background: 'var(--primary)' }}
            >
              {capitalize(user?.username ?? '')[0]}
            </div>
            <div>
              <p className="text-sm font-black text-on-surface leading-none">{capitalize(user?.username ?? '')}</p>
              <p className="text-[10px] text-on-surface-variant font-medium">Linguza</p>
            </div>
          </div>

          {/* Sayaçlar */}
          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border"
              style={{
                background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                borderColor: 'color-mix(in srgb, var(--primary) 20%, transparent)',
              }}
            >
              <span className="text-sm font-black" style={{ color: 'var(--primary)' }}>{stats?.wordCount ?? 0}</span>
              <span className="text-[10px] font-semibold text-on-surface-variant">Kelime</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-container border border-outline-variant">
              <span className="text-sm font-black text-on-surface">{stats?.quizCount ?? 0}</span>
              <span className="text-[10px] font-semibold text-on-surface-variant">Quiz</span>
            </div>
          </div>
        </div>

        {/* Hızlı Erişim – 3 buton yatay */}
        <div className="grid grid-cols-3 gap-2">
          {/* Kitap Okuma */}
          <Link
            href="/books"
            className="group relative flex flex-col gap-2 p-3 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 70%, #000) 100%)',
              boxShadow: '0 4px 16px color-mix(in srgb, var(--primary) 30%, transparent)',
            }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="relative z-10 p-1.5 rounded-lg w-fit" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <BookOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="relative z-10">
              <p className="text-[9px] font-bold uppercase tracking-wide opacity-70 text-white leading-none">Kütüphane</p>
              <p className="text-xs font-black text-white leading-tight">Kitap Okuma</p>
            </div>
          </Link>

          {/* Kelimelerim */}
          <Link
            href="/words"
            className="group flex flex-col gap-2 p-3 rounded-xl bg-surface-container border border-outline-variant transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 45%, transparent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
          >
            <div className="p-1.5 rounded-lg border w-fit"
              style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--primary) 20%, transparent)' }}>
              <BookMarked className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wide leading-none">Kayıtlı</p>
              <p className="text-xs font-black text-on-surface leading-tight">Kelimelerim</p>
            </div>
          </Link>

          {/* Metin Tara */}
          <Link
            href="/ocr"
            className="group flex flex-col gap-2 p-3 rounded-xl bg-surface-container border border-outline-variant transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 45%, transparent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
          >
            <div className="p-1.5 rounded-lg border w-fit"
              style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--primary) 20%, transparent)' }}>
              <FileSearch className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wide leading-none">OCR</p>
              <p className="text-xs font-black text-on-surface leading-tight">Metin Tara</p>
            </div>
          </Link>
        </div>
      </div>

      {/* ── 3. KISIM: Günlük İpucu + Seri ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Günlük İpucu */}
        <div className="glass-card rounded-2xl p-4 relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 opacity-5">
            <Lightbulb className="h-24 w-24" style={{ color: 'var(--primary)' }} />
          </div>
          <div className="flex items-start gap-3 relative z-10">
            <div
              className="p-2 rounded-xl shrink-0"
              style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}
            >
              <Lightbulb className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Günün İpucu</p>
              <p className="text-xs text-on-surface leading-relaxed">
                Her gün en az <span className="font-black" style={{ color: 'var(--primary)' }}>10 dakika</span> İngilizce okumak, kelime haznenizi hızla geliştirir.
              </p>
            </div>
          </div>
        </div>

        {/* Hedef / Motivasyon */}
        <div className="glass-card rounded-2xl p-4 relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 opacity-5">
            <Target className="h-24 w-24" style={{ color: 'var(--primary)' }} />
          </div>
          <div className="flex items-start gap-3 relative z-10">
            <div
              className="p-2 rounded-xl shrink-0"
              style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}
            >
              <Flame className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Hedefin</p>
              <p className="text-xs text-on-surface leading-relaxed">
                Bugün <span className="font-black" style={{ color: 'var(--primary)' }}>5 yeni kelime</span> öğrenmeyi ve bir bölüm okumayı hedefle!
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
