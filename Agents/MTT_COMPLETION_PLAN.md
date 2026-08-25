# Plán dokončení MTT části

> **Přeuspořádáno 25. 8. 2026.** Fáze níž popisují, jak dodělat *obsah*. Měření
> z 25. 8. ale ukázalo, že úzké hrdlo není obsah, ale **doručení**: vyřešená
> odpověď se z velké části nedostane hráči na obrazovku. Fáze 0 je proto nová a
> má přednost před vším ostatním, včetně fáze 4, která běží sama.
>
> Zdůvodnění a čísla jsou ve `MTT_ORCHESTRATOR.md`, vrstva 0.

## Fáze 0 — doručení k hráči — **z velké části dodáno 25. 8. 2026**

Stav po opravě, změřeno `npm run mtt:post-answer`:

| | před | po |
|---|---|---|
| tříd ze 169 s akcí (medián) | 0 | **50 / 40 / 34** (flop / turn / river) |
| vysvětlení jmenuje blafy | 41 / 29 / 30 % | **71 / 78 / 70 %**, skutečnými třídami |
| riverová EV doručuje | 3 packy, 896 pravidel | **17 packů, 4 906 pravidel** |
| riverová EV u hráče | 0,0 % | **31,7 %** |

Co zbývá a proč to nejde udělat potichu: **30 riverových rodin nemá tabulku EV
vůbec.** Dopočet stojí ~12 MB, a v rozpočtu líného obsahu zbývá po zvednutí
stropu na 44 MB zhruba **2,5 MB**.
Je to tedy rozhodnutí o velikosti stahování - stejná otázka jako ve fázi 2, jen
na riveru. Do rozhodnutí se nedopočítává.

Otevřené i to, že **linkový režim** (flop→turn→river v jedné ruce) přednačtení
EV nemá; opravený je zatím jednotlivý riverový dril, tedy ta cesta, na kterou
majitel upozornil.

### Původní zadání fáze, pro pořádek

Změřeno `npm run mtt:post-answer` na spotech rozdaných z katalogu:

| co hráč po odpovědi nevidí | dojde | příčina | kde se opravuje |
|---|---|---|---|
| co dělat s každou kombinací matice | 0 % | `solvedStrategySource` nevyplňuje `rangeBuckets` | `src/data/ranges/solvedStrategySource.ts` |
| blafovací část range | 0 % | matice se barví podle kategorie ruky, ne podle akce | `src/ui/postflopRangeMatrixView.ts` |
| EV jednotlivých akcí | 4,7 % river, 0 % jinde | 30 rodin bez tabulky, **14 se zastaralou** po nočním přegenerování | `riverEvRuntime` + noční cyklus |

Obsah přitom všechno tři **zná**: každé vyřešené pravidlo nese `buckets[]` s
akcí, třídami rukou a frekvenční směsí. Není to práce pro solver, je to práce na
cestě z packu na obrazovku.

Pořadí je dané dopadem: první dva řádky se týkají **všech** rozdaných spotů na
všech třech ulicích a data pro ně už na disku leží. Třetí řádek je dražší,
protože EV se musí dopočítat a vejít do rozpočtu líného obsahu (viz fáze 2).

**Cílový tvar matice je vlastníkův vlastní chart** (`Documents/Private/PKR/
02_Openning ranges`): barva = akce, se čtyřmi stavy a legendou „3 bet for value /
bluff 3 bet / defend / fold". Dnešní paleta z těch chartů vzala barvy, ale ne
osu - obarvila se podle síly ruky místo podle toho, co se s ní dělá.


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

## Fáze 2b — posledních 12 % riverové EV — **uzavřeno měřením: nedělat**

EV se ukáže u **87,7 %** rozdaných riverových spotů. Zbylých 12,3 % má jedinou
příčinu: **663 z 4902 pravidel nemá řádek EV**, protože se soubory ořezaly do
rozpočtu. Váže **gzip, ne raw** - strop je 128 KiB na líný chunk a soubory sedí
na 117.

Byly tři cesty. **Dvě jsem změřil a obě padly:**

| cesta | měření | závěr |
|---|---|---|
| rozdělit na části podle dosahu | řazení podle dosahu získá **2,0 bodu** (86,7 → 88,7 % pokrytého dosahu) | nedělat: hráč by potřeboval část 2 skoro stejně často jako část 1, takže by se neušetřilo nic a přibyla by mechanika v generátoru, manifestu i runtime |
| zmenšit zápis řídkou formou | **154 KiB proti dnešním 118** | nedělat: je to horší. Hodnoty jsou už rozdílové a z 36,7 % nulové, což gzip komprimuje líp než seznam indexů |
| zvednout strop na ~230 KiB | úplná EV by u nejhorší rodiny potřebovala 223 KiB gzip | jediná zbývající cesta |

**Rozhodnutí: nezvedat, zůstat na 87,7 %.** Zbylých 12,3 % by stálo skoro
zdvojnásobení jednoho stažení **všem** hráčům, včetně těch, kdo z rodiny potkají
tři spoty. To je špatný poměr; 87,7 % je dobrý stav, ne nouzový.

Majitel to může přebít - je to rozhodnutí o šířce pásma, ne o kódu. Změna je
pak jednořádková (`BUNDLE_MAX_LAZY_MTT_GZIP_KB`) plus přegenerování EV.

## Fáze 3 — postflopové řádky knihovny — **hotovo 24. 8. 2026**

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
- **112 typových chyb ve `scripts/` v 91 souborech** - otevřené, a zápis „změřeno
  24. 8.: 0, hotovo" byl **nepravdivý**. To měření pustilo `tsc --noEmit`, jenže
  `tsconfig.json` má `include: ["src", "tests", "vite.config.ts"]`, takže
  `scripts/` nikdy nekontrolovalo. Nula neznamenala čisto, znamenala, že se
  nedívala. Přeměřeno 25. 8. 2026 konfigurací, která `scripts` zahrne.

  Je to tatáž třída chyby jako vrstva 0 orchestrátoru: **měřilo se něco vedle a
  výsledek se vydal za odpověď na jinou otázku.** Zapnout `scripts` v tsconfigu
  hned nejde - `npm run typecheck` je součástí `verify:block` i nočního cyklu a
  spadl by. Pořadí je tedy: posbírat chyby, opravit, teprve pak zapnout bránu.

## Co zůstane nedokončené a čeká na majitele

1. **Six-max charty** - 16 řádků knihovny.
2. **ICM data** - 32 řádků.
3. **Stroj s 48+ GB RAM** - 51 desek s blendem.
4. **Čtení hráči** - mechanická kontrola chytá hrubé rozbití, ne kvalitu hry.
   Dnes stojí na měření **67 packů a na čtení člověkem 0**.
5. **Strop líného obsahu** - viz fáze 2. Bez rozhodnutí se EV na turn a flop
   dodat nedá.
