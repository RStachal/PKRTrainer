# PKRTrainer Codex instructions

## Project goal

Refactor the original single-file poker trainer into a maintainable offline-capable Vanilla TypeScript + Vite app while preserving current behavior.

## Baseline

The original working app is stored under `legacy/`.

Do not modify files under `legacy/` unless explicitly requested.

## Postup práce: jak se pracuje dopředu, ne dokola

Zapsáno 24. 8. 2026 po tom, co jedna relace ohlásila hotovo čtyřikrát a pokaždé
se ukázalo něco dalšího. Příčina nebyla nešikovnost, ale **tři chybějící
pravidla**. Nejsou to předsevzetí, jsou to podmínky.

### 1. Do dokumentu jde jen změřené

Tvrzení v plánu nebo v deníku musí nést **číslo a příkaz, který ho vyrobil**.
Když ho nemá, nezapisuje se.

Protipříklad, na kterém to vzniklo: do plánu se napsalo „pravidla jsou seřazená
podle dosahu, takže část 1 pokryje to nejčastější". Znělo to samozřejmě, nikdo
to neměřil a **bylo to špatně** - dosah je rozložený rovnoměrně, první polovina
nese přesně 50 %. Doporučení postavené na tom by znamenalo postavit mechaniku,
která nic nepřinese.

### 2. Jedna definice hotového, jeden příkaz: `npm run verify:block`

Blok je hotový, když projde **celý ověřovací řetěz**, ne když projdou testy.
Dokud neprojde, blok se nehlásí jako hotový - ani „hotovo, ale ještě ověřím".

Ten řetěz je `verify:block`: typecheck, testy, `verify:ranges`,
**`mtt:post-answer`**, build, `verify:precache`, rozpočty a **Chrome E2E**. E2E
tam patří proto, že dřív běželo až uvnitř balíčkování, takže se mobilní přetečení
o 39 px na 360 px displeji našlo teprve při čtvrtém pokusu o ZIP. To nebyla
smůla, to byla chybějící brána.

`mtt:post-answer` přibyl 25. 8. 2026 ze stejného důvodu o patro výš: měřil se
vyrobený obsah, ne to, co z něj dojde k hráči, a rozdíl mezi tím se dva týdny
neprojevil nikde. Viz pravidlo 4.

**Dno dostal až 27. 8. 2026** a do té doby to byla brána jen jménem: nikdy
nevrátila nenulový kód. Ten den ráno odpojil cyklus 44 ze 48 tabulek EV, skript
to ve výpisu měl, a řetěz pokračoval - zastavila to až sada. Dno je teď dvojí:
přísná nula tam, kde je každá jiná hodnota vada, a podíl s rezervou tam, kde se
čísla legitimně hýbou s obsahem. A je **ověřené selháním**, ne jen zeleným
během; brána, u které se nikdy nevidělo kousnutí, není ověřená brána.

**`typecheck` hlídá dvě konfigurace, a je to podstatné.** `tsconfig.json`
kontroluje `src` a `tests` proti ES2020 kvůli Android WebView;
`tsconfig.scripts.json` kontroluje `scripts/` proti ES2022, protože skripty
běží na Node. Slévat je do jedné by znamenalo buď zakázat Node modernější API,
nebo pustit do aplikace to, co starý WebView neumí.

**Do 26. 8. 2026 se `scripts/` nekontroloval vůbec** a schovával 114 chyb.
Deník i plán přitom tvrdily „změřeno 0, hotovo" - to měření pustilo
`tsc --noEmit` a nedívalo se do adresáře, o kterém mluvilo.

Za těch 114 chyb vypadlo **šest skutečných vad**, ne jen nepořádek:

- `checkSolvedSpotCoverage` četl neexistující pole a hlásil **vždy 0,0 %**;
- `extractReferenceRanges.py` zahazoval mixované strategie u 11,8 % rukou;
- profiler stavěl neplatný `TableState` bez povinné hloubky;
- `packageMttPlayableBeta` četl pole mimo vlastní deklaraci;
- `isAutoDraftable` byl type guard, který tvrdil o typu víc, než ověřoval;
- brána pilotů vracela report bez `provenanceFamilyIds`.

**Poučení, které z toho platí dál:** nekontrolovaný adresář neznamená, že tam
nic není - jen že to nikdo neuvidí. A **nástroj, kterým se měří, potřebuje
bránu stejně jako produkt**: žádná z těch dvou měřicích chyb se neprojevila
pádem, obě vracely čísla, která vypadala jako důkaz.

