const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001') + '/api';

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface ReadingProgress {
  bookId: number;
  bookTitle: string;
  progressPercent: number;
  currentChapter: number;
  lastRead: string;
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
}

/** Çalışma seansındaki tek bir kart. */
export interface CalismaKarti {
  id: number;
  word: string;
  translation: string;
  context: string;
  /** Üst üste kaç kez doğru bilindi. */
  dogruSeri: number;
  ogrenildi: boolean;
}

/** "Kaç kelime biliyorum?" sorusunun cevabı. */
export interface KelimeOzeti {
  toplam: number;
  ogrenildi: number;
  calisiliyor: number;
  hicCalisilmadi: number;
  /** Öğrenildi sayılmak için gereken üst üste doğru sayısı — sunucudan gelir. */
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

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) => 
    apiRequest<{ token: string; user: User }>('/auth/login', 'POST', { email, password }),
  
  register: (username: string, email: string, password: string, role: string) =>
    apiRequest<{ token: string; user: User }>('/auth/register', 'POST', { username, email, password, role }),
  
  me: () => 
    apiRequest<{ user: User }>('/auth/me', 'GET'),
  
  logout: () => 
    apiRequest<{ message: string }>('/auth/logout', 'POST'),

  // Books
  getBooks: () => 
    apiRequest<Book[]>('/books'),
  
  getBook: (id: number) => 
    apiRequest<{ book: Book & { chapters: Array<{ id: number; chapterNumber: number; title: string }> } }>(`/books/${id}`),
  
  /** `chapter` verilmezse sunucu KALDIĞI YERDEN devam ettirir. */
  readChapter: (id: number, chapter?: number, reanalyze: boolean = false) =>
    apiRequest<{
      bookId: number;
      bookTitle: string;
      currentChapter: Chapter;
      totalChapters: number;
      chapterNumber: number;
    }>(`/books/${id}/read?${chapter ? `chapter=${chapter}&` : ''}${reanalyze ? 'reanalyze=true' : ''}`),
  
  /** `page` verilmezse sunucu KALDIĞI YERDEN devam ettirir. */
  readPage: (id: number, page?: number, reanalyze: boolean = false) =>
    apiRequest<{
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
    }>(`/books/${id}/read?${page ? `page=${page}&` : ''}${reanalyze ? 'reanalyze=true' : ''}`),
  
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
  getCalismaSeansi: (adet: number) =>
    apiRequest<CalismaKarti[]>(`/books/words/calisma?adet=${adet}`),

  getKelimeOzeti: () =>
    apiRequest<KelimeOzeti>('/books/words/ozet'),

  kaydetCalismaSonucu: (kelimeId: number, bildim: boolean) =>
    apiRequest<{ success: boolean }>('/books/words/calisma-sonucu', 'POST', { kelimeId, bildim }),

  updateWord: (id: number, word: string, translation: string, context: string) =>
    apiRequest<{ success: boolean }>(`/books/words/${id}`, 'PUT', { word, translation, context }),
  
  getQuiz: (chapterId: number) => 
    apiRequest<Quiz>(`/books/quiz/${chapterId}`),
  
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
};
