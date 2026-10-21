'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { api, WordItem, CalismaKarti, KelimeOzeti, CumleItem, CumleOzeti } from '../api';
import { cumleGocuCalistir } from '../lib/cumleGocu';
import { useTelaffuz, KELIME_HIZI } from '../hooks/useTelaffuz';
import { useAuth } from '../context/AuthContext';
import { TopluEkleModal } from '../components/TopluEkleModal';
import { IlerlemeRaporuModal } from '../components/IlerlemeRaporuModal';
import {
  BookMarked,
  Trash2,
  Edit3,
  Plus,
  Check,
  X,
  Sparkles,
  Brain,
  Award,
  RefreshCw,
  GraduationCap,
  Target,
  Volume2,
  Loader2,
  FileUp,
  BarChart3,
  MessageSquare,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

function altAnlamlariAyikla(ham?: string): string[] {
  if (!ham) return [];
  return ham
    .split('\n')
    .flatMap((satir) => {
      const iki = satir.replace(/^[•\s-]+/, '').split(':');
      return (iki.length > 1 ? iki.slice(1).join(':') : iki[0]).split(',');
    })
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 40)
    .slice(0, 6);
}

const YEDEK_CELDIRICILER = [
  { word: 'journey', translation: 'yolculuk' },
  { word: 'courage', translation: 'cesaret' },
  { word: 'freedom', translation: 'özgürlük' },
  { word: 'discovery', translation: 'keşif' },
  { word: 'whisper', translation: 'fısıltı' },
  { word: 'curiosity', translation: 'merak' },
  { word: 'silence', translation: 'sessizlik' },
  { word: 'promise', translation: 'söz, vaat' },
  { word: 'adventure', translation: 'macera' },
  { word: 'patience', translation: 'sabır' },
  { word: 'memory', translation: 'anı, hafıza' },
  { word: 'treasure', translation: 'hazine' },
];

