function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl.replace(/\/+$/, '') + '/api';
    }
    return `http://${host}:5001/api`;
  }
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/+$/, '') + '/api';
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface ReadingProgress {
  bookId: number;
  bookTitle: string;
  coverColor?: string;
  level?: string;
  category?: string;
  progressPercent: number;
  currentChapter: number;
  lastRead: string;
  hasPages?: boolean;
  totalChapters?: number;
  totalPages?: number;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  coverColor: string;
  description: string;
  level?: string;
  category?: string;
  chaptersCount?: number;
  // KURAL-08: sayfa modundaki kitapların chaptersCount'u 0'dır. Bu alan olmadan
  // arayüz onları "1 Bölüm" diye gösteriyordu.
  pagesCount?: number;
  progress?: number;
  currentChapter?: number;
}

export interface Chapter {
  id: number;
  chapterNumber: number;
  title: string;
  content: string;
}

export interface Group {
  id: number;
  name: string;
  description: string;
  // KURAL-08: davet kodunu yalnızca grubun sahibi görür. Sahibi olmayan
  // kullanıcı için sunucu null döner — tip bunu yansıtmak zorunda.
  inviteCode: string | null;
  sahipMiyim: boolean;
  membersCount: number;
  assignments: Array<{ bookId: number; title: string }>;
}

export interface GroupMember {
  userId: number;
  username: string;
  role: string;
}

export interface GroupDetails {
  // KURAL-08: yanıt biçimi GrupDetayYaniti'dır.
  //  - adminUserId KALDIRILDI: başka bir kullanıcının kimliği yerine türetilmiş
  //    sahipMiyim bayrağı gelir.
  //  - members üst seviyeye taşındı.
  //  - allBooks yalnızca grup sahibine dolu gelir (atama formu için).
  group: Group;
  members: GroupMember[];
  allBooks: Array<{ bookId: number; title: string }>;
  progresses: Array<{
    userId: number;
    username: string;
    bookTitle: string;
    progressPercent: number;
    currentChapter: number;
    lastRead: string;
  }>;
  quizResults: Array<{
    username: string;
    bookTitle: string;
    quizTitle: string;
    score: number;
    totalQuestions: number;
    takenAt: string;
  }>;
}

export interface WordItem {
  id: number;
  word: string;
  translation: string;
  context: string;
  addedAt: string;
  /** Leitner kutusu (0–7). */
  kutu: number;
  /** Sunucu hesaplar — eşik özetteki ogrenildiEsigi ile aynı. İstemci kendi eşiğini yazmaz. */
  ogrenildi: boolean;
}

/** Çalışma seansındaki tek bir kart. */
export interface CalismaKarti {
  id: number;
  word: string;
  translation: string;
  context: string;
  /** Üst üste kaç kez doğru bilindi. */
  dogruSeri: number;
  kutu: number;
  sonrakiTekrarAt?: string | null;
  ogrenildi: boolean;
}

/** "Kaç kelime biliyorum?" sorusunun cevabı. */
export interface KelimeOzeti {
  toplam: number;
  ogrenildi: number;
  calisiliyor: number;
  hicCalisilmadi: number;
  bugunTekrar: number;
  yarinTekrar: number;
  kutuDagilimi: number[];
  /** Öğrenildi sayılmak için gereken üst üste doğru sayısı — sunucudan gelir. */
  ogrenildiEsigi: number;
}

export interface CumleItem {
  id: number;
  cumle: string;
  ceviri: string;
  baglam: string;
  addedAt: string;
  dogruSayisi: number;
  yanlisSayisi: number;
  dogruSeri: number;
  kutu: number;
  sonrakiTekrarAt?: string | null;
  sonCalismaAt?: string | null;
  ogrenildi: boolean;
}

export interface CumleOzeti {
  toplam: number;
  ogrenildi: number;
  calisiliyor: number;
  hicCalisilmadi: number;
  bugunTekrar: number;
  yarinTekrar: number;
  kutuDagilimi: number[];
  ogrenildiEsigi: number;
}

export interface QuizQuestion {
  id: number;
  questionText: string;
  options: string[];
}

export interface Quiz {
  id: number;
  title: string;
  bookId: number;
  chapterId: number;
  questions: QuizQuestion[];
}

export interface OcrRecord {
  id: number;
  extractedText: string;
  scannedAt: string;
}

/**
 * KURAL-05 — Taksonomi (seviye/kategori/dil) tek kaynaktan gelir.
 * Bu listeler backend'deki IzinliDegerler whitelist'inin ta kendisidir.
 */
export interface EnvanterKalemi {
  tablo: string;
  alan: string;
  sinif: string;
  sebep: string;
  saklama: string;
  disaAktarilir: boolean;
}

