'use client';

import React from 'react';
import { BarChart3, X, GraduationCap, CheckCircle2, Flame, Target } from 'lucide-react';
import { KelimeOzeti, WordItem } from '../api';
import { CumleOzeti, SentenceItem } from '../lib/cumleDeposu';

interface IlerlemeRaporuModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'kelime' | 'cumle';
  words: WordItem[];
  wordSummary: KelimeOzeti | null;
  sentences: SentenceItem[];
  sentenceSummary: CumleOzeti | null;
}

export function IlerlemeRaporuModal({
  isOpen,
  onClose,
  type,
  words,
  wordSummary,
  sentences,
  sentenceSummary,
}: IlerlemeRaporuModalProps) {
  if (!isOpen) return null;

  const isWord = type === 'kelime';
  const total = isWord
    ? (wordSummary?.toplam ?? words.length)
    : (sentenceSummary?.toplam ?? sentences.length);

  const learned = isWord
    ? (wordSummary?.ogrenildi ?? 0)
    : (sentenceSummary?.ogrenildi ?? 0);

  const learning = isWord
    ? (wordSummary?.calisiliyor ?? 0)
    : (sentenceSummary?.calisiliyor ?? 0);

  const notEncountered = isWord
    ? (wordSummary?.hicCalisilmadi ?? 0)
    : (sentenceSummary?.hicCalisilmadi ?? 0);

  const percentage = total > 0 ? Math.round((learned / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-container-high border border-outline-variant rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-on-surface">
              {isWord ? 'Kelime İlerleme Durumu' : 'Cümle İlerleme Durumu'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="p-6 rounded-2xl bg-surface border border-outline-variant text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mb-1">
              <GraduationCap className="w-6 h-6" />
            </div>
            <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
              Öğrenilme Oranı
            </p>
            <p className="text-3xl font-black text-green-500">%{percentage}</p>
            <p className="text-xs text-on-surface-variant">
              {total} kayıttan {learned} tanesi tam öğrenildi
            </p>
            <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden mt-3">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-3.5 bg-green-500/10 border border-green-500/20 rounded-xl">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs font-bold text-green-600">Bildiğim (Öğrenildi)</span>
              </div>
              <span className="text-base font-black text-green-500">{learned}</span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-primary/10 border border-primary/20 rounded-xl">
              <div className="flex items-center gap-2.5">
                <Flame className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-primary">Çalışılıyor</span>
              </div>
              <span className="text-base font-black text-primary">{learning}</span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-surface-container border border-outline-variant rounded-xl">
              <div className="flex items-center gap-2.5">
                <Target className="w-4 h-4 text-on-surface-variant" />
                <span className="text-xs font-bold text-on-surface">Henüz Karşılaşılmadı</span>
              </div>
              <span className="text-base font-black text-on-surface">{notEncountered}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 border border-outline-variant text-on-surface-variant hover:text-on-surface font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
