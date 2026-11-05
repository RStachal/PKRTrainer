# Režimy GTO a REAL, 6-max a cash – analýza a plán

Napsáno 4. 11. 2026 na zadání majitele (oddíl 1). Fakta v oddíle 2 jsou z kódu
a dat k HEAD `314418ab` a u každého je soubor, odkud je. Odhady jsou označené
jako odhady. Navazuje na `plan-dokonceni-mtt-2026-11.md` a `ui-redesign-plan.md`.

## 0. Shrnutí

- **REAL nezačíná od nuly.** Aplikace už má model soupeře (4 styly) a v all-in
  spotech počítá EV proti range upravené podle stylu – a protože hodnocení jde
  podle EV všude, kde EV je, volba soupeře už dnes mění správnou odpověď
  u push/fold, rejamu a 5-bet jamu. Chybí: archetypy podle zadání, výpočet pro
  open, 3-bet a call, celý postflop, grafika, volba režimu a osa v profilu
  a statistikách.
- **Algoritmus (odpověď na otázku majitele):** archetyp je **zamčená odchylka
  GTO strategie soupeře** – jeho frekvence se posunou podle síly ruky tak, aby
  seděly jeho statistiky (VPIP, fold na c-bet, podíl blafů…). Doporučená akce
  je **nejlepší odpověď hrdiny (best response) proti takto upravenému soupeři**,
  počítaná na stejném stromu, ze kterého je GTO. Nepotřebuje nový solve pro
  každý typ hráče – a náš solver node-lock stejně nemá.
- **Kde se počítá:** preflop v aplikaci (equity tabulka 169×169 tam už je),
  postflop offline v ranním cyklu ze stromů rozkladu, protože dodávané packy
  nesou strategii hrdiny, ne odpovědi soupeře. Do aplikace jde jako líně
  načítaná vrstva vedle packu – stejně jako frekvence po třídách.
- **6-max:** v1 bez jediné noci – odvozený preflop (dnes náhled) a postflop
  z 9-max rodin tímtéž pravidlem „kolik hráčů je za mnou“. v2 měřený chce
  6-max charty a kolem 440 desek nocí.
- **Cash** jako fáze 2: charty s rakem a hluboké stromy (100 bb, ~2,5 h na
  desku). Na jednom stroji měsíce nocí – chce rozhodnutí o výpočetním výkonu.
- **Odhad:** MTT 1.0 s režimem REAL (preflop, turn, river), grafikou hráčů
  a 6-max v1 je 28–42 pracovních dní agenta od 5. 11., střed odhadu kolem
  23. 12., rezerva do poloviny ledna. Majitel 6–8 h (rozhodnutí, výběr grafiky,
  kalibrace, přejímka). Proti původnímu plánu (20–30 dní od 2. 11.) je to
  posun o 2–3 týdny.
- **Rozhodnutí majitele:** R1–R8 v oddíle 10.

## 1. Zadání

Majitel 4. 11. 2026:

> Abychom náš produkt odlišili od konkurence, chceme mít na začátku dva mody
> před vstupem do trenéru, GTO a REAL. U stolu chci zobrazovat ikony hráčů.
> Pokud bude vybraná volba GTO, bude zde jen název pozice a nějaká vhodná
> ikona, a pokud bude vybrané REAL, zde se budou zobrazovat ikony jako: žralok
> pro profitabilního hráče, hrací kostka pro gamblera, kámen pro nit hráče,
> orel pro lehce profit hráče, velryba pro velmi ztrátového hráče. […] Otázka
> je, jakým algoritmem modifikovat GTO vypočítané range dle jednotlivých typů
> hráčů v režimu REAL. […] Tahle grafika zobrazení hráče by měla být velmi
> propracovaná, aby se uživatelé do hry pořádně vzali. Následně musíme dokončit
> 6 max, aby bylo MTT komplet. A nakonec cash game, ale třeba až ve 2. fázi.

## 2. Co už máme – analýza dosavadního řešení

### 2.1 Model soupeře

