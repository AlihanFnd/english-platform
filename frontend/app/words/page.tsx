'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api, WordItem, CalismaKarti, KelimeOzeti } from '../api';
import { useTelaffuz, KELIME_HIZI } from '../hooks/useTelaffuz';
import { BookMarked, Trash2, Edit3, Plus, Check, X, Sparkles, Brain, Award, RefreshCw, GraduationCap, Target, Volume2, Loader2 } from 'lucide-react';

/**
 * Sunucudan gelen eş anlamlı metnini tekil önerilere ayırır.
 * Biçim: "• sıfat: esnek, elastik, çabuk iyileşen" (birden çok satır olabilir).
 */
function altAnlamlariAyikla(ham?: string): string[] {
  if (!ham) return [];
  return ham
    .split('\n')
    .flatMap(satir => {
      const iki = satir.replace(/^[•\s-]+/, '').split(':');
      return (iki.length > 1 ? iki.slice(1).join(':') : iki[0]).split(',');
    })
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 40)
    .slice(0, 6);
}

export default function WordsPage() {
  const { destekleniyor: telaffuzVar, seslendir, konusuyorMu } = useTelaffuz();

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
  const flipLockRef = useRef<{ [key: number]: boolean }>({});

  // Çalışma seansı durumu
  const [studyMode, setStudyMode] = useState(false);
  const [studyWords, setStudyWords] = useState<CalismaKarti[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ known: 0, unknown: 0 });

  // Seans boyu — kullanıcı 200 kelimeyi tek oturumda bitiremiyor.
  const SEANS_SECENEKLERI = [10, 20, 30, 50];
  const [seansBoyu, setSeansBoyu] = useState(20);
  const [seansYukleniyor, setSeansYukleniyor] = useState(false);

  // Seçenekleri LİSTE BOYUNA göre türet. 8 kelimesi olan birine
  // "20 kelime (yetersiz)" göstermek, seçilemeyen bir varsayılan bırakır.
  const seansSecenekleri = React.useMemo(() => {
    const uygun = SEANS_SECENEKLERI.filter(n => n < words.length);
    return words.length > 0 ? [...uygun, words.length] : [];
  }, [words.length]);

  // Liste küçüldüyse (kelime silindiyse) seçili boy listeden büyük kalabilir.
  useEffect(() => {
    if (words.length > 0 && seansBoyu > words.length) setSeansBoyu(words.length);
  }, [words.length, seansBoyu]);

  // Kalıcı özet: "kaç kelime biliyorum?"
  const [ozet, setOzet] = useState<KelimeOzeti | null>(null);

  const loadWords = async () => {
    try {
      const [data, o] = await Promise.all([api.getWords(), api.getKelimeOzeti()]);
      setWords(data);
      setOzet(o);
    } catch (err: any) {
      setError(err.message || 'Kelimeler yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  // Özeti tek başına tazele — seans bitince tüm listeyi yeniden çekmeye gerek yok.
  const loadOzet = async () => {
    try {
      setOzet(await api.getKelimeOzeti());
    } catch {
      /* özet tazelenemezse ekran eski sayıyı gösterir; akışı kesmeye değmez */
    }
  };

  useEffect(() => {
    loadWords();
  }, []);

  /**
   * "N" tuşu hızlı giriş alanına odaklanır — panele ulaşmak için fareyle
   * sayfanın sağına uzanmak gerekmesin (kullanıcı isteği: daha kolay ulaşılır).
   *
   * Bir alana yazarken tetiklenmez; yoksa kelime yazarken "n" harfi
   * odağı kendine çekerdi.
   */
  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (studyMode) return;

      const hedef = e.target as HTMLElement | null;
      const yaziyor = hedef?.tagName === 'INPUT'
        || hedef?.tagName === 'TEXTAREA'
        || hedef?.isContentEditable;
      if (yaziyor) return;

      e.preventDefault();
      fastWordInputRef.current?.focus();
      fastWordInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    window.addEventListener('keydown', dinle);
    return () => window.removeEventListener('keydown', dinle);
  }, [studyMode]);

  /**
   * YAZARKEN anlık çeviri.
   *
   * Eskiden çeviri yalnızca `onBlur` ile, yani alandan çıkınca geliyordu —
   * kullanıcı yazdıktan sonra bir de tıklamak zorundaydı.
   *
   * Üç şey hızlı hissettiriyor:
   *  1. 350 ms bekleme — her tuşta istek atmak hem yavaş hem hız sınırını yer
   *     (çeviri kotası dakikada 100).
   *  2. Oturum önbelleği — aynı kelimeye dönmek AĞA HİÇ ÇIKMAZ, anında dolar.
   *  3. Yarış koruması — hızlı yazarken yanıtlar sırasız gelebilir;
   *     istek sayacı sayesinde ESKİ bir yanıt yeni cevabı EZEMEZ.
   *     Bu olmadan "cat" yazıp "category"ye çevirince kutuda "kedi" kalabilir.
   */
  /** Alternatif karşılıklar — alana doldurulmaz, öneri olarak gösterilir. */
  const [alternatifler, setAlternatifler] = useState<string[]>([]);

  const ceviriOnbellegi = useRef<Map<string, { ana: string; alt: string[] }>>(new Map());
  const istekSayaci = useRef(0);
  /** Kullanıcı çeviri alanına elle dokunduysa üstüne yazma. */
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

    const zamanlayici = setTimeout(async () => {
      try {
        const res = await api.translateWord(kelime);
        // Bu yanıt hâlâ EN SON istek mi? Değilse sessizce at.
        if (benimSiram !== istekSayaci.current) return;

        // ANA karşılık ile alternatifleri AYIR. 'translation' alanı
        // "dayanıklı\n\nEş Anlamlılar / Alternatifler:\n• sıfat: esnek, …"
        // biçiminde geliyor; olduğu gibi alana koymak, kelime listesine
        // gürültü kaydeder. 'generalMeaning' temiz karşılığı taşıyor.
        const ana = (res.generalMeaning || res.translation || '').split('\n')[0].trim();
        const alt = altAnlamlariAyikla(res.synonyms);

        ceviriOnbellegi.current.set(kelime, { ana, alt });
        if (!ceviriElleDegisti.current) {
          setFastTranslation(ana);
          setAlternatifler(alt);
        }
      } catch {
        // Çeviri gelmezse kullanıcı elle yazabilir; akışı kesmeye değmez.
        if (benimSiram === istekSayaci.current) { setFastTranslation(''); setAlternatifler([]); }
      } finally {
        if (benimSiram === istekSayaci.current) setIsTranslating(false);
      }
    }, 350);

    return () => clearTimeout(zamanlayici);
  }, [fastWord]);

  // Submit fast-add word on press enter
  const handleFastAddSubmit = async (e: React.FormEvent) => {
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
    if (flipLockRef.current[id]) return;

    flipLockRef.current[id] = true;
    setTimeout(() => {
      flipLockRef.current[id] = false;
    }, 150);

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

  // Seansı SUNUCUDAN al: karıştırma artık istemcide değil.
  // Sunucu önce hiç çalışılmamışları veriyor, böylece 200 kelimelik listede
  // her seans farklı kartlar geliyor ama liste bitmeden hiçbiri tekrar etmiyor.
  const startStudySession = async () => {
    if (words.length === 0 || seansYukleniyor) return;
    setSeansYukleniyor(true);
    try {
      const kartlar = await api.getCalismaSeansi(seansBoyu);
      if (kartlar.length === 0) {
        alert('Çalışılacak kelime bulunamadı.');
        return;
      }
      setStudyWords(kartlar);
      setCurrentIdx(0);
      setShowAnswer(false);
      setStats({ known: 0, unknown: 0 });
      setStudyMode(true);
    } catch (err: any) {
      alert(err.message || 'Çalışma seansı başlatılamadı.');
    } finally {
      setSeansYukleniyor(false);
    }
  };

  const handleStudyAction = async (known: boolean) => {
    const kart = studyWords[currentIdx];

    // Ekranı BEKLETME: kart hemen ilerlesin, kayıt arkada gitsin.
    // Ağ yavaşsa kullanıcı her kartta donmuş bir arayüz görmemeli.
    if (known) setStats(p => ({ ...p, known: p.known + 1 }));
    else setStats(p => ({ ...p, unknown: p.unknown + 1 }));

    const sonKart = currentIdx + 1 >= studyWords.length;
    if (!sonKart) {
      setCurrentIdx(currentIdx + 1);
      setShowAnswer(false);
    } else {
      setCurrentIdx(studyWords.length);
    }

    try {
      await api.kaydetCalismaSonucu(kart.id, known);
      if (sonKart) await loadOzet();   // seans bitti, sayaçları tazele
    } catch {
      /* Tek bir kartın kaydı düşerse seansı kesmiyoruz; bir sonraki
         seansta o kelime yine "hiç çalışılmamış" bandında gelir. */
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

        <div className="flex flex-wrap items-center gap-3">
          {/* Kalıcı ilerleme: sayfayı kapatınca sıfırlanmaz */}
          <div className="bg-surface-container/60 backdrop-blur-md px-4 py-2 border border-outline-variant/60 rounded-2xl flex items-center gap-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Toplam</span>
              <span className="text-xl font-black text-primary">{ozet?.toplam ?? words.length}</span>
            </div>
            <div className="h-6 w-px bg-outline-variant/60" />
            <div className="flex items-center gap-2" title={`Üst üste ${ozet?.ogrenildiEsigi ?? 3} kez doğru bilinenler`}>
              <GraduationCap size={14} className="text-green-500" />
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Bildiğim</span>
              <span className="text-xl font-black text-green-500">{ozet?.ogrenildi ?? 0}</span>
            </div>
            {(ozet?.hicCalisilmadi ?? 0) > 0 && (
              <>
                <div className="h-6 w-px bg-outline-variant/60" />
                <div className="flex items-center gap-2" title="Henüz hiç karşına çıkmamış kelimeler">
                  <Target size={14} className="text-on-surface-variant" />
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Kalan</span>
                  <span className="text-xl font-black text-on-surface">{ozet?.hicCalisilmadi}</span>
                </div>
              </>
            )}
          </div>

          {words.length > 0 && !studyMode && (
            <div className="flex items-center gap-2 bg-surface-container/60 backdrop-blur-md px-3 py-2 border border-outline-variant/60 rounded-2xl shadow-sm">
              <label htmlFor="seans-boyu" className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Kaçarlık
              </label>
              <select
                id="seans-boyu"
                value={Math.min(seansBoyu, words.length)}
                onChange={e => setSeansBoyu(Number(e.target.value))}
                className="bg-surface-container text-on-surface text-xs font-bold rounded-lg border border-outline-variant px-2 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {seansSecenekleri.map(n => (
                  <option key={n} value={n}>
                    {n === words.length ? `Tümü (${n})` : `${n} kelime`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {words.length > 0 && !studyMode && (
            <button
              onClick={startStudySession}
              disabled={seansYukleniyor}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-2xl font-bold text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Brain size={14} />
              {seansYukleniyor ? 'Hazırlanıyor…' : 'Pratik Yap (Kartlar)'}
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
              <div className="flex items-center justify-center gap-2">
                <span className="text-[10px] bg-primary/10 text-primary font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Kart {currentIdx + 1} / {studyWords.length}
                </span>
                {studyWords[currentIdx].ogrenildi ? (
                  <span className="text-[10px] bg-green-500/10 text-green-600 font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <GraduationCap size={11} /> Öğrenildi — tekrar
                  </span>
                ) : studyWords[currentIdx].dogruSeri > 0 ? (
                  <span className="text-[10px] bg-surface-variant text-on-surface-variant font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                        title="Üst üste doğru bilme sayısı">
                    Seri: {studyWords[currentIdx].dogruSeri}
                  </span>
                ) : null}
              </div>

              <div 
                onClick={() => setShowAnswer(!showAnswer)}
                className="py-12 px-6 rounded-2xl bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant min-h-[160px] flex flex-col justify-center items-center shadow-inner relative"
              >
                {!showAnswer ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-3">
                      <h2 className="text-3xl font-black text-on-surface tracking-wide capitalize">{studyWords[currentIdx].word}</h2>
                      {telaffuzVar && (
                        <button
                          onClick={(e) => { e.stopPropagation(); seslendir(studyWords[currentIdx].word, KELIME_HIZI); }}
                          className="p-2 rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all cursor-pointer"
                          title="Telaffuzu dinle"
                          aria-label={`${studyWords[currentIdx].word} kelimesinin telaffuzunu dinle`}
                        >
                          <Volume2
                            size={20}
                            className={konusuyorMu(studyWords[currentIdx].word) ? 'text-primary animate-pulse' : ''}
                          />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-semibold mt-4">Anlamını görmek için tıkla</p>
                  </div>
                ) : (
                  <div className="space-y-2 animate-fade-in">
                    <p className="text-xs text-primary font-bold uppercase tracking-widest">Türkçe Karşılığı</p>
                    <h2 className="text-2xl font-extrabold text-on-surface capitalize">{studyWords[currentIdx].translation}</h2>
                    {studyWords[currentIdx].context && (
                      <div className="flex items-start justify-center gap-2 mt-3 max-w-sm mx-auto">
                        <p className="text-xs text-on-surface-variant italic">"{studyWords[currentIdx].context}"</p>
                        {telaffuzVar && (
                          <button
                            /* Cümle normal hızda: yavaşlatmak tonlamayı bozar,
                               oysa tek kelimede yavaşlık harfleri ayırt ettiriyor. */
                            onClick={(e) => { e.stopPropagation(); seslendir(studyWords[currentIdx].context); }}
                            className="p-1 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all cursor-pointer shrink-0"
                            title="Cümleyi dinle"
                            aria-label="Örnek cümlenin telaffuzunu dinle"
                          >
                            <Volume2
                              size={14}
                              className={konusuyorMu(studyWords[currentIdx].context) ? 'text-primary animate-pulse' : ''}
                            />
                          </button>
                        )}
                      </div>
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

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-2">Bu seans</p>
                  <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                      <p className="text-[10px] text-green-600 font-bold uppercase">Bildim</p>
                      <p className="text-2xl font-black text-green-500">{stats.known}</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                      <p className="text-[10px] text-red-600 font-bold uppercase">Bilemedim</p>
                      <p className="text-2xl font-black text-red-500">{stats.unknown}</p>
                    </div>
                  </div>
                </div>

                {/* Asıl yenilik: bu sayılar sayfayı kapatınca SIFIRLANMAZ. */}
                {ozet && (
                  <div>
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-2">
                      Toplam ilerlemen
                    </p>
                    <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                      <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                        <p className="text-[10px] text-green-600 font-bold uppercase">Öğrenildi</p>
                        <p className="text-xl font-black text-green-500">{ozet.ogrenildi}</p>
                      </div>
                      <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                        <p className="text-[10px] text-on-surface-variant font-bold uppercase">Çalışılıyor</p>
                        <p className="text-xl font-black text-on-surface">{ozet.calisiliyor}</p>
                      </div>
                      <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                        <p className="text-[10px] text-on-surface-variant font-bold uppercase">Hiç çıkmadı</p>
                        <p className="text-xl font-black text-on-surface">{ozet.hicCalisilmadi}</p>
                      </div>
                    </div>
                    {ozet.hicCalisilmadi > 0 && (
                      <p className="text-[11px] text-on-surface-variant mt-3">
                        Sonraki seansta önce <strong className="text-on-surface">hiç çıkmamış</strong> kelimeler gelir.
                      </p>
                    )}
                    {ozet.hicCalisilmadi === 0 && ozet.calisiliyor > 0 && (
                      <p className="text-[11px] text-on-surface-variant mt-3">
                        Listenin tamamını gördün. Sırada <strong className="text-on-surface">henüz öğrenilmemiş</strong> kelimeler var.
                      </p>
                    )}
                  </div>
                )}
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
                      onClick={() => !isEditing && toggleFlip(item.id)}
                      className={`h-56 cursor-pointer select-none glass-card rounded-2xl p-6 flex flex-col justify-between border transition-all shadow-sm hover:shadow-md group ${
                        isFlipped 
                          ? 'border-primary/40 bg-surface/95' 
                          : 'border-outline-variant/60 group-hover:border-primary/40 bg-surface/90'
                      }`}
                    >
                      {!isFlipped ? (
                        /* FRONT SIDE (English) */
                        <>
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
                              <div className="flex items-center justify-center gap-2">
                                <h3 className="text-2xl font-black text-on-surface capitalize tracking-wide">{item.word}</h3>
                                {telaffuzVar && (
                                  <button
                                    /* stopPropagation ŞART: kart tıklaması kartı çevirir.
                                       Olmadan telaffuz dinlemek kartı ters çevirirdi. */
                                    onClick={(e) => { e.stopPropagation(); seslendir(item.word, KELIME_HIZI); }}
                                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all cursor-pointer shrink-0"
                                    title={`"${item.word}" telaffuzunu dinle`}
                                    aria-label={`${item.word} kelimesinin telaffuzunu dinle`}
                                  >
                                    <Volume2
                                      size={17}
                                      className={konusuyorMu(item.word) ? 'text-primary animate-pulse' : ''}
                                    />
                                  </button>
                                )}
                              </div>
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
                        </>
                      ) : (
                        /* BACK SIDE (Turkish Translation) */
                        <>
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
                              &larr; KELİMEYE DÖN
                            </div>
                          )}
                        </>
                      )}
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
          <div className="w-full lg:w-[380px] order-1 lg:order-2 lg:sticky lg:top-24 shrink-0">
            <div className="glass-card rounded-3xl p-6 border border-primary/30 bg-gradient-to-b from-primary/5 via-transparent to-transparent shadow-xl relative overflow-hidden transition-all hover:border-primary/50">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] rounded-full pointer-events-none"></div>

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5 text-primary font-bold text-xs uppercase tracking-wider">
                  <div className="p-1.5 rounded-xl bg-primary/10">
                    <Sparkles size={14} className="text-primary animate-pulse" />
                  </div>
                  <span>Seri Kelime Girişi</span>
                </div>
                {/* Klavye kısayolu: panele ulaşmak için fareye uzanmak gerekmesin */}
                <kbd className="hidden lg:inline-flex items-center gap-0.5 text-[10px] font-bold text-on-surface-variant/70 bg-surface-container border border-outline-variant/60 rounded-md px-1.5 py-0.5">
                  N
                </kbd>
              </div>

              <p className="text-[11px] text-on-surface-variant mb-5 leading-relaxed">
                Bilmediğin kelimeyi yaz — <strong className="text-on-surface">anlamı sen yazarken</strong> gelir.
              </p>

              <form onSubmit={handleFastAddSubmit} className="space-y-4">
                <div>
                  <label htmlFor="hizli-kelime" className="block text-[10px] font-bold text-on-surface-variant/80 mb-1.5 uppercase tracking-wider">
                    İngilizce kelime
                  </label>
                  <input
                    id="hizli-kelime"
                    ref={fastWordInputRef}
                    type="text"
                    required
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={fastWord}
                    onChange={(e) => { setFastWord(e.target.value); ceviriElleDegisti.current = false; }}
                    placeholder="mysterious"
                    className="w-full bg-surface-container border border-outline-variant/60 focus:border-primary/60 text-on-surface rounded-2xl px-4 py-3.5 text-base outline-none font-bold transition-all shadow-inner focus:bg-surface focus:shadow-md placeholder:font-normal placeholder:text-on-surface-variant/50"
                  />
                </div>

                {/* Asıl alan: TÜRKÇE. Kullanıcının okuduğu ve düzelttiği yer
                    burası olduğu için en büyük ve en görünür eleman bu. */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="hizli-ceviri" className="block text-[10px] font-bold text-primary uppercase tracking-wider">
                      Türkçe anlamı
                    </label>
                    <span className="text-[10px] font-bold text-on-surface-variant/70 flex items-center gap-1 h-4">
                      {isTranslating ? (
                        <>
                          <Loader2 size={11} className="animate-spin text-primary" />
                          çevriliyor
                        </>
                      ) : fastTranslation && !ceviriElleDegisti.current ? (
                        <>
                          <Sparkles size={11} className="text-primary" />
                          otomatik
                        </>
                      ) : null}
                    </span>
                  </div>
                  <textarea
                    id="hizli-ceviri"
                    required
                    rows={2}
                    value={fastTranslation}
                    onChange={(e) => { setFastTranslation(e.target.value); ceviriElleDegisti.current = true; }}
                    onKeyDown={(e) => {
                      // Enter kaydeder, Shift+Enter satır atlar — çok anlamlı
                      // kelimelerde alt satıra geçmek gerekebiliyor.
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleFastAddSubmit(e as unknown as React.FormEvent);
                      }
                    }}
                    placeholder="gizemli, esrarengiz"
                    className={`w-full bg-surface-container border rounded-2xl px-4 py-3.5 text-xl outline-none transition-all shadow-inner focus:bg-surface focus:shadow-md font-black leading-snug resize-none placeholder:text-base placeholder:font-normal placeholder:text-on-surface-variant/50 ${
                      isTranslating
                        ? 'border-primary/40 text-on-surface-variant'
                        : 'border-outline-variant/60 focus:border-primary/60 text-on-surface'
                    }`}
                  />
                </div>

                {/* Alternatifler ALANA DOLDURULMAZ, öneri olarak durur.
                    Tıklayınca eklenir — kullanıcı hangi anlamı istediğini seçer. */}
                {alternatifler.length > 0 && !isTranslating && (
                  <div className="space-y-1.5 animate-fade-in">
                    <span className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">
                      Diğer anlamlar — eklemek için tıkla
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {alternatifler.map(alt => {
                        const zatenVar = fastTranslation
                          .toLowerCase()
                          .split(',')
                          .some(p => p.trim() === alt.toLowerCase());
                        return (
                          <button
                            key={alt}
                            type="button"
                            disabled={zatenVar}
                            onClick={() => {
                              setFastTranslation(v => (v.trim() ? `${v.trim()}, ${alt}` : alt));
                              ceviriElleDegisti.current = true;
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                              zatenVar
                                ? 'border-primary/30 bg-primary/10 text-primary cursor-default'
                                : 'border-outline-variant/60 text-on-surface-variant hover:border-primary/50 hover:text-primary hover:bg-primary/5 cursor-pointer active:scale-95'
                            }`}
                          >
                            {zatenVar ? '✓ ' : '+ '}{alt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isAdding || !fastWord.trim() || !fastTranslation.trim()}
                  className="w-full py-4 bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container rounded-2xl text-sm font-black shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <Plus size={17} /> {isAdding ? 'Kaydediliyor…' : 'Sözlüğe Kaydet'}
                </button>
                <p className="text-[10px] text-on-surface-variant/70 text-center">
                  <kbd className="font-bold">Enter</kbd> kaydeder ·
                  <kbd className="font-bold ml-1">Shift+Enter</kbd> alt satır
                </p>
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
