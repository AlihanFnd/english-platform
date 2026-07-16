'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { api, Book } from '../api';
import { BookOpen, Search, ArrowRight, Layers, FileText, Bookmark, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

const LEVELS = [
  { id: 'all', label: 'Tüm Seviyeler', color: 'gray' },
  { id: 'A1', label: 'A1', subtitle: 'Beginner', color: 'emerald' },
  { id: 'A1-A2', label: 'A1 - A2', subtitle: 'Elementary', color: 'emerald' },
  { id: 'A2', label: 'A2', subtitle: 'Pre-Intermediate', color: 'emerald' },
  { id: 'A2-B1', label: 'A2 - B1', subtitle: 'Pre to Inter', color: 'sky' },
  { id: 'B1', label: 'B1', subtitle: 'Intermediate', color: 'sky' },
  { id: 'B1-B2', label: 'B1 - B2', subtitle: 'Upper Inter', color: 'indigo' },
  { id: 'B2', label: 'B2', subtitle: 'Upper Inter+', color: 'indigo' },
  { id: 'B2-C1', label: 'B2 - C1', subtitle: 'Adv Transition', color: 'purple' },
  { id: 'C1', label: 'C1', subtitle: 'Advanced', color: 'purple' },
  { id: 'C1-C2', label: 'C1 - C2', subtitle: 'Prof Transition', color: 'rose' },
  { id: 'C2', label: 'C2', subtitle: 'Mastery', color: 'rose' },
];

const CATEGORIES = [
  { id: 'all', label: 'Tümü', icon: Layers },
  { id: 'story', label: 'Hikayeler', icon: BookOpen },
  { id: 'article', label: 'Makaleler', icon: FileText },
  { id: 'other', label: 'Diğer', icon: Bookmark },
];

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadBooks() {
      try {
        const data = await api.getBooks();
        setBooks(data);
      } catch (err: any) {
        setError(err.message || 'Kitaplar yüklenirken hata oluştu.');
      } finally {
        setLoading(false);
      }
    }
    loadBooks();
  }, []);

  const filteredBooks = useMemo(() => {
    return books.filter(b => {
      const matchesSearch = 
        (b.title || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.author || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.description && b.description.toLowerCase().includes(search.toLowerCase()));

      const matchesCategory = 
        selectedCategory === 'all' || 
        (selectedCategory === 'story' && (!b.category || b.category === 'story')) ||
        (b.category === selectedCategory);

      const matchesLevel = 
        selectedLevel === 'all' || 
        (selectedLevel === 'A1' && (!b.level || b.level === 'A1')) ||
        (b.level === selectedLevel);

      return matchesSearch && matchesCategory && matchesLevel;
    });
  }, [books, search, selectedCategory, selectedLevel]);

  function getLevelBadgeStyle(levelStr?: string) {
    const lvl = levelStr || 'A1';
    if (lvl.includes('A1') || lvl.includes('A2')) {
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-emerald-500/10';
    } else if (lvl.includes('B1') || lvl === 'A2-B1') {
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30 shadow-sky-500/10';
    } else if (lvl.includes('B2')) {
      return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 shadow-indigo-500/10';
    } else if (lvl.includes('C1') || lvl.includes('C2')) {
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30 shadow-purple-500/10';
    }
    return 'bg-primary/15 text-primary border-primary/30 shadow-primary/10';
  }

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-lg shadow-primary/30"></div>
        <p className="text-sm font-semibold text-on-surface-variant animate-pulse">Kitaplık hazırlanıyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Sleek, Luxury & Compact Top Navigation & Filter Bar */}
      <div className="glass-card rounded-2xl p-3 sm:p-4 border border-outline-variant/60 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4 sticky top-4 z-30 backdrop-blur-xl">
        {/* Left: Category Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = selectedCategory === cat.id;
            const count = cat.id === 'all' 
              ? books.length 
              : books.filter(b => (cat.id === 'story' ? (!b.category || b.category === 'story') : b.category === cat.id)).length;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-xs sm:text-sm transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-r from-primary to-emerald-600 text-on-primary shadow-md shadow-primary/25 scale-102'
                    : 'bg-surface-container/60 hover:bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-on-primary' : 'text-primary'}`} />
                <span>{cat.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                  isActive ? 'bg-black/20 text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Level Select Dropdown & Compact Mini Search Box */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
          {/* Level Filter Select */}
          <div className="relative flex-shrink-0 w-full sm:w-48">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-primary pointer-events-none text-xs font-black">
              🎯
            </span>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="w-full bg-surface-container-high border border-outline-variant/80 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm font-extrabold text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer shadow-inner"
            >
              {LEVELS.map((lvl) => (
                <option key={lvl.id} value={lvl.id} className="bg-surface font-bold text-on-surface py-1">
                  {lvl.label} {lvl.subtitle ? `(${lvl.subtitle})` : ''}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-on-surface-variant">
              <span className="text-[10px]">▼</span>
            </div>
          </div>

          {/* Compact Mini Search Box */}
          <div className="relative flex-1 sm:w-56">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-on-surface-variant pointer-events-none">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Kitap veya yazar ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-surface-container-high border border-outline-variant/80 pl-9 pr-7 py-2 rounded-xl text-xs sm:text-sm font-medium w-full focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner placeholder:text-on-surface-variant/70 text-on-surface"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[10px] font-bold text-on-surface-variant hover:text-on-surface"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-medium flex items-center gap-3">
          <span className="text-lg">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Books Grid */}
      {filteredBooks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBooks.map((book) => {
            const hasProgress = book.progress !== undefined && book.progress > 0;
            const isCompleted = book.progress !== undefined && book.progress >= 99;
            const levelStyle = getLevelBadgeStyle(book.level);
            const categoryLabel = book.category === 'article' ? '📄 Makale' : book.category === 'other' ? '📁 Diğer' : '📖 Hikaye';

            return (
              <div 
                key={book.id} 
                className="glass-card rounded-3xl p-6 flex flex-col justify-between h-[390px] hover:border-primary/80 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group relative overflow-hidden"
              >
                {/* Top badges bar */}
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold bg-surface-container-highest/80 text-on-surface border border-outline-variant/60">
                    {categoryLabel}
                  </span>

                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-black border shadow-sm ${levelStyle}`}>
                    <span>🎯</span> {book.level || 'A1'}
                  </span>
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex items-start gap-4">
                    {/* Digital Book Cover */}
                    <div
                      className="w-22 h-32 rounded-2xl flex-shrink-0 flex flex-col justify-between p-3.5 text-white font-extrabold relative overflow-hidden transition-transform duration-300 group-hover:scale-105 shadow-md border border-white/10"
                      style={{ 
                        backgroundColor: book.coverColor || 'var(--primary)',
                        backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.25) 100%)'
                      }}
                    >
                      <div className="absolute top-0 right-0 w-12 h-12 bg-white/10 rounded-bl-full pointer-events-none"></div>
                      <span className="z-10 text-[10px] font-black text-left leading-tight line-clamp-3 uppercase tracking-wider drop-shadow-sm">
                        {book.title}
                      </span>
                      <div className="z-10 text-left border-t border-white/20 pt-1.5 mt-auto">
                        <span className="text-[8px] font-semibold text-white/90 block truncate">
                          {book.author || 'Anonim'}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-hidden flex-1 self-center">
                      <h3 className="text-base font-black text-on-surface line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                        {book.title}
                      </h3>
                      <p className="text-xs font-semibold text-on-surface-variant mt-1 truncate">
                        {book.author || 'Bilinmiyor'}
                      </p>

                      <div className="flex items-center gap-2 mt-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-on-surface-variant bg-surface-container/80 border border-outline-variant/60 rounded-lg px-2.5 py-1">
                          <BookOpen className="w-3 h-3 text-primary" />
                          <span>{book.chaptersCount || 1} Bölüm</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-on-surface-variant text-xs mt-4 line-clamp-3 leading-relaxed font-normal">
                    {book.description || 'Bu içerik için açıklama bulunmuyor. Hemen okumaya başlayarak keşfedin.'}
                  </p>
                </div>

                <div className="space-y-3.5 pt-4 border-t border-outline-variant/60 mt-4">
                  {hasProgress && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-on-surface-variant font-bold">
                        <span className="flex items-center gap-1">
                          {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : '⏳'}
                          {isCompleted ? 'Tamamlandı' : 'İlerleme'}
                        </span>
                        <span className="text-primary font-black">%{Math.round(book.progress!)}</span>
                      </div>
                      <div className="w-full bg-surface-container-highest rounded-full h-2 overflow-hidden shadow-inner">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-primary to-emerald-500'
                          }`}
                          style={{ width: `${book.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <Link
                    href={`/books/${book.id}?chapter=${book.currentChapter || 1}`}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/90 hover:to-emerald-600/90 text-on-primary font-extrabold text-sm transition-all shadow-lg shadow-primary/20 bouncy-btn"
                  >
                    <span>{hasProgress ? (isCompleted ? 'Tekrar Oku' : 'Okumaya Devam Et') : 'Hemen Okumaya Başla'}</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel rounded-3xl p-16 text-center text-on-surface-variant max-w-xl mx-auto space-y-4 shadow-xl">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-3xl">
            📚
          </div>
          <h3 className="text-xl font-bold text-on-surface">Kriterlerinize Uygun İçerik Bulunamadı</h3>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Seçtiğiniz kategori veya CEFR seviyesi için henüz bir kitap/makale eklenmemiş veya aramanızla eşleşmiyor.
          </p>
          <button
            onClick={() => { setSelectedCategory('all'); setSelectedLevel('all'); setSearch(''); }}
            className="mt-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-md hover:bg-primary/90 transition"
          >
            Tüm Filtreleri Temizle
          </button>
        </div>
      )}
    </div>
  );
}
