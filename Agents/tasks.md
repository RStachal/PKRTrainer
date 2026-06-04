# Implementation Plan: MTT Preflop Trainer

## Overview

Implementační plán portuje ověřené koncepty z legacy baseline do nového, typovaného a modulárního buildu na **Vanilla TypeScript + Vite**. Postupuje odspodu nahoru: nejdříve čisté jádro (deterministická primitiva, typy, akční strom, Range_Store, generování spotů, scoring, perzistence/migrace), poté UI vrstvy (stůl, range matice, filtry, dashboard, HH import), nakonec offline/PWA a propojení v `main.ts`. Každý krok staví na předchozích a končí integrací; žádný kód nezůstává osamocený.

Testování jádra je **property-based** (fast-check, ≥ 100 iterací na test), kde každá vlastnost 1–33 z designu je realizována právě jedním property testem. UI a infrastruktura se ověřují příklad/DOM/integračními testy. Testovací sub-tasky jsou označeny `*` jako volitelné a NEBUDOU implementovány automaticky.

## Tasks

- [x] 1. Inicializace projektu (Vite + TypeScript + testovací rámec)
  - [x] 1.1 Založit Vite projekt s Vanilla TypeScript a strukturou
    - Vytvořit `tsconfig.json`, `package.json`, `index.html` a Vite konfiguraci
    - Vytvořit adresářovou strukturu dle designu (`src/core`, `src/data`, `src/persistence`, `src/ui`, `src/pwa`, `tests/properties`, `tests/unit`)
    - Přidat `public/manifest.webmanifest` placeholder
    - _Requirements: 12.1, 12.3_

  - [x] 1.2 Nastavit testovací rámec
    - Nakonfigurovat Vitest jako test runner, přidat fast-check (PBT) a jsdom + @testing-library/dom (DOM testy)
    - _Requirements: 12.1_

- [x] 2. Základní typy a deterministická primitiva
  - [x] 2.1 Implementovat `src/core/types.ts`
    - Definovat `Position`, `POSITION_ORDER`, `StackBucket`, `STACK_BUCKETS`, `PUSH_FOLD_MAX`, `AnteMode`, `ActionContext`, `ActionKey`, `ActionKind`, `HandLabel`, `Answer`, `Card`, `Rank`, `Suit`, `Spot`, `TableState`, `Filters`, `SessionConfig`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.12_

  - [x] 2.2 Implementovat `src/core/rng.ts`
    - Portovat `mulberry32(seed)` a `hashStr(s)` (FNV-1a) 1:1 z baseline pro zachování deterministické sekvence
    - _Requirements: 6.1, 6.2_

  - [x]* 2.3 Napsat unit testy pro RNG
    - Ověřit, že stejný seed dává stejnou sekvenci a že `hashStr` je stabilní; pokrýt hraniční seedy 0 a 4 294 967 295
    - _Requirements: 6.1_

  - [x] 2.4 Implementovat `src/core/poker.ts`
    - Definovat `RANKS`, mapování hodnot, generování všech 169 tříd startovních rukou a helper pro standardní rozložení mřížky 13×13 (páry na diagonále, suited nad, offsuit pod)
    - _Requirements: 1.5, 8.3, 10.1, 10.4_

- [x] 3. Deterministické odvození Question_ID
  - [x] 3.1 Implementovat `src/core/questionId.ts`
    - Čistá funkce `questionId(p)` odvozující stabilní ID z parametrů (kontext, pozice, eff stack, ruka, ante) ve formátu `${context}|${heroPos}|${effStack}|${hand}|${ante}`
    - _Requirements: 6.4_

  - [x]* 3.2 Napsat property test pro Question_ID
    - **Property 16: Question_ID je deterministická funkce parametrů**
    - **Validates: Requirements 6.4**

- [x] 4. Akční strom (stavové stráže Požadavku 3)
  - [x] 4.1 Implementovat `src/core/actionTree.ts`
    - Čistá funkce `offeredActions(state: TableState): ActionKind[]` realizující stráže 3.1–3.13 (RFI/Open, Limp, Over-limp, Iso, vs-open, Squeeze, vs-3bet, vs-4bet, Push/Fold, vs-all-in, BvB)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.13_

  - [x]* 4.2 Napsat property test pro stavové stráže
    - **Property 5: Stavové stráže nabízejí očekávané akce**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.13**

  - [x]* 4.3 Napsat property test pro vs-all-in
    - **Property 6: Vs-all-in nabízí výhradně Call-jam a Fold**
    - **Validates: Requirements 3.10**

- [x] 5. Range_Store — referenční ranges jako oddělená data
  - [x] 5.1 Implementovat `src/data/ranges/schema.ts`
    - Definovat `RangeFile`, `RangeRecord` a validační pravidla integrity (≥ 1 klíč v `lenient`/`strict` u přítomné ruky; raise klíče nesou sizing; ruce bez záznamu = fold)
    - _Requirements: 4.1, 4.2, 4.5, 7.6_

  - [x] 5.2 Vytvořit referenční data ranges (ante-on a ante-off varianty)
    - Naplnit `src/data/ranges/ante-on/` a `src/data/ranges/ante-off/` daty indexovanými dle Pozice × Hloubkový_koš × akční kontext; data reflektují cEV bez ICM
    - _Requirements: 4.1, 4.2, 4.9, 5.2, 5.3_

  - [x] 5.3 Implementovat `src/data/ranges/index.ts`
    - Agregovat data variant, vynutit integritu a poskytnout signál celkové načtenosti pro `isLoaded()`
    - _Requirements: 4.6_

  - [x] 5.4 Implementovat `src/data/rangeStore.ts`
    - Lookup API `lookup(key: RangeKey)` a `isLoaded()` nad agregovanými daty; vrací `undefined` pro chybějící kombinaci
    - _Requirements: 4.3, 4.4, 4.7, 4.8_

  - [x]* 5.5 Napsat property test pro existenci sizingu u raise akcí
    - **Property 11: Existence sizingu pro raise akce**
    - **Validates: Requirements 4.5**

