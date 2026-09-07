import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Linguza API istemcisi — web'deki `frontend/app/api.ts` dosyasının mobil eşi.
 *
 * ÜÇ FARK, üçü de bilinçli:
 *
 *  1. JETON NEREDE DURUYOR: web'de `localStorage`, burada `expo-secure-store`
 *     (iOS Keychain / Android Keystore). Telefonda uygulama verisi yedeklere ve
 *     köklenmiş cihazlarda başka uygulamalara açık olabilir; oturum jetonu
 *     düz dosyada tutulmaz.
 *
 *  2. SUNUCU ADRESİ: telefon "localhost" derse KENDİNİ kasteder. Bu yüzden
 *     adres, Expo geliştirme sunucusunun IP'sinden türetilir (aşağıya bakın).
 *
 *  3. ZAMAN AŞIMI: mobil ağ kopabilir. Zaman aşımı olmayan bir `fetch` sonsuza
 *     kadar bekler ve ekran "yükleniyor"da donar.
 */

/** Tek bir istek en fazla bu kadar bekler. */
const ZAMAN_ASIMI_MS = 20000;

/**
 * API taban adresi.
 *
 * Öncelik sırası:
 *   1. `EXPO_PUBLIC_API_URL` — üretim/dağıtım için açık ayar (.env dosyası).
 *   2. Expo geliştirme sunucusunun ana bilgisayarı — telefon aynı ağdaysa
 *      bilgisayarın LAN IP'sini buradan öğreniriz, elle IP yazmak gerekmez.
 *   3. `http://localhost:5001` — yalnızca öykünücü/simülatör için son çare.
 */
function tabanAdres(): string {
  const acikAdres = process.env.EXPO_PUBLIC_API_URL;
  if (acikAdres && acikAdres.trim()) return acikAdres.trim().replace(/\/+$/, '');

  const gelistirmeSunucusu =
    Constants.expoConfig?.hostUri ??
    // Eski Expo Go sürümlerinde alan adı farklı; ikisine de bakıyoruz.
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;

  if (gelistirmeSunucusu) {
    const anaBilgisayar = gelistirmeSunucusu.split(':')[0];
    if (anaBilgisayar) return `http://${anaBilgisayar}:5001`;
  }

  return 'http://localhost:5001';
}

export const API_TABANI = tabanAdres();
const API_KOK = `${API_TABANI}/api`;

/* ─── Oturum jetonu ─────────────────────────────────────────── */

const JETON_ANAHTARI = 'linguza_token';

/**
 * Bellek içi kopya. SecureStore her okumada Keychain'e gidiyor; her istekte
 * bunu yapmak listeleri gözle görülür biçimde yavaşlatıyordu.
 */
let bellektekiJeton: string | null = null;
let jetonOkundu = false;

export async function jetonOku(): Promise<string | null> {
  if (jetonOkundu) return bellektekiJeton;
  try {
    bellektekiJeton = await SecureStore.getItemAsync(JETON_ANAHTARI);
  } catch {
    bellektekiJeton = null;
  }
  jetonOkundu = true;
  return bellektekiJeton;
}

export async function jetonYaz(jeton: string): Promise<void> {
  bellektekiJeton = jeton;
  jetonOkundu = true;
  await SecureStore.setItemAsync(JETON_ANAHTARI, jeton);
}

export async function jetonSil(): Promise<void> {
  bellektekiJeton = null;
  jetonOkundu = true;
  try {
    await SecureStore.deleteItemAsync(JETON_ANAHTARI);
  } catch {
    /* Zaten yoksa sorun değil. */
  }
}

/**
 * Oturum düştüğünde (401) haberdar olmak isteyenler.
 * AuthContext buraya abone olup kullanıcıyı giriş ekranına gönderir.
 */
type OturumDinleyici = () => void;
const oturumDinleyicileri = new Set<OturumDinleyici>();

export function oturumDustugundeDinle(dinleyici: OturumDinleyici): () => void {
  oturumDinleyicileri.add(dinleyici);
  return () => oturumDinleyicileri.delete(dinleyici);
}

/* ─── İstek sarmalayıcı ─────────────────────────────────────── */

export class ApiHatasi extends Error {
  readonly durum: number;
  constructor(mesaj: string, durum: number) {
    super(mesaj);
    this.name = 'ApiHatasi';
    this.durum = durum;
  }
}