`src/core/opponentStyle.ts`: čtyři kvadranty podle VPIP a podílu PFR
(`TIGHT_AGGRESSIVE`, `TIGHT_PASSIVE`, `LOOSE_AGGRESSIVE`, `LOOSE_PASSIVE`)
a osm štítků, které do nich padají (`REG`, `ROCK`, `NIT`, `MANIAC`, `GAMBLER`,
`CALLING_STATION`, `FISH`, `WHALE`). Model nese **jediné číslo**, které se
někde používá: jak často styl folduje proti shove. Dvě hodnoty jsou změřené
(Little, sv. 2: těsné pole volá shove na 10 bb s ~20 %, volné s ~40 %),
zbytek je mezi nimi interpolovaný a je tak označený (`basis`). Ve filtrech je
volba „Soupeř“ s pěti položkami (`src/ui/filters.ts:743`).

### 2.2 Preflop: EV proti stylu už mění hodnocení

- `computeActionEvs` v `src/core/drillEngine.ts:567` počítá EV ze **všech**
  rozhodnutí, kde je cena daná: push/fold a open-shove, call all-inu, rejam přes
  open, 5-bet jam, BvB a squeeze. Equity jde z tabulky třída proti třídě
  169×169 (`src/core/preflopEquity.ts`, načítá se líně), EV shove počítá i se
  všemi hráči za sebou (`shoveEv`).
- Styl soupeře mění **range, kterým se callne** (`styledCallers`,
  `drillEngine.ts:906`): vezme nejsilnější výřez toho, co soupeř může mít, podle
  pořadí síly rukou (`strongestSlice`). Platí pro open-shove, rejam a 5-bet jam;
  call all-inu, BvB a squeeze styl zatím neberou.
- `grade()` v `src/core/scoring.ts:106` hodnotí podle EV, kdykoli spot EV má.
  **Volba soupeře tedy už dnes mění správnou odpověď** v těch třech kontextech.
  U open, 3-betu, callu a izolace EV není a hodnotí se podle chartu (GTO).

### 2.3 Postflop

- Vyřešený obsah: 83 flopových, 55 turnových a 48 riverových rodin, všechny
  9-max (`src/data/ranges/{flop,turn,river}`); frekvence po třídách u 37 rodin
  (`*-mix/`); rozklad v `artifacts/decomposition` má 842 desek.
- EV akcí: river přesně z vyřešené podhry (`riverActionEv`), turn složený přes
  riverové vrstvy (`src/core/turnActionEv.ts`), showdown a equity na turnu
  (`showdownRank.ts`, `turnShowdownEquity.ts`). Tyhle funkce počítají EV
  hrdiny **proti strategii soupeře ve stromu** – a to je přesně to, co REAL
  potřebuje, jen se strategií soupeře upravenou.
- **Dodávané packy strategii soupeře nenesou.** Pravidlo riverového packu má
  akce hrdiny, třídy rukou a frekvence (`buckets`), ne odpovědi soupeře;
  ty jsou jen ve stromech rozkladu mimo aplikaci.
- Soupeř v lince hraje jednu pevnou akci na větev z packu (`opponentPolicy`,
  `src/core/postflopGenerator.ts:295`). Styl soupeře postflop neexistuje.

### 2.4 Stůl a GUI

- Nové GUI je od 4. 11. jediné (deník 340). Stůl `src/ui/kit/pokerTable.ts`
  kreslí sedadla jako štítky s pozicí, stackem a odznakem akce; rozmístění
  (kdo složil, kdo hraje) je v `src/ui/tableModel.ts`. Devět štítků se vejde
  na 360 px a E2E hlídá, že se nepřekrývají. Avatar zatím žádný.
- Mantinely redesignu (`ui-redesign-plan.md`): vanilla TypeScript bez runtime
  závislostí, rozpočet svazku neroste (dnes hlavní JS 241 KiB, CSS 51,5 z 80
  KiB), animace jen `transform`/`opacity` s `prefers-reduced-motion`, kontrast
  4,5:1, dotykové cíle 44 px, tmavé téma.
- Start tréninku: dnešní filtry a výběr profilu (`filters.ts` 938 řádků
  s inline styly, `profileSelector.ts`). Fáze 3 redesignu (předvolby, start
  jedním klepnutím) je další na řadě – volba režimu do ní patří.

### 2.5 Profil, záznamy, statistiky

`TrainingProfile` (`src/core/trainingProfile.ts`) má sedm os: varianta, formát,
rychlost blindů, ulice, EV model, ante, rake. **Režim ani soupeř v profilu,
v ID otázky ani v záznamech statistik nejsou.** Styl soupeře je jen ve filtrech,
takže dnes se odpověď proti rocku a proti nikomu zapisuje do jedné statistiky.

