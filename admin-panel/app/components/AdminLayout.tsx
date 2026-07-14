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
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-gray-900/80 backdrop-blur-md border-b border-gray-800 fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-sm">🛡️</div>
          <span className="font-bold text-white text-sm">Linguza Admin</span>
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

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-40 transition-transform duration-300 md:translate-x-0 ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">🛡️</div>
            <div>
              <p className="font-bold text-white text-sm">Linguza Admin</p>
              <p className="text-xs text-gray-500">Yönetici Arayüzü</p>
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
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  isActive 
                    ? "bg-red-600/10 text-red-500 border border-red-500/20" 
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button 
            onClick={() => { localStorage.clear(); router.replace("/"); }} 
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-red-400 hover:bg-red-900/20 transition-colors text-sm"
          >
            <span>🚪</span><span>Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="ml-0 md:ml-64 pt-16 md:pt-0">
        <main className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
