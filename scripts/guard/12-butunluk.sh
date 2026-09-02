#!/usr/bin/env bash
# KURAL-12 — veri bütünlüğü ve kalıntı kapısı.
#
# TASARIM NOTU (KURAL-10 mutasyonundan öğrenildi): kapı, kaynak dosyada desen
# aramakla YETİNMEZ. Bir yorum satırına ".IsUnique()" yazmak, kaynak dosyayı
# grepleyen bir kapıyı kandırır. Bu yüzden tekillik ve silme davranışı
# ÜRETİLMİŞ model anlık görüntüsünden (AppDbContextModelSnapshot.cs) okunur:
# orası elle yazılmaz, 'dotnet ef migrations add' üretir. Yani kısıt gerçekten
# EF modeline girmişse oradadır — yorumla taklit edilemez.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[12] Veri bütünlüğü ve kalıntı"

BAGLAM="EnglishReadingPlatform/Data/AppDbContext.cs"
ANLIK="EnglishReadingPlatform/Migrations/AppDbContextModelSnapshot.cs"

# ── 1. Veritabanı dosyası sürüm kontrolünde mi? ─────────────────────────
cikti="$(git ls-files | grep -E '\.(db|sqlite|sqlite3)$' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "veritabanı dosyası repoda" "$n" "$cikti"

# ── 2. Veritabanı DÖKÜMÜ sürüm kontrolünde mi? ──────────────────────────
# .db dosyası kapatıldı diye kalıntı bitmez: bir pg_dump çıktısı ('.sql'/'.dump')
# aynı PII'yi taşır ve aynı yoldan repoya girer. Kardeş yol.
cikti="$(git ls-files | grep -E '\.(dump|bak)$|(^|/)(yedek|backup)[^/]*\.sql$' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "veritabanı dökümü repoda" "$n" "$cikti"

# ── 3. Ölü MVC katmanı takipte mi? ──────────────────────────────────────
cikti="$(git ls-files | grep -E 'EnglishReadingPlatform/(Views/|wwwroot/)' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "ölü MVC dosyası repoda" "$n" "$(printf '%s' "$cikti" | head -5)"

# ── 4. Derlenmiş araç ikilisi takipte mi? ───────────────────────────────
# 'dotnet tool install --tool-path .' çıktısı (dotnet-ef + .store/**) 2,6 MB'lık
# gözden geçirilmemiş ikili demektir; Windows .exe'leri de dahil. Doğru yol
# sürüm-sabitli metin bir manifesttir (.config/dotnet-tools.json).
cikti="$(git ls-files | grep -E '(^|/)\.store/|(^|/)dotnet-ef$|\.(exe|dll|nupkg)$' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "derlenmiş araç ikilisi repoda" "$n" "$(printf '%s' "$cikti" | head -5)"

# ── 5. Beklenen unique index'ler ÜRETİLMİŞ MODELDE var mı? ──────────────
# Anlık görüntüde biçim:  b.HasIndex("UserId", "BookId")\n    .IsUnique();
eksik=""
kontrol_tekillik() {
  local etiket="$1" desen="$2"
  grep -A2 -F "$desen" "$ANLIK" 2>/dev/null | grep -q '\.IsUnique()' \
    || eksik="${eksik}${etiket}"$'\n'
}
kontrol_tekillik "ReadingProgress (UserId, BookId)"     'b.HasIndex("UserId", "BookId")'
kontrol_tekillik "TranslationCache (QueryText, ContextText)" 'b.HasIndex("QueryText", "ContextText")'
kontrol_tekillik "GroupMember (GroupId, UserId)"        'b.HasIndex("GroupId", "UserId")'
kontrol_tekillik "GroupBookAssignment (GroupId, BookId)" 'b.HasIndex("GroupId", "BookId")'
kontrol_tekillik "WordListItem (UserId, Word)"          'b.HasIndex("UserId", "Word")'
kontrol_tekillik "BookPage (BookId, PageNumber)"        'b.HasIndex("BookId", "PageNumber")'
kontrol_tekillik "Quiz (ChapterId)"                     'b.HasIndex("ChapterId")'
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "eksik unique index (üretilmiş model)" "$n" "$eksik"

