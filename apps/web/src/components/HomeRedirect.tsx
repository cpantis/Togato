"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

/** utilizatorii autentificați merg direct în aplicație; ceilalți văd pagina de prezentare */
export function HomeRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && user) router.replace("/dashboard"); }, [loading, user, router]);
  return null;
}