### 2.6 6-max

- Preflop: žádné měřené záznamy. Náhled se odvozuje z 9-max podle počtu
  hráčů, kteří jsou ještě za sedadlem (`src/core/tableFormatConversion.ts`):
  6-max UTG = 9-max LJ, HJ = HJ, CO = CO, BTN, SB, BB. Je to přiznaná
  aproximace; dvě veřejné reference se navzájem rozcházejí víc, než by šlo
  kalibrovat.
- Import měřených 6-max chartů je připravený (`mttSixMaxRangePackImport.ts`,
  zpráva o připravenosti s druhem licence) – chybí charty.
- Postflop 6-max žádný. Ale 9-max rodiny se sedadly LJ, HJ, CO, BTN, SB a BB
  (na 25 bb skoro všechny dvojice) jdou tímtéž pravidlem použít pro 6-max.

### 2.7 Noci a solver

- Cena desky 44,6 min (první noc 2.–3. 11.), kolem 14 desek za noc expanze;
  noci se střídají s rozkladem, expanzi připadá kolem 50 h týdně. Dávce zbývá
  189 desek (`expansion.log`, 3.–4. 11.).
- Sada příkazů, kterou solveru posíláme (`solve_plan.py`,
  `run_night_*.py`), node-lock nemá; TexasSolver ho podle všeho nepodporuje
  (neověřeno proti nejnovější verzi).

## 3. Produkt: režimy GTO a REAL

### 3.1 Tok

1. Start: dvě velké karty **GTO** a **REAL** s jednou větou, co znamenají.
   Volba se pamatuje.
2. Předvolba (fáze 3 redesignu): například „MTT 9-max · preflop · všechny
   pozice“, podrobnosti sbalené.
3. Trénink. V REAL je u stolu vidět, kdo kde sedí; soupeř, proti kterému se
   rozhoduje, je zvýrazněný.

**GTO:** u sedadel pozice a neutrální ikona, hodnocení proti solveru
a chartům jako dnes.

**REAL:** u sedadel archetypy. Obsazení stolu dvojí (rozhodnutí R3):
- *Živý stůl* – mix podle populace (třeba 1 žralok, 2 orli, 2 kameny, 1 kostka,
  2 velryby), deterministicky podle seedu;
- *Trénink proti typu* – soupeřem ve hře je vždy zvolený archetyp.

### 3.2 Archetypy

Statistiky jsou **výchozí návrh** pro 9-max MTT (rozhodnutí R2). Změřené kotvy
z 2.1 zůstávají, zbytek je odhad a tak se i ponese v datech.

| Ikona | Kdo to je | VPIP | PFR | 3-bet | Fold na 3-bet | Fold na c-bet | Blafy na riveru | Jak na něj |
|---|---|---|---|---|---|---|---|---|
| Žralok | výherní reg, blízko rovnováhy | 18–24 | 15–20 | 7–9 | 50–55 | 40–45 | vyvážené | hrát GTO, nic nedarovat |
| Orel | lehce výherní reg s mezerami | 16–22 | 13–18 | 5–6 | 60–65 | 45–50 | málo | 3-bet light, float a raise proti c-betu, na raise na riveru složit |
| Kámen (nit) | těsný a pasivní | 10–14 | 7–10 | 2–3 | 70–75 | 55–60 | skoro žádné | krást blindy, blafovat víc, jeho agresi věřit |
| Kostka (gambler) | volný a agresivní | 40–55 | 30–40 | 12–18 | 30–40 | 25–35 | hodně | call down širší, hodnota tenčí, méně blafů, past |
| Velryba | velmi ztrátový, volný pasivní | 55–70 | 5–10 | 1–3 | 20–30 | 15–25 | skoro žádné | izolovat široce, sázet tence a velké, neblafovat, na jeho raise složit |

Hodnoty jsou v procentech. Mapování na dnešní styly: žralok a orel →
`TIGHT_AGGRESSIVE`, kámen → `TIGHT_PASSIVE`, kostka → `LOOSE_AGGRESSIVE`,
velryba → `LOOSE_PASSIVE`. „Neznámý soupeř“ v režimu GTO je rovnováha sama.

### 3.3 Vyhodnocení v REAL