export default function WordsPage() {
  const { destekleniyor: telaffuzVar, seslendir, konusuyorMu } = useTelaffuz();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'kelime' | 'cumle'>('kelime');

  const [words, setWords] = useState<WordItem[]>([]);
  const [ozet, setOzet] = useState<KelimeOzeti | null>(null);

  const [sentences, setSentences] = useState<CumleItem[]>([]);
  const [sentenceSummary, setSentenceSummary] = useState<CumleOzeti | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [modeChoiceModalOpen, setModeChoiceModalOpen] = useState(false);

  /* Hızlı Kelime Ekleme */
  const [fastWord, setFastWord] = useState('');
  const [fastTranslation, setFastTranslation] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [alternatifler, setAlternatifler] = useState<string[]>([]);
  const fastWordInputRef = useRef<HTMLInputElement>(null);

  /* Hızlı Cümle Ekleme */
  const [fastSentence, setFastSentence] = useState('');
  const [fastSentenceTranslation, setFastSentenceTranslation] = useState('');
  const [isSentenceTranslating, setIsSentenceTranslating] = useState(false);
  const [isSentenceAdding, setIsSentenceAdding] = useState(false);
  const fastSentenceInputRef = useRef<HTMLTextAreaElement>(null);

  /* Düzenleme */
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [editTranslation, setEditTranslation] = useState('');
  const [editWordText, setEditWordText] = useState('');
  const [updatingId, setUpdatingId] = useState<number | string | null>(null);

  const [flippedCards, setFlippedCards] = useState<Set<number | string>>(new Set());

  /* Pratik Seçimleri */
  const [selectedStudyMode, setSelectedStudyMode] = useState<'test' | 'flashcard'>('test');
  const [selectedCount, setSelectedCount] = useState(10);

  /* Aktif Quiz */
  const [studyMode, setStudyMode] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [optionsLocked, setOptionsLocked] = useState(false);
  const [studyItems, setStudyItems] = useState<
    Array<{
      id: number | string;
      original: string;
      translation: string;
      context?: string;
      dogruSeri: number;
      kutu?: number;
      ogrenildi: boolean;
    }>
  >([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ known: 0, unknown: 0 });
  const [seansYukleniyor, setSeansYukleniyor] = useState(false);

  const loadData = async () => {
    try {
      setError('');
      if (user?.id) {
        await cumleGocuCalistir(user.id);
      }
      const [wData, oData, sData, sOzet] = await Promise.all([
        api.getWords(),
        api.getKelimeOzeti(),
        api.getSentences(),
        api.getCumleOzeti(),
      ]);
      setWords(wData);
      setOzet(oData);
      setSentences(sData);
      setSentenceSummary(sOzet);
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const loadOzet = async () => {
    try {
      const [oData, sOzet] = await Promise.all([
        api.getKelimeOzeti(),
        api.getCumleOzeti(),
      ]);
      setOzet(oData);
      setSentenceSummary(sOzet);
    } catch {}
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user?.id]);

  /* Kelime Otomatik Çeviri */
  const ceviriOnbellegi = useRef<Map<string, { ana: string; alt: string[] }>>(new Map());
  const istekSayaci = useRef(0);
  const ceviriElleDegisti = useRef(false);

  useEffect(() => {
    const kelime = fastWord.trim().toLowerCase();
    if (!kelime) {
      setIsTranslating(false);
      setAlternatifler([]);
      return;
    }
    if (ceviriElleDegisti.current) return;

    const onbellekten = ceviriOnbellegi.current.get(kelime);
    if (onbellekten !== undefined) {
      setFastTranslation(onbellekten.ana);
      setAlternatifler(onbellekten.alt);
      setIsTranslating(false);
      return;
    }

    setIsTranslating(true);
    const benimSiram = ++istekSayaci.current;

    const timer = setTimeout(async () => {
      try {
        const res = await api.translateWord(kelime);
        if (benimSiram !== istekSayaci.current) return;

        const ana = (res.generalMeaning || res.translation || '').split('\n')[0].trim();
        const alt = altAnlamlariAyikla(res.synonyms);

        ceviriOnbellegi.current.set(kelime, { ana, alt });
        if (!ceviriElleDegisti.current) {
          setFastTranslation(ana);
          setAlternatifler(alt);
        }
      } catch {
        if (benimSiram === istekSayaci.current) {
          setFastTranslation('');
          setAlternatifler([]);
        }
      } finally {
        if (benimSiram === istekSayaci.current) setIsTranslating(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [fastWord]);

  /* Cümle Otomatik Çeviri */
  const cumleCeviriOnbellegi = useRef<Map<string, string>>(new Map());
  const cumleIstekSayaci = useRef(0);
  const cumleElleDegisti = useRef(false);

  useEffect(() => {
    const cumle = fastSentence.trim();
    if (!cumle) {
      setIsSentenceTranslating(false);
      return;
    }
    if (cumleElleDegisti.current) return;

    const onbellekten = cumleCeviriOnbellegi.current.get(cumle.toLowerCase());
    if (onbellekten !== undefined) {
      setFastSentenceTranslation(onbellekten);
      setIsSentenceTranslating(false);
      return;
    }

    setIsSentenceTranslating(true);
    const benimSiram = ++cumleIstekSayaci.current;

    const timer = setTimeout(async () => {
      try {
        const res = await api.translateSentence(cumle);
        if (benimSiram !== cumleIstekSayaci.current) return;
        cumleCeviriOnbellegi.current.set(cumle.toLowerCase(), res.translation);
        if (!cumleElleDegisti.current) {
          setFastSentenceTranslation(res.translation);
        }
      } catch {
        if (benimSiram === cumleIstekSayaci.current) {
          setFastSentenceTranslation('');
        }
      } finally {
        if (benimSiram === cumleIstekSayaci.current) setIsSentenceTranslating(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [fastSentence]);

  /* Hızlı Ekleme */
  const handleFastWordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fastWord.trim() || !fastTranslation.trim()) return;
    setIsAdding(true);
    try {
      await api.addWord(fastWord.trim(), fastTranslation.trim(), '');
      setFastWord('');
      setFastTranslation('');
      setAlternatifler([]);
      ceviriElleDegisti.current = false;
      fastWordInputRef.current?.focus();
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Kelime eklenemedi.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleFastSentenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fastSentence.trim() || !fastSentenceTranslation.trim()) return;
    setIsSentenceAdding(true);
    try {
      await api.addSentence(fastSentence.trim(), fastSentenceTranslation.trim(), '');
      setFastSentence('');
      setFastSentenceTranslation('');
      cumleElleDegisti.current = false;
      fastSentenceInputRef.current?.focus();
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Cümle eklenemedi.');
    } finally {
      setIsSentenceAdding(false);
    }
  };

  const toggleFlip = (id: number | string) => {
    if (editingId === id) return;
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
  };

  const startEditWord = (item: WordItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditWordText(item.word);
    setEditTranslation(item.translation);
  };

  const startEditSentence = (item: CumleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditWordText(item.cumle);
    setEditTranslation(item.ceviri);
  };

  const handleUpdateWord = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editWordText.trim() || !editTranslation.trim()) return;
    setUpdatingId(id);
    try {
      await api.updateWord(id, editWordText.trim(), editTranslation.trim(), '');
      setEditingId(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Güncellenemedi.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateSentence = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editWordText.trim() || !editTranslation.trim()) return;
    setUpdatingId(id);
    try {
      await api.updateSentence(id, editWordText.trim(), editTranslation.trim(), '');
      setEditingId(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Güncellenemedi.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteWord = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bu kelimeyi silmek istediğinize emin misiniz?')) return;
    try {
      await api.deleteWord(id);
      setWords((prev) => prev.filter((w) => w.id !== id));
      loadOzet();
    } catch (err: any) {
      alert(err.message || 'Kelime silinemedi.');
    }
  };

  const handleDeleteSentence = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bu cümleyi silmek istediğinize emin misiniz?')) return;
    try {
      await api.deleteSentence(id);
      setSentences((prev) => prev.filter((s) => s.id !== id));
      loadOzet();
    } catch (err: any) {
      alert(err.message || 'Cümle silinemedi.');
    }
  };

  const handleMarkWordKnown = async (item: WordItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.kaydetCalismaSonucu(item.id, true);
      setWords((prev) =>
        prev.map((w) => (w.id === item.id ? { ...w, dogruSeri: (w as any).dogruSeri + 1 } : w)),
      );
      loadOzet();
    } catch {}
  };

  const handleMarkSentenceKnown = async (item: CumleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.kaydetCumleCalismaSonucu(item.id, true);
      setSentences((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, dogruSeri: s.dogruSeri + 1 } : s)),
      );
      loadOzet();
    } catch {}
  };

  /* Pratik Başlatma */
  const activeListLength = activeTab === 'kelime' ? words.length : sentences.length;

  const startStudySession = async (mode: 'test' | 'flashcard', count: number, calismaModu: 'tekrar' | 'serbest' = 'tekrar') => {
    setModeChoiceModalOpen(false);
    if (activeListLength === 0) return;
    setSeansYukleniyor(true);

    try {
      if (activeTab === 'kelime') {
        const kartlar = await api.getCalismaSeansi(count, calismaModu);
        setStudyItems(
          kartlar.map((k) => ({
            id: k.id,
            original: k.word,
            translation: k.translation,
            context: k.context,
            dogruSeri: k.dogruSeri,
            kutu: k.kutu,
            ogrenildi: k.ogrenildi,
          })),
        );
      } else {
        const cKartlar = await api.getCalismaCumleleri(count, calismaModu);
        setStudyItems(
          cKartlar.map((c) => ({
            id: c.id,
            original: c.cumle,
            translation: c.ceviri,
            context: c.baglam,
            dogruSeri: c.dogruSeri,
            kutu: c.kutu,
            ogrenildi: c.ogrenildi,
          })),
        );
      }

      setSelectedStudyMode(mode);
      setCurrentIdx(0);
      setShowAnswer(false);
      setStats({ known: 0, unknown: 0 });
      setSelectedOption(null);
      setOptionsLocked(false);
      setStudyMode(true);
    } catch (err: any) {
      alert(err.message || 'Çalışma seansı başlatılamadı.');
    } finally {
      setSeansYukleniyor(false);
    }
  };

  const currentItem = studyItems[currentIdx];

  const currentOptions = useMemo(() => {
    if (!currentItem) return [];
    const correct = currentItem.original;
    const pool =
      activeTab === 'kelime'
        ? words.map((w) => w.word).filter((w) => w.toLowerCase() !== correct.toLowerCase())
        : sentences.map((s) => s.cumle).filter((s) => s.toLowerCase() !== correct.toLowerCase());

    const combinedPool = [
      ...pool,
      ...YEDEK_CELDIRICILER.map((y) => y.word).filter((w) => w.toLowerCase() !== correct.toLowerCase()),
    ];

    const shuffled = [...new Set(combinedPool)].sort(() => 0.5 - Math.random()).slice(0, 3);
    return [correct, ...shuffled].sort(() => 0.5 - Math.random());
  }, [currentItem, activeTab, words, sentences]);

  const recordResult = (id: number | string, known: boolean) => {
    if (activeTab === 'kelime') {
      api.kaydetCalismaSonucu(Number(id), known).then(loadOzet).catch(() => {});
    } else {
      api.kaydetCumleCalismaSonucu(Number(id), known).then(loadOzet).catch(() => {});
    }
  };

  const handleOptionSelect = (option: string) => {
    if (optionsLocked || !currentItem) return;
    setOptionsLocked(true);
    setSelectedOption(option);

    const isCorrect = option.toLowerCase().trim() === currentItem.original.toLowerCase().trim();
    if (isCorrect) setStats((s) => ({ ...s, known: s.known + 1 }));
    else setStats((s) => ({ ...s, unknown: s.unknown + 1 }));

    recordResult(currentItem.id, isCorrect);

    setTimeout(() => {
      setCurrentIdx((prev) => prev + 1);
      setSelectedOption(null);
      setOptionsLocked(false);
    }, 750);
  };

  const handleFlashcardAnswer = (known: boolean) => {
    if (!currentItem) return;
    if (known) setStats((s) => ({ ...s, known: s.known + 1 }));
    else setStats((s) => ({ ...s, unknown: s.unknown + 1 }));

    recordResult(currentItem.id, known);
    setCurrentIdx((prev) => prev + 1);
    setShowAnswer(false);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeTotal = activeTab === 'kelime' ? (ozet?.toplam ?? words.length) : (sentenceSummary?.toplam ?? sentences.length);
  const activeLearned = activeTab === 'kelime' ? (ozet?.ogrenildi ?? 0) : (sentenceSummary?.ogrenildi ?? 0);
  const activeRemaining = activeTab === 'kelime' ? (ozet?.hicCalisilmadi ?? 0) : (sentenceSummary?.hicCalisilmadi ?? 0);
  const accuracyPercent = studyItems.length > 0 ? Math.round((stats.known / (stats.known + stats.unknown || 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Üst Başlık & Sade Eylemler ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface tracking-tight flex items-center gap-2">
            {activeTab === 'kelime' ? <BookMarked className="h-7 w-7 text-primary" /> : <MessageSquare className="h-7 w-7 text-primary" />}
            {activeTab === 'kelime' ? 'Kelimelerim' : 'Cümlelerim'}
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            {activeTab === 'kelime' ? `${activeTotal} kelime kayıtlı` : `${activeTotal} cümle kayıtlı`}
          </p>
        </div>

        {/* Eylem Butonları */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setModeChoiceModalOpen(true)}
            disabled={activeListLength === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-xs shadow-md shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            <Brain size={15} />
            Pratik Yap
          </button>

          <button
            onClick={() => setBulkImportOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-surface-container border border-outline-variant hover:border-primary/40 text-on-surface rounded-xl font-bold text-xs transition-all cursor-pointer shadow-sm"
          >
            <FileUp size={14} className="text-primary" />
            Toplu Ekle
          </button>

          <button
            onClick={() => setReportModalOpen(true)}
            className="p-2.5 bg-surface-container border border-outline-variant hover:border-primary/40 text-on-surface-variant hover:text-on-surface rounded-xl transition-all cursor-pointer shadow-sm"
            title="İlerleme Raporu"
          >
            <BarChart3 size={16} />
          </button>
        </div>
      </div>

      {/* ── Sade Sekme Geçişi & İlerleme Kartı ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Sekme */}
        <div className="flex p-1 bg-surface-container border border-outline-variant rounded-xl max-w-xs">
          <button
            onClick={() => {
              setActiveTab('kelime');
              setStudyMode(false);
            }}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'kelime'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Kelimelerim ({ozet?.toplam ?? words.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('cumle');
              setStudyMode(false);
            }}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'cumle'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Cümlelerim ({sentenceSummary?.toplam ?? sentences.length})
          </button>
        </div>

        {/* Sade İlerleme Sayacı */}
        <div
          onClick={() => setReportModalOpen(true)}
          className="flex items-center gap-4 px-4 py-2 bg-surface-container/60 border border-outline-variant/80 rounded-xl text-xs cursor-pointer hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-on-surface-variant font-medium">Toplam:</span>
            <span className="font-bold text-on-surface">{activeTotal}</span>
          </div>
          <div className="h-3 w-px bg-outline-variant" />
          <div className="flex items-center gap-1.5">
            <span className="text-green-600 font-medium">Bildiğim:</span>
            <span className="font-bold text-green-600">{activeLearned}</span>
          </div>
          <div className="h-3 w-px bg-outline-variant" />
          <div className="flex items-center gap-1.5">
            <span className="text-on-surface-variant font-medium">Kalan:</span>
            <span className="font-bold text-on-surface">{activeRemaining}</span>
          </div>
        </div>
      </div>

      {/* ── QUIZ & PRATİK MODU ── */}
      {studyMode && (
        <div className="max-w-xl mx-auto border border-primary/30 rounded-3xl p-6 space-y-5 shadow-2xl bg-surface-container-high/90">
          <div className="flex justify-between items-center border-b border-outline-variant pb-3">
            <h3 className="text-sm font-bold text-primary flex items-center gap-2">
              <Brain size={16} />
              {selectedStudyMode === 'test' ? '🎯 Çoktan Seçmeli Test' : '🎴 Flashcard Pratiği'}
            </h3>
            <button
              onClick={() => {
                setStudyMode(false);
                loadOzet();
              }}
              className="p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {currentIdx < studyItems.length ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between text-xs">
                <span className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Soru {currentIdx + 1} / {studyItems.length}
                </span>
                <div className="flex items-center gap-3 font-bold">
                  <span className="text-green-600">✓ {stats.known}</span>
                  <span className="text-red-500">✗ {stats.unknown}</span>
                </div>
              </div>

              {selectedStudyMode === 'test' ? (
                /* ÇOKTAN SEÇMELİ TEST */
                <div className="space-y-4">
                  <div className="p-6 rounded-2xl bg-surface border border-outline-variant text-center space-y-1">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
                      BU İFADENİN İNGİLİZCESİ NEDİR?
                    </p>
                    <h2 className="text-2xl font-black text-on-surface">
                      {currentItem.translation}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentOptions.map((opt, idx) => {
                      const isCorrect = opt.toLowerCase().trim() === currentItem.original.toLowerCase().trim();
                      const isSelected = selectedOption === opt;

                      let style = 'bg-surface border-outline-variant text-on-surface hover:border-primary/50';
                      if (optionsLocked) {
                        if (isCorrect) style = 'bg-green-500/20 border-green-500 text-green-700 font-bold';
                        else if (isSelected) style = 'bg-red-500/20 border-red-500 text-red-700 font-bold';
                      }

                      const letters = ['A', 'B', 'C', 'D'];

                      return (
                        <button
                          key={opt + idx}
                          disabled={optionsLocked}
                          onClick={() => handleOptionSelect(opt)}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${style}`}
                        >
                          <span className="w-6 h-6 rounded-lg bg-surface-container flex items-center justify-center font-bold text-primary shrink-0">
                            {letters[idx]}
                          </span>
                          <span className="flex-1 font-semibold">{opt}</span>
                          {optionsLocked && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                          {optionsLocked && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* FLASHCARD MODU */
                <div className="space-y-5">
                  <div
                    onClick={() => setShowAnswer(!showAnswer)}
                    className="p-8 rounded-2xl bg-surface hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant min-h-[140px] flex flex-col justify-center items-center text-center relative"
                  >
                    {!showAnswer ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-2">
                          <h2 className="text-2xl font-black text-on-surface">
                            {currentItem.original}
                          </h2>
                          {telaffuzVar && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                seslendir(currentItem.original, KELIME_HIZI);
                              }}
                              className="p-1 text-on-surface-variant hover:text-primary rounded cursor-pointer"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant">Anlamı görmek için tıklayın</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-primary uppercase">Türkçe Karşılığı</span>
                        <h2 className="text-xl font-bold text-on-surface">{currentItem.translation}</h2>
                        {typeof currentItem.kutu === 'number' && (
                          <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
                            {currentItem.kutu}. kutu · {currentItem.kutu === 0 ? 'Henüz çalışılmadı' : `${[0, 1, 2, 4, 7, 15, 30, 60][Math.min(currentItem.kutu, 7)]} gün sonra tekrar`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleFlashcardAnswer(false)}
                      className="flex-1 py-2.5 border border-red-500/30 text-red-500 hover:bg-red-500/10 rounded-xl font-bold text-xs transition-all cursor-pointer"
                    >
                      Bilmiyorum ❌
                    </button>
                    <button
                      onClick={() => handleFlashcardAnswer(true)}
                      className="flex-1 py-2.5 bg-primary text-on-primary hover:bg-primary-container rounded-xl font-bold text-xs transition-all cursor-pointer shadow-sm"
                    >
                      Biliyorum ✓
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* KARNE */
            <div className="text-center py-4 space-y-5">
              <Award className="w-12 h-12 text-yellow-500 mx-auto" />
              <div>
                <h3 className="text-lg font-black text-on-surface">Harika İş!</h3>
                <p className="text-xs text-on-surface-variant">Çalışma seansını tamamladın.</p>
              </div>

              <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto text-xs">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2.5">
                  <p className="text-[10px] text-green-600 font-bold uppercase">Doğru</p>
                  <p className="text-xl font-black text-green-600">{stats.known}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2.5">
                  <p className="text-[10px] text-red-500 font-bold uppercase">Yanlış</p>
                  <p className="text-xl font-black text-red-500">{stats.unknown}</p>
                </div>
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-2.5">
                  <p className="text-[10px] text-primary font-bold uppercase">Başarı</p>
                  <p className="text-xl font-black text-primary">%{accuracyPercent}</p>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setStudyMode(false);
                    loadOzet();
                  }}
                  className="px-4 py-2 border border-outline-variant text-on-surface-variant hover:text-on-surface rounded-xl text-xs font-bold cursor-pointer"
                >
                  Kapat
                </button>
                <button
                  onClick={() => startStudySession(selectedStudyMode, selectedCount)}
                  className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RefreshCw size={12} /> Tekrar Dene
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── KARTLAR GRID & HIZLI GİRİŞ ── */}
      {!studyMode && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* SOL: Kartlar Listesi */}
          <div className="flex-1 w-full order-2 lg:order-1">
            {activeTab === 'kelime' ? (
              words.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {words.map((item) => {
                    const isFlipped = flippedCards.has(item.id);
                    const isEditing = editingId === item.id;
                    const isLearned = item.ogrenildi;

                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleFlip(item.id)}
                        className={`rounded-2xl border transition-all p-4 cursor-pointer relative flex flex-col justify-between min-h-[120px] shadow-sm hover:shadow-md ${
                          isFlipped
                            ? 'bg-primary/5 border-primary/40'
                            : 'bg-surface-container/70 hover:bg-surface-container border-outline-variant/60'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface border border-outline-variant text-on-surface-variant uppercase">
                              {isFlipped ? 'TR' : 'EN'}
                            </span>
                            {isLearned && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 flex items-center gap-1">
                                <GraduationCap size={10} /> Öğrenildi
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleMarkWordKnown(item, e)}
                              className="px-2 py-0.5 rounded bg-green-500/10 text-green-600 hover:bg-green-500/20 text-[11px] font-bold cursor-pointer"
                            >
                              ✓ Bildim
                            </button>
                            <button
                              type="button"
                              onClick={(e) => startEditWord(item, e)}
                              className="p-1 text-on-surface-variant hover:text-on-surface rounded cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteWord(item.id, e)}
                              className="p-1 text-red-500/80 hover:text-red-500 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="space-y-2 mt-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editWordText}
                              onChange={(e) => setEditWordText(e.target.value)}
                              className="w-full text-xs font-semibold p-1.5 bg-surface border border-outline-variant rounded-lg text-on-surface"
                            />
                            <input
                              type="text"
                              value={editTranslation}
                              onChange={(e) => setEditTranslation(e.target.value)}
                              className="w-full text-xs font-semibold p-1.5 bg-surface border border-outline-variant rounded-lg text-primary"
                            />
                            <div className="flex justify-end gap-2 pt-1">
                              <button onClick={cancelEdit} className="px-2 py-1 text-xs text-on-surface-variant cursor-pointer">
                                Vazgeç
                              </button>
                              <button
                                onClick={(e) => handleUpdateWord(item.id, e)}
                                disabled={updatingId === item.id}
                                className="px-3 py-1 bg-primary text-on-primary rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Kaydet
                              </button>
                            </div>
                          </div>
                        ) : isFlipped ? (
                          <div className="my-auto text-center">
                            <p className="text-lg font-bold text-primary">{item.translation}</p>
                          </div>
                        ) : (
                          <div className="my-auto text-center space-y-1">
                            <div className="flex items-center justify-center gap-2">
                              <p className="text-xl font-black text-on-surface">{item.word}</p>
                              {telaffuzVar && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    seslendir(item.word, KELIME_HIZI);
                                  }}
                                  className="p-1 text-on-surface-variant hover:text-primary rounded cursor-pointer"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="text-[10px] text-on-surface-variant/50 font-semibold text-center mt-2 uppercase">
                          {isFlipped ? '← Kelimeye dön' : 'Anlamı gör →'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center rounded-2xl border border-dashed border-outline-variant space-y-2">
                  <BookMarked className="w-10 h-10 mx-auto text-on-surface-variant/40" />
                  <h3 className="text-sm font-bold text-on-surface">Henüz kelime eklenmedi</h3>
                  <p className="text-xs text-on-surface-variant">
                    Sağdaki formdan ekleyebilir veya Word/Excel dosyanızdan topluca aktarabilirsiniz.
                  </p>
                </div>
              )
            ) : (
              sentences.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {sentences.map((item) => {
                    const isFlipped = flippedCards.has(item.id);
                    const isEditing = editingId === item.id;
                    const isLearned = (item.dogruSeri || 0) >= 2;

                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleFlip(item.id)}
                        className={`rounded-2xl border transition-all p-4 cursor-pointer relative flex flex-col justify-between min-h-[120px] shadow-sm hover:shadow-md ${
                          isFlipped
                            ? 'bg-primary/5 border-primary/40'
                            : 'bg-surface-container/70 hover:bg-surface-container border-outline-variant/60'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface border border-outline-variant text-on-surface-variant uppercase">
                              {isFlipped ? 'TR CÜMLE' : 'EN CÜMLE'}
                            </span>
                            {isLearned && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 flex items-center gap-1">
                                <GraduationCap size={10} /> Öğrenildi
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleMarkSentenceKnown(item, e)}
                              className="px-2 py-0.5 rounded bg-green-500/10 text-green-600 hover:bg-green-500/20 text-[11px] font-bold cursor-pointer"
                            >
                              ✓ Bildim
                            </button>
                            <button
                              type="button"
                              onClick={(e) => startEditSentence(item, e)}
                              className="p-1 text-on-surface-variant hover:text-on-surface rounded cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSentence(item.id, e)}
                              className="p-1 text-red-500/80 hover:text-red-500 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="space-y-2 mt-1" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              value={editWordText}
                              onChange={(e) => setEditWordText(e.target.value)}
                              rows={2}
                              className="w-full text-xs font-semibold p-1.5 bg-surface border border-outline-variant rounded-lg text-on-surface"
                            />
                            <textarea
                              value={editTranslation}
                              onChange={(e) => setEditTranslation(e.target.value)}
                              rows={2}
                              className="w-full text-xs font-semibold p-1.5 bg-surface border border-outline-variant rounded-lg text-primary"
                            />
                            <div className="flex justify-end gap-2 pt-1">
                              <button onClick={cancelEdit} className="px-2 py-1 text-xs text-on-surface-variant cursor-pointer">
                                Vazgeç
                              </button>
                              <button
                                onClick={(e) => handleUpdateSentence(item.id, e)}
                                disabled={updatingId === item.id}
                                className="px-3 py-1 bg-primary text-on-primary rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Kaydet
                              </button>
                            </div>
                          </div>
                        ) : isFlipped ? (
                          <div className="my-auto text-center">
                            <p className="text-sm font-bold text-primary">{item.ceviri}</p>
                          </div>
                        ) : (
                          <div className="my-auto space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-on-surface leading-relaxed">
                                {item.cumle}
                              </p>
                              {telaffuzVar && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    seslendir(item.cumle);
                                  }}
                                  className="p-1 text-on-surface-variant hover:text-primary rounded cursor-pointer shrink-0"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="text-[10px] text-on-surface-variant/50 font-semibold text-center mt-2 uppercase">
                          {isFlipped ? '← İngilizceye dön' : 'Çeviriyi gör →'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center rounded-2xl border border-dashed border-outline-variant space-y-2">
                  <MessageSquare className="w-10 h-10 mx-auto text-on-surface-variant/40" />
                  <h3 className="text-sm font-bold text-on-surface">Henüz cümle eklenmedi</h3>
                  <p className="text-xs text-on-surface-variant">
                    Öğrendiğiniz cümleleri sağdaki formdan ekleyebilir ya da dosyadan aktarabilirsiniz.
                  </p>
                </div>
              )
            )}
          </div>

          {/* SAĞ: Hızlı Giriş Paneli */}
          <div className="w-full lg:w-72 order-1 lg:order-2 shrink-0">
            {activeTab === 'kelime' ? (
              <div className="border border-outline-variant/80 rounded-2xl p-5 shadow-sm space-y-4 bg-surface-container/70">
                <div className="flex items-center gap-2 border-b border-outline-variant pb-2.5">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                    Hızlı Kelime Ekle
                  </h3>
                </div>

                <form onSubmit={handleFastWordSubmit} className="space-y-3">
                  <input
                    ref={fastWordInputRef}
                    type="text"
                    value={fastWord}
                    onChange={(e) => {
                      setFastWord(e.target.value);
                      ceviriElleDegisti.current = false;
                    }}
                    placeholder="İngilizce kelime"
                    className="w-full p-2 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface font-semibold focus:outline-none focus:border-primary"
                  />

                  <div className="relative">
                    <input
                      type="text"
                      value={fastTranslation}
                      onChange={(e) => {
                        setFastTranslation(e.target.value);
                        ceviriElleDegisti.current = true;
                      }}
                      placeholder={isTranslating ? 'Çevriliyor…' : 'Türkçe anlamı'}
                      className="w-full p-2 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface font-semibold focus:outline-none focus:border-primary"
                    />
                    {isTranslating && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary absolute right-2.5 top-2.5" />
                    )}
                  </div>

                  {alternatifler.length > 0 && !isTranslating && (
                    <div className="flex flex-wrap gap-1">
                      {alternatifler.map((alt) => (
                        <button
                          key={alt}
                          type="button"
                          onClick={() => {
                            setFastTranslation((v) => (v.trim() ? `${v.trim()}, ${alt}` : alt));
                            ceviriElleDegisti.current = true;
                          }}
                          className="px-1.5 py-0.5 rounded border border-primary/20 bg-primary/5 text-primary text-[10px] cursor-pointer"
                        >
                          + {alt}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isAdding || !fastWord.trim() || !fastTranslation.trim()}
                    className="w-full py-2 bg-primary text-on-primary font-bold text-xs rounded-xl hover:bg-primary-container transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus size={14} />}
                    Ekle
                  </button>
                </form>
              </div>
            ) : (
              <div className="border border-outline-variant/80 rounded-2xl p-5 shadow-sm space-y-4 bg-surface-container/70">
                <div className="flex items-center gap-2 border-b border-outline-variant pb-2.5">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                    Hızlı Cümle Ekle
                  </h3>
                </div>

                <form onSubmit={handleFastSentenceSubmit} className="space-y-3">
                  <textarea
                    ref={fastSentenceInputRef}
                    value={fastSentence}
                    onChange={(e) => {
                      setFastSentence(e.target.value);
                      cumleElleDegisti.current = false;
                    }}
                    placeholder="İngilizce cümle"
                    rows={2}
                    className="w-full p-2 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface font-semibold focus:outline-none focus:border-primary"
                  />

                  <div className="relative">
                    <textarea
                      value={fastSentenceTranslation}
                      onChange={(e) => {
                        setFastSentenceTranslation(e.target.value);
                        cumleElleDegisti.current = true;
                      }}
                      placeholder={isSentenceTranslating ? 'Çevriliyor…' : 'Türkçe çevirisi'}
                      rows={2}
                      className="w-full p-2 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface font-semibold focus:outline-none focus:border-primary"
                    />
                    {isSentenceTranslating && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary absolute right-2.5 top-2.5" />
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSentenceAdding || !fastSentence.trim() || !fastSentenceTranslation.trim()}
                    className="w-full py-2 bg-primary text-on-primary font-bold text-xs rounded-xl hover:bg-primary-container transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {isSentenceAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus size={14} />}
                    Ekle
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── KULLANICININ İSTEDİĞİ SADE PRATİK SEÇİM MODALI ── */}
      {modeChoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container-high border border-outline-variant rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <h3 className="text-sm font-bold text-on-surface">Nasıl Çalışmak İstersin?</h3>
              <button
                onClick={() => setModeChoiceModalOpen(false)}
                className="p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* İki Seçenek */}
            <div className="space-y-3">
              <div
                onClick={() => setSelectedStudyMode('test')}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                  selectedStudyMode === 'test'
                    ? 'border-primary bg-primary/10'
                    : 'border-outline-variant bg-surface hover:bg-surface-container'
                }`}
              >
                <span className="text-xl">🎯</span>
                <div>
                  <p className={`text-xs font-bold ${selectedStudyMode === 'test' ? 'text-primary' : 'text-on-surface'}`}>
                    Test Modu (Çoktan Seçmeli)
                  </p>
                  <p className="text-[11px] text-on-surface-variant">Türkçesi yazar, 4 İngilizce şık arasından seçersin</p>
                </div>
              </div>

              <div
                onClick={() => setSelectedStudyMode('flashcard')}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                  selectedStudyMode === 'flashcard'
                    ? 'border-primary bg-primary/10'
                    : 'border-outline-variant bg-surface hover:bg-surface-container'
                }`}
              >
                <span className="text-xl">🎴</span>
                <div>
                  <p className={`text-xs font-bold ${selectedStudyMode === 'flashcard' ? 'text-primary' : 'text-on-surface'}`}>
                    Kart Çevirme (Biliyorum / Bilmiyorum)
                  </p>
                  <p className="text-[11px] text-on-surface-variant">Klasik kart modu. Anlamını tahmin edip çevirirsin</p>
                </div>
              </div>
            </div>

            {/* Soru Sayısı */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                Soru Sayısı:
              </span>
              <div className="flex gap-2">
                {[10, 20, activeListLength].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSelectedCount(n)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      selectedCount === n
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {n === activeListLength ? `Tümü (${n})` : `${n} Soru`}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => startStudySession(selectedStudyMode, selectedCount)}
              className="w-full py-2.5 bg-primary text-on-primary font-bold text-xs rounded-xl shadow-md shadow-primary/20 hover:bg-primary-container transition-all cursor-pointer"
            >
              Pratiğe Başla 🚀
            </button>
          </div>
        </div>
      )}

      {/* ── TOPLU İÇE AKTARMA MODALI ── */}
      <TopluEkleModal
        isOpen={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        defaultTarget={activeTab}
        userId={user?.id}
        onSuccess={loadData}
      />

      {/* ── DETAYLI İLERLEME RAPORU MODALI ── */}
      <IlerlemeRaporuModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        type={activeTab}
        words={words}
        wordSummary={ozet}
        sentences={sentences}
        sentenceSummary={sentenceSummary}
      />
    </div>
  );
}
