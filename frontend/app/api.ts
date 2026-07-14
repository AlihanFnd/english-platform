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
  chaptersCount?: number;
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
  inviteCode: string;
  membersCount: number;
  assignments: Array<{ bookId: number; title: string }>;
}

export interface GroupMember {
  userId: number;
  username: string;
  role: string;
}

export interface GroupDetails {
  group: {
    id: number;
    name: string;
    description: string;
    inviteCode: string;
    adminUserId: number;
    members: GroupMember[];
  };
  allBooks: Array<{ id: number; title: string }>;
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
  
  readChapter: (id: number, chapter: number = 1) =>
    apiRequest<{
      bookId: number;
      bookTitle: string;
      currentChapter: Chapter;
      totalChapters: number;
      chapterNumber: number;
    }>(`/books/${id}/read?chapter=${chapter}`),
  
  readPage: (id: number, page: number = 1) =>
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
    }>(`/books/${id}/read?page=${page}`),
  
  addWord: (word: string, translation: string, context: string) =>
    apiRequest<{ success: boolean }>('/books/addword', 'POST', { word, translation, context }),
  
  getWords: () => 
    apiRequest<WordItem[]>('/books/words'),
  
  deleteWord: (id: number) =>
    apiRequest<{ success: boolean }>(`/books/words/${id}`, 'DELETE'),
    
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
  translateWord: (text: string) =>
    apiRequest<{ translation: string; type: string }>('/translate/word', 'POST', { text }),
  
  translateSentence: (text: string) =>
    apiRequest<{ translation: string }>('/translate/sentence', 'POST', { text }),
  
  analyzeText: (text: string) =>
    apiRequest<{
      sentences: Array<{
        original: string;
        translation: string;
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

  logActivity: (activityType: string, details: string, durationSeconds: number) =>
    apiRequest<{ success: boolean }>('/activity/log', 'POST', { activityType, details, durationSeconds }),
};
