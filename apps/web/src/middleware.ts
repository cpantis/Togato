import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

/** nonce nou la fiecare cerere: Next.js îl aplică scripturilor proprii când îl găsește în antetul CSP al cererii */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