**`release:check` to není a nesmí se s tím zaměnit.** Měřeno 24. 8. 2026:
padá na třech branách, které s kódem nesouvisí - „MTT completion production
gate" (6 zablokovaných řádků, knihovna je 4/64), „MTT postflop final release
gate" a „Android WebView preflight" (není připojené zařízení). První dvě měří
úplnost knihovny, která čeká na data od majitele, takže `release:check`
**v tomhle stavu projít nemůže** a jako denní brána je nepoužitelný.

Mimochodem: tohle pravidlo tu nejdřív stálo s `release:check` a bylo tím
porušením pravidla 1 - napsal jsem jako fakt něco, co jsem neověřil. Opraveno
až poté, co to spadlo.

### 2b. Dlouhý běh se pouští odpojeně, ne na pozadí relace

Přidáno 31. 8. 2026, po dvou zabitých cyklech za jedno dopoledne. Ranní
`mtt:after-night` trvá **dvě až čtyři hodiny** a spuštěný jako úloha na pozadí
relace zemře, jakmile relace skončí - bez záznamu, takže se to pozná až podle
toho, že log přestal růst uprostřed fáze 1/3.

Poprvé to vypadalo jako náhoda, podruhé už ne. Dlouhý běh proto patří
**odpojený**, aby na relaci nezávisel:

```
Start-Process cmd.exe -ArgumentList "/c npm run mtt:after-night -- --write > log 2>&1" -WindowStyle Hidden
```

Postup je pak jiný: nečeká se na oznámení o dokončení, ale **čte se log**.
A platí to i pro noční solving, který takhle běží odjakživa - proto přežije
i konec relace.

**A ještě jedna past ze stejného dne:** zastavit takový běh přes Git Bash
nejde. `taskkill /T /F /PID` si shell přebere jako cestu a rodič přežije;
naměřeno, že po „zabití" rozjel další rodinu. Přes PowerShell (`Stop-Process`)
to projde napoprvé - je to tentýž typ chyby, jaký dřív pokazil `tasklist /FI`.

### 3. Jedno hlášení na blok, ne na nález

Zkoumat se má potichu a ohlásit **výsledek**. Nález uprostřed bloku je normální
práce, ne novinka; když se každý odbočka popíše zvlášť, čte se to jako
přeskakování, i když je postup správný.

### 4. Měří se, co dojde k hráči — ne co jsme vyrobili

Přidáno 25. 8. 2026, po tom, co majitel nahlásil tři chybějící věci naráz a
**všechny tři byly na obrazovce prázdné, přestože obsah je měl spočítaný.**

Hotová práce je to, co hráč uvidí. Vyřešená rodina, která se nedostane na
obrazovku, je nulová hodnota se stoprocentní cenou - solver ji počítal celou noc.

Změřeno v ten den (`npm run mtt:post-answer`): akce v matici range dojdou k hráči
v **0 %** rozdaných spotů, blafovací část range v **0 %**, EV akcí ve **4,7 %**
riverových a **0 %** flopových a turnových. Ve stejný den hlásily produkční brány
97 vyřešených rodin a 81,4 % pokrytí vzorů. Obě čísla byla pravdivá; dohromady
dávala nepravdivý obrázek, protože měřila výrobu, ne doručení.

Z toho plynou dvě povinnosti:

- **Nová funkce se nehlásí jako hotová bez čísla, kolik rozdaných spotů ji
  ukáže.** „Dodáno pro 17 rodin" není doručení, dokud se neví, kolik rodin je
  celkem a kolik se jich rozdává.
- **Tiché zneplatnění je vada, ne detail.** EV se váže na otisk packu a noční
  přegenerování ji zahodí bez hlášky; naměřeno 14 packů se spočítanou a zahozenou
  tabulkou. Kde se dá hodnota ztratit potichu, tam patří brána.
- **Brána proti tiché ztrátě musí měřit z jiného procesu, než který tu hodnotu
  měnil.** Přidáno 27. 8. 2026, když se ukázalo, že ta brána z předchozího bodu
  sama lhala: `mtt:after-night` přegeneroval packy a pak se na zastaralost ptal
  ve svém vlastním procesu, kde je obsah vložený esbuildem **při startu**.
  Naměřeno v jednu chvíli dvakrát: uvnitř 0 zastaralých, ve svěžím procesu 44
  ze 48. Kontrola tedy měřila vlastní paměť, ne disk - a hlásila klid přesně
  v okamžiku ztráty. Našla to až sada, 94 spadlými testy.