- [x] 6. Generování spotů (generateSpot)
  - [x] 6.1 Implementovat `generateSpot` v `src/core/drillEngine.ts`
    - Sestavit z RNG a kontextu jeden Spot: přiřadit hrdinovi 1 z 9 pozic, obsadit všech 9 pozic, vybrat eff stack z 13 košů, určit `pushFold` (≤ 12 BB), sestavit `TableState`, vybrat ruku/karty, propojit `offeredActions` + `rangeStore.lookup` + `questionId`, naplnit `answers` (bijekce akce→klíč), `correctKeys`, `strictCorrect`, ante variantu a startovní pot; vynechat kombinace bez klíče (4.8), povolit kombinace bez sizingu (4.7)
    - _Requirements: 1.3, 1.4, 2.1, 2.3, 2.4, 3.12, 4.4, 4.7, 4.8, 5.1, 5.2, 5.3_

  - [x]* 6.2 Napsat property test pro celistvost a unikátnost pozic
    - **Property 1: Celistvost a unikátnost 9 pozic**
    - **Validates: Requirements 1.1, 1.3, 1.4**

  - [x]* 6.3 Napsat property test pro hloubkové koše
    - **Property 2: Efektivní stack pouze z 13 košů**
    - **Validates: Requirements 2.1, 2.2**

  - [x]* 6.4 Napsat property test pro režim push/fold u krátkých stacků
    - **Property 3: Krátký stack vynucuje push/fold**
    - **Validates: Requirements 2.3, 3.9**

  - [x]* 6.5 Napsat property test pro sizingové raise akce u hlubokých stacků
    - **Property 4: Hluboký stack nabízí sizingové raise akce**
    - **Validates: Requirements 2.4**

  - [x]* 6.6 Napsat property test pro blind-vs-blind
    - **Property 7: Blind-vs-blind staví hrdinu mezi SB a BB**
    - **Validates: Requirements 3.11**

  - [x]* 6.7 Napsat property test pro bijekci akce → Akční_klíč
    - **Property 8: Každá nabízená akce má právě jeden Akční_klíč**
    - **Validates: Requirements 3.12**

  - [x]* 6.8 Napsat property test pro neprázdná doporučení
    - **Property 9: Generovaný spot má neprázdné doporučení v obou sadách**
    - **Validates: Requirements 4.4, 7.4, 7.6**

  - [x]* 6.9 Napsat property test pro generovatelnost podle dostupnosti klíčů
    - **Property 12: Generovatelnost spotu podle dostupnosti klíčů**
    - **Validates: Requirements 4.7, 4.8**

  - [x]* 6.10 Napsat property test pro ante variantu a startovní pot
    - **Property 13: Ante mód určuje variantu dat i startovní pot**
    - **Validates: Requirements 5.2, 5.3**

- [x] 7. Pool a deterministická sekvence spotů
  - [x] 7.1 Implementovat `buildPool` v `src/core/drillEngine.ts`
    - Vygenerovat Pool unikátních spotů pro (kategorie, seed, filtry); deduplikovat podle Question_ID; zachovat deterministické pořadí
    - _Requirements: 6.3_

  - [x] 7.2 Implementovat `spotSequence` v `src/core/drillEngine.ts`
    - Vrátit deterministickou sekvenci spotů: každé Question_ID nejvýše jednou v rámci průchodu; po vyčerpání cyklit od začátku ve stejném pořadí
    - _Requirements: 6.5, 6.6_

  - [x]* 7.3 Napsat property test pro determinismus sekvence
    - **Property 14: Stejný seed a filtry dávají identickou sekvenci spotů**
    - **Validates: Requirements 6.2**

  - [x]* 7.4 Napsat property test pro unikátnost a pořadí Poolu
    - **Property 15: Pool obsahuje pouze unikátní spoty v deterministickém pořadí**
    - **Validates: Requirements 6.3**

  - [x]* 7.5 Napsat property test pro jeden průchod Poolem
    - **Property 17: Jeden průchod Poolem nezobrazí Question_ID dvakrát**
    - **Validates: Requirements 6.5**

  - [x]* 7.6 Napsat property test pro cyklení vyčerpaného Poolu
    - **Property 18: Vyčerpaný Pool se cyklí od začátku ve stejném pořadí**
    - **Validates: Requirements 6.6**

- [x] 8. Filtry a konfigurace relace
  - [x] 8.1 Implementovat filtrování a obsluhu seedu v `src/core/drillEngine.ts`
    - Aplikovat logický průnik dimenzí (Pozice AND Hloubkový_koš AND kontext), prázdná dimenze = neomezená; při chybějícím platném seedu vygenerovat seed v rozsahu 0–4 294 967 295 a zpřístupnit jej
    - _Requirements: 2.5, 2.6, 6.7, 13.5, 13.7, 13.8_

  - [x]* 8.2 Napsat property test pro průnik filtrů
    - **Property 31: Filtrování je logický průnik dimenzí**
    - **Validates: Requirements 13.5, 13.7, 13.8**

  - [x]* 8.3 Napsat unit testy pro generování seedu a stráž startu
    - Ověřit vygenerování a zpřístupnění platného seedu bez vstupu (6.7) a že bez explicitního startu se negenerují spoty (13.4)
    - _Requirements: 6.7, 13.4_

- [x] 9. Checkpoint - jádro generování spotů
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Scoring_Engine (LENIENT / STRICT)
  - [x] 10.1 Implementovat `src/core/scoring.ts`
    - Čistá funkce `grade(spot, chosen, mode)` vyhodnocující členství v `strictCorrect` (STRICT) resp. `correctKeys` (LENIENT); vrací doporučené klíče a příznak dostupnosti zdůvodnění
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7_

  - [x]* 10.2 Napsat property test pro STRICT správnost
    - **Property 19: STRICT správnost je členství v přesné sadě**
    - **Validates: Requirements 7.2, 7.7**

  - [x]* 10.3 Napsat property test pro LENIENT správnost
    - **Property 20: LENIENT správnost je členství v přijatelné sadě**
    - **Validates: Requirements 7.3, 7.7**

  - [x]* 10.4 Napsat property test pro izolaci scoringu na záznam spotu
    - **Property 10: Scoring závisí výhradně na záznamu Range_Store pro daný spot**
    - **Validates: Requirements 4.3**

  - [x]* 10.5 Napsat unit testy pro režimy a selhání zdůvodnění
    - Ověřit podporu obou režimů (7.1) a dokončení vyhodnocení při selhání zobrazení zdůvodnění bez pádu (7.5)
    - _Requirements: 7.1, 7.5_

