"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const ADMIN_TOKEN_ANAHTARI = "admin_token";

/**
 * Tarayıcıda saklanan yönetici token'ını okur.
 * Sunucu tarafında (prerender) localStorage yoktur; orada null döner.
 */
export function adminTokenOku(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_TOKEN_ANAHTARI);
}

/**
 * Token yoksa giriş sayfasına yönlendirir.
 *
 * Token'ı bilerek state'te TUTMAZ. Eski sürüm token'ı state'e yazıyordu ve bu,
 * efekt gövdesinde senkron setState demekti (react-hooks/set-state-in-effect):
 * gereksiz ikinci render tetikliyor, ayrıca aynı mantık dört sayfada
 * kopyalanmıştı. Token'a ihtiyaç duyan yerler `adminTokenOku()` ile
 * kullanım anında okur.
 */
export function useAdminKorumasi(): void {
  const router = useRouter();

  useEffect(() => {
    if (!adminTokenOku()) router.replace("/");
  }, [router]);
}
