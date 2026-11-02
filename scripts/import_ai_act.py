#!/usr/bin/env python3
"""
Importă textul oficial al Regulamentului (UE) 2024/1689 (AI Act), în limba română,
din pagina HTML EUR-Lex / Jurnalul Oficial, într-un JSON structurat pe articole,
alineate și anexe.

Utilizare (rulați cu -I: fișierul de intrare e o sursă externă):
    python3 -I scripts/import_ai_act.py <pagina.html> apps/api/src/legal/ai_act_ro.json

Sursa: https://eur-lex.europa.eu/legal-content/RO/TXT/HTML/?uri=CELEX:32024R1689
Doar biblioteca standard Python.
"""
import json
import re
import sys
from datetime import date
from html.parser import HTMLParser

VOID = {"br", "hr", "img", "col", "meta", "link", "input", "area", "base", "source", "wbr"}


class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.children, self.parent = tag, dict(attrs), [], parent

    def cls(self):
        return (self.attrs.get("class") or "").split()

    def text(self):
        out = []
        for c in self.children:
            out.append(c if isinstance(c, str) else c.text())
        return "".join(out)

    def iter(self):
        yield self
        for c in self.children:
            if isinstance(c, Node):
                yield from c.iter()

    def kids(self, tag=None):
        return [c for c in self.children if isinstance(c, Node) and (tag is None or c.tag == tag)]


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", {}, None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def clean(s):
    s = s.replace(" ", " ")
    s = re.sub(r"[ \t\r\n]+", " ", s)
    return s.strip()


def block_lines(node):
    """Transformă un bloc (paragrafe + tabele de enumerare) în linii de text.
    Un rând de tabel „(a) | text” devine „(a) text”, cu indentare pentru nivelurile imbricate."""
    lines = []

    def walk(n, depth):
        for c in n.children:
            if isinstance(c, str):
                continue
            if c.tag == "p":
                if "oj-note" in c.cls():
                    continue
                t = clean(c.text())
                if t:
                    lines.append(("  " * depth) + t)
            elif c.tag == "table":
                for tr in (r for r in c.iter() if r.tag == "tr" and nearest_table(r) is c):
                    tds = [td for td in tr.kids("td")]
                    if len(tds) >= 2:
                        label = clean(tds[0].text())
                        sub = []
                        start = len(lines)
                        walk(tds[1], depth + 1)
                        body = lines[start:]
                        del lines[start:]
                        if body:
                            first = body[0].strip()
                            lines.append(("  " * depth) + (f"{label} {first}" if label else first))
                            lines.extend(body[1:])
                        elif label:
                            lines.append(("  " * depth) + label)
                    else:
                        for td in tds:
                            walk(td, depth)
            else:
                walk(c, depth)

    walk(node, 0)
    return lines


def nearest_table(n):
    p = n.parent
    while p is not None and p.tag != "table":
        p = p.parent
    return p


def split_numbered_points(lines):
    """Articole fără alineate, dar cu puncte numerotate (ex. Art. 3 — definițiile „1.”, „2.” ...):
    fiecare punct devine o unitate proprie (n = numărul punctului), ca „Art. 3 pct. 1” să fie adresabil.
    Textul de dinaintea primului punct rămâne o unitate fără număr."""
    out, intro, current = [], [], None
    for line in lines:
        m = re.fullmatch(r"(\d{1,3})\.", line.strip())
        if m:
            current = {"n": m.group(1), "lines": []}
            out.append(current)
            continue
        if current is None:
            intro.append(line)
        else:
            if not current["lines"]:
                current["lines"].append(f'{current["n"]}. {line.strip()}')
            else:
                current["lines"].append(line)
    if len(out) < 2:
        return [{"n": None, "lines": lines}]
    return ([{"n": None, "lines": intro}] if intro else []) + out


