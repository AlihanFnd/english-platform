'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, User } from '../api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // 1. Initial auth bootstrap on component mount
  useEffect(() => {
    let isMounted = true;

    async function bootstrapAuth() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const data = await api.me();
        if (isMounted) {
          setUser(data.user);
        }
      } catch (err: any) {
        // Only invalidate token if backend explicitly responded with 401 Unauthorized
        if (err?.status === 401 || err?.message?.includes('401')) {
          localStorage.removeItem('token');
          if (isMounted) setUser(null);
        } else {
          console.warn('Could not verify session with server', err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Client-side route protection
  useEffect(() => {
    if (loading) return;

    const isAuthPage = pathname === '/login' || pathname === '/register';

    if (!user && !isAuthPage) {
      router.push('/login');
    } else if (user && isAuthPage) {
      router.push('/');
    }
  }, [user, loading, pathname, router]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await api.login(email, password);
      localStorage.setItem('token', data.token);
      setUser(data.user);
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  };

  // KURAL-17: rol artık gönderilmiyor — her kayıt "student" üretir.
  const register = async (username: string, email: string, password: string) => {
    setLoading(true);
    try {
      const data = await api.register(username, email, password);
      localStorage.setItem('token', data.token);
      setUser(data.user);
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // Ignore API failure on logout
    }
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
