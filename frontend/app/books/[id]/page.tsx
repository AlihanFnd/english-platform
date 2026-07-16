'use client';

import React, { useEffect, useState, use } from 'react';
import { api, Chapter } from '../../api';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  Volume2, BookMarked, CheckCircle, X, HelpCircle,
  Maximize2, Minimize2
} from 'lucide-react';
import Link from 'next/link';

interface AnalyzedWord { word: string; translation: string; type: string; }
interface AnalyzedSentence { original: string; translation: string; isHeading?: boolean; alignment?: 'left' | 'center' | 'right'; indentation?: number; words: AnalyzedWord[]; }

export default function BookReader({ params }: { params: Promise<{ id: string }> }) {
  const { id: bookIdStr } = use(params);
  const bookId = parseInt(bookIdStr);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bookTitle, setBookTitle]   = useState('');
  const [loading, setLoading]       = useState(true);
  const [analyzing, setAnalyzing]   = useState(false);
  const [sentences, setSentences]   = useState<AnalyzedSentence[]>([]);
  const [error, setError]           = useState('');

  const [hasPages, setHasPages]         = useState(false);
  const [totalPages, setTotalPages]     = useState(0);
  const currentPage = parseInt(searchParams.get('page') || '1');

  const [chapter, setChapter]           = useState<Chapter | null>(null);
  const [totalChapters, setTotalChapters] = useState(1);
  const currentChapter = parseInt(searchParams.get('chapter') || '1');

  // Which sentence's translation is open
  const [openTr, setOpenTr] = useState<number | null>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Word popup
  const [selWord, setSelWord]     = useState<any | null>(null);
  const [selCtx, setSelCtx]       = useState('');
  const [added, setAdded]         = useState<Record<string, boolean>>({});
  const [saving, setSaving]       = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);

  const normalizeSentences = (arr: any): AnalyzedSentence[] => {
    const raw = Array.isArray(arr) ? arr : [];
    const expanded: AnalyzedSentence[] = [];

    raw.forEach((s: any) => {
      let orig = (s.original || s.Original || "").trim();
      let trans = (s.translation || s.Translation || "").trim();
      let isHead = s.isHeading !== undefined ? s.isHeading : (s.IsHeading !== undefined ? s.IsHeading : false);
      let align = s.alignment || s.Alignment || (isHead ? "center" : "left");
      let words = s.words || s.Words || [];

      // Eğer satır içinde başlık ile normal paragraf cümlesi birleşmişse (örn: "CHAPTER I THE BEGINNING It was a dark...")
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
              words: headingPart.split(/\s+/).map((w: string) => ({ word: w, translation: w, type: "default" }))
            });
            orig = bodyPart;
            if (trans.length > headingPart.length) {
              trans = trans.replace(headingPart, "").trim();
            }
          }
        }
      }

      // Ayrıca başlık tespiti kontrolü (Sadece açıkça CHAPTER vb. ile başlıyorsa):
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
        words: formattedWords
      });
    });

    return expanded;
  };

  useEffect(() => {
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
        } else {
          setHasPages(false);
          const d = await api.readChapter(bookId, currentChapter);
          setChapter(d.currentChapter); setBookTitle(d.bookTitle); setTotalChapters(d.totalChapters);
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

  const handleReanalyze = async () => {
    if (analyzing || loading) return;
    setAnalyzing(true);
    try {
      if (hasPages) {
        const pd = await api.readPage(bookId, currentPage, true);
        if (pd.currentPage?.sentencesJson && pd.currentPage.sentencesJson !== "[]") {
          setSentences(normalizeSentences(JSON.parse(pd.currentPage.sentencesJson)));
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

  const speak = (t: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US';
      window.speechSynthesis.speak(u);
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

  const handleSelection = () => {
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

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const handleDocSelectionChange = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (text && text.length > 1 && text.length < 150 && selection?.rangeCount) {
          const range = selection.getRangeAt(0);
          const container = range.commonAncestorContainer;
          const isInsideReader = container.nodeType === Node.ELEMENT_NODE 
            ? (container as HTMLElement).closest('.bk-sentences') 
            : container.parentElement?.closest('.bk-sentences');
            
          if (isInsideReader) {
            const sentEl = container.nodeType === Node.ELEMENT_NODE 
              ? (container as HTMLElement).closest('.bk-sent-en') 
              : container.parentElement?.closest('.bk-sent-en');
            const sentText = sentEl ? sentEl.textContent || text : text;
            handleWordClick({ word: text, type: text.includes(' ') ? "kalıp" : "kelime" }, sentText);
          }
        }
      }, 500); // 500ms debounce when long-pressing and dragging word by word
    };

    document.addEventListener('selectionchange', handleDocSelectionChange);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('selectionchange', handleDocSelectionChange);
    };
  }, []);

  const wordClass = (t: string) => {
    const map: Record<string, string> = {
      'isim': 'word-isim', 'fiil': 'word-fiil', 'sıfat': 'word-sifat',
      'zarf': 'word-zarf', 'edat': 'word-edat', 'bağlaç': 'word-baglac', 'zamir': 'word-zamir',
    };
    return map[t?.toLowerCase()] || 'word-default';
  };

  /* ── Loading ── */
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

      {/* ── Header strip ── */}
      <div className="bk-header">
        <Link href="/books" className="bk-back"><ArrowLeft size={13}/> Kitaplık</Link>
        <div className="bk-title-block">
          <span className="bk-title">{bookTitle}</span>
          <span className="bk-loc">
            {hasPages ? `Sayfa ${currentPage} / ${totalPages}` : `Bölüm ${currentChapter} / ${totalChapters}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleReanalyze} 
            disabled={analyzing}
            className="bk-quiz bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 cursor-pointer"
            title="Eski önbelleği temizleyip başlıkları alt alta ve doğru şekilde yeniden analiz et"
          >
            🔄 {analyzing ? 'Yenileniyor...' : 'Başlıkları Yeniden Çevir & Düzenle'}
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

      {/* ── Page card ── */}
      <div className="bk-page">
        {analyzing ? (
          <div className="bk-loading">
            <div className="bk-spin"/> <span>Analiz yapılıyor...</span>
          </div>
        ) : sentences.length === 0 ? (
          <p className="bk-empty">Bu sayfada metin bulunamadı.</p>
        ) : (
          <div className="bk-sentences" onMouseUp={handleSelection} onTouchEnd={handleSelection}>
            {sentences.map((s, i) => (
              <div 
                key={i} 
                className={`bk-sent-block${s.isHeading ? ' bk-sent-block--heading' : ''}`}
                style={{
                  textAlign: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'right' : 'left',
                  paddingLeft: s.indentation ? `${s.indentation * 12}px` : undefined
                }}
              >

                {/* English sentence — words are clickable, row is clickable for translation */}
                <div
                  className={`bk-sent-en${openTr === i ? ' bk-sent-en--active' : ''}${s.isHeading ? ' bk-sent-en--heading' : ''}`}
                  onClick={() => setOpenTr(openTr === i ? null : i)}
                  style={{
                    justifyContent: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'flex-end' : 'space-between'
                  }}
                >
                  <span 
                    className="bk-sent-words"
                    style={{
                      textAlign: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'right' : 'left'
                    }}
                  >
                    {s.words.map((w, wi) => (
                      <span
                        key={wi}
                        className={`bk-word ${wordClass(w.type)}`}
                        onClick={e => { e.stopPropagation(); handleWordClick(w, s.original); }}
                        title="Tıklayarak çeviriyi gör"
                      >
                        {w.word}{wi < s.words.length - 1 ? ' ' : ''}
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

                {/* Turkish translation — directly under the sentence, same block */}
                {openTr === i && (
                  <div 
                    className={`bk-sent-tr${s.alignment === 'center' ? ' bk-sent-tr--center' : ''}`}
                    style={{
                      justifyContent: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'flex-end' : 'flex-start',
                      textAlign: s.alignment === 'center' ? 'center' : s.alignment === 'right' ? 'right' : 'left'
                    }}
                  >
                    <span className="bk-tr-flag">TR</span>
                    <span className="bk-tr-text">{s.translation}</span>
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
            <button disabled={currentPage <= 1} onClick={() => router.push(`/books/${bookId}?page=${currentPage-1}`)} className="bk-nav">
              <ChevronLeft size={15}/> Önceki
            </button>
            <span className="bk-pageno">{currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages} onClick={() => router.push(`/books/${bookId}?page=${currentPage+1}`)} className="bk-nav">
              Sonraki <ChevronRight size={15}/>
            </button>
          </>
        ) : (
          <>
            <button disabled={currentChapter <= 1} onClick={() => router.push(`/books/${bookId}?chapter=${currentChapter-1}`)} className="bk-nav">
              <ChevronLeft size={15}/> Önceki
            </button>
            <span className="bk-pageno">{currentChapter} / {totalChapters}</span>
            <button disabled={currentChapter >= totalChapters} onClick={() => router.push(`/books/${bookId}?chapter=${currentChapter+1}`)} className="bk-nav">
              Sonraki <ChevronRight size={15}/>
            </button>
          </>
        )}
      </div>

      {/* ── Word popup ── */}
      {selWord && (
        <div className="bk-word-panel">
          <div className="bk-wp-top">
            <div>
              <span className="bk-wp-type">{selWord.type || 'kelime'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <p className="bk-wp-word" style={{ margin: 0 }}>{selWord.word}</p>
                <button
                  onClick={() => speak(selWord.word)}
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