- [x] 11. Perzistence a statistiky
  - [x] 11.1 Implementovat `src/persistence/keys.ts`
    - Definovat verzované klíče (`mtt_preflop_*_v1`) a legacy klíče jako read-only zdroj migrace
    - _Requirements: 14.1_

  - [x]* 11.2 Napsat property test pro verzování a nekolizi klíčů
    - **Property 32: Nové klíče jsou verzované a nekolidují s legacy**
    - **Validates: Requirements 14.1**

  - [x] 11.3 Implementovat `src/persistence/statsStore.ts`
    - `record(r)` (uložení záznamu před dalším spotem), `summary()`, `breakdownBy(dim)`, sledování streaku a defenzivní serializace/deserializace přes localStorage; izolace I/O do try/catch
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 11.4 Napsat property test pro povinná pole záznamu
    - **Property 24: Záznam výsledku obsahuje povinná pole**
    - **Validates: Requirements 9.1**

  - [x]* 11.5 Napsat property test pro round-trip perzistence
    - **Property 25: Perzistence je round-trip**
    - **Validates: Requirements 9.2**

  - [x]* 11.6 Napsat property test pro agregaci statistik
    - **Property 26: Konzistentní agregace statistik**
    - **Validates: Requirements 9.3, 9.4**

  - [x]* 11.7 Napsat property test pro stav série (streak)
    - **Property 27: Stav série (streak) sleduje sekvenci odpovědí**
    - **Validates: Requirements 9.5**

  - [x]* 11.8 Napsat unit testy pro chybové toky statistik
    - Ověřit ponechání dat při selhání uložení (9.6) a prázdné skupiny bez dělení nulou (9.7)
    - _Requirements: 9.6, 9.7_

- [x] 12. Migrace lokálního úložiště
  - [x] 12.1 Implementovat `src/persistence/migration.ts`
    - Idempotentní migrace strukturně kompatibilních legacy dat do verzovaných klíčů; ponechat legacy beze změny do nastavení příznaku migrace; zápisy výhradně do nových klíčů
    - _Requirements: 14.2, 14.4_

  - [x]* 12.2 Napsat property test pro migraci a idempotenci
    - **Property 33: Migrace přenáší kompatibilní data, nechává legacy nedotčené a je idempotentní**
    - **Validates: Requirements 14.2, 14.4**

  - [x]* 12.3 Napsat unit testy pro chybové toky migrace
    - Ověřit selhání migrace s čistým novým stavem (14.3), pokračování při selhání init po migraci (14.5) a nekonzistentní stav bez spuštění relace (14.6)
    - _Requirements: 14.3, 14.5, 14.6_

- [x] 13. Checkpoint - jádro, scoring a perzistence
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Table_Renderer (grafika stolu)
  - [x] 14.1 Implementovat `src/ui/tableRenderer.ts`
    - Vykreslit ovál stolu s 9 sedadly, odlišit hrdinu, 2 hole karty, akční odznaky, značky BTN/SB/BB, složená/neaktivní sedadla; čistá funkce formátování potu a stacku v BB na ≤ 1 desetinné místo dle stavu ante
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x]* 14.2 Napsat property test pro formátování hodnot v BB
    - **Property 21: Formátování hodnot v BB na nejvýše jedno desetinné místo**
    - **Validates: Requirements 8.5, 8.6**

  - [x]* 14.3 Napsat DOM unit testy pro vykreslení stolu
    - Ověřit 9 sedadel s unikátními labely (8.1), právě 1 hero sedadlo (8.2), 2 hole karty (8.3), akční odznak (8.4), značky BTN/SB/BB (8.7), složená sedadla (8.8)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 8.8_

- [x] 15. Range_Matrix_View (mřížka 13×13)
  - [x] 15.1 Implementovat `src/ui/rangeMatrixView.ts`
    - Vykreslit mřížku 13×13 (169 tříd) s barvením dle Akčního_klíče, kategorií fold odlišenou od akcí, zvýrazněním ruky spotu, legendou; indikace nedostupnosti dat bez pádu
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x]* 15.2 Napsat property test pro rozložení mřížky
    - **Property 22: Standardní rozložení mřížky 13×13**
    - **Validates: Requirements 10.1, 10.4**

  - [x]* 15.3 Napsat property test pro barvení mřížky
    - **Property 23: Barvení mřížky podle Akčního_klíče**
    - **Validates: Requirements 10.2**

  - [x]* 15.4 Napsat DOM unit testy pro matici
    - Ověřit zvýraznění ruky spotu (10.3), legendu (10.5) a indikaci nedostupných dat (10.6)
    - _Requirements: 10.3, 10.5, 10.6_

- [x] 16. Filtry UI a dashboard statistik
  - [x] 16.1 Implementovat `src/ui/filters.ts`
    - Výběr 1–9 Pozic, 1–13 Hloubkových_košů a akčních kontextů; stráž explicitního startu (negenerovat bez startu); upozornění a zachování výběru při prázdném průniku
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_

  - [x] 16.2 Implementovat `src/ui/dashboard.ts`
    - Zobrazit souhrnnou úspěšnost, rozčlenění podle kategorie/Pozice/Hloubkového_košu, aktuální streak a počet spotů relace; prázdné skupiny s indikací nedostupné úspěšnosti
    - _Requirements: 9.3, 9.4, 9.5, 9.7_

  - [x]* 16.3 Napsat DOM unit testy pro filtry a dashboard
    - Ověřit gating startu (13.4), prázdný průnik (13.6) a zobrazení statistik vč. prázdných skupin (9.7)
    - _Requirements: 13.4, 13.6, 9.7_

- [x] 17. HH_Parser (parser hand history)
  - [x] 17.1 Implementovat `src/core/hhParser.ts`
    - Totální parser PokerStars-like textu: vytěžit pole hrdiny (pozice, akce, hloubky v BB, karty), označit nečitelná pole, sestavit Spot pouze pro kompatibilní 9-handed model a koše 5–150 BB; odmítnout vstup > 100 000 znaků
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x]* 17.2 Napsat property test pro HH round-trip
    - **Property 28: HH round-trip zachová pole hrdiny a sestaví Spot**
    - **Validates: Requirements 11.1, 11.4**

  - [x]* 17.3 Napsat property test pro totalitu parseru
    - **Property 29: Parser je totální a označuje nečitelná pole**
    - **Validates: Requirements 11.2, 11.3**

  - [x]* 17.4 Napsat property test pro nekompatibilní data
    - **Property 30: Nekompatibilní data nesestaví Spot**
    - **Validates: Requirements 11.5**

  - [x]* 17.5 Napsat unit test pro překročení délky vstupu
    - Ověřit odmítnutí vstupu > 100 000 znaků s chybovou zprávou bez pádu
    - _Requirements: 11.6_

