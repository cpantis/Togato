import type { Metadata } from "next";
import "./globals.css";
import { connection } from "next/server";
import { AuthProvider } from "@/hooks/useAuth";

export const metadata: Metadata = {
  title: "Togato",
  description: "Conformitate AI Act pentru cabinetele de avocatură și consultanță",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // randare per cerere: nonce-ul CSP se aplică scripturilor doar în paginile dinamice
  await connection();
  return (
    <html lang="ro">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
