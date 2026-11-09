import type { NextConfig } from "next";

const raw = process.env.API_INTERNAL_URL || "http://localhost:8080";
const API_URL = raw.startsWith("http") ? raw : `https://${raw}`;

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@togato/shared"],
  poweredByHeader: false,
  experimental: {
    // cu middleware (CSP cu nonce), Next.js trunchiază corpul cererilor la 10 MB — și pe cele trimise prin
    // proxy către API. Dovezile pot avea 15 MB: lăsăm 20 MB (fișier + formular), iar API-ul răspunde 413 peste limita lui.
    middlewareClientMaxBodySize: "20mb",
  },
  async headers() {
    // Content-Security-Policy (cu nonce per cerere) e setată în src/middleware.ts
    const common = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ];
    return [
      { source: "/:path*", headers: common },
      // linkurile cu token (portal, invitație, resetare) nu se trimit mai departe în Referer
      { source: "/portal/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/invite/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/reset/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/autoevaluare/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/confirmare-email/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
