'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api, WordItem } from '../api';
import { BookMarked, Trash2, Edit3, Plus, Check, X, Sparkles, Brain, Award, RefreshCw } from 'lucide-react';

export default function WordsPage() {
  const [words, setWords] = useState<WordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fast Word Add inputs
  const [fastWord, setFastWord] = useState('');
  const [fastTranslation, setFastTranslation] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const fastWordInputRef = useRef<HTMLInputElement>(null);

  // Edit states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTranslation, setEditTranslation] = useState('');
  const [editWordText, setEditWordText] = useState('');
  const [editContext, setEditContext] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Flashcard flipping state - stores set of flipped IDs
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());

  // Study / Test Mode states
  const [studyMode, setStudyMode] = useState(false);
  const [studyWords, setStudyWords] = useState<WordItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ known: 0, unknown: 0 });

  const loadWords = async () => {
    try {
      const data = await api.getWords();
      setWords(data);
    } catch (err: any) {
      setError(err.message || 'Kelimeler yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWords();
  }, []);

  // Quick translation as user types
  const handleFastTranslate = async () => {
    if (!fastWord.trim()) return;
    setIsTranslating(true);
    try {
      const res = await api.translateWord(fastWord.trim());
      setFastTranslation(res.translation);
    } catch (e) {
      console.error(e);
    } finally {
      setIsTranslating(false);
    }
  };

  // Submit fast-add word on press enter
  const handleFastAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fastWord.trim() || !fastTranslation.trim()) return;
    setIsAdding(true);
    try {
      await api.addWord(fastWord.trim(), fastTranslation.trim(), '');
      setFastWord('');
      setFastTranslation('');
      fastWordInputRef.current?.focus();
      await loadWords();
    } catch (err: any) {
      alert(err.message || 'Kelime eklenemedi.');
    } finally {
      setIsAdding(false);
    }
  };

  // Edit / Update translations
  const startEdit = (item: WordItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditWordText(item.word);
    setEditTranslation(item.translation);
    setEditContext(item.context || '');
  };

  const handleUpdate = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editWordText.trim() || !editTranslation.trim()) return;
    setUpdatingId(id);
    try {
      await api.updateWord(id, editWordText.trim(), editTranslation.trim(), editContext.trim());
      setEditingId(null);
      await loadWords();
    } catch (err: any) {
      alert(err.message || 'Güncellenemedi.');
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bu kelimeyi silmek istediğinize emin misiniz?')) return;
    try {
      await api.deleteWord(id);
      setWords(prev => prev.filter(w => w.id !== id));
      if (studyMode) {
        setStudyWords(prev => prev.filter(w => w.id !== id));
      }
    } catch (err: any) {
      alert(err.message || 'Kelime silinemedi.');
    }
  };

  const toggleFlip = (id: number) => {
    if (editingId === id) return;
    setFlippedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Start study session
  const startStudySession = () => {
    if (words.length === 0) return;
    const shuffled = [...words].sort(() => 0.5 - Math.random());
    setStudyWords(shuffled);
    setCurrentIdx(0);
    setShowAnswer(false);
    setStats({ known: 0, unknown: 0 });
    setStudyMode(true);
  };

  const handleStudyAction = (known: boolean) => {
    if (known) {
      setStats(p => ({ ...p, known: p.known + 1 }));
    } else {
      setStats(p => ({ ...p, unknown: p.unknown + 1 }));
    }

    if (currentIdx + 1 < studyWords.length) {
      setCurrentIdx(currentIdx + 1);
      setShowAnswer(false);
    } else {
      setCurrentIdx(studyWords.length);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-on-surface tracking-tight flex items-center gap-2">
            <BookMarked className="h-8 w-8 text-primary" />
            Kelime Listem
          </h1>
          <p className="text-on-surface-variant mt-1">İzlediğiniz dizi ve filmlerden kelimeleri anında ekleyip pratik yapın.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-surface-container/60 backdrop-blur-md px-4 py-2 border border-outline-variant/60 rounded-2xl flex items-center gap-2.5 shadow-sm">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Kelimelerim</span>
            <span className="text-xl font-black text-primary">{words.length}</span>
          </div>

          {words.length > 0 && !studyMode && (
            <button
              onClick={startStudySession}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-2xl font-bold text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <Brain size={14} />
              Pratik Yap (Kartlar)
            </button>
          )}
        </div>
      </div>

      {/* STUDY MODE SIMULATOR SCREEN */}
      {studyMode && (
        <div className="max-w-xl mx-auto glass-card border border-primary/30 rounded-3xl p-8 space-y-6 shadow-xl animate-fade-in relative overflow-hidden">
          <div className="flex justify-between items-center border-b border-outline-variant pb-4">
            <h3 className="text-sm font-bold text-primary flex items-center gap-1.5"><Brain size={16}/> Kelime Pratiği</h3>
            <button
              onClick={() => setStudyMode(false)}
              className="p-1.5 rounded-lg hover:bg-surface-variant text-on-surface-variant transition-all cursor-pointer"
              title="Çıkış"
            >
              <X size={16} />
            </button>
          </div>

          {currentIdx < studyWords.length ? (
            <div className="space-y-6 text-center">
              <span className="text-[10px] bg-primary/10 text-primary font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Kart {currentIdx + 1} / {studyWords.length}
              </span>

              <div 
                onClick={() => setShowAnswer(!showAnswer)}
                className="py-12 px-6 rounded-2xl bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant min-h-[160px] flex flex-col justify-center items-center shadow-inner relative"
              >
                {!showAnswer ? (
                  <div className="space-y-1">
                    <h2 className="text-3xl font-black text-on-surface tracking-wide capitalize">{studyWords[currentIdx].word}</h2>
                    <p className="text-[10px] text-on-surface-variant uppercase font-semibold mt-4">Anlamını görmek için tıkla</p>
                  </div>
                ) : (
                  <div className="space-y-2 animate-fade-in">
                    <p className="text-xs text-primary font-bold uppercase tracking-widest">Türkçe Karşılığı</p>
                    <h2 className="text-2xl font-extrabold text-on-surface capitalize">{studyWords[currentIdx].translation}</h2>
                    {studyWords[currentIdx].context && (
                      <p className="text-xs text-on-surface-variant italic mt-3 max-w-sm">"{studyWords[currentIdx].context}"</p>
                    )}
                  </div>
                )}
              </div>

              {/* Know / Don't Know Actions */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => handleStudyAction(false)}
                  className="flex-1 py-3 px-5 border border-red-500/30 text-red-500 hover:bg-red-500/10 rounded-xl font-bold text-xs transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  Bilmiyorum ❌
                </button>
                <button
                  onClick={() => handleStudyAction(true)}
                  className="flex-1 py-3 px-5 bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container rounded-xl font-bold text-xs shadow-md shadow-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  Biliyorum  
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-6">
              <Award className="w-16 h-16 text-yellow-500 mx-auto animate-bounce" />
              <div className="space-y-1">
                <h3 className="text-xl font-black text-on-surface">Harika İş!</h3>
                <p className="text-xs text-on-surface-variant">Çalışma seansını tamamladın.</p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-green-600 font-bold uppercase">Bildiğim</p>
                  <p className="text-2xl font-black text-green-500">{stats.known}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-red-600 font-bold uppercase">Bilmediğim</p>
                  <p className="text-2xl font-black text-red-500">{stats.unknown}</p>
                </div>
              </div>

              <div className="flex justify-center gap-2.5 pt-4">
                <button
                  onClick={() => setStudyMode(false)}
                  className="px-5 py-2.5 border border-outline-variant text-on-surface-variant hover:text-on-surface rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Kapat
                </button>
                <button
                  onClick={startStudySession}
                  className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={12} /> Tekrar Dene
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Split Layout for Card list and Add widget */}
      {!studyMode && (
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* Left / Main section: Saved Cards Grid */}
          <div className="flex-1 w-full order-2 lg:order-1">
            {words.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {words.map((item) => {
                  const isFlipped = flippedCards.has(item.id);
                  const isEditing = editingId === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleFlip(item.id)}
                      className="h-56 cursor-pointer relative select-none perspective-1000 group"
                    >
                      <div
                        className={`w-full h-full transition-transform duration-500 transform-style-3d relative ${
                          isFlipped ? 'rotate-y-180' : ''
                        }`}
                      >
                        {/* FRONT SIDE (English) */}
                        <div className="absolute inset-0 backface-hidden glass-card rounded-2xl p-6 flex flex-col justify-between border border-outline-variant/60 group-hover:border-primary/40 transition-all shadow-sm hover:shadow-md bg-surface/90">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-primary tracking-wider bg-primary/10 px-2.5 py-1 rounded-lg">
                              EN
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => startEdit(item, e)}
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all cursor-pointer"
                                title="Kelimeyi Düzenle"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(item.id, e)}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-on-surface-variant hover:text-red-400 transition-all cursor-pointer"
                                title="Sil"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="my-auto space-y-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editWordText}
                                onChange={(e) => setEditWordText(e.target.value)}
                                className="w-full bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded-lg px-2.5 py-1.5 text-xs outline-none font-bold"
                                placeholder="Kelime"
                              />
                              <input
                                type="text"
                                value={editContext}
                                onChange={(e) => setEditContext(e.target.value)}
                                className="w-full bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded-lg px-2.5 py-1.5 text-[11px] outline-none"
                                placeholder="Kullanım cümlesi"
                              />
                            </div>
                          ) : (
                            <div className="my-auto text-center">
                              <h3 className="text-2xl font-black text-on-surface capitalize tracking-wide">{item.word}</h3>
                              {item.context && (
                                <p className="text-xs text-on-surface-variant mt-2.5 line-clamp-2 italic px-2">
                                  "{item.context}"
                                </p>
                              )}
                            </div>
                          )}

                          {isEditing ? (
                            <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button onClick={cancelEdit} className="p-1 border border-outline-variant text-on-surface-variant hover:text-on-surface rounded-lg cursor-pointer"><X size={13}/></button>
                              <button onClick={(e) => handleUpdate(item.id, e)} disabled={updatingId === item.id} className="p-1 bg-primary text-on-primary rounded-lg cursor-pointer"><Check size={13}/></button>
                            </div>
                          ) : (
                            <div className="text-center text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-widest group-hover:text-primary transition-colors">
                              ANLAMI GÖSTER &rarr;
                            </div>
                          )}
                        </div>

                        {/* BACK SIDE (Turkish Translation) */}
                        <div className="absolute inset-0 backface-hidden rotate-y-180 glass-card rounded-2xl p-6 flex flex-col justify-between border border-primary/30 bg-surface/95 shadow-md">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-primary tracking-wider bg-primary/10 px-2.5 py-1 rounded-lg">
                              TR
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => startEdit(item, e)}
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all cursor-pointer"
                                title="Çeviriyi Düzenle"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(item.id, e)}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-on-surface-variant hover:text-red-400 transition-all cursor-pointer"
                                title="Sil"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="my-auto" onClick={(e) => e.stopPropagation()}>
                              <label className="block text-[9px] font-bold text-on-surface-variant mb-1 uppercase">ÇEVİRİ</label>
                              <input
                                type="text"
                                value={editTranslation}
                                onChange={(e) => setEditTranslation(e.target.value)}
                                className="w-full bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded-lg px-2.5 py-1.5 text-xs outline-none font-bold"
                                placeholder="Türkçe Çeviri"
                              />
                            </div>
                          ) : (
                            <div className="my-auto text-center">
                              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Türkçe Karşılığı</p>
                              <h3 className="text-xl font-bold text-primary capitalize mt-2">{item.translation}</h3>
                            </div>
                          )}

                          {isEditing ? (
                            <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button onClick={cancelEdit} className="p-1 border border-outline-variant text-on-surface-variant hover:text-on-surface rounded-lg cursor-pointer"><X size={13}/></button>
                              <button onClick={(e) => handleUpdate(item.id, e)} disabled={updatingId === item.id} className="p-1 bg-primary text-on-primary rounded-lg cursor-pointer"><Check size={13}/></button>
                            </div>
                          ) : (
                            <div className="text-center text-[10px] text-primary font-bold uppercase tracking-widest group-hover:scale-105 transition-transform">
                              KELİMEYE DÖN &larr;
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="glass-card rounded-2xl p-12 text-center text-on-surface-variant">
                <BookMarked className="h-12 w-12 text-on-surface-variant mx-auto mb-4" />
                <p>Henüz kelime kaydetmediniz.</p>
                <p className="text-xs mt-1 text-on-surface-variant">Kitap okurken bilmediğiniz kelimelerin üzerine tıklayarak veya yandaki seri ekleme panelinden doğrudan kelimelerinizi girebilirsiniz.</p>
              </div>
            )}
          </div>

          {/* Right / Sidebar: Floating premium input card */}
          <div className="w-full lg:w-[320px] order-1 lg:order-2 lg:sticky lg:top-24 shrink-0">
            <div className="glass-card rounded-2xl p-5 border border-primary/30 bg-gradient-to-b from-primary/5 via-transparent to-transparent shadow-xl relative overflow-hidden transition-all hover:border-primary/50">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 blur-[40px] rounded-full pointer-events-none"></div>
              
              <div className="flex items-center gap-2.5 mb-4 text-primary font-bold text-xs uppercase tracking-wider">
                <div className="p-1.5 rounded-xl bg-primary/10">
                  <Sparkles size={14} className="text-primary animate-pulse" />
                </div>
                <span>Seri Kelime Girişi</span>
              </div>

              <p className="text-[11px] text-on-surface-variant mb-4 leading-relaxed">Dizi izlerken veya kitap okurken bilmediğiniz kelimeyi yazın, anlamı otomatik olarak Google Translate ile anında doldurulacaktır.</p>

              <form onSubmit={handleFastAddSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 mb-1 uppercase tracking-wider">İNGİLİZCE KELİME</label>
                  <input
                    ref={fastWordInputRef}
                    type="text"
                    required
                    value={fastWord}
                    onChange={(e) => setFastWord(e.target.value)}
                    onBlur={handleFastTranslate}
                    placeholder="E.g. mysterious"
                    className="w-full bg-surface-container border border-outline-variant/60 focus:border-primary/60 text-on-surface rounded-xl px-4 py-3 text-xs outline-none font-semibold transition-all shadow-inner focus:bg-surface focus:shadow-md"
                  />
                </div>

                <div className="relative">
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 mb-1 uppercase tracking-wider">TÜRKÇE ANLAMI</label>
                  <input
                    type="text"
                    required
                    value={fastTranslation}
                    onChange={(e) => setFastTranslation(e.target.value)}
                    placeholder={isTranslating ? "Otomatik çevriliyor..." : "Gizemli, esrarengiz"}
                    className="w-full bg-surface-container border border-outline-variant/60 focus:border-primary/60 text-on-surface rounded-xl px-4 py-3 text-xs outline-none transition-all shadow-inner focus:bg-surface focus:shadow-md font-semibold"
                  />
                  {isTranslating && (
                    <div className="absolute right-3.5 bottom-3 w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isAdding || !fastWord.trim()}
                  className="w-full py-3.5 bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container rounded-xl text-xs font-black shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                >
                  <Plus size={15} /> Sözlüğe Kaydet
                </button>
              </form>
            </div>
          </div>

        </div>
      )}

      {/* Modern 3D Flip Animasyon Düzeltmeleri - Safari/Chrome için backface-visibility override */}
      <style jsx global>{`
        .perspective-1000 {
          perspective: 1000px;
          -webkit-perspective: 1000px;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
          -webkit-transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
          -webkit-transform: rotateY(180deg);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.25s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
