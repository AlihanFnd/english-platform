"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/books", label: "Kitap Yönetimi", icon: "📚" },
    { href: "/users", label: "Kullanıcı Yönetimi", icon: "👥" },
    { href: "/feedbacks", label: "Geri Bildirimler", icon: "💬" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-indigo-500/30">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-gray-900/80 backdrop-blur-md border-b border-gray-800 fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-lg flex items-center justify-center text-sm shadow-md">🛡️</div>
          <span className="font-bold text-white text-sm tracking-wide">ADMIN PORTAL</span>
        </div>
        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 text-gray-400 hover:text-white focus:outline-none"
        >
          {menuOpen ? (
            <span className="text-xl">✕</span>
          ) : (
            <span className="text-xl">☰</span>
          )}
        </button>
      </header>

      {/* Mobile Overlay */}
      {menuOpen && (
        <div 
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black/70 z-30 md:hidden backdrop-blur-sm transition-opacity duration-300"
        />
      )}

      {/* Sidebar with Premium Design (Restored PC Style) */}
      <aside className={`fixed left-0 top-0 h-full w-64 bg-gray-900/60 backdrop-blur-md border-r border-gray-800 flex flex-col z-40 transition-transform duration-300 md:translate-x-0 ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="p-6 border-b border-gray-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-lg">🛡️</div>
            <div>
              <p className="font-bold text-white text-sm tracking-wide">ADMIN PORTAL</p>
              <p className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase mt-0.5">Control Center</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <a 
                key={item.href} 
                href={item.href} 
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-semibold tracking-wide ${
                  isActive 
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20" 
                    : "text-gray-400 hover:bg-gray-800/40 hover:text-white"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-800/80">
          <button 
            onClick={() => { localStorage.clear(); router.replace("/"); }} 
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-red-950/20 text-red-400 hover:bg-red-900/25 border border-red-900/30 transition-all duration-200 text-sm font-bold"
          >
            <span>🚪</span><span>Oturumu Kapat</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area (Restored PC Padding) */}
      <div className="ml-0 md:ml-64 pt-16 md:pt-0">
        <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
          {children}
        </main>
      </div>
    </div>
  );
}
