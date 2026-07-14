'use client';

import React, { useEffect, useState } from 'react';
import { api, Group, GroupDetails } from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  GraduationCap, 
  Plus, 
  UserPlus, 
  Users, 
  ArrowLeft, 
  BookOpen, 
  Clipboard, 
  Check, 
  Calendar,
  Award
} from 'lucide-react';

export default function GroupsPage() {
  const { user } = useAuth();
  
  // Lists
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [adminGroups, setAdminGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected Group Details
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Forms
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [assignBookId, setAssignBookId] = useState<number>(0);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  
  // UI states
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);

  const loadGroupsList = async () => {
    setLoading(true);
    try {
      const data = await api.getGroups();
      setMyGroups(data.myGroups);
      setAdminGroups(data.adminGroups);
    } catch (err: any) {
      setError(err.message || 'Gruplar yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroupsList();
  }, []);

  const loadGroupDetail = async (id: number) => {
    setLoadingDetails(true);
    try {
      const data = await api.getGroupDetails(id);
      setGroupDetails(data);
      setSelectedGroupId(id);
      if (data.allBooks.length > 0) {
        setAssignBookId(data.allBooks[0].id);
      }
    } catch (err: any) {
      alert(err.message || 'Grup detayları yüklenemedi.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (!createName.trim()) return;

    try {
      await api.createGroup(createName, createDesc);
      setCreateName('');
      setCreateDesc('');
      setShowCreateForm(false);
      setFormSuccess('Grup başarıyla oluşturuldu.');
      loadGroupsList();
    } catch (err: any) {
      setFormError(err.message || 'Grup oluşturulamadı.');
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (!joinCode.trim()) return;

    try {
      const result = await api.joinGroup(joinCode);
      setJoinCode('');
      setShowJoinForm(false);
      setFormSuccess(`"${result.groupName}" grubuna başarıyla katıldınız.`);
      loadGroupsList();
    } catch (err: any) {
      setFormError(err.message || 'Gruba katılım başarısız oldu.');
    }
  };

  const handleAssignBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !assignBookId) return;

    try {
      await api.assignBook(selectedGroupId, assignBookId);
      alert('Kitap gruba başarıyla atandı!');
      loadGroupDetail(selectedGroupId);
    } catch (err: any) {
      alert(err.message || 'Kitap atanamadı.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  // DETAILED VIEW FOR GROUP
  if (selectedGroupId && groupDetails) {
    const isTeacher = user?.role === 'teacher' || groupDetails.group.adminUserId === user?.id;
    return (
      <div className="space-y-8">
        {/* Detail Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button
            onClick={() => {
              setSelectedGroupId(null);
              setGroupDetails(null);
            }}
            className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-all font-semibold text-sm self-start bouncy-btn"
          >
            <ArrowLeft className="h-4 w-4" /> Gruplara Geri Dön
          </button>
          
          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider">Davet Kodu:</span>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container border border-outline-variant text-primary font-mono font-bold text-sm">
              <span>{groupDetails.group.inviteCode}</span>
              <button
                onClick={() => copyToClipboard(groupDetails.group.inviteCode)}
                className="hover:text-primary transition-all ml-1"
                title="Kodu Kopyala"
              >
                {copiedCode ? <Check className="h-4 w-4 text-primary" /> : <Clipboard className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-extrabold text-on-surface">{groupDetails.group.name}</h1>
          <p className="text-on-surface-variant mt-2 text-sm md:text-base">{groupDetails.group.description || 'Açıklama belirtilmemiş.'}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Members / Assign Book Sidebar */}
          <div className="space-y-6 lg:col-span-1">
            {/* Assign Book Form for Teacher */}
            {isTeacher && (
              <div className="glass-card rounded-2xl p-6 space-y-4">
                <h3 className="text-md font-bold text-on-surface flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" /> Kitap Ata
                </h3>
                <form onSubmit={handleAssignBook} className="space-y-4">
                  <select
                    value={assignBookId}
                    onChange={(e) => setAssignBookId(parseInt(e.target.value))}
                    className="glass-input block w-full px-4 py-3 rounded-xl text-sm"
                  >
                    {groupDetails.allBooks.map((b) => (
                      <option key={b.id} value={b.id} className="bg-background text-on-surface">
                        {b.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-sm transition-all shadow-md shadow-primary/20 bouncy-btn"
                  >
                    Gruba Ata
                  </button>
                </form>
              </div>
            )}

            {/* Members List */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <h3 className="text-md font-bold text-on-surface flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Üyeler ({groupDetails.group.members.length})
              </h3>
              <div className="space-y-3 divide-y divide-outline-variant/30 max-h-[300px] overflow-y-auto pr-1">
                {groupDetails.group.members.map((member) => (
                  <div key={member.userId} className="flex items-center justify-between pt-3 first:pt-0">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-xs font-bold text-primary">
                        {member.username[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-on-surface">{member.username}</span>
                    </div>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                      member.role === 'admin' ? 'bg-primary/20 text-primary font-extrabold' : 'bg-surface-container text-on-surface-variant'
                    }`}>
                      {member.role === 'admin' ? 'Öğretmen' : 'Öğrenci'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Progress Tracker Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Student Progress */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" /> Öğrenci İlerleme Durumları
              </h3>

              {groupDetails.progresses.length > 0 ? (
                <div className="space-y-4 divide-y divide-outline-variant/30 max-h-[400px] overflow-y-auto pr-2">
                  {groupDetails.progresses.map((prog, index) => (
                    <div key={index} className="pt-4 first:pt-0 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-bold text-on-surface">{prog.username}</span>
                          <span className="text-on-surface-variant text-xs mx-2">okuyor:</span>
                          <span className="font-semibold text-primary">{prog.bookTitle}</span>
                        </div>
                        <span className="text-xs text-on-surface-variant font-bold">%{Math.round(prog.progressPercent)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 bg-surface-container rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full"
                            style={{ width: `${prog.progressPercent}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-on-surface-variant flex-shrink-0">
                          Bölüm {prog.currentChapter}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant italic">Henüz okuma ilerlemesi kaydeden öğrenci yok.</p>
              )}
            </div>

            {/* Quiz Results */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" /> Quiz Sonuçları
              </h3>

              {groupDetails.quizResults.length > 0 ? (
                <div className="space-y-3 divide-y divide-outline-variant/30 max-h-[300px] overflow-y-auto pr-2">
                  {groupDetails.quizResults.map((result, index) => (
                    <div key={index} className="pt-3 first:pt-0 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-bold text-on-surface">{result.username}</span>
                        <span className="text-on-surface-variant text-xs mx-2">bitirdi:</span>
                        <span className="font-semibold text-primary truncate max-w-[200px] inline-block align-bottom">
                          {result.quizTitle}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-primary">{result.score} / {result.totalQuestions}</span>
                        <p className="text-[10px] text-on-surface-variant">
                          {new Date(result.takenAt).toLocaleDateString('tr-TR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant italic">Henüz testi tamamlayan öğrenci yok.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // GROUP LISTINGS (DEFAULT VIEW)
  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-on-surface tracking-tight flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-primary" />
            Sınıf / Gruplar
          </h1>
          <p className="text-on-surface-variant mt-1">Öğretmenler grup oluşturup kitap atayabilir, öğrencilerin performansını takip edebilir.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowJoinForm(true);
              setShowCreateForm(false);
            }}
            className="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-variant text-on-surface font-bold text-sm transition-all border border-outline-variant flex items-center gap-2 bouncy-btn"
          >
            <UserPlus className="h-4 w-4" /> Gruba Katıl
          </button>
          
          {user?.role === 'teacher' && (
            <button
              onClick={() => {
                setShowCreateForm(true);
                setShowJoinForm(false);
              }}
              className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-sm transition-all flex items-center gap-2 shadow-md shadow-primary/20 bouncy-btn"
            >
              <Plus className="h-4 w-4" /> Yeni Sınıf/Grup
            </button>
          )}
        </div>
      </div>

      {formSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-medium">
          {formSuccess}
        </div>
      )}

      {formError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-medium">
          {formError}
        </div>
      )}

      {/* Pop up form modal overlay for Create Group */}
      {showCreateForm && (
        <div className="glass-card rounded-2xl p-6 border border-primary/30 max-w-md">
          <h3 className="text-lg font-bold text-on-surface mb-4">Yeni Grup Oluştur</h3>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <input
              type="text"
              required
              placeholder="Grup / Sınıf Adı"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="glass-input block w-full px-4 py-3 rounded-xl text-sm"
            />
            <textarea
              placeholder="Grup Açıklaması (Opsiyonel)"
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              className="glass-input block w-full px-4 py-3 rounded-xl text-sm h-24"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container text-sm font-semibold"
              >
                İptal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-sm shadow-md shadow-primary/20 bouncy-btn"
              >
                Oluştur
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pop up form modal overlay for Join Group */}
      {showJoinForm && (
        <div className="glass-card rounded-2xl p-6 border border-primary/30 max-w-md">
          <h3 className="text-lg font-bold text-on-surface mb-4">Gruba Davet Kodu ile Katıl</h3>
          <form onSubmit={handleJoinGroup} className="space-y-4">
            <input
              type="text"
              required
              placeholder="Örn: 8BA3D2"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="glass-input block w-full px-4 py-3 rounded-xl text-sm text-center font-mono font-bold tracking-widest"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowJoinForm(false)}
                className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container text-sm font-semibold"
              >
                İptal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-sm shadow-md shadow-primary/20 bouncy-btn"
              >
                Katıl
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Groups (Only for Teachers) */}
      {user?.role === 'teacher' && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Yöneticisi Olduğum Gruplar/Sınıflar
          </h2>

          {adminGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {adminGroups.map((g) => (
                <div
                  key={g.id}
                  onClick={() => loadGroupDetail(g.id)}
                  className="glass-card rounded-2xl p-6 flex flex-col justify-between h-48 cursor-pointer border border-outline-variant hover:border-primary transition-all"
                >
                  <div>
                    <h3 className="text-lg font-bold text-on-surface truncate">{g.name}</h3>
                    <p className="text-on-surface-variant text-xs mt-2 line-clamp-2">{g.description || 'Açıklama belirtilmemiş.'}</p>
                  </div>
                  <div className="pt-4 border-t border-outline-variant flex items-center justify-between text-xs text-on-surface-variant">
                    <span>{g.membersCount} Öğrenci</span>
                    <span className="font-semibold text-primary">Detayları Yönet &rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-8 text-center text-on-surface-variant">
              <p>Yöneticisi olduğunuz bir grup bulunmamaktadır.</p>
            </div>
          )}
        </div>
      )}

      {/* Member Groups */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Katıldığım Sınıflar/Gruplar
        </h2>

        {myGroups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myGroups.map((g) => (
              <div
                key={g.id}
                onClick={() => loadGroupDetail(g.id)}
                className="glass-card rounded-2xl p-6 flex flex-col justify-between h-48 cursor-pointer border border-outline-variant hover:border-primary transition-all"
              >
                <div>
                  <h3 className="text-lg font-bold text-on-surface truncate">{g.name}</h3>
                  <p className="text-on-surface-variant text-xs mt-2 line-clamp-2">{g.description || 'Açıklama belirtilmemiş.'}</p>
                </div>
                <div className="pt-4 border-t border-outline-variant flex items-center justify-between text-xs text-on-surface-variant">
                  <span>{g.membersCount} Üye</span>
                  <span className="font-semibold text-primary">Sınıf Paneli &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-8 text-center text-on-surface-variant">
            <p>Henüz katıldığınız bir grup bulunmamaktadır.</p>
          </div>
        )}
      </div>
    </div>
  );
}
