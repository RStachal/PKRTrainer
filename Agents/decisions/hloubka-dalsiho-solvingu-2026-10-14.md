# Co solvovat dál — rozhodnutí o hloubce

> **Aktualizace 14. 10. 2026 odpoledne — tenhle dokument už nevyžaduje tvoji
> odpověď.** Jeho premisa („obě automatické osy jsou vyčerpané") byla **chybná**:
> `mtt:seat-pair-expansion` počítal „co už máme" bez hloubky a z adresáře
> rozkladu místo checkpointů, takže na 40 a 50 bb chybějící dvojice nenabídl
> vůbec. Opraveno (deník 308).
>
> | | rodin | desek | nocí |
> |---|---|---|---|
> | **40 bb — nastagováno, běží od dnešní noci** | 16 | 96 | ve frontě celkem 4,2 |
> | 50 bb — připraveno, nastaguje se, až 40 bb dojíždí | 18 | 108 | ~4,7 |
>
> Šířka na 40 i 50 bb je tedy zajištěná bez rozhodnutí. Pod pravomocí, kterou
> jsi mi dal 14. 10. („nechám na tvém profesionálním rozhodnutí další kroky"),
> to pořadí řídím já. Otevřené zůstávají jen 3BP sonda a přesolvení 100 bb
> z července — obojí není pilné a rozhodnu je, až 40 a 50 bb dojedou.
>
> Text níž zůstává, jak byl napsán ráno, aby bylo vidět, z čeho se vycházelo.
> Čísla o dvojicích v něm platí; závěr „je to rozpočtové rozhodnutí" ne.

---

# (původní znění z rána) — k vyplnění vlastníkem

**Vznik:** 14. 10. 2026 ráno, po noci, která frontu snížila na 16 desek
**Proč teď:** fronta vydrží **0,6 noci**. Dnešní noc ji dojede a zítra nebude na čem jet.
**Vyplň prosím oddíl „Tvoje odpověď" dole.**

---

## Proč to rozhodnutí nemůže udělat stroj

Obě automatické osy jsou vyčerpané a je to změřené, ne odhadnuté:

| osa | příkaz | co vrací |
|---|---|---|
| přesolvení na dnešní ranže | `mtt:resolve-stage --depth=25` | u všech rodin **„liší se 0"** |
| rozšíření dvojic sedaček | `mtt:seat-pair-expansion` | 29/29 dvojic, šablona textur došla |
| 3bet poty | `mtt:texas-solver-3bp-expansion-batch` | přegeneruje tytéž 12 desek, které checkpoint mají |

Takže další práce je rozpočtové rozhodnutí. `MTT_ORCHESTRATOR.md` to má zapsané
stejně: „rozhodnutí o další ose je rozpočtové, ne technické, takže ho stroj
neudělá sám."

## Kde dnes stojíme

Vyřešených rodin je 81 a hloubky jsou rozdělené nerovnoměrně:

| hloubka | rodin | | hloubka | rodin |
|---|---|---|---|---|
| 20 bb | 1 | | 50 bb | 20 |
| 25 bb | **32** | | 70 bb | 1 |
| 35 bb | 2 | | 80 bb | 2 |
| 40 bb | **17** | | 100 bb | 3 |
| 45 bb | 1 | | 110 bb | 1 |
| | | | 150 bb | 1 |

Na dvojicích sedaček je to vidět nejčistěji: **25 bb má 29 dvojic, 40 bb i 50 bb
jen 17** — a chybí u obou **tytéž třináct**:

`BTN_SB` · `CO_BTN` · `CO_SB` · `HJ_BB` · `HJ_BTN` · `HJ_CO` · `HJ_SB` ·
`LJ_BB` · `LJ_BTN` · `LJ_CO` · `LJ_HJ` · `UTG_1_BB` · `UTG_2_BB`

Jsou to pozdní pozice a blindy proti sobě — tedy ne okrajové spoty.

## Změřené ceny

Z dnešní tabulky (`board-cost.generated.json`, 872 desek z nočních logů):

| hloubka | medián | průměr | desek měřeno |
|---|---|---|---|
| 25 bb | 6,4 min | 7,3 | 698 |
| 40 bb | 21,3 min | **22,7** | 93 |
| 50 bb | 23,9 min | **25,6** | 81 |
| 100 bb | — | **přes 150** | ruční sonda, ne noc |

*Pro odhad, na kolik nocí práce je, se počítá průměr, ne medián — noc
spotřebuje součet, a nezkreslený odhad součtu je `počet krát průměr`. Opraveno
dnes, viz deník.*

## Možnosti a co stojí

Třináct dvojic krát šest desek je **78 desek**. Noční okno je 587 minut.

| | desek | cena | nocí | jak |
|---|---|---|---|---|
| **a) šířka na 40 bb** | 78 | 1 771 min | **3,0** | `mtt:seat-pair-expansion -- --depths=40 --write` |
| **b) šířka na 50 bb** | 78 | 1 997 min | **3,4** | totéž s `--depths=50` |
| **c) obojí** | 156 | 3 768 min | **6,4** | dvě dávky za sebou |
| d) tytéž dvojice na 100 bb | 78 | 11 700 min | **20** | `--depths=100` |
| e) 3bet poty do šířky | ? | **neměřeno** | ? | chce nejdřív sondu |

