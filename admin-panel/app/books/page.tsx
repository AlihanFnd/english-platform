/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
"use client";

import React, { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "../components/AdminLayout";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

interface Book {
  id: number;
  title: string;
  author: string;
  description: string;
  language: string;
  chapterCount: number;
  createdAt: string;
}

interface PdfThumbnailProps {
  pdfDoc: any;
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

        const renderContext = {
          canvasContext: context,
          viewport: viewport
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
        <canvas ref={canvasRef} className="rounded-lg shadow bg-white max-h-36 object-contain transition-transform duration-300 group-hover:scale-105" />
        <div className={`absolute inset-0 bg-indigo-950/20 transition-opacity duration-300 ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`} />
        
        {isSelected && (
          <div className="absolute top-2 right-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-full p-1.5 w-7 h-7 flex items-center justify-center text-xs font-bold shadow-lg animate-in zoom-in duration-200">
            ✓
          </div>
        )}
      </div>
      <span className="text-xs text-gray-400 mt-3 font-semibold group-hover:text-indigo-400 transition-colors">Sayfa {pageNumber}</span>
    </div>
  );
}

export default function BooksPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("en");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // PDF.js states
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    script.onload = () => {
      // @ts-ignore
      window.pdfjsLib = window["pdfjs-dist/build/pdf"];
      // @ts-ignore
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (!t) { router.replace("/"); return; }
    setToken(t);
    loadBooks(t);
  }, [router]);

  useEffect(() => {
    if (!pdfFile) {
      setPdfDoc(null);
      setTotalPages(0);
      setSelectedPages([]);
      return;
    }

    // Word (.docx) belgeleri için PDF önizlemeyi bypass et
    if (pdfFile.name.toLowerCase().endsWith(".docx")) {
      setPdfDoc(null);
      setTotalPages(1);
      setSelectedPages([1]); // Word belgelerini tek sayfa olarak simüle ederiz
      return;
    }

    const loadPdf = async () => {
      setLoadingPreview(true);
      try {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
          const typedarray = new Uint8Array(this.result as ArrayBuffer);
          // @ts-ignore
          if (window.pdfjsLib) {
            // @ts-ignore
            const doc = await window.pdfjsLib.getDocument({ data: typedarray }).promise;
            setPdfDoc(doc);
            setTotalPages(doc.numPages);
            const all: number[] = [];
            for (let i = 1; i <= doc.numPages; i++) all.push(i);
            setSelectedPages(all);
          }
        };
        fileReader.readAsArrayBuffer(pdfFile);
      } catch (err) {
        console.error("PDF loading error:", err);
      } finally {
        setLoadingPreview(false);
      }
    };
    
    // @ts-ignore
    if (window.pdfjsLib) {
      loadPdf();
    } else {
      const timer = setTimeout(loadPdf, 1000);
      return () => clearTimeout(timer);
    }
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
        setTitle(""); setAuthor(""); setDescription(""); setPdfFile(null);
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

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-white bg-clip-text bg-gradient-to-r from-white to-gray-400">Kitap Yönetimi</h1>
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

      {/* Grid: Upload & Book List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* PDF Yükleme Formu */}
        <div className="lg:col-span-1 bg-gray-900/30 border border-gray-800/80 backdrop-blur-sm rounded-3xl p-6 shadow-xl space-y-6">
          <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent flex items-center gap-2">
            <span>📤</span> Yeni Kitap Yükle & Çevir
          </h2>
          
          <form onSubmit={handleUpload} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Kitap Başlığı *</label>
                <input id="book-title" required value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600"
                  placeholder="Örn: Tom Sawyer'ın Maceraları" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Yazar</label>
                <input id="book-author" value={author} onChange={e => setAuthor(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600"
                  placeholder="Yazar adı" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Açıklama</label>
              <textarea id="book-description" value={description} onChange={e => setDescription(e.target.value)} rows={3}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600 resize-none"
                placeholder="Kitap hakkında kısa açıklama..." />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Dil</label>
                <select id="book-language" value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all">
                  <option value="en">İngilizce</option>
                  <option value="tr">Türkçe</option>
                  <option value="de">Almanca</option>
                  <option value="fr">Fransızca</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">PDF veya Word Dosyası * (Max 50MB)</label>
                <input id="book-pdf" type="file" accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required
                  onChange={e => setPdfFile(e.target.files?.[0] || null)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-gray-300 text-sm focus:outline-none focus:border-indigo-500 file:mr-3 file:py-1.5 file:px-3.5 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-bold file:hover:bg-indigo-500 file:cursor-pointer transition-all" />
              </div>
            </div>

            {/* PDF Sayfa Önizleme Grid */}
            {pdfDoc && (
              <div className="border border-gray-800 bg-gray-950/20 backdrop-blur-sm rounded-2xl p-6 space-y-6">
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
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white py-4 rounded-xl text-sm font-bold transition-all duration-300 shadow-lg shadow-indigo-600/10">
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
        <div className="bg-gray-900/30 border border-gray-800/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl">
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
                      <td className="py-4"><span className="px-2.5 py-1 bg-gray-800/80 text-gray-300 rounded-lg text-xs font-bold border border-gray-700">{b.language.toUpperCase()}</span></td>
                      <td className="py-4 text-gray-400 font-semibold">{new Date(b.createdAt).toLocaleDateString("tr-TR")}</td>
                      <td className="py-4">
                        <button onClick={() => deleteBook(b.id)} className="text-red-400 hover:text-red-300 font-bold text-xs px-3 py-1.5 rounded-xl bg-red-950/20 border border-red-900/30 hover:bg-red-900/35 transition">Sil</button>
                      </td>
                    </tr>
                  ))}
                  {books.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-600">Henüz kitap eklenmemiş.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
