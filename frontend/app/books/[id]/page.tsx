'use client';

import React, { useEffect, useState, use } from 'react';
import { api, Chapter } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useTelaffuz, KELIME_HIZI } from '../../hooks/useTelaffuz';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  Volume2, BookMarked, CheckCircle, X, HelpCircle,
  Maximize2, Minimize2, AlertTriangle, RefreshCw, BookOpen
} from 'lucide-react';
import Link from 'next/link';

interface AnalyzedWord { word: string; translation: string; type: string; }
interface AnalyzedSentence { original: string; translation: string; isHeading?: boolean; alignment?: 'left' | 'center' | 'right'; indentation?: number; words: AnalyzedWord[]; ceviriBasarili?: boolean; }

export default function BookReader({ params }: { params: Promise<{ id: string }> }) {
  const { seslendir: speak } = useTelaffuz();

  const { id: bookIdStr } = use(params);
  const bookId = parseInt(bookIdStr);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bookTitle, setBookTitle]   = useState('');
  const [loading, setLoading]       = useState(true);
  const { user } = useAuth();
  const yenidenAnalizEdebilir = user?.role === 'teacher' || user?.role === 'admin';

  const [analyzing, setAnalyzing]   = useState(false);
  const [sentences, setSentences]   = useState<AnalyzedSentence[]>([]);
  const [error, setError]           = useState('');

  const [hasPages, setHasPages]         = useState(false);
  const [totalPages, setTotalPages]     = useState(0);
  const sayfaParam = searchParams.get('page');
  const currentPage = sayfaParam ? parseInt(sayfaParam) : undefined;

  const [chapter, setChapter]           = useState<Chapter | null>(null);
  const [totalChapters, setTotalChapters] = useState(1);
  const bolumParam = searchParams.get('chapter');
  const currentChapter = bolumParam ? parseInt(bolumParam) : undefined;

  const [devamEdildi, setDevamEdildi] = useState(false);
  const [aktifSayfa, setAktifSayfa] = useState(1);
  const [aktifBolum, setAktifBolum] = useState(1);

  const [openTr, setOpenTr] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Word popup
  const [selWord, setSelWord]     = useState<any | null>(null);
  const [selCtx, setSelCtx]       = useState('');
  const [added, setAdded]         = useState<Record<string, boolean>>({});
  const [saving, setSaving]       = useState(false);

  // Cümle kurma modu (YH-03 / YH-15)
  const [cumleKurmaModu, setCumleKurmaModu] = useState(false);
  const [seciliKelimeler, setSeciliKelimeler] = useState<string[]>([]);
  const [cumleKaydediliyor, setCumleKaydediliyor] = useState(false);
  const [cumleMesaji, setCumleMesaji] = useState('');

  const normalizeSentences = (arr: any): AnalyzedSentence[] => {
    const raw = Array.isArray(arr) ? arr : [];
    const expanded: AnalyzedSentence[] = [];

    raw.forEach((s: any) => {
      let orig = (s.original || s.Original || "").trim();
      let trans = (s.translation || s.Translation || "").trim();
      let isHead = s.isHeading !== undefined ? s.isHeading : (s.IsHeading !== undefined ? s.IsHeading : false);
      let align = s.alignment || s.Alignment || (isHead ? "center" : "left");
      let words = s.words || s.Words || [];
      const basarili = (s.ceviriBasarili ?? s.CeviriBasarili) !== false;

      if (!isHead && orig.length > 20) {
        const match = orig.match(/^(CHAPTER|Chapter|PART|Part|UNIT|Unit|LESSON|Lesson|BOOK|Book)\s+([0-9IVXLCDMivxlcdm]+|[A-Za-z]+)?\s*(-|:|–)?\s*([A-Z\s]{2,40}|[A-Za-z\s]{2,40})?(\.\s+|\s{2,}|\n)(.*)$/);
        if (match && match[6] && match[6].trim().length > 15) {
          const headingPart = orig.substring(0, orig.indexOf(match[6])).trim();
          const bodyPart = match[6].trim();
          if (headingPart.length > 0) {
            expanded.push({
              original: headingPart,
              translation: headingPart,
              isHeading: true,
              alignment: "center",
              indentation: 0,
              ceviriBasarili: true,
              words: headingPart.split(/\s+/).map((w: string) => ({ word: w, translation: w, type: "default" }))
            });
            orig = bodyPart;
            if (trans.length > headingPart.length) {
              trans = trans.replace(headingPart, "").trim();
            }
          }
        }
      }

      if (!isHead && orig.length > 0) {
        const startsWithHeadingWord = /^(CHAPTER|Chapter|PART|Part|UNIT|Unit|LESSON|Lesson|BOOK|Book)\b/i.test(orig);
        if (startsWithHeadingWord) {
          isHead = true;
          align = "center";
        }
      }

      const formattedWords = (Array.isArray(words) && words.length > 0 ? words : orig.split(/\s+/).map((w: string) => ({ word: w, translation: w, type: "default" }))).map((w: any) => ({
        word: typeof w === 'string' ? w : (w.word || w.Word || ""),
        translation: typeof w === 'string' ? w : (w.translation || w.Translation || ""),
        type: typeof w === 'string' ? "default" : (w.type || w.Type || "default")
      }));

      expanded.push({
        original: orig,
        translation: trans || orig,
        isHeading: isHead,
        alignment: isHead ? "center" : (align || "left"),
        indentation: s.indentation || s.Indentation || 0,
        words: formattedWords,
        ceviriBasarili: basarili
      });
    });

    return expanded;
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true); setError(''); setSentences([]); setOpenTr(null); setSelWord(null);
      try {
        const pd = await api.readPage(bookId, currentPage);
        if (pd.hasPages) {
          setHasPages(true); setBookTitle(pd.bookTitle); setTotalPages(pd.totalPages);
          if (pd.currentPage?.sentencesJson) {
            try {
              setSentences(normalizeSentences(JSON.parse(pd.currentPage.sentencesJson)));
            } catch {
              setSentences([]);
            }
          }
          setChapter(null);
          setAktifSayfa(pd.pageNumber);

          if (!sayfaParam) {
            setDevamEdildi(pd.pageNumber > 1);
            router.replace(`/books/${bookId}?page=${pd.pageNumber}`, { scroll: false });
          }
        } else {
          setHasPages(false);
          const d = await api.readChapter(bookId, currentChapter);
          setChapter(d.currentChapter); setBookTitle(d.bookTitle); setTotalChapters(d.totalChapters);
          setAktifBolum(d.chapterNumber);
          if (!bolumParam) {
            setDevamEdildi(d.chapterNumber > 1);
            router.replace(`/books/${bookId}?chapter=${d.chapterNumber}`, { scroll: false });
          }
          setAnalyzing(true);
          const a = await api.analyzeText(d.currentChapter.content);
          setSentences(normalizeSentences(a.sentences));
        }
      } catch (e: unknown) { setError((e as Error).message || 'Yüklenemedi.'); }
      finally { setLoading(false); setAnalyzing(false); }
    })();
  }, [bookId, currentPage, currentChapter]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.classList.add('reader-fullscreen-active');
    } else {
      document.body.classList.remove('reader-fullscreen-active');
    }
    return () => {
      document.body.classList.remove('reader-fullscreen-active');
    };
  }, [isFullscreen]);

  const cevrilemeyen = sentences.filter(s => s.ceviriBasarili === false).length;

  const handleReanalyze = async () => {
    if (analyzing || loading) return;
    setAnalyzing(true);
    try {
      if (hasPages) {
        const pd = await api.reanalyzePage(bookId, aktifSayfa);
        if (pd.sentencesJson && pd.sentencesJson !== "[]") {
          setSentences(normalizeSentences(JSON.parse(pd.sentencesJson)));
        }
      } else if (chapter?.content) {
        const a = await api.analyzeText(chapter.content);
        setSentences(normalizeSentences(a.sentences));
      }
    } catch (e: unknown) {
      setError((e as Error).message || 'Yeniden analiz yapılamadı.');
    } finally {
      setAnalyzing(false);
    }
  };

  const saveWord = async () => {
    if (!selWord) return;
    setSaving(true);
    try { 
      const wordAsAny = selWord as any;
      const saveText = wordAsAny.generalMeaning 
        ? `${wordAsAny.generalMeaning}${wordAsAny.synonyms ? '\n\nEş Anlamlılar:\n' + wordAsAny.synonyms : ''}`
        : wordAsAny.translation;
      await api.addWord(wordAsAny.word, saveText, selCtx); 
      setAdded(p => ({ ...p, [wordAsAny.word.toLowerCase()]: true })); 
    }
    catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleWordClick = async (w: any, originalSentence: string) => {
    if (cumleKurmaModu) {
      const temiz = w.word.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
      if (temiz) {
        setSeciliKelimeler(prev => [...prev, temiz]);
      }
      return;
    }

    const isKalip = w.word.trim().includes(' ') || w.type === 'kalıp';
    setSelWord({ word: w.word, translation: "Çevriliyor...", type: isKalip ? "kalıp" : (w.type || "default") });
    setSelCtx(originalSentence);
    try {
      const res = await api.translateWord(w.word, originalSentence, false);
      setSelWord({ 
        word: w.word, 
        translation: res.translation, 
        generalMeaning: res.generalMeaning,
        synonyms: res.synonyms,
        type: isKalip ? "kalıp" : res.type 
      });
    } catch (e) {
      setSelWord({ word: w.word, translation: "Çevrilemedi", type: isKalip ? "kalıp" : "default" });
    }
  };

  const handleCumleKaydet = async () => {
    if (seciliKelimeler.length === 0) return;
    setCumleKaydediliyor(true);
    setCumleMesaji('');
    try {
      const cumleMetni = seciliKelimeler.join(' ');
      await api.addSentence(cumleMetni, '', bookTitle);
      setCumleMesaji('Cümle başarıyla Cümlelerim listesine eklendi!');
      setSeciliKelimeler([]);
      setTimeout(() => setCumleMesaji(''), 3000);
    } catch (e: any) {
      setCumleMesaji(e.message || 'Cümle kaydedilemedi.');
    } finally {
      setCumleKaydediliyor(false);
    }
  };

  const handleSelection = () => {
    if (cumleKurmaModu) return;
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 1 && text.length < 150 && selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const sentEl = container.nodeType === Node.ELEMENT_NODE 
          ? (container as HTMLElement).closest('.bk-sent-en') 
          : container.parentElement?.closest('.bk-sent-en');
          
        if (sentEl || (container.parentElement && container.parentElement.closest('.bk-sentences'))) {
          const sentText = sentEl ? sentEl.textContent || text : text;
          handleWordClick({ word: text, type: text.includes(' ') ? "kalıp" : "kelime" }, sentText);
        }
      }
    }, 150);
  };

  const wordClass = (t: string) => {
    const map: Record<string, string> = {
      'isim': 'word-isim', 'fiil': 'word-fiil', 'sıfat': 'word-sifat',
      'zarf': 'word-zarf', 'edat': 'word-edat', 'bağlaç': 'word-baglac', 'zamir': 'word-zamir',
    };
    return map[t?.toLowerCase()] || 'word-default';
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-on-surface-variant">
      <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="text-xs">Yükleniyor...</p>
    </div>
  );

  if (error) return (
    <div className="max-w-lg mx-auto my-8 px-4">
      <p className="text-red-400 text-sm mb-3">{error}</p>
      <Link href="/books" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
        <ArrowLeft size={14}/> Kitaplığa Dön
      </Link>
    </div>
  );

  return (
    <div className={`bk-wrap ${isFullscreen ? 'bk-wrap--fullscreen' : ''}`}>

      {devamEdildi && (
        <div className="bk-devam" role="status">
          <BookOpen size={14} />
          <span>
            Kaldığın yerden devam ediyorsun —{' '}
            <strong>{hasPages ? `sayfa ${aktifSayfa}` : `bölüm ${aktifBolum}`}</strong>
          </span>
          <button
            onClick={() => {
              setDevamEdildi(false);
              router.replace(`/books/${bookId}?${hasPages ? 'page=1' : 'chapter=1'}`, { scroll: false });
            }}
            className="bk-devam-bas"
          >
            Baştan başla
          </button>
          <button onClick={() => setDevamEdildi(false)} className="bk-devam-kapat" aria-label="Bildirimi kapat">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Header strip ── */}
      <div className="bk-header">
        <Link href="/books" className="bk-back"><ArrowLeft size={13}/> <span>Kitaplık</span></Link>
        <div className="bk-title-block">
          <span className="bk-title">{bookTitle}</span>
          <span className="bk-loc">
            {hasPages ? `Sayfa ${aktifSayfa} / ${totalPages}` : `Bölüm ${aktifBolum} / ${totalChapters}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Cümle Kurma Modu Butonu */}
          <button
            onClick={() => {
              setCumleKurmaModu(!cumleKurmaModu);
              setSeciliKelimeler([]);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 cursor-pointer ${
              cumleKurmaModu
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                : 'bg-surface-container text-on-surface-variant border-outline-variant hover:border-primary/40'
            }`}
            title="Cümle Kurma Modu"
          >
            <span>🧩 {cumleKurmaModu ? 'Mod Açık' : 'Cümle Kur'}</span>
          </button>

          {!hasPages && chapter && (
            <Link href={`/books/${bookId}/quiz?chapterId=${chapter.id}`} className="bk-quiz">
              <HelpCircle size={13}/> Quiz
            </Link>
          )}
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)} 
            className="bk-fullscreen-toggle"
            title={isFullscreen ? "Normal Ekran" : "Tam Ekran Okuma"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ── Page card (Sayfa Animasyonu Dahil) ── */}
      <div className="bk-page bk-page-animate">
        {analyzing ? (
          <div className="bk-loading">
            <div className="bk-spin"/> <span>Analiz yapılıyor...</span>
          </div>
        ) : sentences.length === 0 ? (
          <p className="bk-empty">Bu sayfada metin bulunamadı.</p>
        ) : (
          <div className="bk-sentences" onMouseUp={handleSelection} onTouchEnd={handleSelection}>

            {cevrilemeyen > 0 && (
              <div className="bk-ceviri-uyari" role="status">
                <AlertTriangle size={14} className="bk-ceviri-uyari__ikon" />
                <span className="bk-ceviri-uyari__metin">
                  {cevrilemeyen === sentences.length
                    ? 'Bu sayfa çevrilemedi — çeviri servisine ulaşılamadı.'
                    : `${cevrilemeyen} satır çevrilemedi — çeviri servisine ulaşılamadı.`}
                  {' '}Aşağıda o satırların İngilizcesi görünüyor.
                </span>
                {(!hasPages || yenidenAnalizEdebilir) && (
                  <button
                    className="bk-ceviri-uyari__btn"
                    onClick={handleReanalyze}
                    disabled={analyzing || loading}
                  >
                    <RefreshCw size={12} className={analyzing ? 'bk-spin-ikon' : undefined} />
                    {analyzing ? 'Deneniyor...' : 'Yeniden dene'}
                  </button>
                )}
              </div>
            )}

            {sentences.map((s, i) => (
              <div 
                key={i} 
                className={`bk-sent-block${s.isHeading ? ' bk-sent-block--heading' : ''}`}
                style={{
                  textAlign: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'right' : 'left',
                  paddingLeft: s.indentation ? `${s.indentation * 12}px` : undefined
                }}
              >

                {/* English sentence — words are styled as kutucuk (chips) */}
                <div
                  className={`bk-sent-en${openTr === i ? ' bk-sent-en--active' : ''}${s.isHeading ? ' bk-sent-en--heading' : ''}`}
                  onClick={() => setOpenTr(openTr === i ? null : i)}
                  style={{
                    justifyContent: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'flex-end' : 'space-between'
                  }}
                >
                  <span 
                    className="bk-sent-words flex flex-wrap items-center gap-1"
                    style={{
                      textAlign: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'right' : 'left'
                    }}
                  >
                    {s.words.map((w, wi) => (
                      <span
                        key={wi}
                        className={`bk-word-chip ${wordClass(w.type)}`}
                        onClick={e => { e.stopPropagation(); handleWordClick(w, s.original); }}
                        title={cumleKurmaModu ? "Cümleye eklemek için tıkla" : "Tıklayarak çeviriyi gör"}
                      >
                        {w.word}
                      </span>
                    ))}
                  </span>
                  <button
                    className="bk-speak"
                    onClick={e => { e.stopPropagation(); speak(s.original); }}
                    title="Sesli oku"
                  >
                    <Volume2 size={12}/>
                  </button>
                </div>

                {/* Turkish translation */}
                {openTr === i && (
                  <div 
                    className={`bk-sent-tr${s.alignment === 'center' ? ' bk-sent-tr--center' : ''}${s.ceviriBasarili === false ? ' bk-sent-tr--hata' : ''}`}
                    style={{
                      justifyContent: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'flex-end' : 'flex-start',
                      textAlign: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'right' : 'left'
                    }}
                  >
                    {s.ceviriBasarili === false ? (
                      <>
                        <span className="bk-tr-flag bk-tr-flag--hata">!</span>
                        <span className="bk-tr-text bk-tr-text--hata">
                          Bu satır çevrilemedi. Yukarıdaki “Yeniden dene” ile tekrar deneyebilirsin.
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="bk-tr-flag">TR</span>
                        <span className="bk-tr-text">{s.translation}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      <div className="bk-pagination">
        {hasPages ? (
          <>
            <button disabled={aktifSayfa <= 1} onClick={() => router.push(`/books/${bookId}?page=${aktifSayfa-1}`)} className="bk-nav">
              <ChevronLeft size={15}/> Önceki
            </button>
            <span className="bk-pageno">{aktifSayfa} / {totalPages}</span>
            <button disabled={aktifSayfa >= totalPages} onClick={() => router.push(`/books/${bookId}?page=${aktifSayfa+1}`)} className="bk-nav">
              Sonraki <ChevronRight size={15}/>
            </button>
          </>
        ) : (
          <>
            <button disabled={aktifBolum <= 1} onClick={() => router.push(`/books/${bookId}?chapter=${aktifBolum-1}`)} className="bk-nav">
              <ChevronLeft size={15}/> Önceki
            </button>
            <span className="bk-pageno">{aktifBolum} / {totalChapters}</span>
            <button disabled={aktifBolum >= totalChapters} onClick={() => router.push(`/books/${bookId}?chapter=${aktifBolum+1}`)} className="bk-nav">
              Sonraki <ChevronRight size={15}/>
            </button>
          </>
        )}
      </div>

      {/* ── Cümle Kurma Paneli (Overlay) ── */}
      {cumleKurmaModu && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 animate-in slide-in-from-bottom-5 duration-300">
          <div className="glass-card rounded-2xl p-4 shadow-2xl border border-emerald-500/30 bg-surface/95 backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between border-b border-outline-variant/50 pb-2">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                🧩 Cümle Kurma Paneli ({seciliKelimeler.length} kelime)
              </span>
              <button
                onClick={() => { setCumleKurmaModu(false); setSeciliKelimeler([]); }}
                className="text-on-surface-variant hover:text-on-surface text-xs font-bold cursor-pointer"
              >
                Kapat ✕
              </button>
            </div>

            <div className="min-h-[44px] p-2.5 rounded-xl bg-surface-container/80 border border-outline-variant flex flex-wrap gap-1.5 items-center">
              {seciliKelimeler.length === 0 ? (
                <span className="text-xs text-on-surface-variant/60 italic">Cümleye eklemek için yukarıdaki kelime kutucuklarına sırayla tıklayın...</span>
              ) : (
                seciliKelimeler.map((k, idx) => (
                  <span key={idx} className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                    {k}
                  </span>
                ))
              )}
            </div>

            {cumleMesaji && (
              <p className="text-xs font-bold text-emerald-400">{cumleMesaji}</p>
            )}

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setSeciliKelimeler(prev => prev.slice(0, -1))}
                disabled={seciliKelimeler.length === 0}
                className="px-3 py-1.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-bold text-on-surface disabled:opacity-40 cursor-pointer"
              >
                ← Geri Al
              </button>
              <button
                onClick={() => setSeciliKelimeler([])}
                disabled={seciliKelimeler.length === 0}
                className="px-3 py-1.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-bold text-red-400 disabled:opacity-40 cursor-pointer"
              >
                Temizle
              </button>
              <button
                onClick={handleCumleKaydet}
                disabled={seciliKelimeler.length === 0 || cumleKaydediliyor}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-500/20 hover:bg-emerald-600 disabled:opacity-40 cursor-pointer transition-all"
              >
                {cumleKaydediliyor ? 'Kaydediliyor...' : 'Cümlelerime Kaydet 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Word popup ── */}
      {selWord && !cumleKurmaModu && (
        <div className="bk-word-panel">
          <div className="bk-wp-top">
            <div>
              <span className="bk-wp-type">{selWord.type || 'kelime'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <p className="bk-wp-word" style={{ margin: 0 }}>{selWord.word}</p>
                <button
                  onClick={() => speak(selWord.word, KELIME_HIZI)}
                  style={{ background: 'rgba(99, 102, 241, 0.1)', border: 'none', cursor: 'pointer', display: 'inline-flex', padding: '4px', borderRadius: '6px', color: '#6366f1' }}
                  title="Sesli Oku"
                >
                  <Volume2 size={14} />
                </button>
              </div>
              <p className="bk-wp-tr">{selWord.translation}</p>
            </div>
            <button className="bk-wp-x" onClick={() => setSelWord(null)}><X size={15}/></button>
          </div>
          {selCtx && <p className="bk-wp-ctx">"{selCtx}"</p>}

          <button
            className={`bk-wp-add${added[selWord.word.toLowerCase()] ? ' done' : ''}`}
            disabled={added[selWord.word.toLowerCase()] || saving}
            onClick={saveWord}
          >
            {added[selWord.word.toLowerCase()]
              ? <><CheckCircle size={14}/> Eklendi</>
              : <><BookMarked size={14}/> {saving ? 'Ekleniyor...' : 'Kelimelerime Ekle'}</>}
          </button>
        </div>
      )}
    </div>
  );
}