Stejný rámec jako dnes (verdikt, ztráta EV, EV akcí, dvě věty), navíc:
- **GTO odpověď a rozdíl:** „GTO: Check. Proti velrybě: Bet 75 %, +1,4 BB.“
- **Proč**, statistikou: „Velryba callne river v 75 % místo 43 %.“
- **Štítek původu:** „Solver + model hráče“ tam, kde exploit stojí na
  vyřešeném stromu, „Model hráče (odhad)“ u preflopových odhadů z 4.4.
  Heuristika se nesmí vydávat za solver (zásada z 2.3 platí dál).

## 4. Algoritmus REAL

### 4.1 Princip

1. **Soupeř:** z jeho GTO strategie v každém uzlu se udělá strategie
   archetypu nejmenší možnou změnou, která trefí jeho statistiky.
2. **Hrdina:** spočítá se nejlepší odpověď (best response) proti takto
   zamčenému soupeři – na tomtéž stromu, ze kterého je GTO.
3. **Bezpečnost:** exploit se bere jen tak daleko, jak model hráče unese,
   a GTO akce zůstává „přijatelná“, když proti archetypu skoro nic neztrácí.

### 4.2 Proč ne nový solve pro každý typ hráče

- Solver node-lock nemá (2.7), takže strategii soupeře zamknout nejde.
- Pětkrát tolik nocí: dnešní dávka sama zabere kolem 3–4 týdnů.
- Solve se změněnými **range** by zachytil jen to, s čím soupeř do spotu přijde,
  ne jeho chyby v rozhodování: stanice volá příliš často se stejnou range,
  a to by nový solve „opravil“.
- Nejlepší odpověď proti pevné strategii je jen průchod stromem: sekundy na
  rodinu, ne hodiny na desku.

### 4.3 Krok 1 – soupeř podle archetypu: uspořádaný přesun

V uzlu soupeře má každá třída ruky GTO frekvence akcí. Archetyp říká cílovou
souhrnnou statistiku (třeba fold na c-bet 60 % místo 43 %). Přesun:

- **Folduje víc:** nejslabší pokračující třídy se postupně přesouvají do foldu,
  dokud souhrn nesedí.
- **Callne víc:** nejsilnější foldující třídy se přesouvají do callu.
- **Blafuje víc / míň:** nejslabší třídy (vzduch) přecházejí z checku do sázky,
  nebo naopak.
- **Raisuje míň (pasivní typy):** spodek raisující range přechází do callu,
  nutsy zůstávají.

Síla ruky je pořadí, které už aplikace má: preflop `strengthOrder()`, postflop
equity proti range na desce. Je to zobecnění dnešního `strongestSlice`. Mění
se jen to, co statistika vyžaduje, a struktura GTO strategie zůstává.

### 4.4 Krok 2 – nejlepší odpověď hrdiny

| Místo | Výpočet | Data | Kde běží | Stav |
|---|---|---|---|---|
| Preflop all-in (push/fold, rejam, 5-bet jam, call jamu, BvB, squeeze) | přesné EV z equity proti range soupeře upravené archetypem | `preflopEquity.ts`, charty | aplikace | jádro hotové; doplnit archetypy a styl do call jamu, BvB a squeeze |
| Preflop open, izolace, 3-bet, call | jeden krok: fold soupeřů × pot + větve odpovědí s equity a realizací (IP/OOP) | equity, charty, konstanty realizace (odhad) | aplikace | nové; **kalibrace:** s GTO statistikami musí model zopakovat chart, jinak se kontext hodnotí jen GTO |
| River | přesná nejlepší odpověď na vyřešené podhře proti upravené strategii soupeře | stromy rozkladu | ranní cyklus → vrstva | nové |
| Turn | totéž přes riverové vrstvy (`turnActionEv`) | stromy rozkladu | ranní cyklus → vrstva | nové |
| Flop | jeden krok s hodnotou turnových kořenů z vrstev | turnové vrstvy | ranní cyklus | v2 (1.1) |
| Linka | soupeř volí akce z upravených frekvencí, ne jednu pevnou | packy + archetyp | aplikace | nové |

