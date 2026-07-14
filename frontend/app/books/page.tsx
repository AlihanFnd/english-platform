'use client';

import React, { useEffect, useState } from 'react';
import { api, Book } from '../api';
import { BookOpen, Search, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
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

  const filteredBooks = books.filter(b => 
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    b.author.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-on-surface tracking-tight">Kitaplık</h1>
          <p className="text-on-surface-variant mt-1">Okumak istediğiniz kitabı seçip hemen çeviri desteğiyle okumaya başlayın.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-on-surface-variant pointer-events-none">
            <Search className="h-5 w-5" />
          </span>
          <input
            type="text"
            placeholder="Kitap veya yazar ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input pl-10 block w-full px-4 py-3 rounded-xl text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Books Grid */}
      {filteredBooks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBooks.map((book) => {
            const hasProgress = book.progress !== undefined && book.progress > 0;
            return (
              <div key={book.id} className="glass-card rounded-2xl p-6 flex flex-col justify-between h-[360px] hover:border-primary transition-all">
                <div>
                  <div className="flex items-start gap-4">
                    {/* Minimalist Digital Book Cover aligned with the current theme */}
                    <div
                      className="w-20 h-28 rounded-xl flex-shrink-0 flex flex-col justify-between p-3 text-white font-extrabold relative overflow-hidden transition-transform duration-300 group-hover:scale-[1.02] shadow-sm border border-black/5"
                      style={{ 
                        backgroundColor: book.coverColor || 'var(--primary)'
                      }}
                    >
                      <div className="absolute inset-0 bg-black/10"></div>
                      <span className="z-10 text-[9px] font-black text-left leading-tight line-clamp-3 uppercase tracking-wider">
                        {book.title}
                      </span>
                      <div className="z-10 text-left">
                        <span className="text-[7px] font-semibold text-white/80 block truncate">
                          {book.author}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-hidden flex-1 self-center">
                      <h3 className="text-md font-extrabold text-on-surface truncate group-hover:text-primary transition-colors leading-snug">{book.title}</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5 truncate">{book.author}</p>
                      <span className="inline-block text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-lg px-2.5 py-0.5 mt-2.5">
                        {book.chaptersCount} BÖLÜM
                      </span>
                    </div>
                  </div>

                  <p className="text-on-surface-variant text-xs mt-4 line-clamp-3 leading-relaxed">
                    {book.description || 'Bu kitap için açıklama bulunmuyor.'}
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-outline-variant">
                  {hasProgress && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-on-surface-variant font-semibold">
                        <span>İlerleme</span>
                        <span>%{Math.round(book.progress!)}</span>
                      </div>
                      <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${book.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <Link
                    href={`/books/${book.id}?chapter=${book.currentChapter || 1}`}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-sm transition-all shadow-md shadow-primary/20 bouncy-btn"
                  >
                    {hasProgress ? 'Okumaya Devam Et' : 'Okumaya Başla'}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-12 text-center text-on-surface-variant">
          <BookOpen className="h-12 w-12 text-on-surface-variant mx-auto mb-4" />
          <p>Kriterlerinize uygun kitap bulunamadı.</p>
        </div>
      )}
    </div>
  );
}