- [x] 18. HH Import View
  - [x] 18.1 Implementovat `src/ui/hhView.ts`
    - UI pro vložení HH textu, zobrazení chyb/částečných výsledků a předání sestaveného Spotu do Table_Renderer
    - _Requirements: 11.2, 11.4_

  - [x]* 18.2 Napsat DOM unit testy pro HH import view
    - Ověřit zobrazení chyb a nečitelných polí bez pádu a vykreslení kompatibilního Spotu
    - _Requirements: 11.2, 11.4_

- [x] 19. Offline provoz a PWA
  - [x] 19.1 Implementovat `src/pwa/sw.ts` a precache app shellu + dat
    - Service Worker precachující kód, styly, Range_Store data a charty; zajistit běh bez síťových požadavků po prvním načtení; upozornění při selhání cache
    - _Requirements: 12.1, 12.2, 12.4, 12.5_

  - [x]* 19.2 Napsat integrační testy offline provozu
    - Ověřit funkce (generování, scoring, statistiky, matice) bez síťových požadavků (12.1, 12.5) a upozornění při selhání cache (12.4)
    - _Requirements: 12.1, 12.4, 12.5_

- [x] 20. Bootstrap a propojení aplikace
  - [x] 20.1 Implementovat `src/main.ts`
    - Inicializační pořadí migrace → ověření stavu → načtení Range_Store → UI; globální error boundary s českými zprávami; propojit filtry, drill engine, table renderer, range matici, scoring, stats, dashboard a HH view do funkčního celku
    - _Requirements: 4.6, 12.3, 13.4, 14.6_

  - [x]* 20.2 Napsat integrační testy inicializačního toku
    - Ověřit nespuštění relace při nedostupném Range_Store (4.6) a nekonzistentním úložišti (14.6) a stráž startu (13.4)
    - _Requirements: 4.6, 13.4, 14.6_

- [x] 21. Final checkpoint - ověření celé aplikace
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. Roadmapa rozšiřitelné tréninkové platformy
  - [x] 22.1 Zmapovat aktuální stav řešení a potvrdit hranici hotové iterace
    - Aktuální stabilní základ: MTT preflop 9-max full ring, cEV ranges, ante ON/OFF, deterministický drill engine, scoring, statistiky, range modal, HH import, offline/PWA a prototyp postflop záložky
    - Navazující architektura musí zůstat aditivní: neměnit existující ranges, seed behavior, Question_ID ani localStorage klíče bez explicitní migrace

  - [x] 22.2 Zavést pravidla pro sourcing chartů z internetu
    - Pro každý nový RangePack dohledat aktuální veřejně dostupné zdroje na internetu, provést alespoň 3 nezávislá vyhledání a porovnat minimálně 2 věrohodné zdroje
    - U každého zdroje uložit metadata: URL, datum ověření, autor/provozovatel, varianta hry, table format, blind speed, ante/rake, stack depth, cEV/ICM model, solver/metodika, licence nebo povolené použití
    - Preferovat zdroje s jasnými assumptions a reputací v pokerové komunitě; příklady pro ověřování: GTO Wizard / solverové články a databáze, PokerCoaching / výukové charty, ICMIZER nebo HoldemResources pro pozdější SNG ICM kontrolu
    - Nepřebírat placené, chráněné nebo licenčně nejasné charty jako data aplikace bez povolení; povolený výstup je náš normalizovaný RangePack s citací zdrojů a poznámkou o interpretaci

  - [x] 22.3 Definovat RangePack v2 jako zdroj pravdy pro všechny budoucí ranges
    - Přidat dimenze `gameVariant` (MTT/SNG/CASH), `tableFormat` (FULL_RING_9/SIX_MAX), `blindSpeed` (REGULAR/TURBO), `street` (PREFLOP/FLOP/TURN/RIVER), `evModel` (CHIP_EV/ICM), `ante`, pozice, stack profile a akční node
    - Přidat metadata `sourceEvidence`, `assumptions`, `version`, `createdAt`, `verifiedAt`, `licenseNote` a `confidence`
    - Zachovat kompatibilitu s aktuálním Range_Store přes adaptér, aby dnešní MTT preflop 9-max běžel beze změny

  - [x] 22.4 Připravit workflow pro import a normalizaci chartů
    - Vytvořit ruční/skriptovatelný postup: zdrojový chart → normalizace 169 hand tříd → validační report → RangePack v2 → testy integrity
    - Validovat, že každá přítomná ruka má alespoň jednu akci, raise akce mají sizing, ruce bez záznamu znamenají fold a každý RangePack nese zdrojová metadata
    - Přidat snapshot/report porovnání mezi zdroji: shody, rozdíly, finální rozhodnutí a praktické vysvětlení proč

- [x] 23. Obecný model tréninkového profilu
  - [x] 23.1 Implementovat `src/core/trainingProfile.ts`
    - Definovat typy `GameVariant = "MTT" | "SNG" | "CASH"`, `TableFormat = "FULL_RING_9" | "SIX_MAX"`, `BlindSpeed = "REGULAR" | "TURBO"`, `TrainingStreet = "PREFLOP" | "FLOP" | "TURN" | "RIVER"`, `EvModel = "CHIP_EV" | "ICM"` a `RakeMode = "NONE" | "RAKE" | "NO_RAKE"`
    - Přidat `TrainingProfile`, `DEFAULT_TRAINING_PROFILE`, `profileId(profile)` a helpery pro dostupné kombinace

  - [x] 23.2 Implementovat `src/core/seatModel.ts`
    - Definovat kanonické pozice pro 9-max: UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN, SB, BB
    - Definovat kanonické pozice pro 6-max: UTG, HJ, CO, BTN, SB, BB
    - Přidat stacky jednotlivých hráčů, button/blindy a helper pro efektivní stack vůči relevantnímu soupeři

  - [x] 23.3 Přidat testy profilu a seat modelu
    - Ověřit stabilitu `profileId`, unikátní pozice, správný počet hráčů pro 9-max/6-max a zachování dnešního pořadí 9-max