Vrstva vedle packu: `{turn,river}-exploit/<rodina>.generated.json`, pro každý
archetyp a pravidlo jen třídy, kde se nejlepší odpověď liší od GTO, a jejich EV
(na desetinu BB). Páruje se s packem přes `contentHash` jako frekvence po
třídách. Odhad velikosti: řádově jako frekvence po třídách krát pět (dnes 3,8 MB
surově na 37 rodin), líně po rodině a archetypu – potřebuje vlastní řádek
rozpočtu.

### 4.5 Krok 3 – bezpečná exploitace a hodnocení

- **Nejlepší** = nejlepší odpověď proti archetypu. **Přijatelná** je i GTO akce,
  když proti archetypu ztrácí méně než dnešní práh (preflop 0,1 a 0,3 BB,
  postflop jako dnes).
- **Odhadnuté statistiky se berou napůl:** posun z 4.3 se u hodnot označených
  jako odhad (`INTERPOLATED`) zmenší na polovinu. Exploit stojí na modelu, který
  může přestřelit; restricted Nash response (Johanson, Zinkevich, Bowling, 2007)
  řeší totéž – exploitovat model a přitom omezit vlastní zranitelnost.
- **Vždy i GTO:** hráč vidí, o kolik se odchylka vyplácí. Neučí se hrát proti
  karikatuře, ale poznat, kdy a o kolik se od rovnováhy odchýlit.

### 4.6 Krok 4 – ověření

1. **Identita:** archetyp s GTO statistikami musí dát GTO akce (v prahu
   rovnocennosti), test nad všemi pravidly packu.
2. **Směr:** proti velrybě ubývá blafů a přibývá tenké hodnoty, proti kameni
   přibývá blafů a foldů na jeho agresi, proti kostce přibývá callů – vlastnostní
   testy.
3. **Monotonie:** větší odchylka statistiky nesmí dát menší posun.
4. **Kalibrace preflopu** proti chartům (cíl shody 85–90 %, odhad).
5. **Čtení majitelem:** 30–50 spotů na archetyp přes `mtt:review-desk`.

### 4.7 Příklad: blaf na riveru

Pot 10 BB, sázka 7,5 BB (75 %). Blaf se zaplatí, když soupeř složí aspoň
7,5 / 17,5 = 42,9 % (`requiredFoldFrequency`).

- Kámen složí 60 %: EV blafu = 0,6 × 10 − 0,4 × 7,5 = **+3,0 BB**.
- Velryba složí 25 %: EV blafu = 0,25 × 10 − 0,75 × 7,5 = **−3,1 BB**.

GTO soupeř skládá kolem 43 %, a tam je blaf nula. Proti kameni blafuje hrdina
se vším vzduchem, proti velrybě vůbec – a s hodnotou sází tenčeji, protože
velryba platí i horšími kartami. Přesně tohle dá nejlepší odpověď na stromu,
jen pro každou třídu zvlášť a se všemi velikostmi sázek.

## 5. Grafika hráčů

- **Styl:** vlastní vektorové ilustrace (SVG) s jednotnou linkou a stínováním
  v tmavém tématu. Žádná emoji, která vypadají na každém telefonu jinak, a žádná
  cizí grafika.
- **Sada:** žralok, orel, kámen, kostka, velryba, neutrální ikona pro GTO
  a hrdina. Každá ve čtyřech stavech: na tahu (světelný lem), složil (ztlumený),
  all-in (výrazný lem), vítěz (krátká animace).
- **U sedadla:** kruhový avatar kolem 32 px na telefonu (9 sedadel na 360 px)
  a 56 px na desktopu, lem v barvě archetypu, pozice a stack pod ním, odznak
  akce zůstává.
- **Karta hráče** po klepnutí: velký portrét, jméno archetypu, 4–6 statistik
  jako HUD, jedna věta „jak na něj“ a jeho tendence v tomhle spotu. Kostra
  dialogu je hotová (`kit/rangeDialog.ts`).
- **Pohyb:** jen `transform` a `opacity`, vypnutý při `prefers-reduced-motion`,
  žádná trvalá animace v klidu.
- **Technika:** inline SVG sprite načtený s režimem REAL, cíl do 30 kB gzip za
  celou sadu, popisky (`aria-label`) a kontrast jako u ostatních prvků, snímky
  `ui:tour` na čtyřech šířkách.
- **GTO režim:** všechna sedadla stejná neutrální ikona (žeton s pozicí).
  Pozornost zůstává na pozicích a číslech.
