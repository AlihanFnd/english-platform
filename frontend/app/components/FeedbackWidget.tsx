'use client';

import React, { useState } from 'react';
import { MessageSquare, Send, CheckCircle2, Loader2, X } from 'lucide-react';
import { api } from '../api';

interface FeedbackWidgetProps {
  showWelcomeTooltip?: boolean;
  onCloseTooltip?: () => void;
}

export default function FeedbackWidget({ showWelcomeTooltip, onCloseTooltip }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleOpen = () => {
    if (onCloseTooltip) onCloseTooltip();
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setError('');

    try {
      await api.submitFeedback(message.trim());
      setSubmitted(true);
      setMessage('');
      setTimeout(() => {
        setSubmitted(false);
        setIsOpen(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Geri bildirim gönderilemedi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Tooltip speech bubble pointing to the feedback icon */}
      {showWelcomeTooltip && (
        <div className="fixed bottom-24 right-6 z-40 bg-surface border border-primary/30 p-4 rounded-2xl shadow-2xl w-72 animate-in slide-in-from-bottom duration-300 flex flex-col gap-3">
          <button 
            onClick={onCloseTooltip}
            className="absolute top-2 right-2 text-on-surface-variant hover:text-on-surface text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            ✕
          </button>
          
          <div className="text-xs text-on-surface-variant leading-relaxed font-semibold">
            📢 <span className="text-primary font-bold">Deneme Sürümü:</span> Lütfen buradan yorumlarınızı yazın, dönütlerinizi bekliyorum. Bu bir test sürümüdür.
          </div>
          
          <button 
            onClick={onCloseTooltip}
            className="self-end bg-primary hover:bg-primary/95 text-on-primary px-3 py-1 rounded-lg text-[10px] font-bold transition-all bouncy-btn cursor-pointer"
          >
            Anladım
          </button>
          
          {/* Arrow pointing down */}
          <div className="absolute bottom-[-6px] right-6 w-3 h-3 bg-surface border-r border-b border-primary/30 transform rotate-45"></div>
        </div>
      )}

      {/* Floating Bubble Button */}
      <div className="fixed bottom-6 right-6 z-40">
        {/* Pulsing highlight effect */}
        {showWelcomeTooltip && (
          <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping pointer-events-none scale-120"></span>
        )}
        <button
          onClick={handleOpen}
          className="relative bg-primary text-on-primary p-4 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 bouncy-btn border border-primary-container/20 group cursor-pointer flex items-center justify-center"
          title="Geri Bildirim Gönder"
        >
          <MessageSquare className="h-6 w-6 group-hover:rotate-12 transition-transform duration-300" />
        </button>
      </div>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md bg-surface border border-outline-variant rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high h-8 w-8 rounded-full flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {submitted ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3 text-center">
                <CheckCircle2 className="h-16 w-16 text-emerald-500 animate-bounce" />
                <h4 className="text-xl font-bold text-on-surface">Teşekkür Ederiz!</h4>
                <p className="text-sm text-on-surface-variant">Geri bildiriminiz başarıyla iletildi.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h3 className="text-lg font-black text-primary flex items-center gap-2">
                    💬 Yorumlarınızı Belirtin
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Platform hakkındaki görüşlerinizi, isteklerinizi veya karşılaştığınız sorunları yazın.
                  </p>
                </div>

                {error && (
                  <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">
                    {error}
                  </div>
                )}

                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Yorumunuzu buraya yazın..."
                  className="w-full bg-surface-container border border-outline-variant hover:border-primary/50 focus:border-primary focus:outline-none rounded-2xl p-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 transition-colors resize-none"
                />

                <button
                  type="submit"
                  disabled={loading || !message.trim()}
                  className="w-full bg-primary hover:bg-primary/90 disabled:bg-surface-container-highest disabled:text-on-surface-variant/40 text-on-primary py-3 rounded-2xl font-bold text-sm transition-all shadow-md shadow-primary/20 hover:shadow-primary/30 flex items-center justify-center gap-2 bouncy-btn cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Geri Bildirim Gönder
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
