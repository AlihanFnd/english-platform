#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[01] Kanıt altyapısı"

TEST_CSPROJ="EnglishReadingPlatform.Tests/EnglishReadingPlatform.Tests.csproj"

# 1. Test projesi var mı?
n=0; [ -f "$TEST_CSPROJ" ] || n=1
ihlal_bildir "test projesi mevcut" "$n" "EnglishReadingPlatform.Tests bulunamadı"

# 2. RollForward satırı duruyor mu? (silinirse net8.0 runtime'ı olmayan makinede testler koşmaz)
n=0
grep -q "<RollForward>" "$TEST_CSPROJ" 2>/dev/null || n=1
ihlal_bildir "RollForward satırı mevcut" "$n" "net8.0 runtime yoksa bu satır zorunlu"

# 3. RollForward LatestMajor DEĞİL mi?
#    LatestMajor, net8.0 runtime kurulu olsa bile her zaman en yüksek majoru seçer.
#    O durumda TestHost 8.x ile ASP.NET Core 10 JSON biçimlendiricisi çakışır ve
#    gövde döndüren her uç 500 verir (PipeWriter.UnflushedBytes). Bkz. KURAL-01 raporu.
n=0
grep -q "<RollForward>LatestMajor</RollForward>" "$TEST_CSPROJ" 2>/dev/null && n=1
ihlal_bildir "RollForward LatestMajor DEĞİL" "$n" "LatestMajor testleri net10'a zorlar; 'Major' kullan"

# 4. net8.0 runtime gerçekten çözümlenebiliyor mu? (testlerin hedef çatıda koşmasının ön koşulu)
n=0
dotnet --list-runtimes 2>/dev/null | grep -q "^Microsoft.AspNetCore.App 8\." || n=1
ihlal_bildir "net8.0 ASP.NET Core runtime mevcut" "$n" "ÇÖZÜM: bash scripts/dev/net8-runtime-kur.sh"

# 4b. Runtime geri yükleme scripti duruyor mu?
#     brew upgrade dotnet net8.0'ı siler; kurtarma yolu repoda kalmalı.
n=0; [ -x "scripts/dev/net8-runtime-kur.sh" ] || n=1
ihlal_bildir "net8 runtime kurulum scripti mevcut" "$n" "scripts/dev/net8-runtime-kur.sh eksik/çalıştırılamaz"

# 5. Çözüm dosyası klasik .sln biçiminde mi?
#    CI .NET 8 SDK kullanıyor; .NET 8 SDK .slnx biçimini okuyamaz.
n=0; [ -f "Linguza.sln" ] || n=1
ihlal_bildir "Linguza.sln (klasik biçim) mevcut" "$n" ".slnx biçimi .NET 8 SDK ile okunamaz"

# 6. CI iş akışı var mı?
n=0; [ -f ".github/workflows/guvenlik.yml" ] || n=1
ihlal_bildir "CI iş akışı mevcut" "$n" ".github/workflows/guvenlik.yml bulunamadı"

# 7. run-all.sh çalıştırılabilir mi?
n=0; [ -x "scripts/guard/run-all.sh" ] || n=1
ihlal_bildir "run-all.sh çalıştırılabilir" "$n" "chmod +x scripts/guard/run-all.sh"

guard_bitir