- [x] 24. Blind speed a stack profil
  - [x] 24.1 Definovat blind speed jako reálnou dimenzi profilu
    - REGULAR/TURBO nesmí být jen UI label; musí určovat blind schedule, dostupné stack buckets a později tempo změny blindů v tréninku

  - [x] 24.2 Přidat model blind levelů pro MTT a SNG
    - Uložit blindy, ante, level duration, startovní stack a odvozené BB stacky pro regular/turbo režim
    - Zachovat jednoduchý režim "fixed BB" pro dnešní drill, aby existující generování zůstalo stabilní

  - [x] 24.3 Připravit UI filtr pro regular/turbo a stacky hráčů
    - Umožnit volit formát, speed a efektivní stack; později rozšířit o jednotlivé stacky u všech sedadel

- [x] 25. MTT preflop jako první produkční vertikála
  - [x] 25.1 Převést aktuální MTT 9-max cEV ranges do RangePack v2 adaptéru
    - Dnešní data zůstanou funkční; nový RangePack pouze přidá metadata a dimenze bez změny doporučení

  - [x] 25.2 Doplnit chart sourcing pro MTT 9-max regular/turbo
    - Priorita: chipEV, preflop, 9-max, full ring, regular speed; turbo přidat jako samostatný profil, pokud zdroje potvrzují odlišné assumptions

  - [x] 25.3 Přidat možnost rozšířit MTT na 6-max
    - Po seat modelu přidat 6-max profil, sourcing 6-max chipEV chartů a RangePacky pro regular/turbo

  - [x] 25.4 Rozšířit relevantní akční nodes
    - Pro preflop držet minimální sadu Fold, Call, Open/Raise, 3bet, 4bet, Jam, Call-jam; u každého node zobrazit skutečně relevantní range

- [x] 26. SNG nejdřív chipEV, potom ICM
  - [x] 26.1 Přidat SNG profil v chipEV režimu
    - Začít bez ICM, aby šel reuse MTT preflop engine, RangePack schema a scoring

  - [x] 26.2 Navrhnout ICM model pro SNG
    - Přidat payout structure, počet zbývajících hráčů, stack distribution, bubble faktor a typ spotu (push/fold, call all-in, rejams)

  - [x] 26.3 Přidat ICM range sourcing a validaci
    - Ověřovat proti více zdrojům/simulátorům typu ICMIZER/HoldemResources a ukládat assumptions do RangePack metadata

- [x] 27. Cash game připravit jako budoucí větev
  - [x] 27.1 Přidat cash profil bez zapojení do produkčního UI
    - Definovat table format, stacky, ante typicky OFF, blind speed N/A nebo fixed, a rake mode jako budoucí dimenzi

  - [x] 27.2 Připravit rake/no-rake dimenzi
    - Rake a no-rake zatím neřešit v engine; pouze rezervovat metadata a datový model, aby pozdější ranges nebylo nutné migrovat násilně

- [x] 28. Postflop roadmapa po dokončení preflop základu
  - [x] 28.1 Převést dnešní postflop prototyp na typovaný TrainingSpot
    - Zachovat stávající jednoduchý feedback, ale oddělit board texture, street, akční node, sizing a explanation

  - [x] 28.2 Zavést postflop RangePack/StrategyPack
    - Flop jako první: board texture, pozice, pot typ, SPR/effective stack, akce Check, Bet small, Bet big, Raise, Call, Fold
    - Turn a river navázat až po stabilním flop modelu

  - [x] 28.3 Přidat praktické vysvětlení po odpovědi
    - Po každé akci zobrazit stručné česky psané vysvětlení: proč je akce preferovaná, jaké ruce tvoří value/bluff/check část a jak se mění plán na další streetě

- [x] 29. Statistiky, migrace a kompatibilita pro více profilů
  - [x] 29.1 Navrhnout `ResultRecord` v2
    - Přidat profileId, gameVariant, tableFormat, blindSpeed, street, evModel, rangePackId a source version

  - [x] 29.2 Přidat migraci statistik v1 → v2
    - Dnešní záznamy označit jako MTT/FULL_RING_9/REGULAR/PREFLOP/CHIP_EV bez změny historických výsledků

  - [x] 29.3 Rozšířit dashboard
    - Filtrovat a seskupovat podle varianty, formátu, speedu, streety, pozice, stacku a akčního node

- [x] 30. UI pro výběr režimu a range evidence
  - [x] 30.1 Přidat profile selector
    - Umožnit volit MTT/SNG/CASH, 9-max/6-max, regular/turbo, preflop/flop/turn/river a scoring režim bez rozbití dnešního jednoduchého startu

  - [x] 30.2 Rozšířit range modal o zdroj a assumptions
    - U každé zobrazené range ukázat RangePack verzi, datum ověření, zdrojový souhrn a poznámku, zda jde o chipEV nebo ICM

  - [x] 30.3 Zachovat české UX a offline-first provoz
    - Všechny nové texty česky; data a metadata součástí bundlu; žádné runtime tahání chartů z internetu v offline aplikaci

- [x] 31. Ověření a release disciplina pro navazující fáze
  - [x] 31.1 Pro každou novou dimenzi přidat unit/property testy
    - Profile/seat/range schema testy musí běžet před začleněním nových chartů

  - [x] 31.2 Spouštět zelené brány po netriviálních změnách
    - `npm test` a `npm run build` musí projít po každé implementační vlně

  - [x] 31.3 Udržovat checklist průběžně
    - Dokončené položky v tomto souboru okamžitě přepínat na `[x]`; nedokončené ponechat `[ ]`

- [x] 32. Postflop StrategyPack resolver jako další rozšiřitelný krok
  - [x] 32.1 Přidat volitelný resolver hook do postflop generátoru
    - Generátor musí zachovat současný fallback, ale umět přijmout externí strategické rozhodnutí z datového packu

  - [x] 32.2 Zapojit flop prototype StrategyPack do postflop UI
    - UI má používat bundleovaný StrategyPack offline; žádné runtime tahání dat z internetu

  - [x] 32.3 Zobrazit rule/source evidence v praktickém postflop vysvětlení
    - Po odpovědi ukázat, zda rozhodnutí přišlo z packu, nebo z fallback heuristiky

- [x] 33. Veřejně dohledané flop c-bet heuristiky pro MTT
  - [x] 33.1 Přidat postflop sourcing audit pro flop single-raised pot
    - Porovnat minimálně 2 veřejné zdroje a uložit závěr, že jde o heuristický pack, ne kopii chartů

  - [x] 33.2 Doplnit source evidence metadata do Postflop StrategyPacku
    - Každý postflop pack musí nést URL, datum ověření, variantu hry, model a licenční poznámku

  - [x] 33.3 Rozšířit flop StrategyPack o veřejně obhajitelné texturové rule
    - Přidat jen obecné pravidlo na úrovni textur/SPR/sizingu; žádné placené hand-frequency tabulky