async function istek<T>(
  uc: string,
  yontem: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  govde?: unknown,
): Promise<T> {
  const jeton = await jetonOku();

  const basliklar: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jeton) basliklar.Authorization = `Bearer ${jeton}`;

  const iptal = new AbortController();
  const sayac = setTimeout(() => iptal.abort(), ZAMAN_ASIMI_MS);

  let yanit: Response;
  try {
    yanit = await fetch(`${API_KOK}${uc}`, {
      method: yontem,
      headers: basliklar,
      body: govde === undefined ? undefined : JSON.stringify(govde),
      signal: iptal.signal,
    });
  } catch (hata) {
    clearTimeout(sayac);
    if ((hata as Error)?.name === 'AbortError') {
      throw new ApiHatasi('Sunucu yanıt vermedi. Bağlantını kontrol edip tekrar dene.', 0);
    }
    // NOT: alttaki hata metni cihaza/ağa özgü ayrıntı taşıyabilir; kullanıcıya
    // sade bir mesaj gösteriyoruz.
    throw new ApiHatasi('Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.', 0);
  } finally {
    clearTimeout(sayac);
  }

  if (yanit.status === 401) {
    if (uc !== '/auth/login') {
      await jetonSil();
      oturumDinleyicileri.forEach((d) => d());
      throw new ApiHatasi('Oturumun sona erdi. Lütfen tekrar giriş yap.', 401);
    }
  }

  if (!yanit.ok) {
    // Sunucu tüm hatalarını { error: "..." } biçiminde döndürüyor
    // (Program.cs → InvalidModelStateResponseFactory). Web istemcisi de
    // bu alanı okuyor; biçim ikisinde de aynı kalmalı.
    let mesaj = `İstek başarısız oldu (${yanit.status}).`;
    try {
      const hataGovdesi = await yanit.json();
      if (hataGovdesi?.error) mesaj = String(hataGovdesi.error);
    } catch {
      /* Gövde JSON değilse genel mesajda kalınır. */
    }
    throw new ApiHatasi(mesaj, yanit.status);
  }

  if (yanit.status === 204) return undefined as T;
  return (await yanit.json()) as T;
}

/* ─── Sunucu sözleşmesi (web'deki api.ts ile birebir) ────────── */

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
  /** KURAL-08: sayfa modundaki kitapların chaptersCount'u 0'dır. */
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
  /** KURAL-08: davet kodunu yalnızca grubun sahibi görür. */
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