- **Postup:** návrh na plátně ve 2–3 stylech → výběr majitelem → produkční sada
  → integrace. Kvalita rozhoduje o dojmu „hra“; když vlastní SVG nedosáhne
  úrovně, ilustrátor na zakázku (R4).
- **Ponoření po 1.0 (volitelné):** přezdívky soupeřů, odznaky („lovec velryb“),
  úspěšnost proti každému archetypu ve statistikách, vlastní avatar hráče.

## 6. Refaktoring

1. **`src/core/villain/`** – doménový model hráče: `archetypes.ts` (5 + GTO,
   statistiky s původem `MEASURED`/`INTERPOLATED`, mapování ze dnešních čtyř
   stylů), `strategyShift.ts` (uspořádaný přesun z 4.3, zobecní
   `strongestSlice`), `tableCast.ts` (obsazení stolu podle seedu).
   `opponentStyle.ts` zůstane jako adaptér a pak zmizí.
2. **`src/core/preflop/preflopEv.ts`** – vytáhnout `computeActionEvs`
   a pomocníky z `drillEngine.ts` (1 617 řádků) do čistého modulu s parametrem
   `VillainModel` místo `OpponentStyleId` a doplnit model pro open, 3-bet a call.
   `drillEngine` jen volá.
3. **`src/core/exploit/`** – formát vrstvy (`PKRTRAINER_EXPLOIT_V1`),
   načítání po rodině a archetypu a hodnocení postflopu v REAL
   (`gradePostflopAction(spot, action, villain?)`).
4. **Pipeline:** `scripts/lib/exploitLayer.mts` a přepínač `--exploit`
   v builderech turnu a riveru (vzor `--mix-only`), test párování (vzor
   `solvedClassMixData.test.ts`), řádek v `checkBundleBudget.mts`.
5. **Profil a záznamy:** `TrainingProfile.mode` (`GTO`/`REAL`), archetyp
   soupeře v ID otázky a v záznamech – nová verze schématu s migrací (staré
   záznamy = GTO). Statistiky po režimu a archetypu.
6. **GUI:** `kit/avatar.ts` a sprite; model sedadla v `tableModel.ts`
   a `pokerTable.ts` dostane avatar a archetyp; start s volbou režimu ve fázi 3,
   která zároveň nahradí `filters.ts` s inline styly; karta hráče jako dialog.
7. **Linka:** politika soupeře podle archetypu místo jedné pevné akce
   (`postflopLineSimulator.ts`).

Pořadí: 1 → 5 → 2 → 6 (bez produkční grafiky) → 3 a 4 → 7. Model hráče
a osa v záznamech jdou první, protože na nich stojí všechno ostatní a změna
schématu později by znamenala druhou migraci.

## 7. 6-max

| | v1 – odvozený | v2 – měřený |
|---|---|---|
| Preflop | dnešní odvození z 9-max (2.6), z náhledu do produkce s přiznaným původem | charty majitele přes hotový import |
| Postflop | 9-max rodiny tímtéž pravidlem (6-max UTG = 9-max LJ), bez nových nocí | nová dávka z 6-max range: odhad 34 rodin × 13 desek ≈ 440 desek ≈ 330 h solvu |
| REAL | funguje stejně, archetypy na formátu nezávisí | stejně |
| Práce (odhad) | 3–5 dní agenta | import 2–3 dny + 6–7 týdnů nocí (polovina okna), s D6 nebo plným oknem 3–4 týdny |
| Riziko | rozdíl proti skutečné 6-max hře | závisí na chartech a právech k nim |

Push/fold do 15 bb jde spočítat vlastním Nashovým výpočtem i bez chartů
(odhad 1–2 dny). **Doporučení:** v1 do MTT 1.0, v2 jako obsah pro 1.1, až
doběhne dnešní dávka.

### 7.1 Dají se 6-max charty odvodit algoritmem? (R6, 4. 11.)

Zčásti, a s jiným stupněm jistoty podle hloubky:

- **Push/fold (do 15–20 bb): ano, přesně.** Nashova rovnováha shove a call
  nad 169 třídami s equity tabulkou, kterou aplikace má (`preflopEquity.ts`).
  Je to známý výpočet a dá se ověřit proti veřejným push/fold tabulkám.
  Odhad 1–2 dny.