- [x] 34. Deterministický výběr nejlepšího postflop StrategyPack rule
  - [x] 34.1 Přidat scoring shodných postflop pravidel
    - Preferovat konkrétnější texture match, užší SPR interval a stabilní pořadí jako poslední tie-break

  - [x] 34.2 Zapojit výběr nejlepšího rule do resolveru
    - Resolver nesmí jen vracet první shodu; musí zvolit nejvhodnější pravidlo pro překryvy typu low-SPR dry board

  - [x] 34.3 Přidat unit testy pro překryvy pravidel
    - Ověřit low-SPR dry/paired boardy a dynamické multi-texture boardy

- [x] 35. Napojit postflop na plnohodnotnou tréninkovou relaci
  - [x] 35.1 Routovat `TrainingProfile.street = FLOP` do postflop session flow
    - Profile selector musí umět přepnout z preflop drill panelu na postflop trénink bez ručního tabování

  - [x] 35.2 Definovat `PostflopResultRecord` a bridge do statistik v2
    - Ukládat street, actionNode, potType, SPR, boardTextures, chosen action, recommended action, source pack/rule a correct flag

  - [x] 35.3 Rozšířit dashboard o postflop breakdown
    - Seskupovat podle street, actionNode, board texture, StrategyPack id a confidence

- [x] 36. Importní a validační report pro Postflop StrategyPack
  - [x] 36.1 Implementovat `postflopStrategyPackImportReport`
    - Reportovat validitu, počet zdrojů, počet rules, překryvy, unsupported actions a LOW confidence warnings

  - [x] 36.2 Validovat source evidence a rule overlap
    - Každý pack musí mít alespoň 2 zdroje; překryvy pravidel musí mít deterministický výběr nebo explicitní priority

  - [x] 36.3 Přidat textový report pro review
    - Stejně jako u preflop RangePack importu mít čitelný review výstup pro commit a budoucí audit

- [x] 37. Pozicně přesnější flop single-raised pot model
  - [x] 37.1 Rozšířit `PostflopTrainingSpot` o pozice a IP/OOP kontext
    - Přidat heroPosition, villainPosition, aggressorPosition, callerPosition, inPosition a callerType

  - [x] 37.2 Generovat pozicní archetypy pro MTT 9-max
    - Minimálně EP vs BB, BTN vs BB, SB vs BB a OOP raiser vs IP caller jako oddělené patterny

  - [x] 37.3 Matcher pravidel musí respektovat `positionPattern`
    - Resolver má vybírat rule podle pozice i textury, ne pouze podle board texture a SPR

- [x] 38. Zpřesnit flop board texture taxonomii
  - [x] 38.1 Rozšířit klasifikaci boardu
    - Přidat ace-high, broadway-high, low, medium, straight-possible, flush-draw-heavy a disconnected

  - [x] 38.2 Aktualizovat public-heuristic flop rules
    - Nové textury mapovat na existující principy bez přidání placených frekvencí

  - [x] 38.3 Přidat unit/property testy textur
    - Ověřit reprezentativní boardy: A72r, K83r, 987tt, JT8tt, 665r, monotone broadway

- [x] 39. Postflop UI evidence a učební feedback
  - [x] 39.1 Přidat detail StrategyPack zdrojů v postflop view
    - Zobrazit pack id, version, verifiedAt, confidence, source URLs a assumptions pro aktuální spot

  - [x] 39.2 Zobrazit proč bylo zvoleno konkrétní pravidlo
    - Ukázat matched textures, SPR interval, positionPattern a tie-break výsledek

  - [x] 39.3 Zachovat české a mobilně použitelné UX
    - Praktické vysvětlení nesmí přetékat a musí zůstat offline-first

- [x] 40. MTT 6-max preflop chipEV jako další obsahová vertikála
  - [x] 40.1 Dohledat a uložit sourcing audit pro MTT 6-max chipEV
    - Porovnat minimálně 2 veřejné zdroje a oddělit regular/turbo assumptions

  - [x] 40.2 Připravit candidate RangePacky pro 6-max
    - Bez produkčního zapojení, dokud nejsou ověřené hand-class hodnoty a import report

  - [x] 40.3 Otestovat profilové vyhledání a UI gating
    - 6-max profil musí jasně ukázat candidate/preview stav, ne produkční jistotu

- [x] 41. SNG chipEV -> ICM přechod bez míchání modelů
  - [x] 41.1 Zpřesnit SNG chipEV candidate pack workflow
    - Oddělit chipEV sourcing, ICM sourcing a payout/stack assumptions v reportu

  - [x] 41.2 Připravit ICM simulation input model pro import
    - Payout structure, remaining players, stack distribution, bubble factor a spot type musí být explicitní

  - [x] 41.3 Přidat validační guard proti použití ICM packu v chipEV profilu
    - Testy musí prokázat, že `evModel` mismatch nikdy nevybere špatný pack

- [x] 42. Rozšířit stats export/import o postflop výsledky
  - [x] 42.1 Přidat postflopRecords do JSON payloadu statistik
    - Zachovat zpětnou kompatibilitu starého preflop-only exportu

  - [x] 42.2 Napojit dashboard import/export na postflop breakdown
    - Po importu obnovit postflop breakdown bez změny localStorage klíčů

  - [x] 42.3 Otestovat kombinovaný preflop/postflop transfer
    - Unit a DOM testy musí pokrýt export, import a legacy payload bez postflopu

- [x] 43. Rozšířit HH import na praktický range analyzátor
  - [x] 43.1 Zobrazit decision summary pro importovaný HH spot
    - Ukázat pozici, hand class, stack, akční kontext a doporučené akce

  - [x] 43.2 Přidat relevantní range matrix k HH výsledku
    - Použít stejný Range_Store a 13x13 renderer jako tréninkový drill

  - [x] 43.3 Otestovat úspěšný import i vyčištění analýzy při chybě
    - DOM test musí ověřit summary, range buňky a prázdný stav po nevalidním vstupu

