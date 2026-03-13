/**
 * Es un hook reutilizable que todos los componentes del dashboard usan para hacer llamadas a la API
 */
"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

export function useApi() {
  const router = useRouter();

  const apiFetch = useCallback(async (url) => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return null;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      localStorage.removeItem("token");
      router.push("/login");
      return null;
    }

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Error del servidor");
    }

    return res.json();
  }, [router]);

  return { apiFetch };
}