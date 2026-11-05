# Plán dokončení MTT – listopad 2026 (po ztrátě stroje)

Napsáno 2. 11. 2026 večer, po obnově na novém stroji. Cíl majitele: dokončit MTT
část za 20–30 jeho pracovních dní, bez vracení a bez zbytečných kroků. Fakta
v oddíle 1 jsou změřená a u každého je příkaz nebo soubor, odkud je. Odhady
jsou označené jako odhady.

**4. 11. 2026:** majitel rozšířil zadání o režimy GTO a REAL (ikony hráčů,
exploit podle typu soupeře), 6-max do kompletního MTT a cash jako fázi 2.
Analýza, algoritmus a nový odhad jsou v `plan-gto-real-2026-11.md`; definice
MTT 1.0 (D1) a kalendář (oddíl 5) se mění podle rozhodnutí R1 tam.

## 1. Stav k 2. 11. 2026 – co přežilo, co ne

### Kód a dokumentace

- Repozitář je naklonovaný do `C:\Work\DrillEV` z GitHubu, větev
  `agent/mtt-ev-feedback-release`, HEAD `48b3b1c0` (23. 10. 2026 10:54).
  Poslední push byl ten den. Commity z 23.–30. 10. jsou **ztracené**.
- Ztracený kód je malý: z 345 testových souborů, které běžely 29. 10.
  (`artifacts/verify-day-2026-10-29*.log`), chybí v gitu jen
  `nightCoverage.test.ts` a `solverLock.test.ts`. Všechny npm skripty z ranních
  logů v `package.json` jsou. Ztratila se noční infrastruktura z toho týdne
  (účet SYSTEM, úlohy `PKRTrainer-Daily` a `PKRTrainer-Night-Watch`, samotest,
  zámek solveru – viz `artifacts/install-night-tasks-2026-10-30.log`,
  `night-selftest.json`) a body deníku od 328.
- Redesign GUI je v gitu do kroku 3d fáze 1 (`ui-redesign-plan.md`, commity
  22.–23. 10.). Jestli po 23. 10. vzniklo víc, se nedá doložit.

### Data solveru

- **Dodaný obsah je celý v gitu:** flopový manifest nese 82 rodin a 1 083 desek
  (`src/data/ranges/flopSolvedManifest.generated.ts` a packy v `flop/`).
- **Rozklad je obnovený:** 33 rodinných archivů prošlo kontrolou SHA256 a dalo
  652 adresářů; 213 volných adresářů z kořene artefaktů je sloučených (39 se
  překrývalo – společné soubory bajtově shodné, navíc `river/`; 174 nových).
  `artifacts/decomposition` má 826 desek. Logy `expansion.log` (nadmnožina verze
  v gitu) a `night.log` jsou zpátky na místě.
- **Monolitické checkpointy jsou ztracené celé**
  (`Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver/*/raw`,
  mimo git i mimo zálohu). Důsledky:
  1. Dodaný obsah to nepoškodí: `mtt:flop-pack` bez checkpointů skončí hláškou
     a manifest ostatních rodin zachová (`buildFlopStrategyPacks.mts:142`, `:87`).
  2. **14 rodin 40/50 bb** se mezi 16. a 26. 10. odsolvilo (63 desek podle
     `expansion.log`), ale do gitu se jejich packy nedostaly. Solví se znovu.
  3. **První rozklad starých desek už nejde** bez přesolvení jejich monolitu
     (`run_night_decomposition.py` čte checkpoint, ř. 149, 280, 771, 977).
- Generátor fronty držel rodiny podle rozkladu a checkpointů, takže po ztrátě
  navrhoval 84 rodin a 504 desek, většinou dodaných. **Opraveno:** drží dodaný
  pack, checkpoint nebo frontu (`buildSeatPairExpansionBatch.mts`,
  `heldFamilies`). Bez opravy by `mtt:daily` takovou frontu doplnil sám.

### Noc na novém stroji

- Stroj: HP EliteBook 840 G10, i7-1360P (4P+8E, 16 vláken), 31,2 GB, jen
  Modern Standby (`powercfg /a`). Starý stroj měl tentýž procesor
  (`run_night_expansion.py:355`), takže naměřené ceny desek platí.
- Úlohy `PKRTrainer-Night-Decomposition` a `-Expansion`: účet SYSTEM, priorita
  4, strop 60 h; spouštěče po–pá 20:00 (po 30 min na 11 h), sobota 00:00 (na
  55 h, do pondělní sedmé), start systému, přihlášení, odemčení, otevření víka
  (`Kernel-Power 507`) a návrat z hibernace. Víko na síti nic, na baterii
  hibernace. Instalace: `scripts/scheduled/install-night-tasks.ps1`
  (`artifacts/install-night-tasks.log`).