export interface KirilimOzeti {
  okuma: number;
  kelime: number;
  calisma: number;
  quiz: number;
  cumle: number;
}

export interface BugunOzeti {
  gun: string;
  xp: number;
  hedefXp: number;
  hedefTamamlandi: boolean;
  kirilim: KirilimOzeti;
}

export interface SonGunOzeti {
  gun: string;
  xp: number;
  hedefTamamlandi: boolean;
}

export interface PuanTablosuKalemi {
  tur: string;
  xp: number;
  gunlukTavan: number;
}

export interface SeriOzeti {
  mevcutSeri: number;
  enUzunSeri: number;
  bugunAktif: boolean;
  seriRiskte: boolean;
  bugun: BugunOzeti;
  sonGunler: SonGunOzeti[];
  gunlukHedefXp: number;
  saatDilimi: string;
  hedefSecenekleri: number[];
  puanTablosu: PuanTablosuKalemi[];
  seviye?: string | null;
  ilkAcilisTamamlandi?: boolean;
}

export interface KelimeCevirisi {
  translation: string;
  type: string;
  generalMeaning?: string;
  contextualMeaning?: string;
  synonyms?: string;
}

export interface AnalizKelimesi {
  word: string;
  translation: string;
  type: string;
}

export interface Taxonomy {
  levels: string[];
  categories: string[];
  languages: string[];
}

