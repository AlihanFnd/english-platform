'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export function useActivityTracker() {
  const pathname = usePathname();
  const { user } = useAuth();
  
  // Track active page to prevent heartbeat overlaps
  const currentPathRef = useRef(pathname);
  currentPathRef.current = pathname;

  useEffect(() => {
    // Only track authenticated users
    if (!user) return;

    // Helper to determine activity type and details based on URL path
    const getActivityDetails = (path: string) => {
      if (path === '/') {
        return { type: 'PageView', details: 'Ana Sayfa' };
      }
      if (path === '/words') {
        return { type: 'PageView', details: 'Kelime Listesi' };
      }
      if (path === '/ocr') {
        return { type: 'PageView', details: 'OCR Metin Okuma' };
      }
      if (path === '/groups') {
        return { type: 'PageView', details: 'Gruplar' };
      }
      if (path === '/login' || path === '/register') {
        return { type: 'AuthView', details: 'Giriş/Kayıt Sayfası' };
      }

      // /books/[id]/quiz
      const quizMatch = path.match(/^\/books\/(\d+)\/quiz$/);
      if (quizMatch) {
        return { type: 'TakeQuiz', details: `Kitap ID: ${quizMatch[1]} - Quiz Çözüyor` };
      }

      // /books/[id]
      const bookMatch = path.match(/^\/books\/(\d+)/);
      if (bookMatch) {
        return { type: 'ReadBook', details: `Kitap ID: ${bookMatch[1]} - Kitap Okuyor` };
      }

      return { type: 'PageView', details: path };
    };

    // Log the initial page view right away
    const initialActivity = getActivityDetails(currentPathRef.current);
    api.logActivity(initialActivity.type, initialActivity.details, 5).catch(() => {});

    // Set up heartbeat timer every 30 seconds
    const intervalSeconds = 30;
    const intervalId = setInterval(() => {
      const activity = getActivityDetails(currentPathRef.current);
      api.logActivity(activity.type, activity.details, intervalSeconds).catch(() => {});
    }, intervalSeconds * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [user, pathname]);
}
