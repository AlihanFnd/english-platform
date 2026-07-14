'use client';

import React from 'react';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useActivityTracker } from './hooks/useActivityTracker';
import FeedbackWidget from './components/FeedbackWidget';
import { 
  BookOpen, 
  GraduationCap, 
  BookMarked, 
  FileSearch, 
  LayoutDashboard, 
  LogOut,
  User as UserIcon,
  Menu,
  X,
  Sun,
  Moon,
  Flame,
  Trophy,
  Target,
  ArrowLeft,
  Home
} from 'lucide-react';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [showWelcome, setShowWelcome] = React.useState(false);
  const [showFeedbackTooltip, setShowFeedbackTooltip] = React.useState(false);

  // Initialize background activity tracking
  useActivityTracker();

  React.useEffect(() => {
    if (user && !loading) {
      const tourSeen = localStorage.getItem('welcome_tour_seen');
      if (!tourSeen) {
        setShowWelcome(true);
      }
    }
  }, [user, loading]);

  const handleCloseWelcome = () => {
    localStorage.setItem('welcome_tour_seen', 'true');
    setShowWelcome(false);
    setShowFeedbackTooltip(true);
  };

  const isAuthPage = pathname === '/login' || pathname === '/register';

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-on-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-primary font-medium animate-pulse text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // If on login or register, do not render sidebar/navbar
  if (isAuthPage || !user) {
    return <>{children}</>;
  }

  const navItems = [
    { name: 'Panel', href: '/', icon: LayoutDashboard },
    { name: 'Kitaplık', href: '/books', icon: BookOpen },
    { name: 'Kelime Listem', href: '/words', icon: BookMarked },
    { name: 'Metin Tara (OCR)', href: '/ocr', icon: FileSearch },
    { name: 'Sınıf / Gruplar', href: '/groups', icon: GraduationCap },
  ];

  const currentItem = navItems.find(item => pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)));
  const pageTitle = currentItem ? currentItem.name : "Panel";

  return (
    <div className="flex min-h-screen bg-background text-on-background relative overflow-hidden font-body-md transition-colors duration-300">
      {/* Geometrik Arka Plan Deseni ve Bulanık Balonlar */}
      <div className="fixed inset-0 z-[0] overflow-hidden pointer-events-none">
        <div className="geometric-bg absolute inset-0"></div>
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-tertiary/10 blur-[100px] rounded-full"></div>
      </div>

      {/* Sidebar - Desktop (Deep Navy #1E293B) */}
      <aside className="hidden md:flex flex-col w-[280px] bg-[#1E293B] text-white/70 py-6 px-4 z-50 shadow-2xl border-r border-outline-variant relative">
        <div className="px-4 mb-10">
          <h1 className="font-display-lg text-[28px] text-primary tracking-tight leading-tight font-extrabold">Linguza</h1>
          <p className="text-white/60 font-label-sm mt-1">Seçkin Rütbe • Seviye 4</p>
        </div>

        <nav className="flex-grow space-y-1 overflow-y-auto pr-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 bouncy-btn font-label-md text-sm ${
                  isActive
                    ? 'border-l-4 border-primary text-primary bg-white/10 font-bold'
                    : 'hover:bg-white/5 hover:text-primary text-white/70'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-white/50 group-hover:text-primary'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User profile section in sidebar */}
        <div className="mt-auto pt-6 border-t border-white/10 flex flex-col gap-3">
          <div className="flex items-center gap-3 px-2">
            <div className="h-10 w-10 rounded-full bg-primary border border-white/20 flex items-center justify-center text-white font-bold shadow-sm">
              {user.username[0].toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate">{user.username}</p>
              <p className="text-[11px] text-white/55 capitalize">{user.role === 'teacher' ? 'Öğretmen' : 'Öğrenci'}</p>
            </div>
          </div>
          
          {/* Sidebar Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all text-xs font-semibold border border-white/10 w-full cursor-pointer"
            title={theme === 'light' ? 'Koyu Temaya Geç' : 'Açık Temaya Geç'}
          >
            <div className="flex items-center gap-2.5">
              {theme === 'light' ? (
                <Moon className="h-4 w-4 text-primary" />
              ) : (
                <Sun className="h-4 w-4 text-yellow-400" />
              )}
              <span>{theme === 'light' ? 'Karanlık Tema' : 'Aydınlık Tema'}</span>
            </div>
            <div className={`w-8 h-4 rounded-full p-0.5 flex items-center transition-colors ${theme === 'dark' ? 'bg-primary justify-end' : 'bg-white/20 justify-start'}`}>
              <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </div>
          </button>

          <button
            onClick={logout}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all font-semibold text-xs w-full text-left"
          >
            <LogOut className="h-4 w-4" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Top App Bar - Desktop */}
      <header className="hidden md:flex fixed top-0 right-0 w-[calc(100%-280px)] z-40 bg-surface/85 backdrop-blur-md border-b border-outline-variant justify-between items-center h-16 px-10 transition-colors duration-300">
        <div className="flex items-center gap-8">
          <h2 className="font-headline-lg text-xl font-bold text-primary">{pageTitle}</h2>
          <div className="hidden lg:flex items-center gap-6 text-on-surface-variant text-xs font-semibold">
            <span className="text-primary border-b-2 border-primary pb-1 cursor-pointer">Ana Sayfa</span>
            <span className="hover:text-primary transition-colors cursor-pointer">Seriler</span>
            <span className="hover:text-primary transition-colors cursor-pointer">Günlük Hedefler</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-4 text-on-surface-variant">
            <span className="cursor-pointer" title="Seri"><Flame className="h-5 w-5 text-orange-500 fill-orange-500" /></span>
            <span className="cursor-pointer" title="Rütbe"><Trophy className="h-5 w-5 text-yellow-500 fill-yellow-500" /></span>
            <span className="cursor-pointer" title="Hedef"><Target className="h-5 w-5 text-primary" /></span>
          </div>

          {/* Dark / Light Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            className="px-3.5 py-1.5 rounded-full glass-card hover:border-primary text-on-surface-variant hover:text-primary transition-all bouncy-btn flex items-center gap-2 text-xs font-bold shadow-sm"
            title={theme === 'light' ? 'Koyu Temaya Geç' : 'Açık Temaya Geç'}
          >
            {theme === 'light' ? (
              <>
                <Moon className="h-4 w-4 text-primary" />
                <span>Karanlık Mod</span>
              </>
            ) : (
              <>
                <Sun className="h-4 w-4 text-yellow-400" />
                <span>Aydınlık Mod</span>
              </>
            )}
          </button>

          <button className="bg-primary text-on-primary px-6 py-2 rounded-full text-xs font-bold bouncy-btn shadow-md shadow-primary/20">Yükselt</button>
          
          <div className="flex items-center gap-3 border-l border-outline-variant pl-5">
            <div className="h-9 w-9 rounded-full bg-tertiary flex items-center justify-center text-white font-bold text-sm shadow-sm">
              {user.username[0].toUpperCase()}
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-on-surface leading-none">{user.username}</p>
              <p className="text-[10px] text-on-surface-variant capitalize mt-1">{user.role}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Header (Deep Navy) */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#1E293B] border-b border-outline-variant px-4 flex items-center justify-between z-20 shadow-md">
        <div className="flex items-center gap-2">
          {pathname !== '/' ? (
            <button 
              onClick={() => router.back()} 
              className="mr-1 p-1 text-white hover:text-primary transition-colors flex items-center justify-center cursor-pointer bg-transparent border-none"
              title="Geri Git"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="p-1.5 rounded-lg bg-primary/20 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
          )}
          
          <Link href="/" className="flex items-center gap-1.5 text-white hover:text-primary transition-colors">
            {pathname !== '/' && <Home className="h-4 w-4" />}
            <span className="font-bold text-md tracking-tight">Linguza</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white flex items-center gap-1.5 text-xs font-bold transition-colors"
            title={theme === 'light' ? 'Koyu Temaya Geç' : 'Açık Temaya Geç'}
          >
            {theme === 'light' ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-yellow-400" />}
            <span>{theme === 'light' ? 'Gece' : 'Gündüz'}</span>
          </button>
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-white/5 text-white/80"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Backdrop & Panel */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-15 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <aside className="w-[280px] h-full bg-[#1E293B] border-r border-outline-variant p-6 flex flex-col pt-20" onClick={(e) => e.stopPropagation()}>
            <nav className="flex-grow space-y-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium text-sm bouncy-btn ${
                      isActive
                        ? 'border-l-4 border-primary text-primary bg-white/10 font-bold'
                        : 'hover:bg-white/5 text-white/70 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto pt-6 border-t border-white/10 flex flex-col gap-3">
              <div className="flex items-center gap-3 px-2">
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                  {user.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{user.username}</p>
                  <p className="text-xs text-white/55 capitalize">{user.role}</p>
                </div>
              </div>

              {/* Mobile Menu Theme Toggle */}
              <button
                onClick={() => {
                  toggleTheme();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all text-xs font-semibold border border-white/10 w-full cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  {theme === 'light' ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-yellow-400" />}
                  <span>{theme === 'light' ? 'Karanlık Tema' : 'Aydınlık Tema'}</span>
                </div>
                <div className={`w-8 h-4 rounded-full p-0.5 flex items-center transition-colors ${theme === 'dark' ? 'bg-primary justify-end' : 'bg-white/20 justify-start'}`}>
                  <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
                </div>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all font-medium text-xs w-full text-left"
              >
                <LogOut className="h-4 w-4" />
                Çıkış Yap
              </button>
            </div>
          </aside>
        </div>
      )}
      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 pt-24 md:pt-24 overflow-y-auto max-w-[1440px] mx-auto w-full z-10 relative">
        {children}
      </main>

      {/* Floating Feedback Bubble */}
      <FeedbackWidget 
        showWelcomeTooltip={showFeedbackTooltip} 
        onCloseTooltip={() => setShowFeedbackTooltip(false)} 
      />

      {/* Welcome Tour Modal */}
      {showWelcome && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-surface border border-outline-variant rounded-3xl p-6 md:p-8 shadow-2xl relative flex flex-col space-y-5 animate-in zoom-in-95 duration-300">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center text-2xl mx-auto animate-bounce shrink-0">
              🚀
            </div>

            <div className="space-y-1 text-center">
              <h2 className="text-xl font-black text-primary tracking-tight">
                Linguza'ya Hoş Geldiniz!
              </h2>
              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">
                İlk Adım Kılavuzu
              </p>
            </div>

            <div className="text-xs text-on-surface-variant leading-relaxed space-y-3.5 text-left bg-surface-container/60 p-4.5 rounded-2xl border border-outline-variant max-h-[300px] overflow-y-auto">
              <div className="flex items-start gap-2.5">
                <span className="text-md shrink-0">📚</span>
                <p>
                  Kitap okumaya başlamak için sol taraftaki menüde yer alan <strong>"Kitaplık"</strong> sekmesini kullanabilirsiniz.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-md shrink-0">🖱️</span>
                <p>
                  Okuma yaparken bilmediğiniz herhangi bir kelimeye tıklayarak <strong>anında Türkçe çevirisini</strong> ve dil bilgisini görebilirsiniz.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-md shrink-0">🔊</span>
                <p>
                  Cümlelerin veya kelimelerin yanındaki <strong>ses butonlarına</strong> basarak doğru İngilizce telaffuzlarını dinleyebilirsiniz.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-md shrink-0">⭐</span>
                <p>
                  Kelimeleri <strong>"Bilinmeyen Kelimelerime Ekle"</strong> butonuyla kendi kelime listenize kaydederek daha sonra çalışabilirsiniz.
                </p>
              </div>
            </div>

            <button
              onClick={handleCloseWelcome}
              className="w-full bg-primary hover:bg-primary/90 text-on-primary py-3 rounded-2xl font-bold text-sm shadow-md shadow-primary/25 transition-all bouncy-btn cursor-pointer shrink-0"
            >
              Harika, Başlayalım!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
