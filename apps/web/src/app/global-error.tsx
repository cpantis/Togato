"use client";

// Ultima plasă de siguranță: înlocuiește tot layout-ul, deci are propriul <html>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ro">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f8fafc", margin: 0 }}>
        <div style={{ maxWidth: 420, textAlign: "center", padding: 16 }} role="alert">
          <h1 style={{ fontSize: 22, color: "#0f172a" }}>Aplicația a întâmpinat o eroare</h1>
          <p style={{ fontSize: 14, color: "#64748b" }}>Reîncărcați pagina. Dacă problema persistă, contactați suportul{error.digest ? ` cu codul ${error.digest}` : ""}.</p>
          <button onClick={reset} style={{ marginTop: 16, height: 40, padding: "0 16px", borderRadius: 8, border: 0, background: "#7a1f3a", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Reîncearcă</button>
        </div>
      </body>
    </html>
  );
}
