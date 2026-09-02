#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[04] Token yaşam döngüsü"

# 1. Eski, hatalı API kalıntısı var mı?
cikti="$(kodda_ara 'RevokeToken\(|IsTokenRevoked\(|RevokeAllUserTokens\(' 'EnglishReadingPlatform/*.cs' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "eski iptal API'si kullanımda" "$n" "$cikti"

# 2. Ham token / SecurityToken.ToString() anahtar olarak kullanılıyor mu?
cikti="$(kodda_ara 'SecurityToken\?\.ToString\(\)|JtiIptalEt\(token' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "ham token anahtar olarak kullanılıyor" "$n" "$cikti"

# 3. Cookie başlıktan önce mi okunuyor? (OnMessageReceived sırası)
n=0
awk '/OnMessageReceived/,/OnTokenValidated/' EnglishReadingPlatform/Program.cs \
  | grep -q 'Headers.Authorization' || n=1
ihlal_bildir "Authorization başlığı önce kontrol ediliyor" "$n" \
  "OnMessageReceived içinde başlık kontrolü yok — cookie ezer"

# 4. Rol değişimi ve silme token iptal ediyor mu?
# Sabit satır penceresi (-A20/-A25) KIRILGANDIR: uca meşru bir kontrol
# eklendiğinde koruma pencerenin dışına taşar ve kapı, koruma YERİNDE olduğu
# hâlde kırmızı verir (KURAL-12'de tam olarak bu oldu). Onun yerine ucun
# GÖVDESİ kesilir: attribute satırından bir SONRAKİ [Http... attribute'una kadar.
uc_govdesi() {
  awk -v desen="$1" '
    index($0, desen) { icinde=1 }
    icinde && /^[[:space:]]*\[Http/ && !index($0, desen) { exit }
    icinde { print }
  ' EnglishReadingPlatform/Controllers/AdminController.cs
}

n=0
uc_govdesi 'HttpPut("users/{id}/role")' | grep -q 'KullaniciTumTokenlariniIptalEt' || n=1
ihlal_bildir "UpdateRole token iptal ediyor" "$n" "rol düşürülen kullanıcı admin kalıyor"

n=0
uc_govdesi 'HttpDelete("users/{id}")' | grep -q 'KullaniciTumTokenlariniIptalEt' || n=1
ihlal_bildir "DeleteUser token iptal ediyor" "$n" "silinen kullanıcının tokenı geçerli kalıyor"

# 5. Task.Run(while(true)) deseni kaldı mı?
cikti="$(kodda_ara 'Task\.Run\(async \(\) =>' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "Task.Run sonsuz döngü deseni" "$n" "$cikti"

# 6. Sözleşme testi duruyor mu?
n=0; [ -f "EnglishReadingPlatform.Tests/TokenIptalSozlesmesiTests.cs" ] || n=1
ihlal_bildir "sözleşme testi mevcut" "$n" "TokenIptalSozlesmesiTests.cs silinmiş"

guard_bitir
