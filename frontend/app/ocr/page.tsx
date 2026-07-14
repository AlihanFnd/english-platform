'use client';

import React, { useState, useEffect } from 'react';
import { api, OcrRecord } from '../api';
import Tesseract from 'tesseract.js';
import { 
  FileSearch, 
  Camera, 
  Sparkles, 
  History, 
  Volume2, 
  Loader, 
  ArrowLeft,
  BookOpen,
  CheckCircle2
} from 'lucide-react';

interface AnalyzedWord {
  word: string;
  translation: string;
  type: string;
}

interface AnalyzedSentence {
  original: string;
  translation: string;
  words: AnalyzedWord[];
}

export default function OcrPage() {
  // OCR states
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [ocrRecords, setOcrRecords] = useState<OcrRecord[]>([]);
  const [ocrProgress, setOcrProgress] = useState<string>('');
  const [ocrRunning, setOcrRunning] = useState(false);
  
  // Scanned text
  const [scannedText, setScannedText] = useState('');
  const [analyzingText, setAnalyzingText] = useState(false);
  const [analyzedSentences, setAnalyzedSentences] = useState<AnalyzedSentence[]>([]);

  // Selected word details
  const [selectedWord, setSelectedWord] = useState<AnalyzedWord | null>(null);
  const [selectedWordContext, setSelectedWordContext] = useState('');
  const [addedWords, setAddedWords] = useState<Record<string, boolean>>({});
  const [savingWord, setSavingWord] = useState(false);

  // Hidden/shown sentence translations index list
  const [showTranslations, setShowTranslations] = useState<Record<number, boolean>>({});

  const loadOcrHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await api.getOcrRecords();
      setOcrRecords(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadOcrHistory();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrRunning(true);
    setOcrProgress('Görsel okunuyor...');
    setScannedText('');
    setAnalyzedSentences([]);

    try {
      const result = await Tesseract.recognize(
        file,
        'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              setOcrProgress(`Tarama yapılıyor: %${Math.round(m.progress * 100)}`);
            }
          }
        }
      );

      const text = result.data.text;
      setScannedText(text);
      setOcrProgress('');

      if (text.trim()) {
        // Save to DB history
        const savedRecord = await api.saveOcrRecord(text);
        setOcrRecords(prev => [savedRecord, ...prev]);

        // Start text analysis instantly
        handleAnalyzeText(text);
      }
    } catch (err: any) {
      alert('OCR işlemi başarısız oldu: ' + err.message);
      setOcrProgress('');
    } finally {
      setOcrRunning(false);
    }
  };

  const handleAnalyzeText = async (text: string) => {
    if (!text.trim()) return;
    setAnalyzingText(true);
    try {
      const analysis = await api.analyzeText(text);
      setAnalyzedSentences(analysis.sentences);
    } catch (err: any) {
      alert('Çeviri analizi yapılamadı: ' + err.message);
    } finally {
      setAnalyzingText(false);
    }
  };

  const handleSelectRecord = (record: OcrRecord) => {
    setScannedText(record.extractedText);
    setAnalyzedSentences([]);
    handleAnalyzeText(record.extractedText);
  };

  const speak = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleWordClick = async (w: AnalyzedWord, originalSentence: string) => {
    const isKalip = w.word.trim().includes(' ') || w.type === 'kalıp';
    setSelectedWord({ word: w.word, translation: 'Çevriliyor...', type: isKalip ? 'kalıp' : (w.type || 'default') });
    setSelectedWordContext(originalSentence);
    try {
      const res = await api.translateWord(w.word);
      setSelectedWord({ word: w.word, translation: res.translation, type: isKalip ? 'kalıp' : res.type });
    } catch (e) {
      setSelectedWord({ word: w.word, translation: 'Çevrilemedi', type: isKalip ? 'kalıp' : 'default' });
    }
  };

  const handleSaveWord = async () => {
    if (!selectedWord) return;
    setSavingWord(true);
    try {
      await api.addWord(selectedWord.word, selectedWord.translation, selectedWordContext);
      setAddedWords(prev => ({ ...prev, [selectedWord.word.toLowerCase()]: true }));
    } catch (err) {
      console.error(err);
    } finally {
      setSavingWord(false);
    }
  };

  const getWordTypeColorClass = (type: string) => {
    switch (type.toLowerCase()) {
      case 'isim': return 'word-isim hover:bg-blue-500/10';
      case 'fiil': return 'word-fiil hover:bg-emerald-500/10';
      case 'sıfat': return 'word-sifat hover:bg-amber-500/10';
      case 'zarf': return 'word-zarf hover:bg-purple-500/10';
      case 'edat': return 'word-edat hover:bg-pink-500/10';
      case 'bağlaç': return 'word-baglac hover:bg-orange-500/10';
      case 'zamir': return 'word-zamir hover:bg-cyan-500/10';
      default: return 'word-default hover:bg-primary/10';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-on-surface tracking-tight flex items-center gap-2">
          <FileSearch className="h-8 w-8 text-primary" />
          Kamera ile Metin Tarama (OCR)
        </h1>
        <p className="text-on-surface-variant mt-1">İngilizce kitap veya belge sayfalarının fotoğrafını yükleyin, anında kelime/cümle çevirileriyle okuyun.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Scan & History List */}
        <div className="space-y-6 lg:col-span-1">
          {/* Upload Card */}
          <div className="glass-card rounded-2xl p-6 text-center space-y-4">
            <h3 className="text-md font-bold text-on-surface flex items-center gap-2 justify-center">
              <Camera className="h-5 w-5 text-primary" /> Görsel Yükle / Tara
            </h3>
            
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant hover:border-primary/50 rounded-2xl h-40 cursor-pointer transition-all bg-surface-container hover:bg-surface-variant">
              {ocrRunning ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs text-on-surface-variant font-semibold">{ocrProgress}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-on-surface-variant">
                  <Camera className="h-10 w-10 text-on-surface-variant mb-1" />
                  <span className="text-sm font-semibold text-on-surface">Görsel Seç veya Kamerayı Aç</span>
                  <span className="text-xs text-on-surface-variant">PNG, JPG, JPEG</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={ocrRunning}
                className="hidden"
              />
            </label>
          </div>

          {/* History Records Card */}
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h3 className="text-md font-bold text-on-surface flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> Tarama Geçmişi
            </h3>

            {loadingHistory ? (
              <div className="h-20 flex items-center justify-center">
                <Loader className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : ocrRecords.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 divide-y divide-outline-variant/30">
                {ocrRecords.map((rec) => (
                  <div
                    key={rec.id}
                    onClick={() => handleSelectRecord(rec)}
                    className="pt-3 first:pt-0 cursor-pointer group flex items-start justify-between gap-3"
                  >
                    <div className="overflow-hidden">
                      <p className="text-xs text-on-surface truncate font-medium group-hover:text-primary transition-all">
                        {rec.extractedText}
                      </p>
                      <span className="text-[10px] text-on-surface-variant">
                        {new Date(rec.scannedAt).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant italic">Kayıtlı tarama bulunmuyor.</p>
            )}
          </div>
        </div>

        {/* Right Side: Interactive Reader for scanned Text */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-3xl p-6 md:p-8 min-h-[400px] space-y-6">
            <div className="flex items-center justify-between border-b border-outline-variant pb-4">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" /> İnteraktif Okuma Ekranı
              </h3>
              {analyzingText && (
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <Loader className="h-4 w-4 animate-spin text-primary" />
                  <span>Metin analiz ediliyor...</span>
                </div>
              )}
            </div>

            {analyzedSentences.length > 0 ? (
              <div className="space-y-6 leading-loose text-lg text-on-surface">
                {analyzedSentences.map((sent, sIdx) => (
                  <div key={sIdx} className="space-y-3 group/sent p-2.5 rounded-xl hover:bg-surface-container border border-transparent hover:border-outline-variant transition-all">
                    <div className="flex flex-wrap gap-x-2 gap-y-3">
                      {sent.words.map((w, wIdx) => (
                        <span
                          key={wIdx}
                          onClick={() => handleWordClick(w, sent.original)}
                          className={`cursor-pointer transition-all duration-150 inline-block px-1 pb-0.5 rounded ${getWordTypeColorClass(
                            w.type
                          )}`}
                        >
                          {w.word}
                        </span>
                      ))}

                      {/* Play TTS button */}
                      <button
                        onClick={() => speak(sent.original)}
                        className="p-1 rounded bg-surface-container hover:bg-primary/20 text-on-surface-variant hover:text-primary transition-all opacity-0 group-hover/sent:opacity-100 ml-auto"
                      >
                        <Volume2 className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => setShowTranslations(prev => ({ ...prev, [sIdx]: !prev[sIdx] }))}
                        className="self-start text-[10px] font-bold text-primary hover:text-primary/80 transition-all uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded"
                      >
                        {showTranslations[sIdx] ? 'Gizle' : 'Çeviriyi Göster'}
                      </button>

                      {showTranslations[sIdx] && (
                        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-on-surface italic">
                          {sent.translation}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : scannedText ? (
              <div className="text-on-surface leading-relaxed font-mono whitespace-pre-wrap text-sm border border-outline-variant p-4 rounded-xl bg-surface-container">
                {scannedText}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-on-surface-variant text-center">
                <Camera className="h-10 w-10 text-on-surface-variant mb-2" />
                <p className="text-sm">Henüz bir görsel taramadınız.</p>
                <p className="text-xs text-on-surface-variant mt-1">Görsel yüklediğinizde, taranan metin buraya aktarılır ve çevirilerle okunabilir hale gelir.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Word details drawer */}
      {selectedWord && (
        <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 glass-panel rounded-3xl p-6 border border-primary/40 shadow-2xl z-30 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary px-2 py-0.5 rounded bg-primary/10">
                {selectedWord.type || 'kelime'}
              </span>
              <div className="flex items-center gap-2 mt-1.5">
                <h4 className="text-2xl font-black text-on-surface">{selectedWord.word}</h4>
                <button
                  onClick={() => speak(selectedWord.word)}
                  className="p-1 rounded bg-surface-container hover:bg-primary/20 text-on-surface-variant hover:text-primary transition-all cursor-pointer"
                  title="Sesli Oku"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <button
              onClick={() => setSelectedWord(null)}
              className="text-on-surface-variant hover:text-on-surface text-sm font-bold bg-surface-container h-8 w-8 rounded-full flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider">Türkçe Çevirisi</p>
              <p className="text-lg font-bold text-primary mt-1 capitalize">{selectedWord.translation}</p>
            </div>

            {selectedWordContext && (
              <div>
                <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider">Cümle İçinde Kullanımı</p>
                <p className="text-xs text-on-surface mt-1 leading-relaxed italic bg-surface-container p-2.5 rounded-lg border border-outline-variant">
                  "{selectedWordContext}"
                </p>
              </div>
            )}

            <button
              disabled={addedWords[selectedWord.word.toLowerCase()] || savingWord}
              onClick={handleSaveWord}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all border bouncy-btn ${
                addedWords[selectedWord.word.toLowerCase()]
                  ? 'bg-emerald-600/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-primary hover:bg-primary/90 text-on-primary border-transparent shadow-md shadow-primary/20'
              }`}
            >
              {addedWords[selectedWord.word.toLowerCase()] ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Kelimelerime Eklendi
                </>
              ) : (
                <>
                  <Loader className={`h-4 w-4 animate-spin ${savingWord ? 'block' : 'hidden'}`} />
                  Bilinmeyen Kelimelerime Ekle
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
