"use client";

import React, { useState, useEffect, useRef, FormEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import AdminLayout from "../components/AdminLayout";
import { useAdminKorumasi, adminTokenOku } from "../hooks/useAdminAuth";

/**
 * KURAL-11 — pdf.js artık CDN'den değil npm paketinden geliyor.
 *
 * Eskiden bu sayfa cdnjs'ten SRI'sız bir <script> enjekte ediyordu. İki ayrı
 * sorun vardı: (1) CDN ele geçirilirse yönetici oturumunun içinde keyfî
 * JavaScript çalışır ve admin_token doğrudan çalınır; (2) çekilen sürüm
 * (2.16.105) CVE-2024-4367'ye açıktı — yani ELE GEÇİRİLMİŞ BİR CDN'E BİLE
 * GEREK YOKTU: kötü niyetli bir PDF açmak, panelin içinde kod çalıştırmaya
 * yetiyordu. Panelde açılan PDF'ler dışarıdan gelen dosyalardır.
 *
 * İçe aktarma modül seviyesinde DEĞİL, kullanıldığı anda yapılıyor: pdf.js
 * tarayıcıya özgü API'lere dokunur, sunucu render'ında yüklenmesi gereksizdir.
 */
async function pdfKitapligiYukle() {
  const pdfjsLib = await import("pdfjs-dist");

  // Worker aynı origin'den servis edilir (CSP: worker-src 'self').
  // Dosya derleme öncesi node_modules'tan kopyalanır:
  // admin-panel/scripts/pdfjs-worker-kopyala.mjs
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjsLib;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

/**
 * KURAL-05 — Taksonomi tek kaynaktan gelir: GET /api/books/taxonomy
 *
 * Bu listeler backend'deki IzinliDegerler whitelist'inin AYNISIDIR ve yalnızca
 * uç erişilemezse kullanılan YEDEKTİR. Panelde whitelist dışı bir seçenek
 * durursa yöneticinin tamamen meşru bir seçimi 400 alır; bu yüzden yedek de
 * AlanSinirlariTests tarafından backend ile karşılaştırılır.
 */
const YEDEK_TAKSONOMI = {
  levels: ["A1", "A1-A2", "A2", "A2-B1", "B1", "B1-B2", "B2", "B2-C1", "C1", "C1-C2", "C2"],
  categories: ["story", "article", "other"],
  languages: ["en"],
};

const SEVIYE_ETIKETI: Record<string, string> = {
  "A1": "A1 (Beginner)",
  "A1-A2": "A1-A2 (Elementary)",
  "A2": "A2 (Pre-Intermediate)",
  "A2-B1": "A2-B1 (Pre to Intermediate)",
  "B1": "B1 (Intermediate)",
  "B1-B2": "B1-B2 (Upper Intermediate)",
  "B2": "B2 (Upper Intermediate+)",
  "B2-C1": "B2-C1 (Advanced Transition)",
  "C1": "C1 (Advanced)",
  "C1-C2": "C1-C2 (Proficiency Transition)",
  "C2": "C2 (Mastery)",
};

const KATEGORI_ETIKETI: Record<string, string> = {
  story: "Hikaye (Story)",
  article: "Makale (Article)",
  other: "Diğer (Other)",
};

const DIL_ETIKETI: Record<string, string> = { en: "İngilizce" };

interface Taksonomi {
  levels: string[];
  categories: string[];
  languages: string[];
}

interface Book {
  id: number;
  title: string;
  author: string;
  description: string;
  language: string;
  level?: string;
  category?: string;
  chapterCount: number;
  // KURAL-08: sayfa modunda yüklenen kitapların chapterCount'u 0'dır; panelde
  // "boş kitap" gibi görünüyorlardı. Sunucu artık sayfa adedini de veriyor.
  pageCount: number;
  createdAt: string;
}

interface PdfThumbnailProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  isSelected: boolean;
  onToggle: () => void;
}

function PdfThumbnail({ pdfDoc, pageNumber, isSelected, onToggle }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = canvasRef.current;
        if (!canvas || !active) return;
        const context = canvas.getContext("2d");
        if (!context || !active) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // pdf.js 6: RenderParameters yalnızca 2D bağlamı değil, canvas'ın
        // kendisini de istiyor. Eksikse çizim sessizce yanlış ölçekleniyor.
        const renderContext = {
          canvasContext: context,
          canvas,
          viewport
        };
        if (active) {
          await page.render(renderContext).promise;
        }
      } catch (err) {
        console.error("Error rendering thumbnail:", err);
      }
    };

    if (pdfDoc) {
      renderPage();
    }
    return () => { active = false; };
  }, [pdfDoc, pageNumber]);

  return (
    <div 
      onClick={onToggle} 
      className={`group relative cursor-pointer border rounded-2xl p-2.5 transition-all duration-300 flex flex-col items-center select-none overflow-hidden ${
        isSelected 
          ? "border-indigo-500 bg-indigo-600/10 shadow-lg shadow-indigo-500/10 scale-102" 
          : "border-gray-800 bg-gray-900/30 hover:border-gray-700 hover:bg-gray-900/60"
      }`}
    >
      <div className="relative overflow-hidden rounded-lg shadow-inner">
        <canvas ref={canvasRef} className="rounded-lg shadow-sm bg-white max-h-36 object-contain transition-transform duration-300 group-hover:scale-105" />
        <div className={`absolute inset-0 bg-indigo-950/20 transition-opacity duration-300 ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`} />
        
        {isSelected && (
          <div className="absolute top-2 right-2 bg-linear-to-r from-indigo-500 to-violet-500 text-white rounded-full p-1.5 w-7 h-7 flex items-center justify-center text-xs font-bold shadow-lg animate-in zoom-in duration-200">
            ✓
          </div>
        )}
      </div>
      <span className="text-xs text-gray-400 mt-3 font-semibold group-hover:text-indigo-400 transition-colors">Sayfa {pageNumber}</span>
    </div>
  );
}

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("en");
  const [level, setLevel] = useState("A1");
  const [category, setCategory] = useState("story");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // PDF.js states
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Edit Book states
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLanguage, setEditLanguage] = useState("en");
  const [editLevel, setEditLevel] = useState("A1");
  const [editCategory, setEditCategory] = useState("story");
  const [savingEdit, setSavingEdit] = useState(false);

  // KURAL-05: seçenekler backend whitelist'inden gelir, panelde kopya tutulmaz.
  const [taksonomi, setTaksonomi] = useState<Taksonomi>(YEDEK_TAKSONOMI);

  useAdminKorumasi();

  useEffect(() => {
    const t = adminTokenOku();
    if (!t) return;
    loadBooks(t);
    taksonomiYukle(t);
  }, []);

  // Uç erişilemezse YEDEK_TAKSONOMI'de kalınır: seçim kutuları asla boş kalmaz.
  async function taksonomiYukle(t: string) {
    try {
      const res = await fetch(`${API}/api/books/taxonomy`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d?.levels) && d.levels.length > 0) {
        setTaksonomi({
          levels: d.levels,
          categories: d.categories ?? YEDEK_TAKSONOMI.categories,
          languages: d.languages ?? YEDEK_TAKSONOMI.languages,
        });
      }
    } catch {
      /* yedekte kalınır */
    }
  }

  // Dosya seçimi değiştiğinde önizleme durumunu ayarlar.
  // Bu iş bilerek efektte DEĞİL olay işleyicisinde yapılır: efekt gövdesinde
  // senkron setState gereksiz ikinci render tetikler
  // (react-hooks/set-state-in-effect).
  function dosyaSecimiDegisti(f: File | null) {
    setPdfFile(f);
    setPdfDoc(null);
    if (!f) {
      setTotalPages(0);
      setSelectedPages([]);
    } else if (f.name.toLowerCase().endsWith(".docx")) {
      // Word belgesinde sayfa sonu YOKTUR: nerede biteceği yazı tipine ve yazıcı
      // ayarına göre değişir, tarayıcı bunu bilemez. Bu yüzden sayfa seçici
      // gösterilmez (pdfDoc boş kalır) ve sunucu belgeyi kendisi sayfalara böler.
      // Gönderilen seçim DOCX'te sunucu tarafından yok sayılır; buradaki [1]
      // yalnızca "dosya seçildi" doğrulamasını geçmek içindir.
      setTotalPages(1);
      setSelectedPages([1]);
    } else {
      // Gerçek PDF: sayfa sayısı aşağıdaki efektte, dosya okunduktan sonra belirlenir.
      setTotalPages(0);
      setSelectedPages([]);
    }
  }

  useEffect(() => {
    // Yalnızca gerçek PDF dosyaları için önizleme yüklenir.
    if (!pdfFile || pdfFile.name.toLowerCase().endsWith(".docx")) return;

    // Kütüphane artık import ile geliyor: "CDN yüklendi mi?" diye 1 saniye
    // bekleyen setTimeout kurgusuna gerek yok. O kurgu yavaş bağlantıda
    // önizlemeyi sessizce boş bırakıyordu; şimdi yükleme beklenebiliyor.
    let gecerli = true;

    const onizlemeyiYukle = async () => {
      setLoadingPreview(true);
      try {
        const pdfjsLib = await pdfKitapligiYukle();
        const veri = new Uint8Array(await pdfFile.arrayBuffer());
        // Yükleme görevi elde tutuluyor: iptal (destroy) belge nesnesinde değil,
        // görevde. Aksi halde vazgeçilen bir önizlemenin worker'ı ayakta kalır.
        // wasmUrl: JBIG2/OpenJPEG çözücüleri de kendi origin'imizden gelsin.
        // Verilmezse pdf.js paketin içindeki göreli yolu dener ve taranmış
        // PDF'lerin sayfaları boş çizilir.
        const yuklemeGorevi = pdfjsLib.getDocument({ data: veri, wasmUrl: "/pdfjs/wasm/" });
        const doc = await yuklemeGorevi.promise;

        // Kullanıcı bu arada başka dosya seçtiyse eski belgeyi bırak.
        if (!gecerli) { void yuklemeGorevi.destroy(); return; }

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setSelectedPages(Array.from({ length: doc.numPages }, (_, i) => i + 1));
      } catch (err) {
        console.error("PDF önizlemesi yüklenemedi:", err);
      } finally {
        // Eski kod bu satırı FileReader daha okumaya BAŞLAMADAN çalıştırıyordu:
        // gösterge, önizleme hazır olmadan kapanıyordu.
        if (gecerli) setLoadingPreview(false);
      }
    };

    void onizlemeyiYukle();
    return () => { gecerli = false; };
  }, [pdfFile]);

  async function loadBooks(t: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/books`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBooks(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const togglePageSelection = (pageNumber: number) => {
    setSelectedPages(prev => 
      prev.includes(pageNumber) 
        ? prev.filter(p => p !== pageNumber) 
        : [...prev, pageNumber].sort((a, b) => a - b)
    );
  };

  const selectAllPages = () => {
    const all = [];
    for (let i = 1; i <= totalPages; i++) all.push(i);
    setSelectedPages(all);
  };

  const clearPageSelection = () => {
    setSelectedPages([]);
  };

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    const token = adminTokenOku();
    if (!pdfFile || !token) return;
    if (selectedPages.length === 0) {
      setMessage({ type: "error", text: "Lütfen en az bir sayfa seçin." });
      return;
    }

    setUploading(true);
    setMessage(null);

    const form = new FormData();
    form.append("title", title);
    form.append("author", author);
    form.append("description", description);
    form.append("language", language);
    form.append("level", level);
    form.append("category", category);
    form.append("file", pdfFile);
    form.append("selectedPages", selectedPages.join(","));

    try {
      const res = await fetch(`${API}/api/admin/books/upload-pages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Yükleme başarısız." });
      } else {
        setMessage({
          type: "success",
          text: `✅ "${data.title}" kitabı ${data.pagesCreated} sayfa ve otomatik çevirilerle sisteme başarıyla eklendi!`,
        });
        setTitle(""); setAuthor(""); setDescription(""); dosyaSecimiDegisti(null);
        setPdfDoc(null); setTotalPages(0); setSelectedPages([]);
        loadBooks(token);
      }
    } catch {
      setMessage({ type: "error", text: "Sunucu hatası oluştu." });
    } finally {
      setUploading(false);
    }
  }

  async function deleteBook(id: number) {
    const token = adminTokenOku();
    if (!token || !confirm("Bu kitabı silmek istediğinizden emin misiniz?")) return;
    const res = await fetch(`${API}/api/admin/books/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setBooks((b) => b.filter((x) => x.id !== id));
      setMessage({ type: "success", text: "Kitap silindi." });
    }
  }

  function handleEditClick(b: Book) {
    setEditingBook(b);
    setEditTitle(b.title || "");
    setEditAuthor(b.author || "");
    setEditDescription(b.description || "");
    setEditLanguage(b.language || "en");
    setEditLevel(b.level || "A1");
    setEditCategory(b.category || "story");
  }

  async function handleUpdateBook(e: React.FormEvent) {
    e.preventDefault();
    const token = adminTokenOku();
    if (!editingBook || !token) return;

    setSavingEdit(true);
    try {
      const res = await fetch(`${API}/api/admin/books/${editingBook.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editTitle,
          author: editAuthor,
          description: editDescription,
          language: editLanguage,
          level: editLevel,
          category: editCategory,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Güncelleme başarısız." });
      } else {
        setMessage({ type: "success", text: `✅ "${editTitle}" kitabı başarıyla güncellendi!` });
        setEditingBook(null);
        loadBooks(token);
      }
    } catch {
      setMessage({ type: "error", text: "Sunucu hatası oluştu." });
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-white bg-clip-text bg-linear-to-r from-white to-gray-400">Kitap Yönetimi</h1>
        <p className="text-gray-400 text-sm mt-1.5 font-medium">Pre-translation teknolojisi ve görsel sayfa seçimi ile kitap oluşturun</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border text-sm font-semibold mb-6 ${
          message.type === "success" 
            ? "bg-green-950/20 border-green-800/40 text-green-400" 
            : "bg-red-950/20 border-red-800/40 text-red-400"
        }`}>
          {message.text}
        </div>
      )}

      {/* PDF Yükleme Formu */}
      <div className="bg-gray-900/30 border border-gray-800/80 backdrop-blur-xs rounded-3xl p-8 shadow-xl space-y-6">
        <h2 className="text-xl font-bold tracking-tight bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent flex items-center gap-2">
          <span>📤</span> Yeni Kitap Yükle & Çevir
        </h2>
        
        <form onSubmit={handleUpload} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Kitap Başlığı *</label>
              <input id="book-title" required value={title} onChange={e => setTitle(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600"
                placeholder="Örn: Tom Sawyer'ın Maceraları" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Yazar</label>
              <input id="book-author" value={author} onChange={e => setAuthor(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600"
                placeholder="Yazar adı" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Açıklama</label>
            <textarea id="book-description" value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600 resize-none"
              placeholder="Kitap hakkında kısa açıklama..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Dil</label>
              <select id="book-language" value={language} onChange={e => setLanguage(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-hidden focus:border-indigo-500 transition-all">
                {taksonomi.languages.map((d) => (
                  <option key={d} value={d}>{DIL_ETIKETI[d] ?? d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Seviye (CEFR & Ara Seviyeler)</label>
              <select id="book-level" value={level} onChange={e => setLevel(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-hidden focus:border-indigo-500 transition-all">
                {taksonomi.levels.map((s) => (
                  <option key={s} value={s}>{SEVIYE_ETIKETI[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Kategori</label>
              <select id="book-category" value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-hidden focus:border-indigo-500 transition-all">
                {taksonomi.categories.map((c) => (
                  <option key={c} value={c}>{KATEGORI_ETIKETI[c] ?? c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">PDF veya Word Dosyası * (Max 50MB)</label>
            <input id="book-pdf" type="file" accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required
              onChange={e => dosyaSecimiDegisti(e.target.files?.[0] || null)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-gray-300 text-sm focus:outline-hidden focus:border-indigo-500 file:mr-3 file:py-1.5 file:px-3.5 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-bold file:hover:bg-indigo-500 file:cursor-pointer transition-all" />
          </div>

          {/* DOCX seçildiğinde: sayfa seçici yok, ne olacağını açıkça söyle */}
          {pdfFile?.name.toLowerCase().endsWith(".docx") && (
            <div className="border border-gray-800 bg-gray-950/20 backdrop-blur-xs rounded-2xl p-5">
              <h3 className="font-bold text-sm text-white">Word belgesi</h3>
              <p className="text-xs text-gray-400 mt-1.5">
                Word belgelerinde sabit sayfa sonu bulunmaz, bu yüzden sayfa seçimi yapılmaz.
                Belgenin <strong className="text-gray-300">tamamı</strong> yüklenir ve okuma
                akışı için otomatik olarak sayfalara bölünür.
              </p>
            </div>
          )}

          {/* PDF Sayfa Önizleme Grid */}
          {pdfDoc && (
            <div className="border border-gray-800 bg-gray-950/20 backdrop-blur-xs rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800/80 pb-4">
                <div>
                  <h3 className="font-bold text-sm text-white">Sayfa Seçimi</h3>
                  <p className="text-xs text-gray-400 mt-1">Seçilen sayfalar pre-translation sırasıyla sisteme kaydedilecektir. ({selectedPages.length} / {totalPages} sayfa seçildi)</p>
                </div>
                <div className="flex gap-2.5">
                  <button type="button" onClick={selectAllPages} className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700/80 text-xs font-bold rounded-xl transition-all">Tümünü Seç</button>
                  <button type="button" onClick={clearPageSelection} className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700/80 text-xs font-bold rounded-xl transition-all text-red-400">Tümünü Kaldır</button>
                </div>
              </div>

              {loadingPreview ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[420px] overflow-y-auto pr-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <PdfThumbnail 
                      key={pageNum}
                      pdfDoc={pdfDoc}
                      pageNumber={pageNum}
                      isSelected={selectedPages.includes(pageNum)}
                      onToggle={() => togglePageSelection(pageNum)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <button id="upload-book-btn" type="submit" disabled={uploading}
            className="w-full bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white py-4 rounded-xl text-sm font-bold transition-all duration-300 shadow-lg shadow-indigo-600/10">
            {uploading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Metin Çıkarılıyor & Google Translate İle Çevriliyor...</span>
              </div>
            ) : (
              "📤 Kitabı Sisteme Yükle ve Otomatik Çevir"
            )}
          </button>
        </form>
      </div>

      {/* Kitap Listesi */}
      <div className="bg-gray-900/30 border border-gray-800/80 backdrop-blur-xs rounded-3xl p-8 shadow-xl">
        <h2 className="text-xl font-bold tracking-tight text-white mb-6">📚 Mevcut Kitaplar ({books.length})</h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Yükleniyor...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800/80">
                  <th className="pb-4 font-bold uppercase tracking-widest text-[10px]">Kitap</th>
                  <th className="pb-4 font-bold uppercase tracking-widest text-[10px]">Yazar</th>
                  <th className="pb-4 font-bold uppercase tracking-widest text-[10px]">Kategori</th>
                  <th className="pb-4 font-bold uppercase tracking-widest text-[10px]">Seviye</th>
                  <th className="pb-4 font-bold uppercase tracking-widest text-[10px]">Dil</th>
                  <th className="pb-4 font-bold uppercase tracking-widest text-[10px]">Eklenme Tarihi</th>
                  <th className="pb-4 font-bold uppercase tracking-widest text-[10px]">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {books.map((b) => (
                  <tr key={b.id} className="text-gray-300 hover:bg-gray-800/10 transition-colors">
                    <td className="py-4 font-bold text-white text-sm">{b.title}</td>
                    <td className="py-4 text-gray-400 font-medium">{b.author || "-"}</td>
                    <td className="py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                        b.category === 'article' 
                          ? 'bg-amber-950/40 text-amber-300 border-amber-800/60' 
                          : 'bg-violet-950/40 text-violet-300 border-violet-800/60'
                      }`}>
                        {b.category === 'article' ? '📄 Makale' : b.category === 'other' ? '📁 Diğer' : '📖 Hikaye'}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="px-2.5 py-1 bg-indigo-950/40 text-indigo-300 rounded-lg text-xs font-extrabold border border-indigo-800/60">
                        {b.level || "A1"}
                      </span>
                    </td>
                    <td className="py-4"><span className="px-2.5 py-1 bg-gray-800/80 text-gray-300 rounded-lg text-xs font-bold border border-gray-700">{b.language.toUpperCase()}</span></td>
                    <td className="py-4 text-gray-400 font-semibold">{new Date(b.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleEditClick(b)} className="text-indigo-300 hover:text-indigo-200 font-bold text-xs px-3 py-1.5 rounded-xl bg-indigo-950/40 border border-indigo-800/50 hover:bg-indigo-900/40 transition">✏️ Düzenle</button>
                        <button onClick={() => deleteBook(b.id)} className="text-red-400 hover:text-red-300 font-bold text-xs px-3 py-1.5 rounded-xl bg-red-950/20 border border-red-900/30 hover:bg-red-900/35 transition">Sil</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {books.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-600">Henüz kitap eklenmemiş.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Kitap Düzenleme Modalı */}
      {editingBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-xl w-full shadow-2xl space-y-6 my-auto">
            <div className="flex items-center justify-between border-b border-gray-800/80 pb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>✏️</span> Kitap Düzenle (#{editingBook.id})
              </h3>
              <button onClick={() => setEditingBook(null)} className="text-gray-400 hover:text-white font-bold text-sm bg-gray-800 px-3 py-1 rounded-xl">✕</button>
            </div>

            <form onSubmit={handleUpdateBook} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Kitap Başlığı *</label>
                <input type="text" required value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Yazar</label>
                <input type="text" value={editAuthor} onChange={e => setEditAuthor(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Açıklama</label>
                <textarea rows={3} value={editDescription} onChange={e => setEditDescription(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-indigo-500" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Dil</label>
                  <select value={editLanguage} onChange={e => setEditLanguage(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-indigo-500">
                    {taksonomi.languages.map((d) => (
                      <option key={d} value={d}>{DIL_ETIKETI[d] ?? d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Seviye (CEFR)</label>
                  <select value={editLevel} onChange={e => setEditLevel(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-indigo-500">
                    {taksonomi.levels.map((s) => (
                      <option key={s} value={s}>{SEVIYE_ETIKETI[s] ?? s}</option>
                    ))}
                      </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Kategori</label>
                  <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-indigo-500">
                    {taksonomi.categories.map((c) => (
                      <option key={c} value={c}>{KATEGORI_ETIKETI[c] ?? c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-gray-800/80">
                <button type="button" onClick={() => setEditingBook(null)}
                  className="w-1/3 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl text-sm font-bold transition">
                  İptal
                </button>
                <button type="submit" disabled={savingEdit}
                  className="w-2/3 bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold transition shadow-lg shadow-indigo-600/20">
                  {savingEdit ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