### 5. Meze se dědí, ale nepřeměřují — a ozvou se až když blokují dodání

Přidáno 25. 8. 2026, protože ten den **selhalo devět různých mezí za jediný den a
všechny ze stejného důvodu**: byly nastavené kolem menší knihovny a nikdo je od
té doby nepřeměřil. Ani jedna nebyla vada kódu.

| mez | byla | je | co ji přerostlo |
|---|---|---|---|
| `testTimeout` sady | 5 s | 60 s | obsah (už 24. 8., dvakrát) |
| `mobileWebViewSmoke` | 30 s / 15 s | 90 s / 45 s | studený překlad dashboardu: 31,6 s |
| halda `vite build` | 4 GB (výchozí) | 8 GB | 301 modulů, 29 MB líných packů, 7 MB EV |
| `bootstrapIntegration` | 30 s | 90 s | týž studený překlad v plné sadě |
| `vi.waitFor` | 1 s (výchozí) | 20 s | dynamický import tabulky EV, ~400 kB |
| halda buildu v E2E | 4 GB (výchozí) | 8 GB | vlastní build uvnitř E2E, tentýž strop |
| workery sady | 4 | **2** | paměť: čtyři workery ji vyčerpají |
| precache raw | 400 KiB | 416 KiB | 8,4 KiB nového kódu |
| chunk raw | 512 KiB | **528 KiB** | manifest EV: 17 → 47 rodin, +6,56 KiB |
| knihovna raw | 32 MB | **64 MB** | 1,2 MB za noc; nově kousne dřív gzip |
| halda `tsc --noEmit` | 4 GB (výchozí) | 8 GB | 14,4 MB JSONu přes `resolveJsonModule` |

Tři věci, které z toho platí dál:

1. **Výchozí hodnoty knihoven jsou taky meze.** `vi.waitFor` s výchozí vteřinou
   nevypadá jako nastavení, a přesto to nastavení je - a padalo na něm tvrzení
   „expected null not to be null", tedy hláška, která svádí hledat vadu
   v produktu.
2. **Vypršená mez se maskuje jako vada.** Rozeznat je od sebe jde jen měřením
   téhož testu samostatně: ten, který v plné sadě vypršel na devíti minutách,
   trvá sám **537 ms**. Bez toho srovnání by se opravoval kód, který je v pořádku.
3. **Nezvedat naslepo.** Každé číslo výš má u sebe naměřenou hodnotu, proti
   které stojí. Strop není kontrola správnosti, jen pojistka proti zaseknutí -
   rozbitý test spadne na tvrzení, ne na čase.

Podruhé to uhodilo hned nazítří, 26. 8. 2026, a **potvrdilo to pravidlo dvakrát**:
doplnění EV pro všech 47 riverových rodin porazilo tři meze naráz a ani jedna
nebyla vada. Dvě z nich brána hlásí a je to tak správně; třetí byla `tsc
--noEmit` s výchozími 4 GB, který **spadl na haldě** a hláškou to vypadalo jako
porucha buildu. Rozeznat to jde jediným způsobem: podívat se, o kolik dat víc
nástroj čte, než když se ta mez nastavovala.

A jedno číslo, které stojí za zapamatování při zvedání syrových stropů:
třicet nových položek manifestu přidalo **6,56 KiB raw a gzip přitom klesl
o 0,84 KiB** - skoro identický text se zkomprimuje pryč. Syrová velikost je
proto špatný odhad toho, co hráč doopravdy zaplatí po drátě.

U workerů vyšlo měření proti intuici a stojí za zapamatování: **méně je
rychleji.** Čtyři workery daly 476 s se dvěma pády a později 980 s s jedním,
dva workery 386 s a nula pádů. Test `SNG chipEV candidate` trval v plné sadě
při čtyřech workerech **559 vteřin** a samostatně **537 ms** - tisícinásobek,
protože stroj stránkoval. Čtyřka nebyla nikdy špatně; byla naměřená na 19
dodávaných rodinách, dnes jich je 97.

### 6. Nejdřív se zeptej paměti, teprve pak měř — `npm run mtt:known`

