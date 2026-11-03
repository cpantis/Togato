import { Logo } from "@/components/ui";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[44%] flex-col justify-between bg-brand p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-white/10 p-0.5"><Logo size={34} /></div>
          <span className="text-lg font-bold tracking-tight">Togato</span>
        </div>
        <div>
          <h2 className="max-w-md text-[28px] font-bold leading-tight">Conformitatea AI Act a clienților tăi, într-un singur loc.</h2>
          <ul className="mt-6 space-y-3 text-[14px] text-white/80">
            <li>• Inventarul sistemelor AI pentru fiecare firmă-client</li>
            <li>• Încadrarea pe niveluri de risc, cu articolele citate</li>
            <li>• Obligațiile concrete, cu termene și stări</li>
            <li>• Decizia finală rămâne la avocat</li>
          </ul>
        </div>
        <div className="text-[12px] text-white/80">Regulamentul (UE) 2024/1689, cu modificările Omnibus 2026</div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={32} />
            <span className="text-lg font-bold tracking-tight text-ink">Togato</span>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 mb-6 text-[13px] text-slate-500">{subtitle}</p>
          {children}
          <div className="mt-6 text-center text-[13px] text-slate-500">{footer}</div>
        </div>
      </div>
    </div>
  );
}