- Dávka: 204 desek, 34 rodin (14 ztracených + 20, které 29. 10. čekaly bez
  jediné desky). Odhad práce: 78,3 h podle runneru rozkladu (`night.log`
  20:54), 121 h podle `npm run mtt:night-ready`. První noc slibuje 2 rodiny
  (`MTT9_50BB_LJ_HJ_SRP`, `MTT9_40BB_HJ_BB_SRP`).
- **Vytížení není 100 %:** solver drží 5,3–7 logických procesorů z 16
  (WMI `Win32_PerfFormattedData_PerfProc_Process`, 2. 11. 21:00), tedy asi
  35–45 % stroje. Pokus 12/16 vláken: poměr času 1,17 (95 % 0,93–1,57,
  `npm run mtt:thread-trial`) – víc vláken nepomáhá.
- Ranní cyklus (`after-night.ps1`, `pack-cycle.ps1`) **není nainstalovaný**:
  přegenerovává packy a turnový a riverový generátor se bez checkpointů zatím
  neověřil.

## 2. Co znamená „hotové MTT" – návrh k rozhodnutí

`MTT_CORE_V1` (preflop 9-max chipEV 4/4 + 7 flopových pilotů) je hotový od
10. 7. 2026 (`mtt-completion-priorities.md`). Plná knihovna 64 profilů za 20–30
dní hotová nebude a nikdy nebyla v dosahu bez dat zvenčí
(`MTT_COMPLETION_PLAN.md`, „sám ji dokončit nemůžu").

**Návrh: „MTT 1.0" = full ring 9, chipEV, regular i turbo, ante on/off:**

- preflop – 4 produkční profily (hotovo) včetně zpřesnění RYE a ICM vrstvy, jak
  jsou dnes;
- postflop – vyřešené rodiny SRP a 3BP na 20–50 bb a dnešní 100–150 bb, flop,
  turn a river tam, kde je obsah; EV akcí tam, kde ji solver dává;
- nové GUI jako výchozí (fáze 1–5 redesignu);
- vydání: hratelná beta balíčkem na FTP (`mtt:ftp-package`) a poznámky k vydání.

**Mimo MTT 1.0** (zůstává v plné knihovně): six-max produkce (chybí charty),
$EV/ICM jako produkční profily (chybí scénář v modelu), 51 desek s blendem
(chce 48+ GB RAM), cash a SNG.

## 3. Rozhodnutí majitele na začátku

Každé z nich jinak vrací práci zpátky; proto patří do prvního týdne, ideálně
na jedno sezení přes `npm run mtt:decisions`.

| | rozhodnutí | doporučení |
|---|---|---|
| D1 | Definice „MTT 1.0" (oddíl 2) | přijmout, jinak se plán nedá zavřít |
| D2 | Kdy ranní cyklus (packy z nocí, 2–4 h) – **uvnitř okna** | sobota 07:00 plný cyklus; všední dny lehký cyklus až po ověření, s koncem solveru dřív (cena: hodiny solvu) |
| D3 | Přesolvit monolity starých desek kvůli prvnímu rozkladu? | ne – rozkládat jen nové rodiny; staré mají dodaný turn a river |
| D4 | Tři rodiny na 100 bb (~2,5 h na desku) | až po dávce 25/40/50 bb |
| D5 | 24 bodů deníku, které čekají na majitele (`npm run mtt:agenda`) | projít jednou, roztřídit na „do MTT 1.0" / „po něm" |
| D6 | Pokus o 100 % HW: dva monolity souběžně (2 × 8 vláken) | ano, jako měřený pokus na 2 noci (desky za hodinu proti dnešku) |
| D7 | Zálohy a push | push po každém ověřeném bloku; noční záloha checkpointů (oddíl 6) |

**Rozhodnuto 3. 11. 2026.** Majitel: „souhlasím s tvými návrhy" - platí
doporučení D1-D7 tak, jak stojí v tabulce. Otevřené zůstává jen to, co se
rozhodnutím udělat nedá: třídění 24 bodů (D5) chce majitelovo sezení a záloha
checkpointů mimo stroj (D7) chce cíl, který určí majitel - na stroji je jen
disk C: a úložiště zaměstnavatele (firemní OneDrive, síťové disky).

## 4. Kroky v pořadí

Každý krok končí změřeným výsledkem a commitem s pushem. Pořadí je dané tím, co
co blokuje: proces a bezpečnost dat dřív než obsah, rozhodnutí dřív než práce,
která na nich stojí.

**Fáze A – dokončit obnovu (1 den agent, majitel 0,5 h)**

1. Commit a push dnešních změn; bod deníku o ztrátě a obnově. *(3. 11.: body
   deníku 328 a 329.)*
2. Instalátor znovu přes den (úlohy budou čitelné i bez správce – `mtt:night-ready`).
   *(3. 11.: instalátor nese i sobotní plný cyklus, D2. Pustit jako správce.)*
3. Ověřit turnový a riverový generátor bez checkpointů; ranní cyklus pustit
   ručně nanečisto, pak `--write` jen pro rodiny z noci. *(3. 11.: projitý celý
   cyklus. Ničil by jen tabulku velikostí sázek - opraveno, bod 328. Turn bez
   checkpointů ukazuje „0 použitelných desek" jen v nálezu brány, pack
   neblokuje; `familiesToGenerate` bez checkpointu přegeneruje rodinu každé
   ráno, což stojí čas, ne obsah. Obnovenému rozkladu chybí 5 turnových a 8
   riverových desek dodaných packů - generátory je teď nepřestaví, bod 331.
   Ruční cyklus pro rodinu z noci proběhl, flop 83/83.)*
4. Noční záloha nových checkpointů (oddíl 6). *(3. 11.: majitel – podsložka
   v DrillEV. `zaloha\checkpointy`, balí ji ranní tik noční úlohy mimo okno;
   první běh 14 checkpointů, 1 574 → 567 MB. Mimo stroj ji dostává majitel.)*

**Fáze B – proces a rozhodnutí (týden 1)**

5. Skills a `CLAUDE.md` v repozitáři (oddíl 6). *(3. 11.: hotovo.)*
6. Sezení majitele: D1–D7 a třídění 24 bodů (D5). *(D1–D7 přijaté 3. 11.;
   třídění potvrzeno 3. 11. (`trideni-agendy-2026-11.md`): do MTT 1.0 jen tři
   body pro čtecí sezení fáze C, 5 uzavřeno, 14 po MTT 1.0.)*
7. GUI fáze 1 dokončit: režim linky (3c), statistika nezapočítá neposouzenou
   odpověď jako chybu (schéma záznamu), přepínač na výchozí po zeleném E2E.
   *(3. 11.: hotovo i s maticí range v novém postflopu; nové GUI je výchozí,
   bod 333.)*

**Fáze C – obsah a GUI (týdny 2–3)**

8. GUI fáze 2 (matice 13×13 bez vodorovného posunu na 360 px) a fáze 3
   (předvolby, start jedním klepnutím). *(3. 11.: fáze 2 hotová, bod 334. Pruh
   frekvencí v buňce: majitel 3. 11. „chci to. Rozšířit" - frekvence po
   třídách v souboru vedle packu (`ui-redesign-plan.md`, fáze 2). 4. 11.:
   dodány u 35 z 55 turnových rodin a 1 flopové, k packům beze změny
   obsahu; zbytek turnu a celý river přijde se sobotní přestavbou packů,
   bod 336. Před fází 3 část úklidu starých stylů, protože CSS je na 79,96
   z 80 KiB. 4. 11.: klasické GUI smazané i se styly, CSS 51,52 z 80 KiB,
   bod 340.)*
9. Packy pro rodiny z dávky, jak se dokončují; mechanická kontrola; čtení
   majitelem přes `mtt:review-desk` (druhé sezení).
10. GUI fáze 4 (statistiky a slabá místa) a 5 (úklid starých stylů).
    *(4. 11.: z fáze 5 smazané klasické GUI i s přepínačem, bod 340; zbývá
    přestěhovat živé staré styly a smazat `src/ui/styles/legacy`.)*
11. Noci: dávka 204 desek, pak rozklad nových rodin (turnová EV). Pokus D6.
    *(3. 11.: D6 v runneru a ve wrapperu, bod 330; první souběžná noc je
    první noc šířky. Rozhodnout po dvou nocích podle řádku `propustnost:`.
    4. 11.: noc 3.-4. 11. D6 nezměřila - druhou desku nepustila pojistka
    paměti a noc po poradě ve 21:00 připadla rozkladu; hranice porady
    opravená, bod 335.)*
11a. *(Přidáno 4. 11., bod 337.)* Vyřešený postflop do jednotlivého spotu:
    aplikace dnes vyřešené packy načítá jen v produkční lince a v rozboru
    HH, takže je jednotlivý spot nedostane ani s licencí - změřeno
    v Chrome, 0 stažených chunků. Bez toho MTT 1.0 (D1) vyřešený postflop
    hráči nedodá. Majitel 4. 11. („souhlasím s tebou“): v betě bez
    licence. Opraveno týž den - start postflopu packy své ulice načte před
    prvním rozdáním, E2E stažení ověřuje, bod 338.

**Fáze D – vydání (týden 4)**

12. `verify:block` zelený, mobilní šířky, offline, `mtt:ftp-package`, poznámky
    k vydání; přejímka majitelem na telefonu.

**Rezerva:** týden 5–6 na nálezy z přejímky a doběh dávky.

## 5. Kapacita stroje a kalendář

- Okno: noci po–čt 4 × 11 h (20:00–07:00) a od pátku 20:00 do pondělí 07:00
  59 h, tedy **103 h týdně**. Odhad, ne měření: noci se od 19. 10. střídají
  1:1 mezi šířkou a rozkladem (`nightAlternation.mts`), jakmile jsou vyřešené
  nerozložené desky – expanzi tedy připadne zhruba polovina, kolem 50 h týdně.
- Dávka 78–121 h expanze při polovině okna: **asi 1,5–2,5 týdne**. Pokus D6 by
  to mohl zkrátit; kolik, řekne až měření.
- **Změřeno první nocí (2.–3. 11., bod 329):** 14 desek za 10,4 h, tedy
  44,6 min na desku včetně jednoho pádu na strop - dráž než 23–36 min, ze
  kterých stál odhad, protože noc vzala dvě rodiny s bránící BB (široké
  ranže, checkpointy 98–209 MB). Kdyby celá fronta stála tolik, je to 141 h
  expanze a při polovině okna kolem 2,7 týdne. Jedna noc není měření ceny;
  přeměří `mtt:board-cost` po dalších nocích.

## 6. Jak pracujeme (změna z 2. 11. 2026)

Majitel: víc skills, méně předávání mezi agenty, protože kompaktováním se ztrácí
podstatné. Platí:

- **Jedna pracovní relace na blok**, kroky přes skills uložené **v repozitáři**
  (`.claude/skills/`), aby je ztráta stroje nevzala. Subagenti jen na čtení
  a jen s výsledkem do souboru.
- Stav mimo hlavu: tenhle plán, deník (`MTT_AUTONOMY.md`) a `mtt:agenda`.
- Návrh skills (malé, nepřekrývající se):

| skill | co dělá | obaluje |
|---|---|---|
| `drillev-start` | začátek relace: plán, agenda, poslední body deníku, stav noci a gitu | `mtt:agenda`, `mtt:night-ready`, `git status` |
| `drillev-rano` | po noci: souhrn logů, spadlé desky, ranní cyklus, rodiny do packu | `mtt:after-night`, `verify:day` |
| `drillev-blok` | uzavření bloku: brána, bod deníku, commit, **push** | `verify:day`/`verify:block` |
| `drillev-davka` | dávka pro noc: náhled, zápis, kontrola fronty | `mtt:seat-pair-expansion`, `mtt:board-growth`, `mtt:night-ready` |
| `drillev-majitel` | kolo pro majitele: formuláře, aplikace odpovědí | `mtt:decisions`, `mtt:review-desk`, `mtt:decision-answers` |
| `drillev-vydani` | balíček a poznámky k vydání | `verify:block`, `mtt:ftp-package` (`release:check` bránou není, `AGENTS.md` pravidlo 2) |

- **Zálohy:** push po každém ověřeném bloku (ztráta 23.–30. 10. byl týden
  nepushnutých commitů). Nové checkpointy jsou jediná data, která se nedají
  znovu vyrobit bez nocí – zálohovat je každé ráno mimo stroj
  (`scripts/backup/archive-by-family.sh` je udělaný pro rozklad; pro checkpointy
  totéž po rodinách).

## 7. Rizika

- **Vytížení 35–45 %** – noc dělá zhruba polovinu toho, co by mohla (D6).
- **Ranní cyklus bez ověření** by mohl přepsat turnové nebo riverové packy –
  proto zatím ručně (fáze A, krok 3).
- **Baterie:** runner na baterii pokračuje (`run_night_expansion.py`,
  `power_source`); noc 29.–30. 10. tak skončila. Stroj na noc do zásuvky.
- **Čtení majitelem** je úzké hrdlo kvality (141 mechanických verdiktů, 0
  lidských k 4. 9.); bez dvou sezení se obsah nedostane z LOW.
