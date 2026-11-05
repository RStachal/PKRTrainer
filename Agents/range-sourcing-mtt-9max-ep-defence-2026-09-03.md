# MTT 9-max: obrana raných pozic proti ranému otevření — sourcing audit 2026-09-03

## Proč se to hledalo

Rozklad drží 34 dvojic sedaček z 36 možných. Chybí tři, všechny „raná proti rané":
`UTG_UTG_1_SRP`, `UTG_UTG_2_SRP`, `UTG_1_UTG_2_SRP`. Dohromady je to 224 z 2 400
dotazů (9,3 %) měřených volnou cestou generátoru.

Založit je nelze: `srpSolverInputRanges` vrací `undefined`, protože produkční
preflop pack nemá `VS_OPEN` pro UTG+1 ani UTG+2 — a **na žádné hloubce**
(ověřeno 2026-09-03 na 20, 25, 30, 40, 50 a 100 bb). Doloženo bylo už 2026-08-27
v `srpSolverInputGap`. Otázka tedy zněla: existuje veřejně a licenčně čistě
zdroj, který tu obranu publikuje?

## Vyhledávání

1. `MTT 9-max GTO preflop chart UTG+1 defending vs UTG open cold call 3bet range`
2. `free GTO preflop ranges MTT full ring 9 handed "UTG+1" "vs open" chart download`
3. `GTO Wizard MTT 9-max preflop "UTG+1 vs UTG" facing raise range chart free`
4. `github open source poker preflop ranges dataset MIT license 9-max tournament "vs open" JSON`
5. `solver 9-max tournament 25bb does UTG+1 ever cold call flat UTG open frequency`
6. `GTO Wizard blog cold calling ranges when to cold call by position`

## Porovnané zdroje

| Zdroj | 9-max? | Obrana raných pozic? | Přístup | Závěr |
|---|---|---|---|---|
| PreflopWizard | ano | **ne** — „vs open" jen pro BB | zdarma | nepoužitelné |
| PokerCoaching | ano | ne — RFI a push/fold | zdarma | nepoužitelné |
| FreeBetRange | ano | nedoloženo, popis mluví o RFI | placené | neověřitelné bez účtu |
| BBZ Poker | **ne, 8-max** | nedoloženo | 12,5–20,8 $/měs. | jiný formát |
| GTOBase | ano, 15–30 bb | nedoloženo, nutno se zeptat podpory | 75–150 $/měs. | licenčně nevyřešené |
| AHTOOOXA/poker-charts (GitHub) | ne, 6 pozic | „vs-open" ano, ale 6-max | MIT | **licence kódu, ne dat** |

Poslední řádek je důležitý a je to past, do které by se dalo snadno spadnout:
MIT licence na repozitáři říká něco o kódu, ne o původu hodnot v ranžích. Repozitář
původ dat nikde neuvádí. To je přesně kategorie „licenčně nejasné", kterou audit
z 2026-06-01 vylučuje.

## Co se přitom ukázalo a mění to závěr

Blog GTO Wizardu uvádí, že solver **prakticky nikdy nedorovnává otevření odjinud
než z BTN a BB**, a že ani ve hrách bez rake není dorovnání z ostatních pozic
atraktivní. Chybějící rodiny jsou přitom `SRP` — tedy postflop **po dorovnání**
raného obránce.

Z toho plyne, že ten uzel v rovnovážné hře skoro nevzniká. Nejde tedy o obsah,
který by někdo zapomněl publikovat; jde o obsah, který nemá kdo hrát. Odpovídá
tomu i to, že náš vlastní korpus `VS_OPEN` pro UTG+1 a UTG+2 nemá — ta absence
je nejspíš záměrná, ne opomenutá.

**Je to odvození, ne měření.** Ověřit by se dalo jen na placeném řešení, kde by
se ta frekvence přečetla přímo. Tvrdím tedy: veřejné zdroje ukazují tímhle směrem
a náš korpus s tím sedí, ne: „změřeno, že je to nula".

## Rozhodnutí

1. **Nekupovat data kvůli téhle mezeře.** I kdyby se licence vyřešila, vyplněný
   uzel by odpovídal na spot, který se u stolu skoro nerozdá. Za 9,3 % dotazů
   volnou cestou se přitom platí celá noc solveru.
2. **Mezeru přiznat mezi limity**, ne ji držet jako otevřenou úlohu. Orchestrátor
   ji od 2026-09-02 hlásí sám a neradí krok, který ji „odemkne".
3. **Jediná licenčně čistá cesta, kdyby to někdy bylo potřeba, je vlastní
   preflopový solve** (`OWNED_SOLVER_EXPORT`). Ta by mimochodem opravila i dva
   ústupky, které jsou dnes přiznané v `solverInputRanges`: že `VS_OPEN`
   nerozlišuje, kdo otevřel (rozdíl v průměru 11,7 bodu, u BB až 26,9), a že
   packy nesou čisté akce místo smíšených (0 z 1980 tříd dělá call i 3bet).
   Tyhle dvě vady stojí za víc než tři chybějící dvojice.
4. Na katalogové cestě, kterou trenažér doopravdy rozdává, se tím nemění nic —
   ta je na 100 % podložená solverem a žádný z těch tří vzorů se na ní nerozdá.

## Odkazy

- https://blog.gtowizard.com/preflop-range-morphology/
- https://blog.gtowizard.com/flop-heuristics-ip-cold-caller-in-mtts/
- https://www.preflopwizard.app/blog/preflop-charts
- https://pokercoaching.com/preflop-charts/
- https://bbzpoker.com/poker-charts/
- https://gtobase.com/
- https://github.com/AHTOOOXA/poker-charts
