# Povolení RYE — osa „dorovnávající" — k vyplnění vlastníkem

**Vznik:** 13. 10. 2026, na otázku vlastníka „Co myslíš zde: dodat RYE záznamy?"
**Zpracuje:** ruční přepis do `Agents/range-intake/raw/<packId>/permission.json` jako `permission-user-confirmed-v3`
**Vyplň prosím oddíl „Tvoje odpověď" dole. Zbytek je podklad, ať nemusíš nic dohledávat.**

---

## Co „dodat RYE záznamy" znamená

Ze zpracovaných draftů leží hotové zpřesněné záznamy v
`artifacts/rye-import/candidate/<packId>/normalized.json`. Jsou schválené
(mřížka po mřížce) a **nic z nich nečeká na výpočet** — žádná solvovací noc.
Čekají na jednu věc: na tvoje povolení, protože mění **provenienci dat v packu**.

Dnešní povolení je z 16. 9. 2026 (`permission-user-confirmed-v2`) a jmenuje
jmenovitě **jednu osu**:

> „refined records (**vsSeat**) derived from the owner's purchased RYE
> Rangeviewer 2021 charts may ship in the PKRTrainer runtime bundle"

## Co se od té doby změřilo (13. 10. 2026)

| osa zpřesnění | záznamů | krytí dnešním povolením |
|---|---|---|
| `vsSeat` sama | 344 | **ano**, v. 2 ji jmenuje |
| `vsSeat` + `flatCallers` | **70** | **ne**, v. 2 o dorovnávajících nic neříká |
| `stackSetupId` | 0 | zatím nehraje roli |

Těch 70 je v **jediném packu**: `mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1`.

**Tohle je celá podstata otázky.** Nejde o nový zdroj ani o nový druh obsahu —
RYE jsi povolil a bereš ho jako referenci. Jde o to, že záznam teď nese
**druhou osu**, kterou předchozí text nejmenuje, a povolení se nemá dovozovat
mlčením. Proto se ptám místo toho, abych to napsal za tebe.

## Co se přenáší a co ne

Stejně jako u v. 2, nic nového: **seznamy akcí po třídách rukou**
(strict/lenient), ne obrázky a ne soubory zdroje. Každý záznam nese
`provenance`. Nový je jen klíč `flatCallers` — tedy informace „tahle range je
proti otevření ze sedačky X **a jednomu dorovnání** ze sedačky Y".

Jedna věc, kterou je fér říct, protože se o ní 8. 10. rozhodovalo: skupina ve
jménech zdroje (`EP/MP`, `CO/BU`) je **jeden dorovnávající ze skupiny**, ne dva.
Dokázala to velikost squeeze — se skupinou se nemění, kdežto druhý dorovnávající
by ji zvedl. Zpřesnění proto stojí **vedle** obecné odpovědi, ne místo ní: kdo se
na osu zeptat neumí, dostane obecnou range jako dřív.

---

## Tvoje odpověď

**1) Můžou záznamy s osou `flatCallers` (70 ks, pack `…regular…ante-on…v1`) jít
do runtime balíku PKRTraineru?**

```
ANO / NE:
```

**2) Vlastními slovy — čím ten zdroj je a za co ho bereš.** (Do `permission.json`
jde tvůj text, ne můj. V. 2 nese tvoji větu z 16. 9.: „zdroj uznává, RYE si
koupil, protože tyhle range jsou optimální, a bere ho i do budoucna jako
referenci." Pro v. 3 stačí doplnit, jestli to platí i pro osu dorovnávajícího,
nebo to říct po svém znovu.)

```


```

**3) Máš k tomu podmínku?** (U v. 2 jsi 24. 9. přidal podmínku, na kterou se
nikdo neptal — podobu odlišení v grafice. Jestli i tady něco je, patří to sem,
ne do kódu.)

```


```

**4) Platí tohle povolení i pro další packy, až tam osa `flatCallers` vznikne**
(dnes 0 záznamů ve zbylých třech), nebo se mám zeptat znovu u každého?

```
PLATÍ DOPŘEDU / ZEPTAT SE ZNOVU:
```

---

*Až tenhle soubor vyplníš, přepíšu ho do `permission.json` jako v. 3 s datem,
tvým jménem jako recenzenta a tvým textem v `rationale` — a pak teprve pustím
import do produkčního packu.*