# ── 6. Grup sahibi silme davranışı bilinçli mi? ─────────────────────────
# Hem kaynakta hem üretilmiş modelde aranır: kaynakta yoksa niyet yok,
# modelde yoksa niyet veritabanına ULAŞMAMIŞ demektir (migration üretilmemiş).
n=0
grep -q "OnDelete(DeleteBehavior.Restrict)" "$BAGLAM" || n=$((n+1))
grep -A4 'b.HasOne("EnglishReadingPlatform.Models.User", "Admin")' "$ANLIK" 2>/dev/null \
  | grep -q "OnDelete(DeleteBehavior.Restrict)" || n=$((n+1))
ihlal_bildir "grup sahibi silme davranışı Restrict" "$n" \
  "kaynakta ve/veya üretilmiş modelde Restrict yok — EF cascade varsayılanı geçerli"

# ── 7. Silme reddi GERÇEKTEN çalışıyor mu? ──────────────────────────────
# Yalnızca Restrict koymak, yöneticiye anlaşılmaz bir 500 gösterir; mesajın
# metnini aramak ise yetmez.
#
# MUTASYON B'NİN ORTAYA ÇIKARDIĞI: bu kapı önce sadece "devredin" kelimesini
# arıyordu. Koşul 'if (false)' yapılınca dal ölüyor ama METİN yerinde kalıyordu
# — kapı yeşil, davranış bozuk. Yani kapı iddia ettiği şeyi ÖLÇMÜYORDU.
# Şimdi üç parça da aranıyor: sahiplik SORGUSU, sonucuna bakan KOŞUL ve
# yol gösteren MESAJ. Yorum satırları ayıklanır ki yorumla taklit edilemesin.
kod="$(grep -v '^[[:space:]]*//' EnglishReadingPlatform/Controllers/AdminController.cs)"
eksik=""
printf '%s' "$kod" | grep -q 'AdminUserId == id'                  || eksik="${eksik}sahiplik sorgusu yok"$'\n'
printf '%s' "$kod" | grep -qE 'if \(sahipOldugu\.Count[[:space:]]*>' || eksik="${eksik}sorgunun sonucuna bakan koşul yok (dal ölü olabilir)"$'\n'
printf '%s' "$kod" | grep -q 'devredin'                           || eksik="${eksik}yol gösteren mesaj yok"$'\n'
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "silme reddi yol gösteriyor" "$n" "$eksik"

# ── 8. Saklama temizliği servisi KAYITLI mı? ────────────────────────────
# Sınıfın var olması yetmez; AddHostedService ile kaydedilmemişse hiç çalışmaz
# (sessiz başarısızlık). Yorum satırları ayıklanarak aranır.
n=0
grep -v '^\s*//' EnglishReadingPlatform/Program.cs \
  | grep -q "AddHostedService<SaklamaTemizligiServisi>" || n=1
ihlal_bildir "saklama temizliği kayıtlı" "$n" "Program.cs'te AddHostedService yok"

# ── 9. Saklama süresi kota sayacını bozacak kadar kısa mı? ──────────────
# 'ai_word_translation' satırları Groq GÜNLÜK KOTA SAYACIDIR. Aktivite logu
# saklama süresi bir günün altına çekilirse kota her gece sıfırlanır ve
# maliyet koruması sessizce çöker.
gun="$(grep -oE 'AktiviteLogu[[:space:]]*=[[:space:]]*TimeSpan\.FromDays\([0-9]+\)' \
        EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs 2>/dev/null \
        | grep -oE '[0-9]+' | tail -1)"
gun="${gun:-0}"
n=0; [ "$gun" -ge 2 ] 2>/dev/null || n=1
ihlal_bildir "aktivite logu saklama süresi güvenli" "$n" \
  "AktiviteLogu FromDays(N) bulunamadı ya da N < 2 — Groq kota sayacı sıfırlanır"

# ── 10. Kullanılmayan NuGet paketi ──────────────────────────────────────
cikti="$(grep -n 'PdfSharpCore' EnglishReadingPlatform/EnglishReadingPlatform.csproj 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "kullanılmayan NuGet paketi" "$n" "$cikti"

# ── 11. .gitignore veritabanı dosyalarını dışlıyor mu? ──────────────────
eksik=""
for desen in '\*\.db' '\*\.sqlite' '\*\.dump'; do
  grep -qE "^${desen}$" .gitignore || eksik="${eksik}${desen}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir ".gitignore veri dosyalarını dışlıyor" "$n" "$eksik"

guard_bitir
