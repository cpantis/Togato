import type { NextConfig } from "next";

const raw = process.env.API_INTERNAL_URL || "http://localhost:8080";
const API_URL = raw.startsWith("http") ? raw : `https://${raw}`;

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@togato/shared"],
  poweredByHeader: false,
  async headers() {
    // 'unsafe-inline' pentru scripturi: Next.js injectează scripturi inline la hidratare (fără nonce în paginile statice)
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // logo-ul cabinetului poate fi un URL extern (https); codul QR pentru 2FA e data:
      "img-src 'self' data: blob: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    const common = [
      { key: "Content-Security-Policy", value: csp },
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
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