// Simple fetch wrapper
async function apiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err: any = new Error(errorData.error || `HTTP error! status: ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) => 
    apiRequest<{ token: string; user: User }>('/auth/login', 'POST', { email, password }),
  
  /**
   * KURAL-17: rol GÖNDERİLMEZ. Kayıt her zaman "student" üretir; öğretmenliği
   * yalnızca bir yönetici verir. Eskiden istemci kendi rolünü seçiyordu ve bu,
   * öğretmen yetkisine bağlı her kontrolü göstermelik yapıyordu.
   */
  register: (username: string, email: string, password: string) =>
    apiRequest<{ token: string; user: User }>('/auth/register', 'POST', { username, email, password }),
  
  me: () => 
    apiRequest<{ user: User }>('/auth/me', 'GET'),

  // ─── KURAL-19: veri sahibi hakları ───────────────────────────────────
  /** Hangi verimin neden ve ne kadar süre tutulduğu — envanterden üretilir. */
  veriEnvanteri: () =>
    apiRequest<{ kalemler: Array<{
      tablo: string; alan: string; sinif: string;
      sebep: string; saklama: string; disaAktarilir: boolean;
    }> }>('/verim/envanter'),

  /** Kullanıcının TÜM verisi. Şifre hash'i ve kurtarma jetonları DÂHİL DEĞİL. */
  verimiDisaAktar: () =>
    apiRequest<Record<string, unknown>>('/verim/disa-aktar'),

  /**
   * 🔴 GERİ ALINAMAZ. Şifre yeniden istenir: çalınmış bir token tek başına
   * hesabı silememeli.
   */
  hesabimiSil: (sifre: string) =>
    apiRequest<{ success: boolean; message: string }>(
      '/verim/hesabimi-sil', 'POST', { sifre }),
  
  logout: () => 
    apiRequest<{ message: string }>('/auth/logout', 'POST'),

  // Books
  getBooks: () => 
    apiRequest<Book[]>('/books'),
  
  getBook: (id: number) => 
    apiRequest<{ book: Book & { chapters: Array<{ id: number; chapterNumber: number; title: string }> } }>(`/books/${id}`),
  
  /**
   * KURAL-17: okuma ucu artık SALT OKUNUR — ilerleme yazmaz, LLM çağırmaz.
   * Sözleşme değişikliği bu katmanda soğurulur: ekran kodu eskisi gibi tek
   * çağrı yapar, ilerleme kaydını sarmalayıcı üstlenir.
   *
   * İlerleme POST'u BEKLENMİYOR (fire-and-forget): sayfanın görünmesi, kaydın
   * yazılmasını beklememeli. Başarısız olursa kullanıcı sayfayı yine de görür;
   * kaybedilen şey yalnızca "kaldığın yer" işaretidir.
   */
  saveProgress: (bookId: number, konum: number) =>
    apiRequest<{ success: boolean }>(`/books/${bookId}/progress`, 'POST', { bookId, konum }),

  /** `chapter` verilmezse sunucu KALDIĞI YERDEN devam ettirir. */
  readChapter: async (id: number, chapter?: number) => {
    const d = await apiRequest<{
      bookId: number;
      bookTitle: string;
      currentChapter: Chapter;
      totalChapters: number;
      chapterNumber: number;
    }>(`/books/${id}/read${chapter ? `?chapter=${chapter}` : ''}`);

    void api.saveProgress(id, d.chapterNumber).catch(() => {});
    return d;
  },

  /** `page` verilmezse sunucu KALDIĞI YERDEN devam ettirir. */
  readPage: async (id: number, page?: number) => {
    const d = await apiRequest<{
      bookId: number;
      bookTitle: string;
      hasPages: boolean;
      currentPage: {
        id: number;
        pageNumber: number;
        content: string;
        sentencesJson: string;
      };
      totalPages: number;
      pageNumber: number;
      analizBekliyor: boolean;
    }>(`/books/${id}/read${page ? `?page=${page}` : ''}`);

    void api.saveProgress(id, d.pageNumber).catch(() => {});

    // KURAL-17: analiz artık okuma ucunda ÜRETİLMİYOR. Sayfa hiç analiz
    // edilmemişse boşluğu dolduran uç çağrılır — bu uç yalnızca BOŞ alanı
    // doldurur, kimsenin gördüğü analizi bozamaz.
    if (d.analizBekliyor) {
      try {
        const a = await apiRequest<{ sentencesJson: string }>(
          `/books/${id}/analyze-page?page=${d.pageNumber}`, 'POST');
        return { ...d, currentPage: { ...d.currentPage, sentencesJson: a.sentencesJson } };
      } catch {
        // Analiz üretilemedi: sayfa metniyle gösterilir, çeviri paneli boş kalır.
        return d;
      }
    }

    return d;
  },

  /**
   * KURAL-17: PAYLAŞILAN analizi yeniden üretir — yalnızca öğretmen/yönetici.
   * BookPage global olduğu için bu çağrı BÜTÜN kullanıcıların gördüğü
   * çeviriyi değiştirir; en dar kotaya (dakikada 20) bağlıdır.
   */
  reanalyzePage: (id: number, page: number) =>
    apiRequest<{ success: boolean; sentencesJson: string }>(
      `/books/${id}/reanalyze?page=${page}`, 'POST'),
  
  addWord: (word: string, translation: string, context: string) =>
    apiRequest<{ success: boolean }>('/books/addword', 'POST', { word, translation, context }),
  
  getWords: () => 
    apiRequest<WordItem[]>('/books/words'),
  
  deleteWord: (id: number) =>
    apiRequest<{ success: boolean }>(`/books/words/${id}`, 'DELETE'),
    
  /**
   * Seanslık bir kart dilimi getirir.
   * Sunucu önce hiç çalışılmamışları verir; aynı bant içinde sıra rastgeledir.
   * Böylece 200 kelimelik listede her seans farklı kartlar gelir ama
   * liste bitmeden hiçbiri iki kez çıkmaz.
   */
  getCalismaSeansi: (adet: number = 10, mod?: 'tekrar' | 'serbest') =>
    apiRequest<CalismaKarti[]>(`/books/words/calisma?adet=${adet}${mod ? `&mod=${mod}` : ''}`),

  getKelimeOzeti: () =>
    apiRequest<KelimeOzeti>('/books/words/ozet'),

  kaydetCalismaSonucu: (kelimeId: number, bildim: boolean) =>
    apiRequest<{ success: boolean }>('/books/words/calisma-sonucu', 'POST', { kelimeId, bildim }),

  updateWord: (id: number, word: string, translation: string, context: string) =>
    apiRequest<{ success: boolean }>(`/books/words/${id}`, 'PUT', { word, translation, context }),
  
  /**
   * KURAL-17: GET artık quiz ÜRETMİYOR (üretmek bir yazma işlemidir ve
   * GET, üst düzey gezinmeyle tetiklenebilir). Yoksa POST ile üretilir —
   * sözleşme değişikliği ekran kodundan gizleniyor.
   */
  getQuiz: async (chapterId: number) => {
    try {
      return await apiRequest<Quiz>(`/books/quiz/${chapterId}`);
    } catch {
      return await apiRequest<Quiz>(`/books/quiz/${chapterId}`, 'POST');
    }
  },
  
  submitQuiz: (quizId: number, answers: Record<number, string>) =>
    apiRequest<{
      score: number;
      total: number;
      evaluation: Array<{
        questionId: number;
        questionText: string;
        userAnswer: string;
        correctAnswer: string;
        isCorrect: boolean;
      }>;
    }>('/books/submitquiz', 'POST', { quizId, answers }),

  // Translate
  translateWord: (text: string, context?: string, useAI?: boolean) =>
    apiRequest<{ 
      translation: string; 
      type: string; 
      generalMeaning?: string; 
      contextualMeaning?: string; 
      synonyms?: string; 
    }>('/translate/word', 'POST', { text, context, useAI }),
  
  // KURAL-06: ceviriBasarili=false ise 'translation' GERÇEK bir çeviri değildir —
  // çeviri servisi patlamış, özgün İngilizce metin geri dönmüştür. Arayüz bunu
  // göstermezse kullanıcı İngilizce cümleyi Türkçe çevirisi sanır.
  translateSentence: (text: string) =>
    apiRequest<{ translation: string; ceviriBasarili: boolean; kaynak: string }>(
      '/translate/sentence', 'POST', { text }),
  
  analyzeText: (text: string) =>
    apiRequest<{
      sentences: Array<{
        original: string;
        translation: string;
        // Eski önbelleklenmiş kayıtlarda bu alan YOKTUR; okuyan taraf
        // eksikse 'true' varsaymalıdır (geçmiş veriyi hatalı işaretleme).
        ceviriBasarili?: boolean;
        words: Array<{
          word: string;
          translation: string;
          type: string;
        }>;
      }>;
    }>('/translate/analyze', 'POST', { text }),

  // Groups
  getGroups: () => 
    apiRequest<{ myGroups: Group[]; adminGroups: Group[] }>('/groups'),
  
  createGroup: (name: string, description: string) =>
    apiRequest<Group>('/groups', 'POST', { name, description }),
  
  joinGroup: (inviteCode: string) =>
    apiRequest<{ success: boolean; groupId: number; groupName: string }>('/groups/join', 'POST', { inviteCode }),
  
  getGroupDetails: (id: number) => 
    apiRequest<GroupDetails>(`/groups/${id}`),
  
  assignBook: (groupId: number, bookId: number) =>
    apiRequest<{ success: boolean }>('/groups/assignbook', 'POST', { groupId, bookId }),

  // Dashboard & OCR
  getDashboardStats: () =>
    apiRequest<{
      user: User;
      recentProgress: ReadingProgress[];
      wordCount: number;
      quizCount: number;
    }>('/dashboard/stats'),
  
  getOcrRecords: () => 
    apiRequest<OcrRecord[]>('/dashboard/ocr'),
  
  saveOcrRecord: (text: string) =>
    apiRequest<OcrRecord>('/dashboard/ocr', 'POST', { text }),

  // KURAL-12: kullanıcı kendi taradığı metni silebilmeli. Saklama süresi
  // yalnızca otomatik temizlikle değil, kullanıcının kendi kararıyla da
  // sınırlanır. Uç idempotenttir: olmayan kayıt da 200 döner.
  deleteOcrRecord: (id: number) =>
    apiRequest<{ success: boolean }>(`/dashboard/ocr/${id}`, 'DELETE'),

  logActivity: (activityType: string, details: string, durationSeconds: number) =>
    apiRequest<{ success: boolean }>('/activity/log', 'POST', { activityType, details, durationSeconds }),

  submitFeedback: (message: string) =>
    apiRequest<{ success: boolean }>('/feedback', 'POST', { message }),

  // KURAL-05: seviye/kategori listeleri artık istemcide kopyalanmaz.
  getTaxonomy: () =>
    apiRequest<Taxonomy>('/books/taxonomy'),

  /* Cümlelerim (YH-05) */
  getSentences: () => apiRequest<CumleItem[]>('/cumleler'),

  getCumleOzeti: () => apiRequest<CumleOzeti>('/cumleler/ozet'),

  addSentence: (cumle: string, ceviri?: string, baglam?: string) =>
    apiRequest<CumleItem>('/cumleler', 'POST', { cumle, ceviri, baglam }),

  updateSentence: (id: number, cumle: string, ceviri?: string, baglam?: string) =>
    apiRequest<CumleItem>(`/cumleler/${id}`, 'PUT', { cumle, ceviri, baglam }),

  deleteSentence: (id: number) => apiRequest<{ success: boolean }>(`/cumleler/${id}`, 'DELETE'),

  topluCumleEkle: (cumleler: Array<{ cumle: string; ceviri?: string; baglam?: string }>) =>
    apiRequest<{ eklenen: number; atlanan: number }>('/cumleler/toplu', 'POST', { cumleler }),

  getCalismaCumleleri: (adet: number = 10, mod?: 'tekrar' | 'serbest') =>
    apiRequest<CumleItem[]>(`/cumleler/calisma?adet=${adet}${mod ? `&mod=${mod}` : ''}`),

  kaydetCumleCalismaSonucu: (cumleId: number, bildim: boolean) =>
    apiRequest<{ success: boolean }>('/cumleler/calisma-sonucu', 'POST', { cumleId, bildim }),

  /* Günlük seri ve hedef (YH-04) */
  getSeri: () => apiRequest<SeriOzeti>('/seri'),

  seriAyarlariniGuncelle: (ayarlar: {
    gunlukHedefXp?: number;
    saatDilimi?: string;
    seviye?: string;
    ilkAcilisTamamlandi?: boolean;
  }) => apiRequest<SeriOzeti>('/seri/ayarlar', 'PUT', ayarlar),
};