- **Hlubší stacky (open, 3-bet, 4-bet na 20–100 bb): jen přibližně.** Chce
  to vlastní zjednodušený preflopový solver: strom s pevnými velikostmi
  (open, 3-bet, 4-bet jam), CFR nad 169 třídami a postflop nahrazený equity
  s realizací podle pozice. Výsledek je tak dobrý, jak dobrá je ta realizace –
  aproximace, ne měření. Odhad 5–8 dní včetně ověření proti 9-max chartům.
- **Proč to dává smysl i s charty:** stejný preflopový model (strom, equity,
  realizace) potřebuje REAL pro open, 3-bet a call (4.4) – jen místo
  rovnováhy počítá nejlepší odpověď proti archetypu. Postaví se jednou v M3
  a pak slouží třikrát: REAL na preflopu, kontrola majitelových chartů
  (velké odchylky na čtení) a doplnění míst, která charty nepokryjí (se
  štítkem „odvozeno algoritmem“).

**Postup:** charty majitele jsou zdroj pravdy. Push/fold 6-max se spočítá
hned po dodání chartů jako kontrola (a pod 15 bb jako náhrada, kde chart
chybí). Zjednodušený solver pro hlubší stacky až s REAL preflopem (M3).

## 8. Cash (fáze 2)

- **Chybí:** cash charty s rakem (100 bb, 6-max), rake v modelu (osa `rakeMode`
  v profilu je, výpočet ne) a hluboký postflop (SRP, 3BP, 4BP na 100 bb).
- **Cena nocí (odhad):** 25–30 rodin × 13 desek × 2,5 h ≈ 800–1 000 h, tedy
  4–5 měsíců nocí jednoho stroje. Bez druhého stroje nebo cloudu to není
  „krátká fáze“ (R8).
- **REAL** je formátově nezávislý a v cashi bude hned. Tam je rozdíl proti
  konkurenci největší, protože cash se hraje hlavně proti stálým typům hráčů.

## 9. Plán a odhady

Dny jsou pracovní dny agenta, odhad. Noci běží souběžně a dnešní plán nemění.

| Milník | Kdy (odhad) | Obsah | Agent | Majitel |
|---|---|---|---|---|
| M1 Rozhodnutí a návrh | 5.–8. 11. | R1–R8, specifikace archetypů, návrh grafiky na plátně | 1,5–2 dny | 1,5 h |
| M2 Start a režim | 9.–15. 11. | fáze 3 s volbou GTO/REAL, model hráče, osa režimu v profilu a záznamech, avatary s provizorní grafikou | 6–8 dní | – |
| M3 REAL preflop | 16.–22. 11. | `preflopEv`, archetypy v all-in, model open/3-bet/call s kalibrací, hodnocení, vysvětlení, soupeř v lince | 5–7 dní | – |
| M4 REAL postflop | 23. 11.–2. 12. | exploit vrstvy turnu a riveru v ranním cyklu (pilot na jedné rodině, pak sobotní plný cyklus), načítání, hodnocení, vysvětlení | 5–7 dní | 1 h (čtení vzorku) |
| M5 Grafika a statistiky | 3.–9. 12. | produkční avatary, karta hráče, stavy, statistiky po archetypu (fáze 4) | 4–6 dní | 1 h (schválení) |
| M6 6-max v1 a úklid | 10.–16. 12. | 6-max v1, zbytek starých stylů (fáze 5) | 4–7 dní | – |
| M7 Vydání | 17.–23. 12. | `verify:block`, mobilní šířky, offline, FTP balíček, poznámky k vydání | 2 dny | 1–2 h přejímka |

**Stav 5. 11. 2026:** z M2 je hotový model hráče, volba režimu a soupeře na startu a avatary u stolu (deník 344). Režim je v nastavení relace, ne v profilu: profil je klíčem packů a statistik a režim obsah nemění. Zbývá režim a typ soupeře v záznamech a start s velkou volbou režimu (fáze 3).

Celkem **28–42 dní agenta**, střed odhadu konec MTT 1.0 kolem 23. 12., rezerva
do poloviny ledna. **Noci:** dnešní dávka (189 desek) zhruba do konce
listopadu, potom 6-max v2, pokud budou charty. **MTT 1.1 (leden):** REAL na
flopu, 6-max měřený, ICM jako produkční profil.

