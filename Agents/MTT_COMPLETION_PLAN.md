# Plán dokončení MTT části

Napsáno 19. 8. 2026 na zadání „vytvoř plán tak, abys byl schopen sám, bez mých
vstupů, reálně dokončit MTT část". **Přepsáno 24. 8. 2026 podle měření** - tři
body byly zastaralé a jedna fáze se ukázala jako nedodatelná tak, jak byla
napsaná. Co se změnilo, je u každé fáze uvedené.

## Nejdřív poctivá odpověď: sám ji dokončit nemůžu

Knihovna má **64 profilů** (2 formáty stolu × 2 rychlosti blindů × 2 EV modely ×
4 ulice × 2 ante). Dnes jsou 4 produkční.

Z těch 64 je **48 zablokovaných na datech nebo hardwaru, které si neopatřím**:

| skupina | řádků | co chybí | proč si to neseženu |
|---|---|---|---|
| six-max | 16 | změřené preflop charty | odvozovat je brána zakazuje, a správně; vlastněné materiály jsou 9-max |
| $EV / ICM | 32 | změřená ICM data | dnešní `bubble-derived` pack se od nezávislého ICM zdroje liší o 13,4 bodu a má jiný tvar |
| blend 51 desek | — | stroj s 48+ GB RAM | commit 25,9 GB proti ~20 GB použitelné paměti; hardwarová odpověď, ne plánovací |

Tvrdit, že to dokončím, by znamenalo buď odvodit data, která brána odmítá, nebo
prohlásit za pokryté něco, co pokryté není. Ani jedno neudělám.

**Co dokončit můžu, je full-ring 9 chipEV**, tedy 16 z těch 64 řádků, a k tomu
funkce, které na datech nezávisí.

## Fáze 1 — EV dopočtem z riveru — **hotovo**

Dodáno 20.-24. 8. 2026. Ověřeno měřením, ne dojmem:

- EV se počítá ze solverovy strategie a rangí (`SOLVED_TREE`, ne `SOLVER` -
  TexasSolver v0.2.0 EV nevypisuje a přesolvení by nepomohlo).
- Tabulku má **všech 17 riverových rodin**, 6,6 MB.
- EV se ukáže u **73,3 %** rozdaných riverových spotů. Zbytek jsou meze dat:
  kombinace mimo tabulku (43 z 300) a řádky padlé ořezem rozpočtu (37 z 300).
- UI: EV ostatních akcí po odpovědi i EV každé kombinace v matici.
- Akce, kterou rozbor nemodeluje, se jmenuje „EV nespočítána" a **nezakládá
  chybu hráče** - dřív za ni dostal „špatně" bez opory v čemkoli spočítaném.

## Fáze 2 — EV pro turn a flop — **nedodatelná, jak byla napsaná**

**Změřeno 24. 8. 2026 a mění to zadání fáze:** EV stojí 1,4 kB na pravidlo.
Turn má 8 302 pravidel a flop 2 521, takže by to bylo **11,2 + 3,4 MB**. Líné
chunky jsou dnes na 27,9 MB z limitu 32, takže by výsledek byl **42,5 MB proti
32** - o třetinu nad stropem.

Rozhodnout se dá trojím způsobem a **žádný z nich není úklid v kódu**:

1. **Zvednout strop líného obsahu.** Není to instalační cesta - hráč stáhne jen
   rodiny, na které dojde - takže je to obhajitelnější než zvednout precache.
   Ale je to rozhodnutí o velikosti knihovny, ne o kódu.
2. **Dodávat EV jen nejžádanějším rodinám**, seřazeným podle změřené poptávky, a
   u ostatních přiznat, že ji nemají.
3. **Zmenšit zápis.** Rozdílový kodek už běží; další úspora by musela přijít z
   hrubší kvantizace, což ubere přesnost, kterou hráč vidí.

Technicky je turn navíc dražší než river: riverový showdown je porovnání karet
bez rekurze, turnový uzel má pod sebou celou riverovou vrstvu v jiném souboru.

**Než se rozhodne, fáze nezačíná.** Spočítat 11 MB, které se nedodají, je horší
než nespočítat nic.

## Fáze 3 — postflopové řádky knihovny — **na řadě, podmínka splněná**

Řádky `FULL_RING_9|CHIP_EV|FLOP|*`, `TURN|*`, `RIVER|*` sledují
`*ProductionStrategyPack`, ne `*SolvedStrategyPack` (ověřeno 24. 8. v
`mttProductionReadiness.ts`). **97 vyřešených rodin je tedy bráně neviditelných.**

Fáze měla začít měřením, jaký podíl rozdávaných spotů vyřešený obsah pokryje.
**To měření teď existuje** a říká dvě různé věci, které se nesmí slít:

| otázka | měřeno |
|---|---|
| když si hráč situaci připne sám (náhodná deska) | 0,0 % |
| když desku vybírá trenažér z katalogu | **100 % na všech třech ulicích** |
| dotazů na vzor pozic, který obsah drží | 81,4 % |

Z toho plyne, co má fáze udělat: **ne prohlásit řádky za produkční**, ale přestat
tvrdit, že tam není nic. Dnešní „4/64" podceňuje, co produkt umí, a to je
nepravda stejného druhu jako nadsazení - jen opačným směrem.

## Fáze 4 — šířka a hloubka obsahu — **běží sama**

Noc rozhoduje podle měření: `mtt:daily` vydá prioritu, rozklad podle ní ustoupí
monolitické expanzi a po vyprázdnění fronty jí okno vrátí. Za tři noci to dalo
163 nových desek, 28 rodin a posun pokrytí vzorů z 11,3 % na 81,4 %.

Moje práce je dohled a dodání: `mtt:after-night -- --write` po každé noci.

## Průběžně

- Mechanická kontrola po každé noci, aby nový obsah nezůstal na LOW.
- Kontrola, že každý řádek manifestu jde postavit.
- ~~104 typových chyb ve `scripts/`~~ - **změřeno 24. 8.: 0.** Hotovo.

## Co zůstane nedokončené a čeká na majitele

1. **Six-max charty** - 16 řádků knihovny.
2. **ICM data** - 32 řádků.
3. **Stroj s 48+ GB RAM** - 51 desek s blendem.
4. **Čtení hráči** - mechanická kontrola chytá hrubé rozbití, ne kvalitu hry.
   Dnes stojí na měření **67 packů a na čtení člověkem 0**.
5. **Strop líného obsahu** - viz fáze 2. Bez rozhodnutí se EV na turn a flop
   dodat nedá.
