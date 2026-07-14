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

interface Stats {
  totalUsers: number;
  totalBooks: number;
  totalGroups: number;
  totalQuizResults: number;
  recentUsers: Array<{ id: number; username: string; email: string; createdAt: string }>;
}

interface ActivityLog {
  id: number;
  username: string;
  activityType: string;
  details: string;
  durationSeconds: number;
  timestamp: string;
}

export default function DashboardPage() {
  const token = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    async function loadDashboardData() {
      try {
        const statsRes = await fetch(`${API}/api/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data);
        }

        const activitiesRes = await fetch(`${API}/api/activity/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (activitiesRes.ok) {
          const actData = await activitiesRes.json();
          setActivities(actData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
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
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Sistem durumuna genel bakış</p>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { title: "Toplam Öğrenci", value: stats?.totalUsers || 0, icon: "👥", color: "from-blue-600 to-cyan-600" },
          { title: "Toplam Kitap", value: stats?.totalBooks || 0, icon: "📚", color: "from-purple-600 to-indigo-600" },
          { title: "Çalışma Grubu", value: stats?.totalGroups || 0, icon: "🏫", color: "from-emerald-600 to-teal-600" },
          { title: "Çözülen Sınav", value: stats?.totalQuizResults || 0, icon: "📝", color: "from-orange-600 to-red-600" },
        ].map((s, idx) => (
          <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl p-6 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-400 font-medium">{s.title}</p>
                <p className="text-3xl font-bold mt-2">{s.value}</p>
              </div>
              <div className="text-2xl">{s.icon}</div>
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${s.color}`} />
          </div>
        ))}
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Registered Users */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 lg:col-span-1">
          <h2 className="text-lg font-semibold mb-4">🆕 Son Kayıt Olan Öğrenciler</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 font-medium">Kullanıcı Adı</th>
                  <th className="pb-3 font-medium">E-Posta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {stats?.recentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 font-medium text-gray-200">{u.username}</td>
                    <td className="py-3 text-gray-400">{u.email}</td>
                  </tr>
                ))}
                {stats?.recentUsers.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-gray-600">Henüz öğrenci kaydı bulunmuyor.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Student Activities */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">📈 Öğrenci Aktivite Geçmişi (Canlı Log)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 font-medium">Öğrenci</th>
                  <th className="pb-3 font-medium">Aktivite</th>
                  <th className="pb-3 font-medium">Detay</th>
                  <th className="pb-3 font-medium">Süre</th>
                  <th className="pb-3 font-medium">Zaman</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {activities.map((a) => {
                  const durationText = a.durationSeconds > 0 
                    ? (a.durationSeconds < 60 ? `${a.durationSeconds}sn` : `${Math.round(a.durationSeconds / 60)}dk`)
                    : "-";
                  return (
                    <tr key={a.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-3 font-medium text-gray-200">{a.username}</td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {a.activityType}
                        </span>
                      </td>
                      <td className="py-3 text-gray-400 truncate max-w-xs">{a.details}</td>
                      <td className="py-3 font-semibold text-emerald-400">{durationText}</td>
                      <td className="py-3 text-gray-500 text-xs">
                        {new Date(a.timestamp).toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
                {activities.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-600">Henüz bir aktivite kaydı bulunmuyor.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
