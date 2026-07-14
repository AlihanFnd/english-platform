# ─── Aşama 1: Build ───────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Önce sadece csproj kopyala (layer cache optimizasyonu)
COPY EnglishReadingPlatform.csproj .
RUN dotnet restore

# Tüm kaynak kodları kopyala ve derle
COPY . .
RUN dotnet publish -c Release -o /app/publish

# ─── Aşama 2: Runtime ─────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Güvenlik: root olmayan kullanıcı ile çalıştır
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

COPY --from=build /app/publish .

# wwwroot ve upload dizinleri için izin
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

ENTRYPOINT ["dotnet", "EnglishReadingPlatform.dll"]