/** KURAL-05 — seviye/kategori/dil listeleri tek kaynaktan (sunucudan) gelir. */
export interface Taxonomy {
  levels: string[];
  categories: string[];
  languages: string[];
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

export interface AnalizCumlesi {
  original: string;
  translation: string;
  /**
   * KURAL-06: `false` ise `translation` GERÇEK bir çeviri değildir — çeviri
   * servisi patlamış, özgün İngilizce metin geri dönmüştür. Eski önbellek
   * kayıtlarında alan hiç yoktur; okuyan taraf eksikse `true` varsaymalıdır.
   */
  ceviriBasarili?: boolean;
  words: AnalizKelimesi[];
}

export const api = {
  /* Kimlik */
  login: (email: string, password: string) =>
    istek<{ token: string; user: User }>('/auth/login', 'POST', { email, password }),

  /**
   * KURAL-17: rol GÖNDERİLMEZ. Kayıt her zaman "student" üretir; öğretmenliği
   * yalnızca bir yönetici verir (PUT /api/admin/users/{id}/role).
   */
  register: (username: string, email: string, password: string) =>
    istek<{ token: string; user: User }>('/auth/register', 'POST', {
      username,
      email,
      password,
    }),

  me: () => istek<{ user: User }>('/auth/me'),

  logout: () => istek<{ message: string }>('/auth/logout', 'POST'),

  /* Kitaplar */
  getBooks: () => istek<Book[]>('/books'),

  getBook: (id: number) =>
    istek<{
      book: Book & { chapters: Array<{ id: number; chapterNumber: number; title: string }> };
    }>(`/books/${id}`),

  /**
   * KURAL-17: okuma ucu artık SALT OKUNUR — ilerleme yazmaz, LLM çağırmaz.
   * Sözleşme değişikliği bu katmanda soğurulur; ekran kodu aynı kalır.
   */
  saveProgress: (bookId: number, konum: number) =>
    istek<{ success: boolean }>(`/books/${bookId}/progress`, 'POST', { bookId, konum }),

  /** `chapter` verilmezse sunucu KALDIĞI YERDEN devam ettirir. */
  readChapter: async (id: number, chapter?: number) => {
    const d = await istek<{
      bookId: number;
      bookTitle: string;
      currentChapter: Chapter;
      totalChapters: number;
      chapterNumber: number;
    }>(`/books/${id}/read${chapter ? `?chapter=${chapter}` : ''}`);

    // Beklenmiyor: sayfanın görünmesi ilerleme kaydına takılmamalı.
    void api.saveProgress(id, d.chapterNumber).catch(() => {});
    return d;
  },

  /** `page` verilmezse sunucu KALDIĞI YERDEN devam ettirir. */
  readPage: async (id: number, page?: number) => {
    const d = await istek<{
      bookId: number;
      bookTitle: string;
      hasPages: boolean;
      currentPage: { id: number; pageNumber: number; content: string; sentencesJson: string };
      totalPages: number;
      pageNumber: number;
      analizBekliyor: boolean;
    }>(`/books/${id}/read${page ? `?page=${page}` : ''}`);

    void api.saveProgress(id, d.pageNumber).catch(() => {});

    // KURAL-17: analiz okuma ucunda ÜRETİLMİYOR. Boşsa, yalnızca BOŞ alanı
    // dolduran uç çağrılır — kimsenin gördüğü analizi bozamaz.
    if (d.analizBekliyor) {
      try {
        const a = await istek<{ sentencesJson: string }>(
          `/books/${id}/analyze-page?page=${d.pageNumber}`, 'POST');
        return { ...d, currentPage: { ...d.currentPage, sentencesJson: a.sentencesJson } };
      } catch {
        return d;
      }
    }

    return d;
  },

  /**
   * KURAL-17: PAYLAŞILAN analizi yeniden üretir — yalnızca öğretmen/yönetici.
   * BookPage global; bu çağrı BÜTÜN kullanıcıların gördüğü çeviriyi değiştirir.
   */
  reanalyzePage: (id: number, page: number) =>
    istek<{ success: boolean; sentencesJson: string }>(
      `/books/${id}/reanalyze?page=${page}`, 'POST'),

  addWord: (word: string, translation: string, context: string) =>
    istek<{ success: boolean }>('/books/addword', 'POST', { word, translation, context }),

  getWords: () => istek<WordItem[]>('/books/words'),

  deleteWord: (id: number) => istek<{ success: boolean }>(`/books/words/${id}`, 'DELETE'),

  getCalismaSeansi: (adet: number) => istek<CalismaKarti[]>(`/books/words/calisma?adet=${adet}`),

  getKelimeOzeti: () => istek<KelimeOzeti>('/books/words/ozet'),

  kaydetCalismaSonucu: (kelimeId: number, bildim: boolean) =>
    istek<{ success: boolean }>('/books/words/calisma-sonucu', 'POST', { kelimeId, bildim }),

  updateWord: (id: number, word: string, translation: string, context: string) =>
    istek<{ success: boolean }>(`/books/words/${id}`, 'PUT', { word, translation, context }),

  /**
   * KURAL-17: GET artık quiz ÜRETMİYOR; yoksa POST ile üretilir.
   * Sözleşme değişikliği ekran kodundan gizleniyor.
   */
  getQuiz: async (chapterId: number) => {
    try {
      return await istek<Quiz>(`/books/quiz/${chapterId}`);
    } catch {
      return await istek<Quiz>(`/books/quiz/${chapterId}`, 'POST');
    }
  },

  submitQuiz: (quizId: number, answers: Record<number, string>) =>
    istek<{
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

  /* Çeviri */
  translateWord: (text: string, context?: string, useAI?: boolean) =>
    istek<KelimeCevirisi>('/translate/word', 'POST', { text, context, useAI }),

  translateSentence: (text: string) =>
    istek<{ translation: string; ceviriBasarili: boolean; kaynak: string }>(
      '/translate/sentence',
      'POST',
      { text },
    ),

  analyzeText: (text: string) =>
    istek<{ sentences: AnalizCumlesi[] }>('/translate/analyze', 'POST', { text }),

  /* Gruplar */
  getGroups: () => istek<{ myGroups: Group[]; adminGroups: Group[] }>('/groups'),

  createGroup: (name: string, description: string) =>
    istek<Group>('/groups', 'POST', { name, description }),

  joinGroup: (inviteCode: string) =>
    istek<{ success: boolean; groupId: number; groupName: string }>('/groups/join', 'POST', {
      inviteCode,
    }),

  getGroupDetails: (id: number) => istek<GroupDetails>(`/groups/${id}`),

  assignBook: (groupId: number, bookId: number) =>
    istek<{ success: boolean }>('/groups/assignbook', 'POST', { groupId, bookId }),

  /* Panel ve OCR */
  getDashboardStats: () =>
    istek<{
      user: User;
      recentProgress: ReadingProgress[];
      wordCount: number;
      quizCount: number;
    }>('/dashboard/stats'),

  getOcrRecords: () => istek<OcrRecord[]>('/dashboard/ocr'),

  saveOcrRecord: (text: string) => istek<OcrRecord>('/dashboard/ocr', 'POST', { text }),

  /** KURAL-12: kullanıcı kendi taradığı metni silebilir. Uç idempotenttir. */
  deleteOcrRecord: (id: number) => istek<{ success: boolean }>(`/dashboard/ocr/${id}`, 'DELETE'),

  logActivity: (activityType: string, details: string, durationSeconds: number) =>
    istek<{ success: boolean }>('/activity/log', 'POST', {
      activityType,
      details,
      durationSeconds,
    }),

  submitFeedback: (message: string) =>
    istek<{ success: boolean }>('/feedback', 'POST', { message }),

  /** KURAL-05: seviye/kategori listeleri istemcide kopyalanmaz. */
  getTaxonomy: () => istek<Taxonomy>('/books/taxonomy'),
};