Zapsáno 3. 9. 2026 po majitelově výtce, že se práce cyklí, opakují se vyvrácené
závěry a vznikají nové chyby. Měl pravdu a příčina není nesoustředěnost.

Pravidlo 1 říká „do dokumentu jde jen změřené". Chybělo k němu druhé půl věty:
**nejdřív zjisti, jestli to není změřené dávno.** Bez něj vede pravidlo 1 přímo
k tomu, že se každá relace rozjede měřením — a měření vypadá jako důkladnost,
i když je to odvozování už odvozeného.

Dvě selhání z 3. 9., obě zbytečná a obě chycená jedním dotazem:

- Prohledal jsem celý internet kvůli tomu, že preflop pack nemá `VS_OPEN` pro
  UTG+1 a UTG+2. Ten fakt ležel v repozitáři od **27. 8.** v komentáři u
  `srpSolverInputGap` — a ten komentář dodává, že jeho zjištění stálo hodinu.
  Zaplatilo se za něj tedy dvakrát.
- Pustil jsem `mtt:rye-corpus` bez `--only` a dostal číslo, ze kterého plyne
  „korpus to nespraví". U toho přepínače je komentář, že slévat ICM a chipEV
  zakryje, která polovina co umí. Po rozdělení vyšel opak.

Odtud dvě podmínky, ne předsevzetí:

1. **Před měřením, hledáním na webu nebo zakládáním nového bodu deníku** se
   pustí `npm run mtt:known -- "<téma>"`. Hledá ve čtyřech místech, kde znalost
   tohohle projektu bydlí: deník, `Agents/*.md`, **komentáře v kódu** a zprávy
   commitů. Řadí od nejstaršího nálezu, protože vyhrát má ten, kdo to zjistil
   první — novější zápisy bývají jeho převyprávění.
2. **Před spuštěním nástroje projektu se přečte jeho doc-komentář.** Skoro každý
   tu nese přepínač nebo past, kterou už někdo zaplatil.

Když `mtt:known` fakt najde, výstupem je **citace, ne nový řádek deníku**.

### 7. Když je práce blokovaná na majiteli — `npm run mtt:agenda`

Zapsáno 5. 9. 2026. Většina toho, co by produkt posunulo, čeká na majitele:
změřeno týž den, že **všech 60 importních slotů** čeká na jeho `normalized.json`
a `permission.json` (`mtt:blockers`) a že ze 141 zapsaných verdiktů je
**lidských 0**. `mtt:blockers` ale odpovídá jen na to, *co je zablokované* — na
otázku „co tedy dělat" se pokaždé odvozovalo znovu: projít plán dokončení,
deník, `mtt:next-action` a poskládat si to. Změřeno, že to zabere půlku relace.

**Ptej se `npm run mtt:agenda`.** Čte deník a roztřídí otevřené body podle toho,
na kom visí: volné pro agenta, na majiteli, na stroji, uzavřené měřením
(neotevírat) a nezařazené. Zdrojem je deník, ne nový seznam — nový seznam by
zestárl jako každý jiný, deník se píše tak jako tak.

Dvě věci, které z toho plynou pro psaní deníku:

