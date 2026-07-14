'use client';

import React, { useEffect, useState } from 'react';
import { api, ReadingProgress, User } from './api';
import { useAuth } from './context/AuthContext';
import { BookOpen, BookMarked, Award, GraduationCap, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

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

  const statCards = [
    {
      name: 'Öğrenilen Kelimeler',
      value: stats?.wordCount ?? 0,
      icon: BookMarked,
      color: 'from-blue-600 to-indigo-600',
      shadow: 'shadow-blue-500/10',
      href: '/words',
    },
    {
      name: 'Tamamlanan Quizler',
      value: stats?.quizCount ?? 0,
      icon: Award,
      color: 'from-amber-500 to-orange-600',
      shadow: 'shadow-amber-500/10',
      href: '/words',
    }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Sol Panel: Okumaya Devam Et & Son Kelimeler */}
      <div className="lg:col-span-8 space-y-8">
        
        {/* Welcome & Continue Reading Hero Banner */}
        <div className="glass-card rounded-3xl p-8 flex flex-col md:flex-row gap-8 items-center md:items-start group relative overflow-hidden">
          <div className="absolute top-[-10%] right-[-10%] w-32 h-32 bg-primary/10 blur-3xl pointer-events-none"></div>
          
          {stats?.recentProgress && stats.recentProgress.length > 0 ? (
            <div
              className="relative w-40 h-56 flex-shrink-0 shadow-2xl rounded-2xl overflow-hidden transition-transform duration-500 group-hover:scale-[1.03] flex flex-col justify-between p-5 border border-black/5 text-white font-extrabold"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <div className="absolute inset-0 bg-black/10"></div>
              <span className="z-10 text-xs font-black text-left leading-tight uppercase tracking-wider line-clamp-4">
                {stats.recentProgress[0].bookTitle}
              </span>
              <div className="z-10 text-left">
                <span className="text-[9px] font-semibold text-white/80 block uppercase tracking-widest">
                  Okunuyor
                </span>
              </div>
            </div>
          ) : (
            <div className="relative w-40 h-56 flex-shrink-0 shadow-2xl rounded-2xl overflow-hidden transition-transform duration-500 group-hover:scale-105 bg-surface-container border border-outline-variant flex items-center justify-center">
              <BookOpen className="h-16 w-16 text-primary animate-pulse" />
            </div>
          )}

          <div className="flex-1 flex flex-col justify-between h-full space-y-6">
            <div>
              <span className="bg-primary/20 text-primary font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wider mb-3 inline-block">
                Hoş Geldin, {user?.username}
              </span>
              <h3 className="font-display-lg text-3xl font-extrabold text-on-surface leading-tight">
                {stats?.recentProgress && stats.recentProgress.length > 0 
                  ? stats.recentProgress[0].bookTitle
                  : "İngilizce Okuma Serüveni"
                }
              </h3>
              <p className="text-on-surface-variant font-body-md mt-1">
                {stats?.recentProgress && stats.recentProgress.length > 0 
                  ? `Son Okuma: Bölüm ${stats.recentProgress[0].currentChapter}`
                  : "Hemen bir kitap seçip kelimeleri keşfetmeye başla!"
                }
              </p>
            </div>

            {stats?.recentProgress && stats.recentProgress.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="font-label-md text-on-surface-variant">İlerleme</span>
                  <span className="font-headline-md text-primary font-bold">
                    %{Math.round(stats.recentProgress[0].progressPercent)}
                  </span>
                </div>
                <div className="h-3 w-full bg-surface-container rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full shadow-[0_0_12px_rgba(34,197,94,0.4)] transition-all duration-1000"
                    style={{ width: `${stats.recentProgress[0].progressPercent}%` }}
                  ></div>
                </div>
              </div>
            )}

            <Link
              href={stats?.recentProgress && stats.recentProgress.length > 0 
                ? `/books/${stats.recentProgress[0].bookId}?chapter=${stats.recentProgress[0].currentChapter}`
                : "/books"
              }
              className="bg-primary text-on-primary font-bold py-4 px-10 rounded-lg flex items-center justify-center gap-3 bouncy-btn w-fit shadow-lg shadow-primary/20"
            >
              <Sparkles className="h-5 w-5" />
              <span>{stats?.recentProgress && stats.recentProgress.length > 0 ? "Öğrenmeye Devam Et" : "Kitaplığı Keşfet"}</span>
            </Link>
          </div>
        </div>

        {/* Son Öğrenilen Kelimeler */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h4 className="font-headline-md text-xl font-bold text-on-surface">Son Öğrenilen Kelimeler</h4>
            <Link href="/words" className="text-primary font-bold text-sm hover:underline">Tümünü Gör</Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 rounded-2xl flex flex-col justify-between hover:border-primary transition-all group">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h5 className="font-headline-md text-xl font-bold text-primary">Kelimelerim</h5>
                  <BookMarked className="text-on-surface-variant group-hover:text-primary transition-colors h-5 w-5" />
                </div>
                <p className="text-on-surface-variant font-body-md italic mb-3">Kişisel Sözlük</p>
                <p className="text-on-surface font-body-md">Şu ana kadar platform genelinde kaydettiğiniz tüm İngilizce kelimeler ve anlamları.</p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                  <span className="font-label-sm text-sm text-on-surface-variant font-semibold">{stats?.wordCount ?? 0} Kayıtlı Kelime</span>
                </div>
              </div>
            </div>

            <div className="glass-card p-6 rounded-2xl flex flex-col justify-between hover:border-primary transition-all group">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h5 className="font-headline-md text-xl font-bold text-primary">Quiz Sonuçları</h5>
                  <Award className="text-on-surface-variant group-hover:text-primary transition-colors h-5 w-5" />
                </div>
                <p className="text-on-surface-variant font-body-md italic mb-3">Öğrenme Değerlendirmesi</p>
                <p className="text-on-surface font-body-md">Kitap bölümlerini tamamladıktan sonra çözdüğünüz anlama testlerinin başarı durumu.</p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                  <span className="font-label-sm text-sm text-on-surface-variant font-semibold">{stats?.quizCount ?? 0} Tamamlanan Test</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Sağ Panel: Günlük Hedef & Önerilen Adımlar */}
      <aside className="lg:col-span-4 space-y-8">
        
        {/* Daily Goal Card (Circular ring) */}
        <div className="glass-card rounded-3xl p-8 flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/15 blur-3xl pointer-events-none"></div>
          <h4 className="font-headline-md text-lg font-bold mb-8 text-on-surface">Günlük Hedef</h4>
          
          <div className="relative w-44 h-44 mb-8 flex items-center justify-center">
            {/* SVG Progress Ring */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle className="text-surface-container stroke-current" cx="50" cy="50" fill="transparent" r="42" strokeWidth="8"></circle>
              <circle 
                className="text-primary stroke-current transition-all duration-1000" 
                cx="50" cy="50" fill="transparent" r="42" strokeLinecap="round" strokeWidth="8" 
                style={{ strokeDasharray: 264, strokeDashoffset: Math.max(0, 264 - (264 * Math.min(stats?.wordCount ?? 0, 10)) / 10) }}
              ></circle>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-on-surface">{stats?.wordCount ?? 0}</span>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Öğrenilen</span>
            </div>
          </div>

          <div className="space-y-2 w-full">
            <p className="text-on-surface font-bold text-md">Harika İlerleme!</p>
            <p className="text-on-surface-variant text-sm leading-relaxed">Kelime haznenizi geliştirmek için kitap okumaya devam edin ve yeni kelimeler kaydedin.</p>
          </div>

          <div className="mt-8 pt-8 border-t border-outline-variant w-full">
            <div className="flex justify-between items-center">
              <div className="text-left">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Mevcut Rütbe</p>
                <p className="text-lg font-extrabold text-primary">Seçkin Üye</p>
              </div>
              <div className="bg-primary text-on-primary font-bold px-4 py-2 rounded-lg text-sm shadow-sm animate-pulse-soft">
                Seviye 4
              </div>
            </div>
          </div>
        </div>

        {/* Önerilen Adımlar */}
        <div className="space-y-4">
          <h4 className="font-label-md text-on-surface uppercase tracking-wider text-xs px-2 font-bold">Önerilen Adımlar</h4>
          <div className="space-y-3">
            <Link href="/books" className="glass-card p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-colors group">
              <div className="w-12 h-12 rounded-lg bg-secondary-container/50 flex items-center justify-center text-tertiary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-on-surface text-sm">Okuma Kütüphanesi</p>
                <p className="text-xs text-on-surface-variant">Yeni Kitaplar Keşfet</p>
              </div>
              <span className="text-on-surface-variant group-hover:text-primary transition-colors font-bold">&rarr;</span>
            </Link>

            <Link href="/ocr" className="glass-card p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-colors group">
              <div className="w-12 h-12 rounded-lg bg-primary/25 flex items-center justify-center text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-on-surface text-sm">Kendi Metnini Tara (OCR)</p>
                <p className="text-xs text-on-surface-variant">Görselden Metin Okuma</p>
              </div>
              <span className="text-on-surface-variant group-hover:text-primary transition-colors font-bold">&rarr;</span>
            </Link>

            <Link href="/groups" className="glass-card p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-colors group">
              <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-on-surface text-sm">Sınıfım ve Gruplarım</p>
                <p className="text-xs text-on-surface-variant">Arkadaşlarınla Birlikte Çalış</p>
              </div>
              <span className="text-on-surface-variant group-hover:text-primary transition-colors font-bold">&rarr;</span>
            </Link>
          </div>
        </div>

      </aside>
    </div>
  );
}