def parse(html):
    tb = TreeBuilder()
    tb.feed(html)
    root = tb.root

    meta = {}
    for n in root.iter():
        c = n.cls()
        if "oj-hd-date" in c:
            meta["journalDate"] = clean(n.text())
        if "oj-hd-coll" in c:
            meta["journalSeries"] = clean(n.text())

    articles = {}
    for n in root.iter():
        aid = n.attrs.get("id", "")
        m = re.fullmatch(r"art_(\d+)", aid)
        if not m or n.tag != "div":
            continue
        num = m.group(1)
        title = ""
        heading = ""
        paragraphs = []
        loose = []
        for c in n.kids():
            cid = c.attrs.get("id", "")
            if c.tag == "p" and "oj-ti-art" in c.cls():
                heading = clean(c.text())
            elif cid.startswith(f"art_{num}.tit"):
                title = clean(c.text())
            elif re.fullmatch(r"\d{3}\.\d{3}", cid):
                lines = block_lines(c)
                para_no = str(int(cid.split(".")[1]))
                paragraphs.append({"n": para_no, "lines": lines})
            else:
                loose.extend(block_lines(c) if c.tag != "p" else [clean(c.text())] if clean(c.text()) else [])
        if not paragraphs and loose:
            paragraphs = split_numbered_points(loose)
        articles[num] = {"heading": heading, "title": title, "paragraphs": paragraphs}

    annexes = {}
    for n in root.iter():
        if n.tag != "div" or "eli-container" not in n.cls():
            continue
        tis = [c for c in n.kids("p") if "oj-doc-ti" in c.cls()]
        if not tis:
            continue
        m = re.fullmatch(r"ANEXA ([IVXLC]+)", clean(tis[0].text()))
        if not m:
            continue
        roman = m.group(1)
        title = clean(tis[1].text()) if len(tis) > 1 else ""
        intro = []
        items = []
        current_section = None
        for c in n.kids():
            if c in tis:
                continue
            if c.tag == "table":
                for tr in (r for r in c.iter() if r.tag == "tr" and nearest_table(r) is c):
                    tds = tr.kids("td")
                    if len(tds) < 2:
                        continue
                    label = clean(tds[0].text()).rstrip(".")
                    body = block_lines(tds[1])
                    points = []
                    for line in body[1:]:
                        pm = re.match(r"^\s*\(([a-z]{1,2})\)\s*(.*)$", line)
                        if pm and not line.startswith("    "):
                            points.append({"letter": pm.group(1), "lines": [pm.group(2)]})
                        elif points:
                            points[-1]["lines"].append(line.strip())
                    items.append({"n": label, "section": current_section, "lines": body, "points": points})
            elif c.tag == "p":
                t = clean(c.text())
                if t:
                    if items or "oj-ti-grseq-1" in c.cls():
                        current_section = t
                    intro.append(t) if not items else None
            else:
                lines = block_lines(c)
                if lines:
                    intro.extend(lines) if not items else items.append({"n": None, "section": current_section, "lines": lines, "points": []})
        annexes[roman] = {"heading": f"Anexa {roman}", "title": title, "intro": intro, "items": items}

    return meta, articles, annexes


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    html = open(src, encoding="utf-8").read()
    if "32024R1689" not in html and "2024/1689" not in html:
        sys.exit("Fișierul nu pare a fi Regulamentul (UE) 2024/1689.")
    meta, articles, annexes = parse(html)
    if len(articles) < 100 or "III" not in annexes:
        sys.exit(f"Structură neașteptată: {len(articles)} articole, anexe {sorted(annexes)}")
    data = {
        "source": {
            "act": "Regulamentul (UE) 2024/1689 al Parlamentului European și al Consiliului (Regulamentul privind inteligența artificială)",
            "celex": "32024R1689",
            "language": "ro",
            "version": "Textul inițial, publicat în Jurnalul Oficial",
            "journal": " ".join(v for v in [meta.get("journalSeries"), meta.get("journalDate")] if v),
            "url": "https://eur-lex.europa.eu/legal-content/RO/TXT/HTML/?uri=CELEX:32024R1689",
            "note": "Nu include modificările ulterioare (pachetul Omnibus digital, 2026). Pentru textul consolidat consultați EUR-Lex.",
            "importedAt": date.today().isoformat(),
        },
        "articles": articles,
        "annexes": annexes,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0, separators=(",", ":"))
    paras = sum(len(a["paragraphs"]) for a in articles.values())
    print(f"OK: {len(articles)} articole, {paras} alineate, anexe {', '.join(annexes)} → {out}")


if __name__ == "__main__":
    main()
