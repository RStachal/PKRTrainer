# Plán dokončení MTT části

> **Přeuspořádáno 25. 8. 2026.** Fáze níž popisují, jak dodělat *obsah*. Měření
> z 25. 8. ale ukázalo, že úzké hrdlo není obsah, ale **doručení**: vyřešená
> odpověď se z velké části nedostane hráči na obrazovku. Fáze 0 je proto nová a
> má přednost před vším ostatním, včetně fáze 4, která běží sama.
>
> Zdůvodnění a čísla jsou ve `MTT_ORCHESTRATOR.md`, vrstva 0.

## Fáze 0 — doručení k hráči — **uzavřeno 26. 8. 2026**

Stav k 26. 8. 2026 večer, celý `npm run mtt:post-answer`:

| co | stav |
|---|---|
| akce v matici | dodáno na všech třech ulicích |
| blafovací lajna | dodáno; **0 zamlčených z 900** spotů, kde ji obsah má |
| EV river | **89,7 %** rozdaných riverových spotů, 47/47 rodin |
| EV turn | **dodáno 10. 9. 2026: 49,0 %** rozdaných turnových spotů, 48/48 rodin (body 231, 236). Rozhodnutí z 26. 8. padlo: pokrytí nebylo 3,9 %, ale sedminásobek |
| EV flop | **nedodává se**, a je to změřené (bod 218): ocenitelných je 15,0 % turnových karet a žádná ze 751 desek nemá ani čtvrtinu |
| EV preflop | **33,1 %**; zbytek není práce v kódu, ale chybějící export (bod 136) |

Fáze je tím uzavřená v tom smyslu, v jakém uzavřít jde: co šlo doručit, doručeno
je; co doručit nejde, je změřené a rozhodnuté; a jediná otevřená položka čeká na
obsah zvenčí, ne na práci.

> **Doplněno 11. 9. 2026.** Turnová EV se mezitím dodala a tím se ukázalo,
> že doručení má ještě jedno patro: z toho, co je nad prahem a tedy
> dodatelné, **zahodí čtvrtinu rozpočet modulu** (bod 236). Majitel téhož
> dne rozhodl zvednout strop modulu i součtu a zároveň poznamenal, že při
> dalším narážení přijde na řadu silnější stroj - a že se časem chystá
> **cash game a SNG**, tedy další násobky celé knihovny. Stropy jsou dnes
> kalibrované na jedinou variantu.

Původní stav po opravě z 25. 8. 2026:

| | před | po |
|---|---|---|
| tříd ze 169 s akcí (medián) | 0 | **50 / 40 / 34** (flop / turn / river) |
| vysvětlení jmenuje blafy | 41 / 29 / 30 % | **71 / 78 / 70 %**, skutečnými třídami |
| riverová EV doručuje | 3 packy, 896 pravidel | **17 packů, 4 906 pravidel** |
| riverová EV u hráče | 0,0 % | **31,7 %** |

**Dopočítáno 26. 8. 2026.** Zbývalo 30 riverových rodin bez tabulky EV; majitel
rozhodnutí o rozpočtu předal, tak padlo takhle:

| | před | po |
|---|---|---|
| rodin s EV | 17 ze 47 | **47 ze 47** |
| pravidel s EV | 4 908 | **13 487** |
| EV u hráče (rozdané rivery) | 30,0 % | **89,7 %** |
| líná knihovna raw | 44,07 MB | 52,27 MB (strop 44 -> 53) |
| líná knihovna gzip | 4,41 MB | 6,18 MB (strop 8, beze změny) |

Stálo to 8,2 MB syrové knihovny a **nula nového solvu** - `mtt:river-pack
--family=X --write --ev` čte hotový strom, 58 vteřin na rodinu. Zvedal se jen
součtový strop, tedy číslo o velikosti celé knihovny, kterou nikdo nestahuje
najednou; stropy, které platí hráč, zůstaly (74 KiB gzipu na tabulku ze 128).

Zbytek do stovky **není chybějící práce, ale platné rozhodnutí z fáze 2b**:
u rodin, kde by úplná EV přerostla 128 KiB gzipu na chunk, se ořezávají méně
dosahované rivery. U nejhorší z nich to je 102 pravidel z 224.

**Linkový režim** (flop→turn→river v jedné ruce) přednačtení EV **dostal
26. 8. 2026**, ale změřený dopad je malý a je fér říct proč:

| | bez přednačtení | s ním |
|---|---|---|
| riverových kroků linky | 80 | 80 |
| z toho vyřešených | 1,3 % | 1,3 % |
| z toho s EV | 0,0 % | **1,3 %** |

EV se ukáže **všude, kde vyřešený obsah je** - ta dvě čísla sedí na sebe
přesně. Strop je jinde: riverový uzel linky je vyřešený jen v 1,3 % případů.
Vyřešená riverová karta se vybere v 8 z 80 linek a z těch osmi sedne uzel
jednou. Není to vada načasování, ale **množství riverového obsahu** - 657
vrstev proti 130 tisícům turnových podher. Na tom pracuje noc.

