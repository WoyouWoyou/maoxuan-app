"""Extract articles from the 毛选 epub into resources/articles.json."""
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPUB_DIR = ROOT / "_epub" / "OEBPS"
OUT = ROOT / "resources" / "articles.json"

CORE = ["实践论", "矛盾论", "论持久战", "反对本本主义", "中国革命战争的战略问题"]


class TextExtractor(HTMLParser):
    BLOCK = {"p", "div", "h1", "h2", "h3", "h4", "h5", "li", "br"}

    def __init__(self):
        super().__init__()
        self.parts, self.in_body, self.skip = [], False, 0

    def handle_starttag(self, tag, attrs):
        if tag == "body":
            self.in_body = True
        if tag in ("sup", "script", "style"):
            self.skip += 1
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("sup", "script", "style"):
            self.skip = max(0, self.skip - 1)
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self.in_body and not self.skip:
            self.parts.append(data)

    def text(self):
        t = "".join(self.parts).replace("\u3000", " ")
        lines = [ln.strip() for ln in t.splitlines()]
        return "\n".join(ln for ln in lines if ln)


def spine_order():
    ns = {"opf": "http://www.idpf.org/2007/opf"}
    tree = ET.parse(EPUB_DIR / "content.opf")
    manifest = {i.get("id"): i.get("href") for i in tree.iterfind(".//opf:manifest/opf:item", ns)}
    return [manifest[r.get("idref")] for r in tree.iterfind(".//opf:spine/opf:itemref", ns)]


def main():
    articles, volume = [], ""
    for href in spine_order():
        path = EPUB_DIR / href
        if not path.name.endswith(".xhtml"):
            continue
        raw = path.read_text(encoding="utf-8")
        m = re.search(r"<title>(.*?)</title>", raw, re.S)
        title = (m.group(1).strip() if m else path.stem)
        if path.stem.startswith("Volume"):
            volume = title
            continue
        if not path.stem.startswith("Section"):
            continue
        p = TextExtractor()
        p.feed(raw)
        body = p.text()
        if body.startswith(title):
            body = body[len(title):].lstrip("\n")
        if not body.strip():
            continue  # period divider pages such as 第一次国内革命战争时期
        articles.append({
            "id": path.stem,
            "title": title,
            "volume": volume,
            "isCore": title in CORE,
            "coreOrder": CORE.index(title) if title in CORE else None,
            "content": body,
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(articles, ensure_ascii=False), encoding="utf-8")
    found = [a["title"] for a in articles if a["isCore"]]
    print(f"articles={len(articles)} core_found={found}")
    missing = set(CORE) - set(found)
    if missing:
        print("MISSING:", missing, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
