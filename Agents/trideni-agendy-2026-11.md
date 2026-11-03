# Třídění agendy pro MTT 1.0 (rozhodnutí D5) – návrh

Napsáno 3. 11. 2026. Majitel 3. 11. přijal D5: 24 bodů deníku, které podle
`npm run mtt:agenda` čekají na majitele, projít jednou a rozdělit na „do MTT 1.0"
a „po něm". Měřítkem je definice MTT 1.0 z rozhodnutí D1
(`plan-dokonceni-mtt-2026-11.md`, oddíl 2). U každého bodu je důvod; kde se
stav od zápisu změnil, je u něj dnešní měření a příkaz.

**Stav: potvrzeno majitelem 3. 11. 2026 („potvrzuji").** Stav všech 24 bodů je
zapsaný ve čtvrtém sloupci deníku; `npm run mtt:agenda` teď na majiteli ukazuje
jen tři body čtecího sezení (skupina A). Pravidlo B se dá provést díky
sobotnímu rozpočtu turnové EV 240 min (`pack-cycle.ps1`, do 3. 11. jen 120).

## Shrnutí

| skupina | bodů | co od majitele |
|---|---|---|
| A. Do MTT 1.0 – čtecí sezení | 3 | jedno sezení nad `mtt:review-desk` (už v plánu, fáze C krok 9) |
| B. Do MTT 1.0 – pravidlo pro turnovou EV | 2 | potvrdit pravidlo |
| C. Uzavřít – vyřešeno měřením nebo rozhodnutím z 3. 11. | 5 | nic |
| D. Po MTT 1.0 | 14 | nic, do vydání se neotevírají |

## A. Do MTT 1.0 – čtecí sezení (fáze C, krok 9)

Mechanická kontrola dnes podkládá 183 packů nad LOW, čtením jediný
(`npm run mtt:confidence-backing`, 3. 11. 2026). Pod LOW zůstává, co měření
neumí rozhodnout – a to je práce pro čtenáře, ne pro kód.

| bod | o čem | návrh |
|---|---|---|
| 179 | `MTT9_25BB_BTN_SB_SRP` a `MTT9_25BB_CO_SB_SRP` drží kontrola iniciativy na LOW: blind mimo pozici proti pozdnímu otvírači donkuje 65-66 %, což je pro tenhle spot měřeně očekávané | přečíst obě rodiny; jestli je donk správná hra, rozhodne čtenář |
| 185 | `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR` padá na porovnání se skupinou o dvou sousedech (sází 8 % proti mezi 14 %); kód to nespraví, víc hlubokých rodin přijde až po dávce (D4) | přečíst; do té doby LOW |
| 19 | Dvojí význam MEDIUM se mezitím srovnal: na všech ulicích znamená „měřením ověřeno, nikdo nečetl". Zbylo 6 položek produkčního flopového packu (piloty z MTT_CORE_V1) s **prošlým** verdiktem (LOW, `STALE_REVIEW`) | přečíst piloty znovu, jinak zůstanou na LOW |

## B. Do MTT 1.0 – pravidlo

| bod | o čem | návrh |
|---|---|---|
| 291, 292 | Turnová EV dvou rodin na 100 bb stojí kolem 3,5 h na přepočet; rozhodnutí bylo „vlastní dlouhý běh v noci, nebo tabulku nechat zastaralou" | **přepočítávat ji jen v sobotním plném cyklu (D2), a jen když se rodině změní pack**; ve všední den nic. Dnes je zastaralých tabulek 0 (`Agents/daily/2026-11-02.md`), takže to platí až při příští změně packu. |

## C. Uzavřít

| bod | o čem | proč uzavřít |
|---|---|---|
| 2 | Preflop produkce 4/8 – chybí $EV (ICM) sloty | D1: $EV a ICM jako produkční profily jsou mimo MTT 1.0 |
| 239 | Ranní cyklus nikdo nespouští | D2: sobotní plný cyklus je od 3. 11. naplánovaný (`PKRTrainer-After-Night-TurnEv`), všední den ručně |
| 274 | Čím naplnit frontu nocí | dávka 204 desek v 34 rodinách nastagovaná 2. 11.; po ní 100 bb (D4) |
| 283 | Dvě nedosolvené desky drží `MTT9_25BB_CO_BTN_SRP` na 10/12 | desky J73r a T84r dosolvily 5. 10.; flopový pack rodiny má 14 desek včetně nich (změřeno 3. 11.) |
| 295 | Strop 90 min pro 50 bb – extrapolované p90 bylo 83 | změřeno na 99 deskách: p90 51,1 min, maximum 86,9 (`board-cost.generated.json`, 3. 11.); strop stačí |

## D. Po MTT 1.0

Do vydání se neotevírají. Většina čeká na data nebo na čtení korpusu RYE, a D1
drží preflop „jak je dnes".

| bod | o čem | proč po |
|---|---|---|
| 300, 298 | Osa dorovnávajícího: kód hotový, 52 mřížek ke čtení odemkne 53 záznamů | preflop jak je dnes (D1); čtení mřížek je majitelův čas, který MTT 1.0 potřebuje na postflop |
| 286, 282 | Otázky ke zdroji RYE (HU, ICM 18 bb, 11 ICM záznamů, 18 stránek HU/BBSTR) | korpus RYE a ICM vrstva jak jsou dnes (D1) |
| 56, 59, 60 | Import ranží z korpusu (SB, $EV pod ICM, 19 hloubek ICM) | čeká na čtení draftu ranží; ICM/$EV mimo MTT 1.0 |
| 58, 137 | Preflop rozlišuje nejvýš 1-2 hloubky z 11 | jen daty – hloubkově rozlišené charty |
| 136 | 66,9 % preflopové EV chybí | jen daty – export preflopu se solverovou EV |
| 147 | Návrh zobrazit cenu akce místo EV | GUI fáze 1-5 mají přednost |
| 119, 157 | EV pro flop a turn by přetekla strop svazku o třetinu; riverové packy na stropu 512 kB vyměňují místo přidávání | pro MTT 1.0 platí dnešní stropy; nové rodiny dostávají vlastní packy |
| 140 | Postflop se ptá na vzor, který preflop neučí (`SRP_UTG_VS_UTG_1`) | změřeno 3. 11.: ptá se volná cesta generátoru (296 z 1 500), ale trenažér rozdává z katalogu, kde je podloženo 100 % spotů (`npm run mtt:solved-coverage`) – k hráči se to nedostane |