- [x] 44. Perzistovat postflop výsledky jako samostatný event log
  - [x] 44.1 Navrhnout verzovaný localStorage klíč pro postflop eventy
    - Zachovat stávající preflop `KEY_EVENTS`; nový klíč musí být explicitně verzovaný a nesmí kolidovat s legacy

  - [x] 44.2 Přidat `PostflopStatsStore` nebo adapter nad `PostflopStatsV2BridgeRecord`
    - Ukládat, číst, validovat a defenzivně rollbackovat stejně jako `StatsStore`

  - [x] 44.3 Napojit postflop session, dashboard a JSON transfer na trvalý postflop log
    - Po reloadu aplikace musí postflop breakdown přežít bez ručního importu

- [x] 45. Připravit legalní import skutečných MTT 6-max chipEV chartů
  - [x] 45.1 Definovat normalizační vstup pro 6-max RangePack import
    - Pozice UTG/HJ/CO/BTN/SB/BB, ante ON/OFF, regular/turbo assumptions, stack bucket mapping a 169 hand tříd musí být explicitní

  - [x] 45.2 Přidat validační report pro candidate -> production povýšení
    - Report musí odmítnout chybějící hand-class hodnoty, špatný `tableFormat`, `evModel` mismatch a nejasnou licenci

  - [x] 45.3 Připravit UI preview pro 6-max importovaný pack bez produkčního scoringu
    - Dokud není pack ověřený, profil zůstane candidate/preview a nesmí spustit legacy 9-max drill

- [x] 46. Rozšířit postflop architekturu za flop single-raised pot
  - [x] 46.1 Přidat TURN/RIVER `TrainingSpot` generátory a typed action nodes
    - Navázat na existující street model bez zavedení solverových frekvencí bez licence

  - [x] 46.2 Připravit StrategyPack sourcing audit pro turn/river veřejné heuristiky
    - Oddělit public heuristics, assumptions, confidence a budoucí solver import

  - [x] 46.3 Rozšířit postflop dashboard breakdown o street progression
    - Rozlišit flop-only, turn a river výsledky a zachovat export/import kompatibilitu

- [x] 47. Posunout SNG chipEV obsah před ICM produkční vrstvu
  - [x] 47.1 Dohledat a uložit aktuální SNG chipEV sourcing audit
    - Porovnat více veřejných zdrojů, ale nekopírovat placené chart hodnoty

  - [x] 47.2 Připravit SNG chipEV import report pro 9-max i 6-max
    - Oddělit chipEV od ICM, payout assumptions musí zůstat mimo chipEV pack

  - [x] 47.3 Přidat UI gating pro SNG candidate profily
    - Uživatel musí jasně vidět, zda jde o chipEV preview nebo ICM preview

- [x] 48. Připravit cash game roadmap bez zásahu do MTT/SNG scoringu
  - [x] 48.1 Zpřesnit rake/no-rake datový model pro cash RangePacky
    - Rake mode musí být explicitní dimenze, ale bez produkčního cash scoringu

  - [x] 48.2 Dohledat cash 6-max preflop sourcing audit
    - Rozlišit cash 6-max od MTT 6-max a nepoužít cash data v turnajovém profilu

  - [x] 48.3 Přidat validační guard proti cash/MTT/SNG záměně
    - `gameVariant`, `rakeMode`, `evModel` a `tableFormat` mismatch nikdy nesmí vybrat špatný pack

- [x] 49. Release hardening pro offline a Android WebView
  - [x] 49.1 Ověřit offline build a service worker cache po posledních datových změnách
    - Zkontrolovat, že nové import/report moduly a range metadata jsou součástí bundlu

  - [x] 49.2 Doplnit mobilní/Android WebView smoke test scénáře
    - Trénink, postflop, HH import, export/import JSON a candidate gating musí být použitelné na malém viewportu

  - [x] 49.3 Zkontrolovat české UI texty, přetékání a dlouhé identifikátory
    - Zejména StrategyPack/RangePack id, postflop source evidence a HH analysis panel

- [x] 50. Opravit postflop start z preflop filtru proti 3-betu
  - [x] 50.1 Zachovat vybrane pozice pri prechodu do postflop flow
    - LJ/HJ + VS_3BET musi spustit LJ vs HJ spot, ne nahodny BTN vs BB generator

  - [x] 50.2 Oddelit 3bet pot od single-raised potu
    - Flop proti 3-betu musi mit `THREE_BET_POT`, `THREE_BET_POT_CBET`, 3bet pot velikost a fallback bez pouziti SRP StrategyPacku

  - [x] 50.3 Overit ulozeni, dashboard bridge a UI bez citaci zdroju
    - 3bet postflop record musi projit validaci/exportem a UI nesmi zobrazovat URL ani provider citace

- [x] 51. Oddelit vyber situace od konkretni preflop otazky
  - [x] 51.1 Neschovavat stul do prvniho filtru situace
    - Pred explicitnim startem neni v DOM `.poker-table` a po startu se filtr skryje

  - [x] 51.2 Zobrazit stul az v obrazovce konkretni otazky
    - Aktivni preflop drill ukazuje samostatnou otazku se stolem a akcnimi tlacitky

  - [x] 51.3 Umoznit navrat z otazky k vyberu situace
    - Tlacitko `Zmenit situaci` ukonci aktualni preflop pohled a vrati filtr

  - [x] 51.4 Pri navratu k filtru vycistit starou otazku z DOM
    - Skryty herni panel uz nedrzi `.poker-table`, akcni tlacitka, vysledek ani range matici

  - [x] 51.5 Zobrazit souhrn situace primo u preflop otazky
    - Po schovani filtru otazka ukazuje kontext, pozici, handu, stack, ante a seed

  - [x] 51.6 Pouzit hracske popisky kontextu v souhrnu preflop otazky
    - UI ukazuje napr. `Proti 3-betu` misto internich enumu jako `VS_3BET`

- [x] 52. Oddelit postflop tab od konkretni postflop otazky
  - [x] 52.1 Zrusit automaticke generovani spotu pri otevreni Postflop tabu
    - Defaultni postflop view zobrazi jen ovladani; board, karty a akce vzniknou az po `Generovat spot`

  - [x] 52.2 Zachovat automaticky spot pri startu z treninkoveho filtru
    - Postflop start z profilu FLOP/TURN/RIVER stale rovnou otevre konkretni otazku se seedem a kontextem

  - [x] 52.3 Udrzet policy bez zdroju a mobilni workflow
    - Source-citation guard i mobile smoke pokryvaji novy explicitni postflop start

  - [x] 52.4 Oddelit zadani postflop situace od konkretni otazky
    - Po `Generovat spot` se ovladani schova, otazka ma `Novy spot` a `Zmenit situaci`; navrat vycisti board, karty i akce

  - [x] 52.5 Zobrazit konkretni postflop situaci jako pokerovy stul
    - Postflop otazka ukazuje 9-max oval, hero/villain sedadla, board uprostred, pot, SPR, IP/OOP a role agresor/caller

