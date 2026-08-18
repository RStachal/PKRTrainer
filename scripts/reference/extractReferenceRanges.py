"""Přečti vlastněné range materiály do porovnávacího korpusu.

Co to je a co to není. Materiály v `Documents/Private/PKR` jsou koupené cizí
produkty - kurzy, knihy, range balíky. Tenhle skript z nich dělá **referenční
korpus pro měření**, ne obsah k dodání: výstup jde do `artifacts/`, které je v
`.gitignore`, takže se necommituje a nebalí do aplikace. Slouží k jediné věci -
změřit, jak se naše vlastní vyřešená strategie liší od nezávislého zdroje.

Proč to má cenu právě teď: všech 37 dodávaných packů stojí na LOW, protože je
nikdo nepřečetl, a LOW neprojde do produkce. Nezávislý korpus nenahradí čtení
člověkem, ale dá druhý měřitelný signál - stejně jako `defenceGap` dnes dává
první. Rodina, která se od nezávislého zdroje liší o pár procent, je jiný případ
než rodina, která se liší o třicet.

Formát zdroje: každá stránka je mřížka 169 buněk `<td id="cid_AKs" class="cell s
mdl-color--red">`, k tomu legenda barva -> akce a souhrn "% of hands (N combos)".
"""
import hashlib
import json
import os
import re
import sys
from collections import Counter

ROOT = r"C:/Users/stachal/Documents/Private/PKR"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..",
                   "artifacts", "reference-ranges")

CELL = re.compile(
    r'<td id="cid_([0-9AKQJT]{1,2}[so]?)" class="cell [pso]((?: mdl-color--[a-z-]+)?)"'
)
LEGEND = re.compile(r'mdl-color--([a-z-]+)"><span class="title">([^<]*)</span>')
SUMMARY = re.compile(
    r'selectedItems">([\d.]+)% of hands</span>\s*<span class="totalCombos">\((\d+)\) combos'
)
NOTES = re.compile(r'<span class="notes">(.*?)</span>', re.S)
STACKS = re.compile(r'([a-z]{2,4})(\d+)bb', re.I)


def text_of(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


def parse_page(path):
    html = open(path, encoding="utf8", errors="replace").read()
    cells = CELL.findall(html)
    if len(cells) < 169:
        return None                      # menu nebo navigace, ne range
    legend = dict(LEGEND.findall(html[html.find("rangeBreakdown"):][:4000]))
    summary = SUMMARY.search(html)
    notes = NOTES.search(html)

    hands = {}
    for hand, colour in cells:
        if not colour:
            continue                     # nebarevná buňka = mimo range
        key = colour.replace(" mdl-color--", "")
        hands[hand] = {"colour": key, "action": legend.get(key, key)}

    name = os.path.basename(path)[:-5]
    return {
        "id": name,
        "sourceFile": os.path.relpath(path, ROOT).replace("\\", "/"),
        "group": name.split("-")[0],
        "stacks": [
            {"seat": seat.upper(), "bb": int(bb)} for seat, bb in STACKS.findall(name)
        ],
        "legend": legend,
        "handCount": len(hands),
        "pctOfHands": float(summary.group(1)) if summary else None,
        "combos": int(summary.group(2)) if summary else None,
        "notes": text_of(notes.group(1)) if notes else "",
        "hands": hands,
        "contentHash": hashlib.sha256(
            json.dumps(hands, sort_keys=True).encode("utf8")
        ).hexdigest()[:16],
    }


def main():
    pages, seen = [], {}
    for base, _dirs, files in os.walk(ROOT):
        for name in sorted(files):
            if not name.endswith(".html"):
                continue
            page = parse_page(os.path.join(base, name))
            if page is None:
                continue
            # Stejný obsah leží na dvou místech (ICM složka je výřez z viewru).
            # Duplicitu je lepší zahodit tady než ji později počítat dvakrát.
            if page["contentHash"] in seen:
                seen[page["contentHash"]]["alsoAt"].append(page["sourceFile"])
                continue
            page["alsoAt"] = []
            seen[page["contentHash"]] = page
            pages.append(page)

    os.makedirs(OUT, exist_ok=True)
    out_path = os.path.join(OUT, "reference-ranges.json")
    json.dump({"pages": pages}, open(out_path, "w", encoding="utf8"),
              ensure_ascii=False, indent=1)

    groups = Counter(p["group"] for p in pages)
    actions = Counter(a for p in pages for a in p["legend"].values())
    dupes = sum(len(p["alsoAt"]) for p in pages)
    print(f"unikátních stránek: {len(pages)} (zahozeno {dupes} duplicit)")
    print(f"zapsáno: {os.path.abspath(out_path)}")
    print(f"skupin: {len(groups)}, různých akcí v legendách: {len(actions)}")
    with_stacks = [p for p in pages if p["stacks"]]
    print(f"stránek se stacky v názvu: {len(with_stacks)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
