"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

function useAdminAuth() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (!t) {
      router.replace("/");
    } else {
      setToken(t);
    }
  }, [router]);

  return token;
}

interface FeedbackItem {
  id: number;
  message: string;
  createdAt: string;
  username: string;
  email: string;
}

export default function FeedbacksPage() {
  const router = useRouter();
  const token = useAdminAuth();
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    async function loadFeedbacks() {
      try {
        const res = await fetch(`${API}/api/feedback/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setFeedbacks(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadFeedbacks();
  }, [token]);

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-sm text-gray-500">Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">🛡️</div>
            <div>
              <p className="font-bold text-white text-sm">Admin Panel</p>
              <p className="text-xs text-gray-500">Yönetici Arayüzü</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {[
            { href: "/dashboard", label: "Dashboard", icon: "📊" },
            { href: "/books", label: "Kitap Yönetimi", icon: "📚" },
            { href: "/users", label: "Kullanıcı Yönetimi", icon: "👥" },
            { href: "/feedbacks", label: "Geri Bildirimler", icon: "💬" },
          ].map((item) => (
            <a key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
              <span>{item.icon}</span><span className="text-sm font-medium">{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button onClick={() => { localStorage.clear(); router.replace("/"); }} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-red-400 hover:bg-red-900/20 transition-colors text-sm">
            <span>🚪</span><span>Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">💬 Kullanıcı Geri Bildirimleri & Yorumları</h1>
          <p className="text-gray-400 text-sm mt-1">Öğrencilerin platform üzerinden gönderdiği tüm yorumlar</p>
        </div>

        {/* Feedback List */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="pb-3 font-medium w-1/4">Kullanıcı</th>
                  <th className="pb-3 font-medium w-2/4">Mesaj / Yorum</th>
                  <th className="pb-3 font-medium w-1/4">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {feedbacks.map((f) => (
                  <tr key={f.id} className="text-gray-300 hover:bg-gray-800/20 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-white">{f.username}</div>
                      <div className="text-xs text-gray-500">{f.email}</div>
                    </td>
                    <td className="py-4 pr-4 text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {f.message}
                    </td>
                    <td className="py-4 text-gray-500 text-xs">
                      {new Date(f.createdAt).toLocaleString("tr-TR")}
                    </td>
                  </tr>
                ))}
                {feedbacks.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-gray-600 italic">Henüz bir yorum veya geri bildirim gönderilmemiş.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
