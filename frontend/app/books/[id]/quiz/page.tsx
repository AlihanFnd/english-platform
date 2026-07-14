'use client';

import React, { useEffect, useState, use } from 'react';
import { api, Quiz, QuizQuestion } from '../../../api';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, Award, RefreshCw, HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: bookIdStr } = use(params);
  const bookId = parseInt(bookIdStr);
  const router = useRouter();
  const searchParams = useSearchParams();
  const chapterId = parseInt(searchParams.get('chapterId') || '0');

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{
    score: number;
    total: number;
    evaluation: Array<{
      questionId: number;
      questionText: string;
      userAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
    }>;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!chapterId) {
      setError('Geçersiz bölüm parametresi.');
      setLoading(false);
      return;
    }

    async function loadQuiz() {
      try {
        const data = await api.getQuiz(chapterId);
        setQuiz(data);
      } catch (err: any) {
        setError(err.message || 'Quiz yüklenirken veya oluşturulurken hata oluştu.');
      } finally {
        setLoading(false);
      }
    }

    loadQuiz();
  }, [chapterId]);

  const handleSelectOption = (questionId: number, optionLetter: string) => {
    if (result) return; // Prevent selection after submission
    setAnswers(prev => ({ ...prev, [questionId]: optionLetter }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz || result) return;

    // Check if all questions are answered
    if (Object.keys(answers).length < quiz.questions.length) {
      alert('Lütfen tüm soruları cevaplayın.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await api.submitQuiz(quiz.id, answers);
      setResult(data);
    } catch (err: any) {
      alert(err.message || 'Quiz gönderilirken hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const getOptionLetter = (index: number) => {
    return ['A', 'B', 'C', 'D'][index];
  };

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-on-surface-variant text-sm">Yapay zeka soruları üretiyor veya yüklüyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-medium">
          {error}
        </div>
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-primary hover:underline font-bold text-sm">
          <ArrowLeft className="h-4 w-4" /> Geri Dön
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-all font-semibold text-sm bouncy-btn">
          <ArrowLeft className="h-4 w-4" />
          Kitaba Dön
        </button>
        <span className="text-xs font-semibold text-primary uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
          Quiz Odası
        </span>
      </div>

      <div className="text-center md:text-left">
        <h1 className="text-2xl md:text-3xl font-extrabold text-on-surface flex items-center justify-center md:justify-start gap-2">
          <HelpCircle className="h-7 w-7 text-primary" />
          {quiz?.title}
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">Okuduğunuz bölümle ilgili 5 soruluk anlama seviyesi testi.</p>
      </div>

      {result ? (
        /* Quiz Results Show Panel */
        <div className="space-y-8">
          <div className="glass-card rounded-3xl p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-tertiary/5"></div>
            <Award className="h-16 w-16 text-primary mx-auto mb-4 animate-bounce" />
            <h2 className="text-3xl font-extrabold text-on-surface">Quiz Tamamlandı!</h2>
            <p className="text-4xl font-black text-primary mt-4">
              {result.score} / {result.total}
            </p>
            <p className="text-sm text-on-surface-variant mt-2">
              Başarı oranı: %{Math.round((result.score / result.total) * 100)}
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={() => {
                  setResult(null);
                  setAnswers({});
                  router.refresh();
                }}
                className="px-6 py-3 rounded-xl bg-surface-container hover:bg-surface-variant text-on-surface border border-outline-variant font-bold text-sm transition-all flex items-center gap-2 bouncy-btn"
              >
                <RefreshCw className="h-4 w-4" />
                Yeniden Çöz
              </button>
              <button
                onClick={() => router.back()}
                className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-sm transition-all shadow-md shadow-primary/20 bouncy-btn"
              >
                Kitaba Geri Dön
              </button>
            </div>
          </div>

          {/* Detailed Question Review */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-on-surface">Cevap Anahtarı</h3>
            {result.evaluation.map((evalItem, index) => {
              const question = quiz?.questions.find(q => q.id === evalItem.questionId);
              return (
                <div key={evalItem.questionId} className={`glass-card rounded-2xl p-6 border ${evalItem.isCorrect ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="font-bold text-on-surface text-base">
                      {index + 1}. {evalItem.questionText}
                    </h4>
                    {evalItem.isCorrect ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    {question?.options.map((opt, oIdx) => {
                      const letter = getOptionLetter(oIdx);
                      const isUserChoice = evalItem.userAnswer === letter;
                      const isCorrectChoice = evalItem.correctAnswer === letter;

                      let btnStyle = 'border-outline-variant text-on-surface-variant bg-surface-container';
                      if (isCorrectChoice) {
                        btnStyle = 'border-emerald-500 bg-emerald-500/15 text-emerald-400 font-bold';
                      } else if (isUserChoice && !evalItem.isCorrect) {
                        btnStyle = 'border-red-500 bg-red-500/15 text-red-400 font-bold';
                      }

                      return (
                        <div key={letter} className={`p-4 rounded-xl border text-sm flex items-center gap-3 ${btnStyle}`}>
                          <span className="font-bold">{letter})</span>
                          <span>{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Quiz Form */
        <form onSubmit={handleSubmit} className="space-y-8">
          {quiz?.questions.map((q, index) => (
            <div key={q.id} className="glass-card rounded-2xl p-6 md:p-8 space-y-6">
              <h3 className="text-lg font-bold text-on-surface leading-relaxed">
                {index + 1}. {q.questionText}
              </h3>

              <div className="grid grid-cols-1 gap-4">
                {q.options.map((option, oIdx) => {
                  const letter = getOptionLetter(oIdx);
                  const isSelected = answers[q.id] === letter;

                  return (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => handleSelectOption(q.id, letter)}
                      className={`w-full p-4 rounded-xl border text-left text-sm transition-all flex items-center gap-4 cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/15 text-on-surface font-bold'
                          : 'border-outline-variant hover:bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      <span className={`h-6 w-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                      }`}>
                        {letter}
                      </span>
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl text-sm font-bold text-on-primary bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer bouncy-btn"
          >
            {submitting ? 'Gönderiliyor...' : 'Cevapları Gönder ve Bitir'}
          </button>
        </form>
      )}
    </div>
  );
}
