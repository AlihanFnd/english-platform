"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "../components/AdminLayout";

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
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Kullanıcı Yönetimi</h1>
        <p className="text-gray-400 text-sm mt-1">Öğrenci hesaplarını ve yetkilerini yönetin</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="pb-3 font-medium">Öğrenci</th>
                <th className="pb-3 font-medium">E-Posta</th>
                <th className="pb-3 font-medium">Rol</th>
                <th className="pb-3 font-medium">İlerleme</th>
                <th className="pb-3 font-medium">Kelime Sayısı</th>
                <th className="pb-3 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="py-4 font-semibold text-white">{u.username}</td>
                  <td className="py-4">{u.email}</td>
                  <td className="py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      u.role === "admin" 
                        ? "bg-red-500/10 text-red-400 border border-red-500/20" 
                        : "bg-gray-800 text-gray-400 border border-gray-700/50"
                    }`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4">{u.readingCount} okuma</td>
                  <td className="py-4">{u.wordCount} kelime</td>
                  <td className="py-4">
                    <button 
                      onClick={() => toggleRole(u.id, u.role)} 
                      className="text-blue-400 hover:text-blue-300 text-xs px-2.5 py-1 rounded bg-blue-900/20 border border-blue-900/30 transition"
                    >
                      Rol Değiştir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
