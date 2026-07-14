#!/bin/bash
# ─── Geliştirme Ortamı Başlatıcı (Hot-Reload) ───────────────────

echo "⚡ Mevcut konteynerler durduruluyor..."
docker compose down

echo "⚡ Veritabanı başlatılıyor..."
docker compose up -d postgres

# Proje dizinini al
PROJECT_DIR="$(pwd)"

echo "⚡ Servisler yeni terminal pencerelerinde başlatılıyor..."

# Backend (ASP.NET Core - dotnet watch)
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_DIR/EnglishReadingPlatform' && ../dotnet_sdk/dotnet watch run\""

# Admin Panel (Next.js - dev mode)
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_DIR/admin-panel' && npm run dev\""

# Frontend (Next.js - dev mode)
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_DIR/frontend' && npm run dev\""

echo "✅ Tüm servisler başlatıldı! Açılan terminal pencerelerinden logları izleyebilirsiniz."
echo "   - Backend: http://localhost:5001"
echo "   - Admin Panel: http://localhost:3001"
echo "   - Frontend: http://localhost:3000"