- [x] 53. Odstranit interni source/pack citace z uzivatelskeho UI
  - [x] 53.1 Prevest range modal z auditnich RangePack metadat na hracsky model range
    - Modal uz neukazuje pack id, verzi, URL ani providery; zustava jen format, model a predpoklady

  - [x] 53.2 Zjednodusit profilove preview a blokacni hlasky
    - Candidate/preview profily uz nezobrazuji interni pack id, import preview pocty ani source audit text

  - [x] 53.3 Schovat StrategyPack detaily v postflop vysvetleni a statistikach
    - Postflop vysvetleni pouziva hracsky model detail bez rule id; dashboard ukazuje preflop/postflop model misto pack nazvu

  - [x] 53.4 Zprisnit dashboard source-citation guard
    - Viditelny dashboard text nesmi zobrazit URL, providery, RangePack/StrategyPack ani interni pack id; raw id smi zustat jen v data-group kontraktu

  - [x] 53.5 Prevest postflop dashboard breakdown z raw enumu na hracske popisky
    - Action node, street, confidence a board texture key se zobrazuji hracsky; raw hodnoty zustavaji jen v data-group

  - [x] 53.6 Pokryt source-free guardem celou postflop otazku
    - Konkretni 3bet spot nesmi ve viditelnem textu zobrazit action node, pot type ani position pattern enumy

  - [x] 53.7 Prevest preflop profilovy dashboard z raw enumu na hracske popisky
    - Viditelne profile breakdown radky zobrazuji napr. 9-max full ring, Preflop, Ante vypnute; raw hodnoty zustavaji jen v data-group

  - [x] 53.8 Sjednotit rake labely v profilovem vyberu
    - Select zobrazuje S rakem / Bez raku misto anglickych Rake / No rake; hodnoty zustavaji RAKE / NO_RAKE

- [x] 54. Zapracovat flop range do vysledku po odpovedi
  - [x] 54.1 Zobrazit source-free range prehled u flop vysledku
    - Po odpovedi na flopu vysledek ukazuje Value / Bluffy / Check kandidaty, doporucenou akci a hracsky fokus bez URL, provideru nebo internich pack citaci

- [x] 55. Skryt postflop zalozku a napojit flop ranges na situace
  - [x] 55.1 Schovat Postflop z hlavni navigace
    - Interni postflop panel se otevre jen pres Start treninku z filtru pri vyberu FLOP/TURN/RIVER
  - [x] 55.2 Opravit hlavni viditelne texty rozbite kodovanim
    - Header, hlavni zalozky, profilovy selector, vysledek a chybove hlasky pouzivaji stabilni Unicode texty
  - [x] 55.3 Rozlisit flop range kandidaty podle konkretni situace
    - Value / Bluffy / Check kandidati se skladaji podle pot typu, pozicniho patternu a board textury

- [x] 56. Pridat Flopzilla-style matrix pro flop ranges
  - [x] 56.1 Vykreslit 13x13 postflop matrix ve vysledku flopu
    - Flop vysledek obsahuje 169 hand-class bunek, hero hand outline a legendu kategorii
  - [x] 56.2 Barevne odlisit postflop kategorie proti boardu
    - Matrix rozlisuje Set+, Made straight, Two pair, Overpair, Top pair, Pair, Underpair, Flush draw, OESD, Gutshot, Backdoor draw, Overcards a Air
  - [x] 56.3 Ponechat pokerovy jazyk v anglictine
    - Range kandidati, action labels a flop explanation pouzivaji anglicke poker terminy

- [x] 57. Premium postflop UI a mobilni ergonomie
  - [x] 57.1 Vylepsit vizual stolu a hracu
    - Postflop stul ma rail, center label, detailni hero/villain badge a stack bary
  - [x] 57.2 Vylepsit akce, karty a vysledek
    - Tlacitka maji stabilni rozmery, premium gradienty, hover stav a vyraznejsi recommended/chosen stav
  - [x] 57.3 Zlepsit mobilni Flopzilla matrix
    - Matrix ma horizontalni scroll hint a mensi mobilni grid s pevnou vyskou bunek

## Notes

- Tasky označené `*` jsou volitelné (testy) a lze je přeskočit pro rychlejší MVP; nebudou implementovány automaticky.
- Každý task odkazuje na konkrétní (granulární) klauzule požadavků kvůli sledovatelnosti.
- Property testy realizují univerzální vlastnosti 1–33 z designu (fast-check, ≥ 100 iterací), každá vlastnost jedním testem; značka ve formátu `// Feature: mtt-preflop-trainer, Property {číslo}: {text}`.
- Unit/DOM/integrační testy pokrývají specifické chování, edge cases a chybové toky mimo property sadu.
- Checkpointy zajišťují inkrementální validaci jádra před stavbou UI a před finálním propojením.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2", "11.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.1", "4.1", "5.1", "11.2", "11.3"] },
    { "id": 3, "tasks": ["3.2", "4.2", "4.3", "5.2", "11.4", "11.5", "11.6", "11.7", "11.8", "12.1"] },
    { "id": 4, "tasks": ["5.3", "12.2", "12.3"] },
    { "id": 5, "tasks": ["5.4"] },
    { "id": 6, "tasks": ["5.5", "6.1", "10.1", "14.1", "15.1", "17.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "7.1", "10.2", "10.3", "10.4", "10.5", "14.2", "14.3", "15.2", "15.3", "15.4", "17.2", "17.3", "17.4", "17.5"] },
    { "id": 8, "tasks": ["7.2", "18.1"] },
    { "id": 9, "tasks": ["8.1", "7.3", "7.4", "7.5", "7.6", "18.2"] },
    { "id": 10, "tasks": ["8.2", "8.3", "16.1", "16.2"] },
    { "id": 11, "tasks": ["16.3", "19.1"] },
    { "id": 12, "tasks": ["19.2", "20.1"] },
    { "id": 13, "tasks": ["20.2"] }
  ]
}
```
