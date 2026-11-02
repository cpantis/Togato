import { Fragment } from "react";

/** Randare minimă și sigură (fără HTML brut) pentru memoriile AI: titluri ##, liste, paragrafe, **bold**. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^#{1,3}\s+(.*)/);
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (h) { flush(); blocks.push(<h2 key={blocks.length}>{inline(h[1])}</h2>); }
    else if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((ul || ol)![1]);
    } else if (line.trim() === "") flush();
    else { flush(); blocks.push(<p key={blocks.length}>{inline(line)}</p>); }
  }
  flush();
  return <div className="memo text-[13px] leading-relaxed text-slate-700">{blocks}</div>;
}
