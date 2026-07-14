// ─── Global JS for ReadEn Platform ──────────────────────────────────────────

let currentWord = '';
let currentTranslation = '';
let currentContext = '';

// ─── Word Click → Translate ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const words = document.querySelectorAll('.word');
    words.forEach(w => {
        w.addEventListener('click', () => translateWord(w.textContent.trim(), w.dataset.sentence || ''));
    });
});

async function translateWord(word, context) {
    if (!word) return;
    currentWord = word;
    currentContext = context;
    currentTranslation = '';

    const popup = document.getElementById('translatePopup');
    const overlay = document.getElementById('popupOverlay');
    const wordEl = document.getElementById('popupWord');
    const transEl = document.getElementById('popupTranslation');

    wordEl.textContent = word;
    transEl.innerHTML = '<span class="loading-dots">Çevriliyor<span>.</span><span>.</span><span>.</span></span>';
    popup.classList.remove('hidden');
    overlay.classList.remove('hidden');

    try {
        const res = await fetch('/Translate/Word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: word })
        });
        const data = await res.json();
        currentTranslation = data.translation;
        transEl.textContent = data.translation;
    } catch (e) {
        transEl.textContent = '(çeviri alınamadı)';
    }
}

function closePopup() {
    document.getElementById('translatePopup').classList.add('hidden');
    document.getElementById('popupOverlay').classList.add('hidden');
}

async function addCurrentWord() {
    if (!currentWord) return;
    try {
        await fetch('/Books/AddWord', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: currentWord, translation: currentTranslation, context: currentContext })
        });
        const btn = document.getElementById('addWordBtn');
        btn.textContent = '✓ Eklendi!';
        btn.style.background = 'rgba(16,185,129,0.3)';
        btn.style.color = '#6ee7b7';

        // Mark word as saved in reader
        document.querySelectorAll('.word').forEach(w => {
            if (w.textContent.trim() === currentWord) w.classList.add('saved');
        });

        setTimeout(closePopup, 1500);
    } catch (e) {
        console.error('Word save failed:', e);
    }
}

// ─── Flashcard Flip ──────────────────────────────────────────────────────────
function flipCard(el) {
    el.classList.toggle('flipped');
}

// ─── OCR — Tesseract.js Integration ─────────────────────────────────────────
let ocrResult = '';

async function runOCR(file) {
    if (!file) return;
    const status = document.getElementById('ocrStatus');
    const resultBox = document.getElementById('ocrResultBox');
    const textarea = document.getElementById('ocrText');

    if (status) status.textContent = 'Metin tanınıyor...';
    if (resultBox) resultBox.classList.add('hidden');

    // Check if Tesseract is loaded
    if (typeof Tesseract === 'undefined') {
        if (status) status.textContent = 'OCR kütüphanesi yükleniyor...';
        await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }

    try {
        const { data: { text } } = await Tesseract.recognize(file, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text' && status) {
                    status.textContent = `Tanınıyor: ${Math.round(m.progress * 100)}%`;
                }
            }
        });
        ocrResult = text.trim();
        if (textarea) textarea.value = ocrResult;
        if (status) status.textContent = 'Tamamlandı!';
        if (resultBox) resultBox.classList.remove('hidden');
    } catch (err) {
        if (status) status.textContent = 'Hata: ' + err.message;
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

// ─── Copy Invite Code ────────────────────────────────────────────────────────
function copyInviteCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        const el = event.target;
        const orig = el.textContent;
        el.textContent = 'Kopyalandı!';
        setTimeout(() => el.textContent = orig, 2000);
    });
}

// ─── Quiz: Highlight Selected Option ────────────────────────────────────────
document.addEventListener('change', e => {
    if (e.target.type === 'radio') {
        const card = e.target.closest('.question-card');
        if (!card) return;
        card.querySelectorAll('.option-label').forEach(l => l.classList.remove('selected'));
        e.target.closest('.option-label').classList.add('selected');
    }
});

// ─── Keyboard Shortcut: Esc = close popup ────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePopup();
});
