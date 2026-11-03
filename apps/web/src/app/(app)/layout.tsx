"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Button, LoadingBlock, Logo, cn } from "@/components/ui";
import { daysUntil, initials } from "@/lib/format";
import { TwoFactorCard } from "@/components/TwoFactorCard";

const NAV_SECTIONS = [
  {
    title: "Conformitate",
    items: [
      { href: "/dashboard", label: "Panou", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
      { href: "/clients", label: "Clienți", icon: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01" },
      { href: "/legislation", label: "Noutăți legislative", icon: "M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15zM9 7h7M9 11h5" },
    ],
  },
  {
    title: "Cabinet",
    items: [
      { href: "/team", label: "Echipă", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
      { href: "/settings", label: "Setări", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" },
    ],
  },
];

const PLATFORM_SECTION = {
  title: "Togato",
  items: [{ href: "/platform", label: "Platformă", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" }],
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization, loading, error, logout, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user && !error) router.replace("/login");
  }, [loading, user, error, router]);
  useEffect(() => setMenuOpen(false), [pathname]);

  if (loading) return <LoadingBlock />;
  if (!user) {
    if (!error) return null;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-[15px] font-semibold">Serverul nu răspunde</div>
        <div className="text-[13px] text-slate-500">{error}</div>
        <Button onClick={() => refresh()}>Reîncearcă</Button>
      </div>
    );
  }

  // politica cabinetului: fără autentificare în doi pași nu se poate accesa nimic altceva
  if (organization?.require2fa && !user.totpEnabled) {
    return (
      <div className="flex min-h-screen items-start justify-center bg-[#f6f7f9] px-4 py-12">
        <div className="w-full max-w-2xl space-y-4">
          <div className="flex items-center gap-3"><Logo size={32} /><span className="text-lg font-bold tracking-tight">Togato</span></div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Activați autentificarea în doi pași</h1>
          <p className="text-[13px] text-slate-600">{organization.name} cere autentificarea în doi pași pentru toți membrii, pentru protecția datelor clienților. Durează un minut.</p>
          <TwoFactorCard onEnabled={() => refresh()} />
          <button onClick={async () => { await logout(); router.replace("/login"); }} className="text-[13px] font-medium text-slate-500 hover:text-slate-700">Ieșire</button>
        </div>
      </div>
    );
  }

  const billing = organization?.billingState;
  const trialDays = billing === "proba" && organization?.trialEndsAt ? daysUntil(organization.trialEndsAt.slice(0, 10)) : null;
  const banner = billing === "expirat"
    ? { kind: "warning" as const, text: "Perioada de probă sau abonamentul a expirat. Datele rămân disponibile pentru consultare și export; pentru modificări alegeți un abonament." }
    : billing === "restant"
      ? { kind: "warning" as const, text: "Plata abonamentului nu a reușit. Actualizați cardul ca să evitați întreruperea accesului." }
      : null;

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={32} />
        <div className="min-w-0">
          <div className="text-[15px] font-bold tracking-tight text-ink">Togato</div>
          <div className="truncate text-[11px] text-slate-400">{organization?.name}</div>
        </div>
      </div>
      {[...NAV_SECTIONS, ...(user.platformAdmin ? [PLATFORM_SECTION] : [])].map((section) => (
      <div key={section.title} className="mb-4 px-3">
        <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{section.title}</div>
        {section.items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/") || (item.href === "/clients" && pathname.startsWith("/systems"));
          return (
            <Link key={item.href} href={item.href} className={cn("mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition", active ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-ink")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
              {item.label}
            </Link>
          );
        })}
      </div>
      ))}
      <div className="mt-auto border-t border-slate-100 p-3">
        {trialDays !== null && (
          <div className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-[12px] text-brand">
            <Link href="/settings#abonament" className="hover:underline">{trialDays > 0 ? <>Perioadă de probă: <b>{trialDays} zile</b> rămase</> : <>Perioada de probă se încheie azi</>}</Link>
          </div>
        )}
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">{user.name}</div>
            <div className="truncate text-[11px] text-slate-400">{user.role === "admin" ? "Administrator" : "Membru"}</div>
          </div>
          <button onClick={async () => { await logout(); router.replace("/login"); }} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Ieșire" aria-label="Ieșire">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-white md:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/30" />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button onClick={() => setMenuOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Meniu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Logo size={26} />
          <span className="font-bold tracking-tight">Togato</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {banner && (
            <div className="mb-5" role="status">
              <Alert kind={banner.kind}>
                {banner.text}{" "}
                <Link href="/settings#abonament" className="font-semibold underline">{user.role === "admin" ? "Alegeți abonamentul" : "Detalii"}</Link>
              </Alert>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
