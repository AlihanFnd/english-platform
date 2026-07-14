"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  readingCount: number;
  wordCount: number;
}

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

export default function UsersPage() {
  const router = useRouter();
  const token = useAdminAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    async function loadUsers() {
      try {
        const res = await fetch(`${API}/api/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        } else {
          setError("Kullanıcı listesi yüklenemedi.");
        }
      } catch {
        setError("Sunucuya bağlanılamadı.");
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, [token]);

  async function toggleRole(id: number, currentRole: string) {
    if (!token) return;
    const newRole = currentRole === "admin" ? "student" : "admin";
    if (!confirm(`Kullanıcı rolünü "${newRole.toUpperCase()}" yapmak istediğinize emin misiniz?`)) return;

    try {
      const res = await fetch(`${API}/api/admin/users/${id}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        setUsers(users.map(u => u.id === id ? { ...u, role: newRole } : u));
      } else {
        alert("Rol güncellenirken hata oluştu.");
      }
    } catch {
      alert("Sunucu hatası.");
    }
  }

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
          <h1 className="text-2xl font-bold">Kullanıcı Yönetimi</h1>
          <p className="text-gray-400 text-sm mt-1">Öğrenci hesaplarını ve yetkilerini yönetin</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm font-semibold">
            {error}
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">👥 Kayıtlı Öğrenci Listesi ({users.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 font-medium">Kullanıcı Adı</th>
                  <th className="pb-3 font-medium">E-Posta</th>
                  <th className="pb-3 font-medium">Rol</th>
                  <th className="pb-3 font-medium">Kayıt Tarihi</th>
                  <th className="pb-3 font-medium">Kitap Okuma</th>
                  <th className="pb-3 font-medium">Kelime Havuzu</th>
                  <th className="pb-3 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map((u) => (
                  <tr key={u.id} className="text-gray-300">
                    <td className="py-3 font-medium">{u.username}</td>
                    <td className="py-3 text-gray-400">{u.email}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${u.role === "admin" ? "bg-red-900/30 text-red-400 border border-red-800" : "bg-gray-800 text-gray-400"}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-gray-400">{new Date(u.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="py-3">{u.readingCount} kitap</td>
                    <td className="py-3">{u.wordCount} kelime</td>
                    <td className="py-3">
                      <button onClick={() => toggleRole(u.id, u.role)} className="text-blue-400 hover:text-blue-300 text-xs px-2.5 py-1 rounded bg-blue-900/20 border border-blue-900/30 transition">
                        Rol Değiştir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