### Původní zadání fáze, pro pořádek

Změřeno `npm run mtt:post-answer` na spotech rozdaných z katalogu:

**Diagnóza z 25. 8. 2026.** Ponechána jako záznam o tom, jak se vada našla;
dnešní čísla jsou v deníku (body 130-136) a v „Pořadí prací" orchestrátoru.

| co hráč po odpovědi nevidí | dojde (25. 8.) | příčina | kde se opravuje |
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
| $EV / ICM | 32 | **ne data - model.** Změřeno 26. 8. 2026, viz níž | majitel vlastní 116 ověřených ICM mřížek, ale knihovna nemá kam zapsat, proti komu range platí |
| blend 51 desek | — | stroj s 48+ GB RAM | commit 25,9 GB proti ~20 GB použitelné paměti; hardwarová odpověď, ne plánovací |

Tvrdit, že to dokončím, by znamenalo buď odvodit data, která brána odmítá, nebo
prohlásit za pokryté něco, co pokryté není. Ani jedno neudělám.

**Co dokončit můžu, je full-ring 9 chipEV**, tedy 16 z těch 64 řádků, a k tomu
funkce, které na datech nezávisí.

## Co ukázal vlastníkův korpus ranží — **ICM blokuje model, ne data**

Majitel potvrdil, že materiály vlastní, tak jsem je zpracoval. Čtou se
prokazatelně: každá stránka nese mřížku i legendu s počty kombinací, takže se
extrakce ověří sama proti sobě. **Ověřeno 395 z 536 mřížek, z toho 116 ICM.**

Import přesto nevzniká, a důvod je věcný:

| | |
|---|---|
| buněk (sedačka × kbelík × kontext), které korpus zasáhne | **21 ze 702** |
| řádků intake scaffoldu k vyplnění | 4 171 ze 118 638 na pack |
| buněk, do kterých padá víc stran | 16 |
| **z toho s rozpornou odpovědí** | **15** |

