"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button, LoadingBlock, Logo, cn } from "@/components/ui";
import { daysUntil, initials } from "@/lib/format";

const NAV = [
  { href: "/dashboard", label: "Panou", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { href: "/clients", label: "Clienți", icon: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01" },
];

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

  const trialDays = organization?.status === "trial" && organization.trialEndsAt ? daysUntil(organization.trialEndsAt.slice(0, 10)) : null;

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={32} />
        <div className="min-w-0">
          <div className="text-[15px] font-bold tracking-tight text-ink">Togato</div>
          <div className="truncate text-[11px] text-slate-400">{organization?.name}</div>
        </div>
      </div>
      <div className="px-3">
        <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Conformitate</div>
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/") || (item.href === "/clients" && pathname.startsWith("/systems"));
          return (
            <Link key={item.href} href={item.href} className={cn("mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition", active ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-ink")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto border-t border-slate-100 p-3">
        {trialDays !== null && (
          <div className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-[12px] text-brand">
            {trialDays > 0 ? <>Perioadă de probă: <b>{trialDays} zile</b> rămase</> : <>Perioada de probă s-a încheiat</>}
          </div>
        )}
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">{user.name}</div>
            <div className="truncate text-[11px] text-slate-400">{user.role === "admin" ? "Administrator" : "Membru"}</div>
          </div>
          <button onClick={() => { logout(); router.replace("/login"); }} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Ieșire" aria-label="Ieșire">
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
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
