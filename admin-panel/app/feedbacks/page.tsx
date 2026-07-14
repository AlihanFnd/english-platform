"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "../components/AdminLayout";

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
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">💬 Kullanıcı Geri Bildirimleri</h1>
        <p className="text-gray-400 text-sm mt-1">Öğrencilerin platform üzerinden gönderdiği tüm yorumlar</p>
      </div>

      {/* Feedback List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="pb-3 font-semibold pr-4">Öğrenci Bilgisi</th>
                <th className="pb-3 font-semibold pr-4">Mesaj / Geri Bildirim</th>
                <th className="pb-3 font-semibold">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {feedbacks.map((f) => (
                <tr key={f.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="py-4 pr-4 align-top">
                    <p className="font-semibold text-gray-200">{f.username}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{f.email}</p>
                  </td>
                  <td className="py-4 pr-4 text-gray-200 whitespace-pre-wrap leading-relaxed">
                    {f.message}
                  </td>
                  <td className="py-4 text-gray-500 text-xs align-top whitespace-nowrap">
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
    </AdminLayout>
  );
}