U buňky `BB|50|VS_OPEN` se pět stran neshodne u **62 tříd ze 169**. Není to
chyba zdroje: ten rozlišuje, **proti které sedačce** a v jaké ICM situaci range
platí. Knihovna to nerozlišuje - `VS_OPEN` je jeden kontext bez ohledu na to,
kdo otevřel. Je to tentýž nesoulad, který deník popisuje v bodě 62 („rozdíl
proti nezávislému zdroji je u BB 16,3 až 37,7 bodu"), jen teď změřený zevnitř.

Sloučit ty odpovědi by znamenalo **vydat průměr, který nikdo nespočítal**, a
označit ho za měřený zdroj. To je přesně ta třída nepravdy, které se produkt
brání jinde.

**Z toho plyne, co ICM doopravdy blokuje:** ne chybějící data, ale chybějící
rozměr v preflop modelu. Které to jsou, se dá **změřit**, a změřené to je -
zkusily se čtyři klíče vedle sebe:

| klíč | buněk | sdílených | rozporných |
|---|---|---|---|
| dnešní `(sedačka, kbelík, kontext)` | 21 | 16 | **15** |
| + sedačka soupeře | 38 | 8 | 8 |
| + sedačka **i hloubka** soupeře | 39 | 8 | 8 |
| **+ sedačka soupeře a sada** | **49** | **0** | **0** |

Čte se z toho trojí:

1. **Sedačka soupeře je nutná** - sama odstraní polovinu rozporů. Postflop ji
   nese už dnes (`SRP_CO_VS_BB`), takže je to srovnání nesrovnalosti, ne nový
   pojem.
2. **Hloubka soupeře nutná není.** Přidá jednu buňku a nula rozporů, takže by
   to byl rozměr navíc bez užitku.
3. **Sada rozhodne o zbytku.** U ICM je to rozložení stacků u celého stolu
   (`ICM3` proti `ICM5` proti `ICM7`), a právě to dělá z ICM ICM. Dvě stránky se
   stejným hrdinou i soupeřem dávají jinou odpověď, protože stůl je jinak
   rozdaný - a to je věcně správně, ne chyba zdroje.

Se `vsSeat` a `scenarioId` je rozporů **nula** a korpus se dá dodat, aniž by se
cokoli slévalo.

**Co to ale neznamená:** 49 buněk ze 702 pořád není úplná mřížka a produkční
brána žádá úplnost. Cesta tedy není „dodat ICM slot jako produkční", ale dodat
ten obsah **jako vrstvu, která odpovídá jen tam, kde ví, a jinde se přizná** -
tedy přesně tak, jak dnes funguje vyřešený postflop. Ten model už v produktu
je a osvědčil se.

Nástroj zůstává hotový a měří to znovu kdykoli:
`npm run mtt:rye-corpus -- --source=... [--vocab|--coverage]`.

### Stav k 17. 9. 2026: sedačka soupeře je dodaná, sada ne

První z těch dvou os je v produktu: `RangeKey.vsSeat` (bod 253, 16. 9.),
spot jmenuje otvírače a losuje jen mezi sedačkami, o kterých knihovna něco
tvrdí, matice po odpovědi ukazuje range proti němu (bod 255). Vlastník přečetl
draft RYE třikrát (9., 15. a 17. 9.) a po třetím čtení sedí **110 ze 118**
mřížek; v produkčním packu je **61 z nich jako zpřesněné záznamy** ve všech
čtyřech chipEV profilech (bod 256; ante ON a turbo rozhodnutím o reuse, bod
255).

Co z toho dojde k hráči, změřeno `npm run mtt:refined-delivery` (4 000 spotů
na kontext a profil, nad produkčními packy):

| kontext | rozdaných spotů se zpřesněnou odpovědí | buněk |
|---|---|---|
| VS_OPEN | **30,4 %** | 26 |
| SQUEEZE | 2,4 % | 2 |
| VS_3BET | 0 % (všech 17 schválených je ICM) | 0 |

**A jedna oprava, která patří sem, protože mění, co „doručeno" znamená
(bod 257, 17. 9. 2026 večer):** produkční preflop packy byly od 16. 7. snímek
legacy dat. Sada, `mtt:post-answer` i všechny brány měřily legacy pack; hráč
dostával produkční. Opravy z tvých chartů z 30. 7. az 7. 8. (re-jam, calling
range, BB proti limpu, push/fold na baseline) tak dva měsíce k hráči nedošly -
rozdíl 2 971 tříd v ante OFF. Přestagováno, `mtt:preflop-drift` ve
`verify:block` hlídá, že se to nestane znovu. Cenou je, že 29 rodin na 25 bb
je solvených ze snímku (BB proti otevření o 94 tříd jinak) - přesolvení je
rozhodnutí vlastníka (rozhodnutí 10).

Druhá osa - **sada, tedy scénář ICM** - dodaná není a je to ta, na které
stojí 40 schválených ICM mřížek: v chipEV packu nemají co dělat (bod 253,
`icm`) a $EV pack, který by je nesl, potřebuje scénář v klíči.
`RangeRefinement.stackSetupId` v `getRangeRecord` už existuje, žádný pack ho
nenese. Bez něj by se v 6 buňkách sráželo po 2 az 4 ICM mřížkách (bod 256).
Je to rozhodnutí o rozsahu, ne import - a je na majiteli.

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

## Fáze 5 — EV a cena rozhodnutí — **na preflopu dodáno, ověřeno 4. 9. 2026**

Majitel to označil za největší úkol a formuloval ho přesně: *„víc odpovědí může
mít téměř stejnou EV, a podle situace a soupeře se může vyplatit jiná akce -
klidně nechat víc akcí pro danou situaci, jen je musíme správně ohodnotit."*

### Co je dnes

| | pokrytí poolu (78 585 spotů) |
|---|---|
| přesná EV (akce má pevnou cenu, tedy all-in) | **33,1 %** |
| EV z dodaného exportu (`SOLVER`) | **0 %** - v packech je `actionEvs` nula |
| frekvence ze zdroje | v draftu 578 rukou s mixem, 92 s nerovným poměrem |

### Co v materiálech je a co ne

Změřeno 28. 8. 2026 nad vlastníkovým archivem: kurzy a poznámky (`PKR-EVRT`
1,8 GB, GTO Wizard a spol.) jsou z 99,9 % obrázky a próza. Strojově čitelný je
RYE korpus a ICM stránky - a ty nesou **frekvence, ne EV** (3 008 vážených buněk
na 250 stranách: 86 % 50/50, 431 s nerovným poměrem).

**Závěr: EV se z vlastněných materiálů vytáhnout nedá.** Buď ji spočítáme, nebo
musí přijít export, který ji nese.

### Návrh: tři druhy čísla, každé označené tím, co tvrdí

Klíč je nemíchat je. Produkt na tom stojí jinde a tady to platí dvojnásob.

1. **EV** - jen tam, kde je cena akce pevná (all-in). Přesná aritmetika nad
   tabulkou ekvit. Dnes 33,1 %.
2. **Cena akce** - kolik musí akce vydělat, aby se zaplatila. U dorovnání
   požadovaná ekvita z pot odds, u zvýšení požadované složení soupeře. Je to
   **požadavek, ne hodnota**, a nesmí se jmenovat EV. Počítá se z velikostí,
   které produkt učí, nebo z přiznaných násobků - stejně jako se dnes počítá
   cena pěti-betu.
3. **Frekvence ze zdroje** - jak často zdroj kterou akci hraje. Není to EV a
   nesmí se za ni vydávat; je to popis strategie.

**Kolik by to pokrylo:** nabízí dorovnání 63,0 % spotů, zvýšení 78,1 %, složení
97,6 % (základna nula) - **aspoň jedna cenitelná akce v 96,1 %**. Proti dnešním
33,1 % s přesnou EV.

### Proč zrovna takhle a ne modelováním

Spočítat EV dorovnání mimo all-in znamená modelovat, co se stane po flopu -
realizaci ekvity, sizing, dovednost soupeře. Vyšlo by číslo, které vypadá stejně
autoritativně jako to přesné, a hráč by je nerozeznal. Panel ceny rozhodnutí to
už jednou zapsal: *„made-up size produces a made-up requirement that reads
exactly as authoritative as a real one."* Návrh tuhle hranici drží.

**A přesně tenhle rám odpovídá majitelově námitce:** požadovaná ekvita a
požadované složení jsou místa, kde typ soupeře doopravdy vstupuje do výpočtu -
call station snižuje fold equity, nit ji zvyšuje. Produkt už soupeře modeluje
jako jedno číslo (`opponentStyle`), takže se to nikam nedolepuje.

### Ověřeno, že to není jen další číslo na obrazovce

Než se práh pustí na obrazovku, musí se vědět, jestli něco vysvětluje.
`npm run mtt:price-signal` porovnal na celém `VS_OPEN` poolu (11 154 spotů)
„ekvita ruky je nad prahem" proti tomu, co strategie doopravdy radí:

| hloubka | souhlas |
|---|---|
| 15-20 BB | 61-63 % |
| 25 BB | 72,5 % |
| 30-40 BB | **81-83 %** |
| 50 BB a výš | 76,3 % |
| **celkem** | **74,4 %** |

Tři ze čtyř spotů tedy práh vysvětluje. To je dost na to, aby byl užitečný, a
zároveň **málo na to, aby se směl číst jako doporučení** - v každém čtvrtém
spotu by lhal. Přesně proto se jmenuje cena, ne rada.

A ta čtvrtina je pedagogicky to nejcennější: ruce s dost ekvitou, které se přesto
skládají (mimo pozici se z ní realizuje míň), a ruce pod prahem, které se hrají
pro implied odds. Rozdíl mezi cenou teď a hodnotou celé ruky je přesně ta věc,
kterou se hráč má naučit.

Měřeno s přiznaným zjednodušením: otevírací range se bere z lojacku, stejně jako
při dnešním počítání ceny re-jamu, protože spot neví, kdo otevřel (bod 140).

### Co k tomu chybí a co je hotové

Hotové je jádro: `decisionMaths` umí `callRequirement` (včetně ICM bubble
factoru), `shoveRequirement` i minimální obrannou frekvenci. Chybí to použít
mimo all-in spoty a zobrazit - a rozhodnout, jak to má vypadat vedle EV, aby se
ty dva druhy čísla nespletly.

### Stav k 4. 9. 2026: na preflopu je to dodané, návrh je překonaný

Odstavec nad tímhle popisuje stav k 28. 8. a **od té doby přestal platit**;
zůstává tu proto, aby bylo vidět, z čeho se vycházelo. Změřeno
`npm run mtt:post-answer` uvnitř `verify:block`, celý pool 78 585 spotů přes
devět kontextů:

| | 28. 8. (návrh) | 4. 9. (změřeno) |
|---|---|---|
| přesná EV | 33,1 % | **33,1 %** |
| cena akce | cíl „aspoň jedna cenitelná akce v 96,1 %" | **100,0 %** |
| vysvětlení | — | **100,0 %** |

Dvě věci, které z toho plynou a nejsou samozřejmé:

1. **Cíl 96,1 % je překonaný**, cena dojde ke hráči u **každého** rozdaného
   preflopového spotu. Otázka „dostane hráč po odpovědi číslo, které něco
   tvrdí" je tedy na preflopu zodpovězená.
2. **EV se nikam nerozlila**: zůstává na 33,1 % a `odkud EV je: ALL_IN_EQUITY
   26026`, tedy výhradně tam, kde je cena akce pevná. To je přesně ta hranice,
   kterou návrh drží - EV se nedopočítává modelem, aby se nevyrobilo číslo,
   které vypadá stejně autoritativně jako to přesné.

**~~Co zůstává nezměřené:~~ změřeno 6. 9. 2026, tenhle odstavec byl zastaralý.**
Stálo tu, že „postflopová sekce `mtt:post-answer` tenhle sloupec nemá, takže se
to z dnešního výpisu nedá tvrdit ani vyvrátit". Sloupec má: `measurePostAnswerFeedback.mts`
počítá `priced` i `priceGaps` z `postflopPriceGap()` a hlídá to podlahou
**flop 20 %, turn 30 %, river 45 %** plus přísnou nulu na `CHYBÍ_SÁZKA`
a `CHYBÍ_POT`. Změřené hodnoty: **flop 25,0 %, turn 36,3 %, river 51,7 %**.

Nalezeno 13. 10. 2026 při otázce vlastníka na flopovou EV. Měření leželo
**v komentáři** `src/core/postflopDecisionPrice.ts` od 6. 9., tedy pět týdnů,
a tenhle odstavec vedle něj dál tvrdil opak - a protože plán se čte jako zadání,
z vyvráceného tvrzení se stávala premisa. Je to tentýž vzorec jako u bodu 139:
**když měření vyvrátí dřívější tvrzení, musí se grepnout každá jeho kopie**, ne
jen to místo, kde se právě měřilo.

**Co na postflopu zůstává prázdné a proč:** cena **vlastní sázky hrdiny**.
Rozpad říká, že 75 % flopových spotů je `NEČELÍ_SÁZCE` - hrdina jedná první.
Důvod zapsaný 28. 8. byl „velikost je model (třetina a tři čtvrtiny), ne
solverovo číslo". **U vyřešených rodin ten předpoklad neplatí** - velikost je ve
stromě (`ip bet 25,50`, `oop bet 50`) ~~a pohled ji odtud bere, přes
`solvedSizing()` a `postflopBetSizing.generated.ts`, kde model slouží už jen
jako záloha~~.

**Opraveno 15. 10. 2026 - pohled ji bere jen u flopových pilotů.** Tabulka
velikostí se klíčuje rodinou z **pilotního** id pravidla (`mtt9_…_srp-…`),
které `familyIdFromRuleId` rozdělí na pomlčce. Vyřešená turnová a riverová
pravidla mají id `RODINA__deska`, rodina se z nich nevyčte, a tlačítko i banka
u nich jedou na modelu 0,33 / 0,75. Zjištěno, když test velikostí nad
skutečnými linkami nenašel ani jeden případ. Tabulku na turn a river přenést
nejde - je změřená na flopu a turnové stromy mají jiné velikosti (v parametrech
`oop,turn,bet,50`, `ip,turn,bet,50`). Skutečná velikost tam musí přijít z akcí
samotného pravidla (pack nese `BET 182.000000` v žetonech proti `potChips`),
a to je samostatný krok přes resolvery tří ulic.

**Hotovo 15. 10. 2026:** tlačítko a simulátor linky čtou velikost z jednoho
místa (`src/data/ranges/solvedBetSizing.ts`), takže „Bank po akci" sedí
s tlačítkem všude. Na flopových pilotech je to velikost ze stromu (všechny čtyři
varianty 0,25 / 0,33 / 0,5 / 0,75, jak vlastník rozhodl), ~~na vyřešeném turnu
a riveru zatím shodně model~~.

**A týž den i na vyřešených pravidlech.** Na modelu nejel jen turn a river, ale
i **vyřešený flop** z rozkladu - má tentýž tvar id `RODINA__deska`. Resolvery
všech tří ulic teď nesou velikost z akcí samotného uzlu (`heroBetSizes`,
spočítané `ruleBetSizes` proti potu a stacku uzlu; shove se pozná podle
stacku). Měřeno `mtt:post-answer` na spotech s tlačítkem sázky: velikost od
solveru aspoň na jednom tlačítku **z 0,0 % na 100 %** na všech třech ulicích,
na všech tlačítkách flop 78,5 %, turn 100 %, river 61,5 %. Zbytek jsou uzly,
které malou sázku nemají - malé tlačítko tam jede poctivě na modelu, a jestli
ho tam vůbec nabízet, je otázka slovníku tlačítek. Hlídají to dna v bráně.
Zbývá **cena vlastní sázky hrdiny**: velikost od solveru už má, cena se z ní
zatím nepočítá.

**Opravený ale nezůstal simulátor linky.** `betSizeBB()`
(`postflopLineSimulator.ts:958`) tentýž řetězec nemá a 0,33 / 0,75 používá
bezpodmínečně - a jeho výsledek se hráči ukazuje jako „Bank po akci" na
`postflopView.ts:699`. Změřeno 13. 10. 2026 na všech 76 rodinách tabulky:
`BET_SMALL` má velikost ve stromě u 20 rodin a **s modelem se rozchází u 17
(85,0 %)**, `BET_BIG` u 63 rodin a **u všech 63 (100 %)**, protože ve stromě je
vždy 0,50 a nikdy 0,75. Hráč tedy u 63 rodin vidí na tlačítku půlpotovou sázku
a pod ní banku ze tří čtvrtin. Není to chybějící číslo, jsou to **dvě čísla,
která si odporují** - tedy právě to, čemu se princip „jedno prázdné místo je
lepší než dvě čísla, ze kterých jedno tiše lže" měl vyhnout. Obsah to nekazí:
simulátor SPR nepočítá, takže si tím nevybírá jiné pravidlo.

Zadáno vlastníkovi v `Agents/decisions/flopova-cena-2026-10-13.md`.

## Fáze 2 — EV pro turn a flop — **uzavřeno 26. 8. 2026: nedodávat**

**Blokátor není velikost, jak se tu psalo, ale to, že ta čísla neexistují.**
Odhad níž („11,2 + 3,4 MB") předpokládá, že EV je spočítaná a jde jen zapsat.
Není. Změřeno 26. 8. 2026:

| | |
|---|---|
| výskytů klíče `"ev` ve 12 dumpech solveru | **0** |
| turnových podher, na které knihovna odpovídá | 15 008 |
| z toho s riverovou vrstvou (bez ní EV nejde spočítat) | **778 = 5,2 %** (27. 8.) |
| tempo výroby vrstev | 80,1 za den v průměru; 207 za jednu soustředěnou noc |
| kolik nocí by trval zbytek | **69 až 178**, a noc by nedělala nic jiného |

Riverová EV se dopočítá proto, že po páté kartě je to showdown bez rekurze.
Turnový uzel má pod sebou celou riverovou vrstvu - a ta pro 96,1 % podher
neexistuje.

**Rozhodnutí: nedodávat.** Odhad by byl jiné tvrzení než „EV ze solveru" a
produkt stojí na tom, že tyhle dvě věci nesplývají. Dodat 3,9 % za cenu
přepsání celého výpočtu je špatný poměr. Změnil by to solver, který
counterfactual values vypisuje; pak je to práce, ne výzkum.

Původní rozvaha, která tu stála, zůstává níž - je pořád platná pro tu část
otázky, která je o velikosti.

## Fáze 2 (původní zadání) — proč se zdálo, že jde o megabajty

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

### Co se z toho rozhodlo, a co z toho zbývá (13. 10. 2026)

Vlastník zvolil **možnost 1** a strop se zvedl potřetí: gzip 12 288 → 13 312,
raw 84 992 → 92 160. Zvedly se oba, protože raw by při změřeném tempu
124 KiB za noc narazil za **osm nocí**, kdežto gzip za 68 - zvednout jen jeden
by znamenalo tutéž otázku znovu o týden později.

Možnost 2 jsem **nedoporučil a je to změřené**: tabulky EV drží 75 % líné
knihovny (turn 5 247 KiB, river 4 044 z 12 333), ale rozdávají se - `mtt:post-answer`
hlásí EV akcí u **72 % turnů a 89,7 % riverů** a nula nevyřešených spotů. Ubrat
je tedy neznamená uklidit mrtvý obsah, ale vzít hráči oceněné spoty.

**Zbývá to podstatné, a vlastník to zadal slovy „do budoucna musíme vyřešit
nějak systémově":**

> Tenhle strop měří **jednu variantu** - full ring 9, regular, chipEV. Druhá
> varianta (cash game, SNG, six-max v produkci) ho nepřeteče o kilobajty;
> přinese druhou takhle velkou knihovnu. Pak už nepůjde o konstantu, ale o model:
> líná knihovna se musí dělit **po variantách** a hráč stahovat jen tu svou.

Dokud to platí jako dnes, každá nová varianta si vyžádá další zvednutí stropu -
a to je ta past, kterou strop sám má odhalovat, ne kterou má krmit. Rozhodnutí,
kdy se do toho modelu pustit, je rozpočtové: dnešní noc dodává obsah jedné
varianty a fronta je na dvě noci, takže to není na dnes - ale je to na dřív než
na chvíli, kdy druhá varianta začne vznikat.

**Než se rozhodne, fáze nezačíná.** Spočítat 11 MB, které se nedodají, je horší
než nespočítat nic.

### Data přes typový systém - změřeno 14. 10. 2026, a je to ta hlavní brzda

Vlastník 14. 10.: „přemýšlejme o refaktoru, aby aplikace postupným rozvojem
nebyla pomalejší a pomalejší". Než se navrhlo cokoli, změřilo se, co roste.

**Velikost dat to není** - v gitu za dva týdny 82,6 -> 83,4 MB (240 -> 267
JSONů). Build je 7 az 17 s a neroste. Testy skáčou mezi 6 a 25 minutami podle
toho, co běží vedle, ne podle růstu.

**Je to typecheck.** `tsconfig.json` má `resolveJsonModule: true` a data se
načítají 267 dynamickými `import("./x.json")`, takže TypeScript odvozuje typy
pro **všech 81 MB** JSONu. Změřeno `tsc --extendedDiagnostics`, tentýž strom
s vypnutým `resolveJsonModule` pro srovnání:

| | dnes | bez typování JSONu |
|---|---|---|
| paměť | **6,37 GB** | **0,52 GB** |
| čas celkem | **38,8 s** | **4,5 s** |
| parse | 9,3 s | 0,5 s |
| check | 25,4 s | 2,8 s |

**92 % paměti a 88 % času** typecheckeru padá na data, ne na 147 tisíc řádků
kódu. A roste to lineárně s každou rodinou a každou variantou: haldu jsme už
dvakrát zvedali (dnes 8 GB pro typecheck, 12 GB pro build) a druhá varianta by
přes ni přetekla - tedy přesně „každým rozvojem pomalejší", jen v čase vývoje,
ne u hráče.

~~U hráče je to podobné o patro jinde: ty JSONy se balí jako **JS moduly**
(turnová EV jedné rodiny až 1 047 kB), takže je telefon parsuje jako kód.~~
**Vyvráceno týž večer, a napsal jsem to vlastníkovi dřív, než jsem to ověřil.**
`vite.config.ts` má `json: { stringify: true }` (deník 275, kvůli paměti buildu)
a skutečný chunk začíná `const l=JSON.parse('{…')` - telefon tedy data **už**
parsuje rychlou cestou `JSON.parse`. Formát doručení u hráče problém není.

Co platí: rychlost u hráče dnes **neměří žádná vrstva** orchestrace - vrstva 0
měří, co dojde, ne za jak dlouho. Jaký je skutečný čas od „Next spot" po spot na
telefonu, nikdo neví.

**Postup, a v tomhle pořadí:**

1. **Měřit dřív, než se mění.** Do brány strop na paměť a čas typecheckeru
   (dnešní hodnota s rezervou, aby růst spadl hned), a do Chrome e2e čas od
   „Next spot" po vykreslený spot - za studena (první spot rodiny, stahuje se
   chunk) i za tepla, se zpomaleným CPU a sítí jako na telefonu. Bez toho se
   „nebude pomalejší" nedá hlídat, a to je na tomhle projektu ta lekce pořád
   dokola.
2. **TypeScriptu data nedávat - a Vite nechat, jak je. HOTOVO 15. 10. 2026.**
   Typecheck aplikace **6,37 GB -> 0,50 GB, 38,8 -> 4,6 s**, řádků JSONu 0;
   instalační cesta a líná knihovna beze změny. Strop 1,5 GB hlídá
   `scripts/checkTypecheckBudget.mts` uvnitř `typecheck` i `build`, ověřený
   vynuceným pádem (40 tabulek postaru = 1,62 GB). Čtení i zápis manifestů
   v jednom modulu `scripts/lib/manifestEntries.mts`. Deklarace pro `*?raw`
   přidávat nebylo potřeba - `src/vite-env.d.ts` odkazuje na `vite/client`;
   jen `tsconfig.scripts.json` ten soubor do `include` neměl (268x TS2307).

   ~~Data jako JSON assety přes `fetch`~~ - to byl zbytečně velký zásah, když se
   ukázalo, že runtime problém nemá. Doměřeno týž večer:
   - Všech **267 importů JSONu je v pěti generovaných manifestech**
     (`flopSolvedManifest`, `turnSolvedManifest`, `turnEvManifest`,
     `riverSolvedManifest`, `riverEvManifest`). Sonda s vypnutým
     `resolveJsonModule` dala 267 chyb a **všechny tam** - nic jiného v kódu
     na odvozených typech dat nezávisí.
   - A manifesty ty typy hned zahazují: `module.default as unknown as
     TurnEvPack`. TypeScript tedy počítá 6 GB typů, které **nikdo nepoužije**.
   - Zástupná deklarace `declare module "*.json"` relativní importy nepřebije
     (TS2732 zůstává), takže to nejde jen konfigurací.

   Postup: generátory manifestů emitují `import("./x.json?raw")` a
   `JSON.parse(module.default)`; ~~k tomu jednořádková deklarace pro `*?raw`
   (`vite/client` v `types` není)~~ (nebyla potřeba, viz výš). U hráče to dělá tutéž práci jako dnešní
   `json.stringify` - `JSON.parse` jednoho řetězce - takže runtime se nezmění.
   **Rizika, která se musí ověřit před nasazením:** `manualChunks` jmenuje
   chunky přes `mttProductionChunkNameForModuleId(id)` a s `?raw` se id změní
   (rozpočet knihovny podle jmen počítá); a každý `load()` by JSON parsoval
   znovu, takže je potřeba ověřit, že loadery drží slib v mezipaměti.
   Očekávaný zisk podle sondy: typecheck **6,37 GB -> ~0,5 GB, 38,8 -> 5 az 8 s**.

   **Obě rizika přečtená týž večer, před implementací:**
   - **Pojmenování chunků sklaplo by počtvrté.** `mttProductionChunkNameForModuleId`
     (`src/pwa/precacheManifestBuild.ts`) testuje `fileName.endsWith(".generated.json")`
     a s `?raw` v id by končil na `.json?raw`. Funkce by vrátila `null`, chunk by
     dostal jméno podle souboru a precache by ho vzal za nutný - komentář u ní tu
     past popisuje třikrát (instalační cesta 362 kB -> 4,4 MB, pak 386 KiB ->
     20,7 MB). Oprava: z id odříznout dotaz dřív, než se testuje, a test na id
     s `?raw`. Strop instalační cesty v `bundle:budget` by to chytil, ale má to
     být ošetřené předem, ne spoléhat na pád.
   - **Dvojí parsování nehrozí.** Všech pět spotřebitelů (`turnEvRuntime`,
     `riverEvRuntime`, `turn/river/flopSolvedStrategyPacks`) drží načtené balíky
     v mapách a volá `entry.load()` jednou na balík.

   **Kde se to mění - v generátorech, ne v manifestech**, protože ranní cyklus
   je pouští každé ráno a ruční úpravu by přepsal: `buildFlopStrategyPacks.mts`,
   `buildTurnStrategyPacks.mts`, `buildTurnEvPacks.mts` (a `measureFullTurnEvBuild.mts`,
   který zapisuje tentýž manifest), `buildRiverStrategyPacks.mts` (oba riverové).

   **Hotovo, až:** typecheck pod strop z bodu 1, `bundle:budget` s instalační
   cestou beze změny (~397 KiB) a líná knihovna beze změny (12 343 KiB gzip),
   e2e zelené včetně offline a rollbacku service workeru, a ranní cyklus jednou
   proběhne s novými generátory.
3. **Dělit knihovnu po variantách** (odstavec výš) - nutné dřív, než začne
   vznikat druhá varianta.

EV tabulky se zmenšovat nebudou: už jsou kvantované (celá čísla v setinách BB
a bitová maska kombinací v base64), takže by to dalo málo.

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
| když si hráč situaci připne sám (náhodná deska) | **flop 18,8 %**, turn a river 0,0 % |
| když desku vybírá trenažér z katalogu | **100 % na všech třech ulicích** |
| dotazů na vzor pozic, který obsah drží | 81,4 % |

Z toho plyne, co má fáze udělat: **ne prohlásit řádky za produkční**, ale přestat
tvrdit, že tam není nic. Dnešní „4/64" podceňuje, co produkt umí, a to je
nepravda stejného druhu jako nadsazení - jen opačným směrem.

## Fáze 4 — šířka a hloubka obsahu — **běží sama**

Noc rozhoduje podle měření: `mtt:daily` vydá prioritu, rozklad podle ní ustoupí
monolitické expanzi a po vyprázdnění fronty jí okno vrátí. Za tři noci to dalo
163 nových desek, 28 rodin a posun pokrytí vzorů z 11,3 % na 81,4 %.

Moje práce je dohled a dodání. Ověřeno v Plánovači úloh 17. 9. 2026: v 07:05
běží `PKRTrainer-After-Night-TurnEv` s `mtt:after-night --write
--streets-if-new=flop --turn-ev-minutes=210` (limit 5 h, log
`artifacts/after-night-turn-ev.log`) - tedy plný cyklus packů, flopová ulice
jen když noc přinesla nové desky, a obnova turnové EV do 210 minut (běhy od
17. 9. logují do `artifacts/turn-ev-run-<k>.log`, počet běhů podle volné paměti,
bod 255). River se v cyklu negeneruje (`--streets-if-new=flop`); ten
spouštím já. Noc: `PKRTrainer-Night-Decomposition` 21:00 a
`PKRTrainer-Night-Expansion` 21:01, obě `--until=07:00`, limit 10,5 h; s
prázdnou frontou expanze skončí hned („není co solvit") a rozklad při
prioritě `NEW_FAMILIES` bez nastagovaných desek neustoupí a jede celou noc
riverové vrstvy podle oceněného prioritního seznamu.

## Průběžně

- Mechanická kontrola po každé noci, aby nový obsah nezůstal na LOW.
- Kontrola, že každý řádek manifestu jde postavit.
- ~~**112 typových chyb ve `scripts/` v 91 souborech**~~ - **uzavřeno, brána
  běží.** Zápis „změřeno 24. 8.: 0, hotovo" byl nepravdivý: to měření pustilo
  `tsc --noEmit`, jenže `tsconfig.json` má `include: ["src", "tests",
  "vite.config.ts"]`, takže `scripts/` nikdy nekontrolovalo. Nula neznamenala
  čisto, znamenala, že se nedívala - tatáž třída chyby jako vrstva 0
  orchestrátoru: **měřilo se něco vedle a výsledek se vydal za odpověď na jinou
  otázku.**

  Plánované pořadí „posbírat, opravit, teprve pak zapnout bránu" proběhlo.
  `npm run typecheck` dnes pouští **dvě konfigurace** - `tsconfig.json` na
  `src` a `tests` proti ES2020 kvůli Android WebView, `tsconfig.scripts.json` na
  `scripts/` proti ES2022, protože skripty běží na Node. Ověřeno 4. 9. 2026:
  obě vracejí 0 a `verify:block` je má jako první bránu. Za těmi chybami
  mimochodem vypadlo šest skutečných vad, ne jen nepořádek - jsou vyjmenované
  v `Agents/AGENTS.md`, pravidlo 2.

## Co zůstane nedokončené a čeká na majitele

1. **Six-max charty** - 16 řádků knihovny.
2. **ICM data** - 32 řádků.
3. **Stroj s 48+ GB RAM** - 51 desek s blendem.
4. **Čtení hráči** - mechanická kontrola chytá hrubé rozbití, ne kvalitu hry.
   Změřeno 4. 9. 2026 v `Agents/turn-review/verdicts.json`: **141 verdiktů,
   z toho lidských 0** - všechny nesou `basis: MECHANICAL` (45 flop, 48 turn,
   48 river). Tady se to nezmění samo a stroj to za majitele udělat nesmí.
   K 17. 9. 2026: draft ranží přečtený celý (110 ze 118 sedí, bod 256),
   lidských verdiktů nad pilotními packy 7 (bod 248, 6 ✗ a 1 ✓).

   **Co pro to je připravené:** `npm run mtt:review-desk` postaví složku
   k nahrání na FTP se třemi dokumenty - chipEV půlka draftu ranží (68 mřížek),
   flopové piloty (7) a celý draft včetně ICM (114). Stránky si pamatují
   odpověď podle identity záznamu, takže se dají vyplňovat postupně; průběh
   ukazuje rozcestník. Odpovědi se pak berou do `mtt:rye-answers`, resp.
   `mtt:pilot-answers`.
5. **Strop líného obsahu** - viz fáze 2. Bez rozhodnutí se EV na turn a flop
   dodat nedá.