1. **Otevřený bod musí ve čtvrtém sloupci říct, na kom visí.** Změřeno 5. 9.
   2026: z 57 otevřených bodů jich **24 nemá stav** (jen „—"), takže se u nich
   nedá poznat, jestli čekají na rozhodnutí, na data, na stroj, nebo na nikoho.
   Nezařazený bod se v agendě vypíše zvlášť a přečte ho člověk; tichým
   zařazením do špatné přihrádky by se plánovalo podle výmyslu.
2. **Řádek deníku má čtyři buňky.** Svislítko uvnitř backticků
   (`` `VS_OPEN|UTG+1|25` ``) z něj udělá osm, poslední sloupec se posune a jako
   stav se čte útržek jména range. Takhle rozbité byly **čtyři řádky** (69, 140,
   141, 172) a půl roku si toho nikdo nevšiml, protože oko si tabulku domyslí.
   `mtt:agenda` proto skončí nenulovým kódem, dokud to platí, a `diaryTable`
   v sadě hlídá totéž. Escapuj jako `\|`, nebo piš lomítkem.

**Co je agentova práce, když je všechno ostatní blokované:** měření, ověřování a
udržování záznamu pravdivého. Obsah vyrobit nelze — pravdu o obsahu ano, a je to
ta část, která se jinak tiše rozchází. Změřeno 4. a 5. 9. 2026, že plán
dokončení zestaral na třech místech a deník na čtyřech; obojí nutilo příští
relaci odvozovat znovu, tedy přesně to, proti čemu stojí pravidlo 6.
Znovuobjevení se nezapisuje; zapisuje se jen to, co paměť opravdu nezná nebo co
se přeměřilo jinak — a tehdy se řekne, který starší zápis se tím mění.

Nástroj má vlastní bránu (`projectMemorySearch.test.ts`) ze stejného důvodu jako
každé jiné měřidlo tady: nejhorší selhání není pád, ale **prázdný výsledek, který
se čte jako „nic o tom nevíme"**.

### 8. Stránka, která se ptá, musí umět ukázat to, na co se ptá — `npm run mtt:review-fidelity`

Zapsáno 10. 9. 2026, po dvou dnech, ve kterých se našly **čtyři vady a všechny
ležely mezi daty a čtenářem, ani jedna v datech**:

- piloti kreslili `bucket.action` a `actionMix` pod ním zahazovali, takže se
  menšinová akce malovala plnou barvou (bod 221) — z 972 kbelíků nebyl čistý
  ani jeden a u 214 se zobrazená akce hraje pod 50 %;
- stránka neřekla, čí strategii čtenář vidí, a vzor je `<agresor>_VS_<caller>`,
  takže u čelení sázce hraje ten druhý — stálo to nález označený za blokující
  (bod 223);
- ruka hraná ze čtvrtiny se v draftu ranží kreslila jako jistota (bod 224):
  1 175 tříd ve zdroji, 1 109 z nich tiše;
- barva, kterou kontext neuměl přeložit, se přeskočila a 104 tříd spadlo do
  foldu, přičemž mřížka se vydala jako úplná (bod 225).

**Čtení je jediná cesta, jak se obsah dostane z LOW do produkce.** Čtecí stránka
je tedy brána — a byla to jediná brána v projektu, kterou nic neměřilo. Proto:

1. **Co stránka kreslí, se porovnává s tím, co data nesou.**
   `mtt:review-fidelity` měří zachování informace, ne vzhled: každý mix v datech
   musí být na stránce mix, každý pilot musí mít napsanou sedačku, žádná hraná
   buňka nesmí být malovaná jednou barvou. Běží uvnitř `mtt:review-desk` ve
   **vlastním procesu**, takže složka, která ztrácí informaci, se nevydá.
2. **Verdikt nad rozbitou stránkou je horší než žádný verdikt.** Zapíše se jako
   „přečteno" o obsahu, který čtenář neviděl, a nikdo to pak nerozliší. Proto je
   ta brána fail-closed a proto zápis odpovědí odmítne token, kterému nerozumí.
3. **Nula z kontroly musí být doložená nula.** Tahle kontrola sama v první verzi
   hledala buňky přes `class="cell"`, jenže buňky mřížky žádnou třídu nemají —
   vracela tedy nulu vždycky a nad úmyslně rozbitou stránkou prošla. Chytila to
   teprve falzifikace: stránka rozbitá schválně **musí** spadnout, jinak se
   neměří nic. Platí to pro každé měřidlo tady, viz pravidlo 6.

### Co tím nezmizí

Zpětné kroky se nedají vypnout úplně. Když oprava odhalí hlubší vadu - třeba že
**18 z 18 spotů ukazuje rozbité vysvětlení** - je zastavení správné rozhodnutí,
ne selhání. Měřítkem profesionality tady není „nikdy neměnit směr", ale **nikdy
nedodat rozbitou věc a nikdy netvrdit víc, než co je změřené**.

## Hard rules

- Preserve existing behavior unless explicitly requested.
- Do not rewrite the whole app in one step.
- Do not change poker ranges casually.
- Do not change `correctKeys`, `strictCorrect`, question IDs, seed behavior, pool behavior or localStorage keys without explicit migration.
- Preserve Czech UI text.
- Keep the app offline-capable.
- Keep Android WebView compatibility in mind.
- Prefer small, reviewable diffs.
- Do not commit automatically.
- After changes, run build/tests if available.

## Refactor direction

Use Vanilla TypeScript + Vite.

Extract gradually:
- constants and RNG
- hand utilities
- storage keys and state loading
- ranges
- question generators
- scoring
- UI renderers
- HH parser
- dashboard/statistics