**Doporučuji c), nastagovat 40 bb první.** Tři důvody:

1. Je to **jeden příkaz** na každou hloubku, cena je změřená na 93 a 81 deskách,
   ne na sondě, a 6,4 noci vydrží do ~21. 10.
2. Skript si zásadu nese sám a platí dál: *„šířka vzorů je dnes to, co chybí —
   dvaatřicet vzorů proti pěti — takže mělká hloubka napříč vzory přinese
   mnohem víc než hloubka u jednoho."* Na 25 bb se ta šířka dojela; na 40 a 50
   je rozdíl 29 proti 17.
3. Chybí **tytéž** dvojice u obou hloubek, takže se tím zavře jedna díra, ne dvě
   poloviny různých.

**Proč ne d):** dvacet nocí za tutéž šířku, kterou a) i b) dají za tři. A 100 bb
má jiný, dřív otevřený problém — tři rodiny z července stojí na ranžích, které
produkt už neučí, takže se budou přesolvovat celé.

**Proč ne e) jako první:** to je obsahově největší díra (trenažér rozdává
`THREE_BET_POT` a knihovna má 3BP jen pro `CO_BTN`), ale **cenu 3BP desky
neznám** a nebudu předstírat, že ano — v nočním logu není jediný 3BP solve z éry
tohohle runneru. Dá se to ale vyřešit mimochodem: do jedné z těch nocí přidat
**tři 3BP desky jako sondu**, stojí to kolem hodiny a příští rozhodnutí už bude
mít číslo.

---

## Tvoje odpověď

**1) Kterou osu nastagovat?**

```
a) šířka na 40 bb (3,0 noci)
b) šířka na 50 bb (3,4 noci)
c) obojí, 40 bb první (6,4 noci) — DOPORUČUJI
d) tytéž dvojice na 100 bb (20 nocí)
e) 3bet poty (cena neznámá)

Volím:
```

**2) Přidat do nejbližší noci sondu tří 3BP desek, ať má příští rozhodnutí cenu?**
(Stojí kolem hodiny z okna.)

```
ANO / NE:
```

**3) Ty tři rodiny na 100 bb z července stojí na starých ranžích. Přesolvit je,
nebo nechat?** (Je to samostatná dávka, kolem 2,5 h na desku.)

```
PŘESOLVIT / NECHAT ZATÍM:
```

---

*Pozor na jednu věc nezávislou na téhle volbě: cokoli se nastaguje, bude se
solvit na obraně, která **nerozlišuje, kdo otevřel** — `VS_OPEN` je klíčovaný
jen sedačkou obránce a hloubkou. ~~Na 40 a 50 bb už přitom packy zpřesnění podle
otvírače mají (56 % a 45 % záznamů). Je to změna v kódu bez jediné noci a
u těchhle dvou hloubek by se vyplatila dřív než solve.~~*

> **Vyvráceno 15. 10. 2026.** Těch 56 % a 45 % bylo průměrem přes všechny packy.
> Solver ale bere obranu z packů s **ante OFF** (expanze volá `ante: "OFF"`)
> a ty podle rozhodnutí 7a RYE vrstvu nemají: zpřesnění podle otvírače je tam
> u 11 ze 77 záznamů (14,3 %) a na každé hloubce stejně, samé vlastní BB proti
> SB. Úspora „bez jediné noci" pro solver neexistuje; vznikne, až ante OFF
> dostane zdroj s otvíračem. Měří to opravený `npm run mtt:vs-open-refinement`.
