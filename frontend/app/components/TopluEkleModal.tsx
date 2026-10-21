'use client';

import React, { useState, useRef } from 'react';
import { FileUp, FileSpreadsheet, FileText, Check, X, Trash2, CheckSquare, Square, UploadCloud, Loader2, Sparkles } from 'lucide-react';
import { api } from '../api';
import { AyristirilmisOge, dosyayiAyristir, metniAyristir } from '../lib/dosyaAyristirici';

interface TopluEkleModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTarget?: 'kelime' | 'cumle';
  userId?: number | string;
  onSuccess: () => void;
}

export function TopluEkleModal({
  isOpen,
  onClose,
  defaultTarget = 'kelime',
  userId,
  onSuccess,
}: TopluEkleModalProps) {
  const [activeTab, setActiveTab] = useState<'dosya' | 'metin'>('dosya');
  const [target, setTarget] = useState<'kelime' | 'cumle'>(defaultTarget);

  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [items, setItems] = useState<AyristirilmisOge[]>([]);
  const [error, setError] = useState('');

  /* Çeviri ve içe aktarma durumu */
  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState({ done: 0, total: 0 });
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const selectedCount = items.filter((i) => i.selected).length;

  const reset = () => {
    setItems([]);
    setFileName('');
    setPastedText('');
    setError('');
    setTranslating(false);
    setImporting(false);
    setImportedCount(0);
  };

  const handleClose = () => {
    if (importing || translating) return;
    reset();
    onClose();
  };

  const autoTranslate = async (targetList?: AyristirilmisOge[]) => {
    const source = targetList || items;
    const missing = source.filter((i) => !i.translation.trim());
    if (missing.length === 0) return;

    setTranslating(true);
    setTranslateProgress({ done: 0, total: missing.length });

    let count = 0;
    for (const item of missing) {
      try {
        let tr = '';
        if (target === 'kelime') {
          const res = await api.translateWord(item.original.trim());
          tr = res.generalMeaning || res.translation || '';
        } else {
          const res = await api.translateSentence(item.original.trim());
          tr = res.translation || '';
        }
        if (tr) {
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, translation: tr } : i)),
          );
        }
      } catch {
        /* Tekil hata diğer kelimeleri engellemesin */
      }
      count++;
      setTranslateProgress({ done: count, total: missing.length });
      await new Promise((r) => setTimeout(r, 40));
    }
    setTranslating(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setFileName(file.name);
    setParsing(true);

    try {
      const parsed = await dosyayiAyristir(file);
      if (parsed.length === 0) {
        setError('Dosyada geçerli kelime veya cümle bulunamadı.');
      } else {
        setItems(parsed);
        const missingCount = parsed.filter((i) => !i.translation.trim()).length;
        if (missingCount > 0) {
          setTimeout(() => {
            autoTranslate(parsed);
          }, 350);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Dosya okunurken bir hata oluştu.');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTextParse = () => {
    setError('');
    if (!pastedText.trim()) {
      setError('Lütfen ayrıştırılacak metni yapıştırın.');
      return;
    }
    const parsed = metniAyristir(pastedText);
    if (parsed.length === 0) {
      setError('Yapıştırılan metinde geçerli kelime veya cümle bulunamadı.');
      return;
    }
    setItems(parsed);
    const missingCount = parsed.filter((i) => !i.translation.trim()).length;
    if (missingCount > 0) {
      setTimeout(() => {
        autoTranslate(parsed);
      }, 350);
    }
  };

  const toggleSelectAll = () => {
    const allSelected = items.every((i) => i.selected);
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })));
  };

  const toggleSelectItem = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)),
    );
  };

  const updateItem = (id: string, field: 'original' | 'translation', val: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: val } : i)),
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleBulkImport = async () => {
    const selected = items.filter((i) => i.selected && i.original.trim());
    if (selected.length === 0) {
      alert('Lütfen içe aktarılacak en az bir geçerli satır seçin.');
      return;
    }

    setImporting(true);
    setImportedCount(0);
    let successCount = 0;

    try {
      if (target === 'kelime') {
        for (let i = 0; i < selected.length; i++) {
          const item = selected[i];
          let tr = item.translation.trim();
          if (!tr) {
            try {
              const res = await api.translateWord(item.original.trim());
              tr = res.generalMeaning || res.translation || item.original.trim();
            } catch {
              tr = item.original.trim();
            }
          }
          try {
            await api.addWord(item.original.trim(), tr, item.context || '');
            successCount++;
          } catch {}
          setImportedCount(i + 1);
        }
      } else {
        const toAdd = [];
        for (let i = 0; i < selected.length; i++) {
          const s = selected[i];
          let tr = s.translation.trim();
          if (!tr) {
            try {
              const res = await api.translateSentence(s.original.trim());
              tr = res.translation || s.original.trim();
            } catch {
              tr = s.original.trim();
            }
          }
          toAdd.push({
            sentence: s.original.trim(),
            translation: tr,
            context: s.context,
          });
          setImportedCount(i + 1);
        }
        const res = await api.topluCumleEkle(
          toAdd.map((item) => ({ cumle: item.sentence, ceviri: item.translation, baglam: item.context })),
        );
        successCount = res.eklenen;
      }

      alert(`${successCount} adet ${target === 'kelime' ? 'kelime' : 'cümle'} başarıyla eklendi!`);
      onSuccess();
      handleClose();
    } catch (err: any) {
      alert(err.message || 'İçe aktarma hatası.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-container-high border border-outline-variant rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <FileUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-on-surface">Toplu İçe Aktarma</h2>
              <p className="text-xs text-on-surface-variant">Excel, Word veya metin listesinden kelime/cümle ekle</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={importing}
            className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">
              {error}
            </div>
          )}

          {items.length === 0 ? (
            <div className="space-y-4">
              {/* Tabs */}
              <div className="flex p-1 bg-surface-container rounded-xl border border-outline-variant">
                <button
                  type="button"
                  onClick={() => setActiveTab('dosya')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'dosya'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Dosya Yükle (.xlsx, .docx, .txt, .csv)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('metin')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'metin'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Metin / Liste Yapıştır
                </button>
              </div>

              {activeTab === 'dosya' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-outline-variant hover:border-primary/50 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-surface/50 hover:bg-surface space-y-3"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.docx,.txt,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {parsing ? <Loader2 className="w-7 h-7 animate-spin" /> : <UploadCloud className="w-7 h-7" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface">
                      {parsing ? 'Dosya ayrıştırılıyor…' : 'Dosya seçmek için tıklayın'}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Excel (.xlsx, .xls), Word (.docx) veya CSV / TXT metin belgeleri
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-on-surface-variant">
                    Her satıra bir kelime veya cümle ve anlamını yazın/yapıştırın. Örn:
                    <br />
                    <code className="text-primary font-mono text-[11px]">car - araba</code>
                    <br />
                    <code className="text-primary font-mono text-[11px]">apple: elma</code>
                    <br />
                    <code className="text-primary font-mono text-[11px]">I love reading books. - Kitap okumayı severim.</code>
                  </p>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`car - araba\nbreak the ice - buzları eritmek\nShe goes to school. - O okula gider.`}
                    rows={8}
                    className="w-full p-3 bg-surface-container border border-outline-variant rounded-xl text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTextParse}
                    disabled={!pastedText.trim()}
                    className="w-full py-2.5 bg-primary text-on-primary font-bold text-xs rounded-xl hover:bg-primary-container transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Metni Çözümle ve Listele
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Items preview table */
            <div className="space-y-4">
              {/* Target & Select All */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-container rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-on-surface-variant">HEDEF LİSTE:</span>
                  <div className="flex p-0.5 bg-surface rounded-lg border border-outline-variant">
                    <button
                      type="button"
                      onClick={() => setTarget('kelime')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        target === 'kelime' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                      }`}
                    >
                      📖 Kelimelerim
                    </button>
                    <button
                      type="button"
                      onClick={() => setTarget('cumle')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        target === 'cumle' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                      }`}
                    >
                      💬 Cümlelerim
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    {selectedCount === items.length ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    Tümünü Seç ({selectedCount}/{items.length})
                  </button>

                  <button
                    type="button"
                    onClick={reset}
                    className="text-xs text-red-500 hover:underline cursor-pointer"
                  >
                    Farklı Dosya Seç
                  </button>
                </div>
              </div>

              {/* Translate Bilgisi ve Butonu */}
              {translating ? (
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Translate ile eksik çeviriler tamamlanıyor ({translateProgress.done}/{translateProgress.total})…</span>
                </div>
              ) : items.some((i) => !i.translation.trim()) ? (
                <button
                  type="button"
                  onClick={() => autoTranslate()}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/25 text-primary text-xs font-bold transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Eksik Çevirileri Translate ile Doldur</span>
                </button>
              ) : null}

              {/* Items List */}
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                      item.selected
                        ? 'bg-surface border-primary/40'
                        : 'bg-surface/40 border-outline-variant opacity-60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelectItem(item.id)}
                      className="cursor-pointer"
                    >
                      {item.selected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-outline" />
                      )}
                    </button>

                    <input
                      type="text"
                      value={item.original}
                      onChange={(e) => updateItem(item.id, 'original', e.target.value)}
                      placeholder="İngilizce"
                      className="flex-1 p-1.5 bg-surface-container border border-outline-variant rounded-lg text-xs text-on-surface font-semibold focus:outline-none focus:border-primary"
                    />

                    <input
                      type="text"
                      value={item.translation}
                      onChange={(e) => updateItem(item.id, 'translation', e.target.value)}
                      placeholder="Türkçe anlamı"
                      className="flex-1 p-1.5 bg-surface-container border border-outline-variant rounded-lg text-xs text-primary font-semibold focus:outline-none focus:border-primary"
                    />

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1 text-red-500 hover:text-red-600 rounded cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Action Button */}
              {importing ? (
                <div className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-xl text-primary text-xs font-bold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  İçe aktarılıyor: {importedCount} / {selectedCount}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleBulkImport}
                  disabled={selectedCount === 0}
                  className="w-full py-3 bg-primary text-on-primary font-bold text-xs rounded-xl hover:bg-primary-container transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-primary/20"
                >
                  {selectedCount} Öğeyi {target === 'kelime' ? 'Kelimelerime' : 'Cümlelerime'} Aktar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