**Kde řezat, kdyby kalendář tlačil:** REAL postflop do 1.1 ušetří 5–7 dní
(REAL v 1.0 jen na preflopu), provizorní grafika místo produkční 2–4 dny.

**Přístup do aplikace (R7, 4. 11.):** registrace, platba a licence jsou
samostatný blok 14–18 dní agenta (`plan-pristup-registrace-2026-11.md`).
Souběžně s M2–M7 by MTT 1.0 posunul zhruba o tři týdny; doporučení je vydat
MTT 1.0 jako betu s pozvánkami a placený vstup spustit hned po ní (leden),
rozhoduje P1 v tom plánu.

## 10. Rozhodnutí majitele

| | rozhodnutí | doporučení |
|---|---|---|
| R1 | Rozsah MTT 1.0: GTO + REAL (preflop, turn, river) + grafika + 6-max v1; REAL na flopu a 6-max měřený v 1.1 | přijmout |
| R2 | Archetypy a jejich statistiky (3.2) | schválit jako výchozí, doladit čtením (M4); vlastní čísla z majitelova materiálu mají přednost |
| R3 | Obsazení stolu v REAL: živý stůl, trénink proti typu, nebo obojí | obojí, výchozí živý stůl |
| R4 | Grafika: vlastní SVG s výběrem stylu na plátně, nebo ilustrátor | nejdřív plátno (M1); když to nebude „hra“, ilustrátor |
| R5 | Ikona v režimu GTO | neutrální žeton s pozicí |
| R6 | 6-max charty: existují, a s právem použití? | když ano, preflop v2 hned; jinak v1 |
| R7 | Je REAL placená funkce? | rozhodnout před vydáním; v betě zdarma jako vyřešený postflop |
| R8 | Výpočetní výkon pro cash (druhý stroj, cloud) | rozhodnout na začátku fáze 2 |

**Rozhodnuto 4. 11. 2026.** Majitel:

- **R1, R2, R3, R5** – souhlas s doporučením.
- **R4** – „udělej návrh sám, víceméně jde jen o kvalitní zobrazení stolu
  a propracovat ikony dle varianty GTO vs REAL“. Návrh dělá agent bez kola
  výběru; majitel ho uvidí na stránce s návrhem a ve snímcích `ui:tour`.
  **Návrh hotový 4. 11.:** plátno https://claude.ai/artifact/K5jGZWGkERAHdQHqF5axUq
  (soukromé, sdílí se přes Share) se stolem na desktopu a telefonu
  s přepínačem GTO/REAL, sadou sedmi ikon (žralok, orel, kámen, kostka,
  velryba, žeton s pozicí, hrdina), šesti stavy u sedadla (klid, na tahu,
  soupeř, složil, all-in, vítěz) a kartou hráče. Zdroj kreseb (SVG, viewBox
  100, bez písma ze sítě) je `Agents/design/avatary-v1.html`, náhled
  `avatary-v1.png`; v M2 z nich vznikne `src/ui/kit/avatar.ts`.
- **R6** – charty dodá majitel a ptá se, jestli je jde odvodit algoritmem.
  Odpověď v 7.1.
- **R7** – o tom, jestli jsou GTO a REAL placené, se nerozhoduje. **Placený bude
  vstup do aplikace** a k tomu registrace hráčů z webu tak, aby provoz zvládl
  kolem 1 000 uživatelů. Rozpracované v `plan-pristup-registrace-2026-11.md`.
- **R8** – postupně.

## 11. Rizika

- **Věrohodnost:** exploit stojí na modelu hráče, ne jen na solveru. Proto
  štítek původu, vždy i GTO odpověď a kalibrace čtením.
- **Přeučení na exploit:** proti karikatuře se hráč naučí špatné návyky.
  Brání tomu bezpečná exploitace (4.5), žralok jako GTO a mix stolu.
- **Velikost dat:** vrstvy krát pět archetypů – jen odchylky od GTO, líně,
  vlastní řádek rozpočtu.
- **Čas ranního cyklu:** nejlepší odpověď pro pět archetypů přidá výpočet;
  změřit na pilotní rodině dřív, než půjde do sobotního cyklu.
- **Grafika** rozhoduje o prvním dojmu; plátno a schválení před integrací.
- **Kalendář:** +2–3 týdny proti původnímu plánu; řez přes R1.
- **Noci:** 6-max v2 a cash soutěží o tentýž stroj.
