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
| chunk raw | 512 KiB | 520 KiB | 2,9 KiB, A/B změřeno |
| knihovna raw | 32 MB | 44 MB | noc dodala 46 rodin: 28,5 → 41,5 MB |

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

U workerů vyšlo měření proti intuici a stojí za zapamatování: **méně je
rychleji.** Čtyři workery daly 476 s se dvěma pády a později 980 s s jedním,
dva workery 386 s a nula pádů. Test `SNG chipEV candidate` trval v plné sadě
při čtyřech workerech **559 vteřin** a samostatně **537 ms** - tisícinásobek,
protože stroj stránkoval. Čtyřka nebyla nikdy špatně; byla naměřená na 19
dodávaných rodinách, dnes jich je 97.

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