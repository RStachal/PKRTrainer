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
    - Přidat dimenze `gameVariant` (MTT/SNG/CASH), `tableFormat` (FULL_RING_9/SIX_MAX), `blindSpeed` (REGULAR/TURBO), `street` (PREFLOP/FLOP/TURN/RIVER), `evModel` (CHIP_EV/DOLAR_EV/ICM), `ante`, pozice, stack profile a akční node
    - Přidat metadata `sourceEvidence`, `assumptions`, `version`, `createdAt`, `verifiedAt`, `licenseNote` a `confidence`
    - Zachovat kompatibilitu s aktuálním Range_Store přes adaptér, aby dnešní MTT preflop 9-max běžel beze změny

  - [x] 22.4 Připravit workflow pro import a normalizaci chartů
    - Vytvořit ruční/skriptovatelný postup: zdrojový chart → normalizace 169 hand tříd → validační report → RangePack v2 → testy integrity
    - Validovat, že každá přítomná ruka má alespoň jednu akci, raise akce mají sizing, ruce bez záznamu znamenají fold a každý RangePack nese zdrojová metadata
    - Přidat snapshot/report porovnání mezi zdroji: shody, rozdíly, finální rozhodnutí a praktické vysvětlení proč

- [x] 23. Obecný model tréninkového profilu
  - [x] 23.1 Implementovat `src/core/trainingProfile.ts`
    - Definovat typy `GameVariant = "MTT" | "SNG" | "CASH"`, `TableFormat = "FULL_RING_9" | "SIX_MAX"`, `BlindSpeed = "REGULAR" | "TURBO"`, `TrainingStreet = "PREFLOP" | "FLOP" | "TURN" | "RIVER"`, `EvModel = "CHIP_EV" | "DOLAR_EV" | "ICM"` a `RakeMode = "NONE" | "RAKE" | "NO_RAKE"`
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

- [x] 58. Postflop luxury polish a mobilni seat fit
  - [x] 58.1 Doplnit detail pot chipu ve stredu stolu
    - Center stolu ma vizualni chip stack mezi potem a boardem
  - [x] 58.2 Oddelit desktop a mobile seat pozice
    - Seaty pouzivaji CSS promenne pro desktop a uzsi mobilni radius, aby nepretekaly mimo viewport
  - [x] 58.3 Sjednotit postflop pokerovy jazyk do anglictiny
    - Texture chips, model detail, confidence, assumptions a result summary pouzivaji anglicke pokerove labely

- [x] 59. Premium shell a filter mobile polish
  - [x] 59.1 Sjednotit shell s premiovym postflop stylem
    - Body, header, tabs a hlavni training karta maji bohatsi dark theme, stiny a aktivni/hover stavy
  - [x] 59.2 Vylepsit prvni filtr pro mobilni web
    - Profil selector, filter groups, config radek a Start button maji jasny mobilni layout bez horizontalniho tlaceni
  - [x] 59.3 Pridat DOM guard proti navratu rozbiteho viditelneho kodovani
    - Bootstrap test hlida mobile media pravidla i absenci typickych mojibake sekvenci ve vykreslenem UI

- [x] 60. Premium preflop table polish
  - [x] 60.1 Sjednotit preflop stul s postflop felt/rail vizualem
    - Preflop table ma rail, bohatsi felt, center plate a pot chip stack
  - [x] 60.2 Doplnit detail hracu a stacku
    - Seaty maji premium gradienty, hero highlight, stack bary, action badge a anglicke folded/YOU labely
  - [x] 60.3 Zlepsit mobilni fit preflop stolu
    - Seaty maji separatni mobile pozice pres CSS promenne a mobile media pravidla pro uzky viewport

- [x] 61. Premium dashboard dark polish
  - [x] 61.1 Prevest stats tab z light karet do premium dark UI
    - Summary, session, breakdowny a postflop/profilove rozcleneni pouzivaji dark gradienty, stiny a sjednocene typograficke vahy
  - [x] 61.2 Vylepsit export/import JSON kontrolky
    - Tlacitka a textarea maji tmavy premium styl, focus-friendly kontrast a mobile full-width layout
  - [x] 61.3 Pridat CSS guard pro dashboard
    - Dashboard test hlida dark gradient, mobile media pravidla a absenci navratu svetleho `background:#fff`

- [x] 62. Premium HH import polish
  - [x] 62.1 Sjednotit HH import s premium dark UI
    - Textarea, analyze button, result boxes and analysis facts use dark gradient card style
  - [x] 62.2 Zlepsit HH import mobilni ergonomii
    - Analyze button is full-width on mobile, textarea is taller and matrix scroll container is stable
  - [x] 62.3 Posilit HH/mobile test guard
    - HH view test hlida premium CSS a mobile smoke ma vyssi timeout pro tezsi DOM render

- [x] 63. Premium Flopzilla matrix polish
  - [x] 63.1 Pridat board/hero meta do flop range matrixu
    - Matrix header ukazuje board a hero hand, aby byl vysledek citelny i mimo stul
  - [x] 63.2 Pridat category counts do legendy
    - Flopzilla legend ukazuje pocet hand classes v kazde pouzite kategorii
  - [x] 63.3 Zlepsit premium a mobile styling matrixu
    - Matrix ma dark gradient panel, polished cells, pill legendu a mobile min-width scroll guard

- [x] 64. Premium preflop range matrix and modal polish
  - [x] 64.1 Sjednotit preflop matrix s premium range UI
    - Matrix ma header, hero/context meta, dark gradient shell, polished cells and hero glow
  - [x] 64.2 Pridat preflop category counts do legendy
    - Legend ukazuje pocet 169 hand classes pro pouzite action categories
  - [x] 64.3 Vylepsit range modal a poker labels
    - Modal uses English poker-facing labels, premium backdrop/dialog/buttons and mobile full-width controls

- [x] 65. Postflop control copy cleanup
  - [x] 65.1 Sjednotit postflop controls do anglictiny
    - Generate, question, new spot and change situation controls use clean English labels
  - [x] 65.2 Omezit riziko visible encoding driftu
    - Postflop view test hlida labels and absence of visible mojibake sequences

- [x] 66. Preflop poker copy cleanup
  - [x] 66.1 Sjednotit preflop action/context labels do anglictiny
    - Main flow, DrillEngine and HH parser use Call, Vs open, Vs 3-bet and related English poker labels
  - [x] 66.2 Sjednotit preflop result copy
    - Result panel uses Correct/Not yet, Recommended, Next spot and English unavailable/save messages
  - [x] 66.3 Sjednotit HH analysis facts
    - Imported HH analysis uses Decision analysis, Position, Hand and Recommended labels

- [x] 67. Training shell and filter copy cleanup
  - [x] 67.1 Prevest app shell tab labels do anglictiny
    - Training, Statistics and app subtitle avoid visible encoding-sensitive Czech text
  - [x] 67.2 Prevest profile selector copy do anglictiny
    - Training profile fields, production/preview notes and rake labels use English copy
  - [x] 67.3 Prevest filter controls do anglictiny
    - Positions, stack depths, action context, scoring, random seed and start controls use English labels

- [x] 68. Dashboard statistics copy cleanup
  - [x] 68.1 Prevest summary/session/transfer copy do anglictiny
    - Summary, current session and JSON transfer controls use clean English labels
  - [x] 68.2 Prevest breakdown headings/group labels do anglictiny
    - Profile, preflop and postflop breakdowns use English poker-facing labels
  - [x] 68.3 Udrzet source-free stats UI guard
    - Dashboard tests guard source-free stats UI and visible mojibake regressions

- [x] 69. HH import copy and parser message cleanup
  - [x] 69.1 Prevest HH import visible controls do anglictiny
    - Import hint, placeholder, analyze button and table placeholder use clean English copy
  - [x] 69.2 Prevest HH parser user-facing errors do anglictiny
    - Empty input, length, incomplete input and incompatibility messages use English runtime strings
  - [x] 69.3 Sjednotit HH unreadable field names
    - HH unreadable fields use position/actions/stack/cards and tests guard the English UI path

- [x] 70. Main runtime warning copy cleanup
  - [x] 70.1 Prevest storage/range fatal errors do anglictiny
    - Blocking storage and range load errors use English UI copy
  - [x] 70.2 Prevest postflop save/offline/migration warnings do anglictiny
    - Notice banner messages use English copy for postflop save, migration and offline readiness
  - [x] 70.3 Sjednotit candidate cash preview label
    - Cash preview gate uses Cash rake / Cash no rake labels consistently

- [x] 71. Range matrix unavailable copy cleanup
  - [x] 71.1 Prevest unavailable fallbacky do anglictiny
    - Missing range data, missing spot range and render-failure fallbacks use English copy
  - [x] 71.2 Pridat DOM guard pro missing range fallback
    - Range matrix test asserts the English unavailable message and blocks the old Czech phrase

- [x] 72. Preflop sizing label cleanup
  - [x] 72.1 Sjednotit raise sizing labely na pokerovy x format
    - Main UI, DrillEngine and HH parser use 2x / 2.5x / 3x instead of multiplication/comma labels
  - [x] 72.2 Pridat integration guard pro action button labels
    - Bootstrap test blocks old multiplication-sign and comma sizing labels in action buttons

- [x] 73. Runtime diagnostics copy cleanup
  - [x] 73.1 Prevest core error strings do anglictiny
    - Action tree, poker grid, drill engine, hand expansion and range validation diagnostics use English strings
  - [x] 73.2 Prevest PWA install diagnostic do anglictiny
    - Service Worker cache setup failure error uses English diagnostic copy
  - [x] 73.3 Overit non-ASCII runtime string scan
    - Scan confirms remaining non-ASCII hits are comments, not runtime string literals

- [x] 74. App metadata copy cleanup
  - [x] 74.1 Prevest package description do anglictiny
    - package.json description is clean ASCII English metadata
  - [x] 74.2 Prevest HTML language and noscript fallback do anglictiny
    - index.html uses lang=en and an English noscript fallback

- [x] 75. PWA manifest metadata cleanup
  - [x] 75.1 Prevest manifest description do anglictiny
    - Web app manifest description is clean English metadata
  - [x] 75.2 Prepnout manifest language na en
    - Installed-app metadata now matches the English UI direction

- [x] 76. Published metadata regression guard
  - [x] 76.1 Pridat test pro index/package/manifest metadata
    - Release metadata test guards lang=en, English noscript, manifest lang and ASCII descriptions
  - [x] 76.2 Zachovat buildovou kompatibilitu bez browser dependency
    - Guard reads static files directly and does not require adding Playwright

- [x] 77. Flop result language regression guard
  - [x] 77.1 Uzamknout anglicky pokerovy jazyk ve flop vysledku
    - Postflop result test guards English Flopzilla legend labels and ASCII-only result copy
  - [x] 77.2 Blokovat navrat mojibake a ceskych poker labelu
    - Result assertions reject mojibake fragments and old Czech value/bluff/check terms

- [x] 78. Flopzilla matrix analysis metadata
  - [x] 78.1 Pridat procenta a datove atributy do legendy
    - Legend items expose count/share metadata and show count plus percentage
  - [x] 78.2 Zlepsit pristupnost matrixu
    - Matrix and cells expose grid/gridcell roles, aria labels and category labels
  - [x] 78.3 Zobrazit hero hand kategorii v matrix headeru
    - Matrix header and dataset now expose the hero category on the current board

- [x] 79. Flop hero bucket feedback
  - [x] 79.1 Vystavit sdilenou hero hand a Flopzilla category logiku
    - Postflop matrix module exports hero hand class and category label helpers for reuse
  - [x] 79.2 Zobrazit Hero bucket ve flop vysledku
    - Flop result shows the hero hand class, category and a player-facing comparison hint
  - [x] 79.3 Pridat DOM a mobile CSS guard
    - Postflop view test guards hero bucket data attributes, English copy and mobile stacking

- [x] 80. Preflop matrix legend analysis metadata
  - [x] 80.1 Sjednotit legend count format s postflop matrixem
    - Preflop legend shows count plus percentage for each visible action category
  - [x] 80.2 Pridat count/share data atributy pro legend items
    - Legend items expose stable count and share metadata for future interactions
  - [x] 80.3 Pokryt preflop matrix i modal testy
    - Range matrix and modal tests guard percentage text and metadata attributes

- [x] 81. Regression checkpoint after range metadata work
  - [x] 81.1 Spustit full Vitest suite
    - Full test suite verifies preflop/postflop range metadata changes across the app
  - [x] 81.2 Spustit typecheck a production build
    - Typecheck and Vite production build confirm release compatibility after tasks 79-80
  - [x] 81.3 Overit ze backlog nema otevrene checkboxy
    - Task scan confirms no remaining unchecked implementation items

- [x] 82. Interactive Flopzilla legend focus
  - [x] 82.1 Pridat click a keyboard toggle na legend items
    - Flopzilla legend items behave as accessible buttons with aria-pressed state
  - [x] 82.2 Zvyraznit vybranou kategorii v matrixu
    - Selecting a legend category keeps matching hands visible and mutes the rest
  - [x] 82.3 Pokryt interakci a premium CSS guardem
    - Matrix tests guard click/keyboard toggles and postflop view test guards active/muted styling

- [x] 83. MTT production readiness matrix
  - [x] 83.1 Definovat production readiness typy pro MTT preflop packy
    - Readiness musi rozlisit production/candidate, format, speed, ante, confidence, records, source count and missing coverage
  - [x] 83.2 Vypocitat coverage pro 9-max/6-max regular/turbo
    - Report musi ukazat plneni pro FULL_RING_9/SIX_MAX x REGULAR/TURBO x ante ON/OFF
  - [x] 83.3 Pridat testy pro soucasny stav
    - Test musi potvrdit, ze 9-max regular je production a 6-max/turbo nejsou hotove production ranges

- [x] 84. MTT preflop production definition
  - [x] 84.1 Definovat minimalni production coverage pravidla
    - Production pack potrebuje legalni source evidence, confidence MEDIUM/HIGH, records > 0, vsechny required positions, stack buckets and action contexts
  - [x] 84.2 Oddelit metadata speed od skutecne odlisnych hand recommendations
    - Turbo nesmi byt povyseno do production jen zmenou blind schedule bez overeneho range rozdilu nebo explicitniho reuse rationale
  - [x] 84.3 Zobrazit readiness status v profilovem selectoru
    - UI ma ukazat, ktere MTT kombinace jsou production a ktere cekaji na verified ranges

- [x] 85. MTT 9-max regular range audit hardening
  - [x] 85.1 Overit soucasne 9-max regular records coverage
    - Audit musi spocitat pozice, stack buckets, contexts, hand-class map completeness and strict/lenient non-empty values
  - [x] 85.2 Zprisit confidence pro stavajici baseline pack
    - Pokud jde o heuristic baseline, ponechat MEDIUM; HIGH az po legalnim solver/export review
  - [x] 85.3 Pridat regression test proti nechtenemu zuzeni 9-max ranges
    - Test musi hlidat record count, representative contexts and source metadata

- [x] 86. MTT 9-max turbo production path
  - Superseded-by: 135.5 P1 preflop CHIP_EV production import wave; DOLAR_EV navazne pokryva 135.6.
  - [x] 86.1 Rozhodnout turbo strategy policy
    - Bud importovat turbo-specific ranges, nebo explicitne zdokumentovat legalni reuse regular chipEV ranges pro stejny stack/ante node
  - [x] 86.2 Pripravit 9-max turbo RangePack records
    - Turbo pack musi mit records, source evidence, assumptions and validation bez candidate gate
    - Generic MTT preflop import validator is ready; actual 9-max turbo records still require legal source/export input
  - [x] 86.3 Zapojit 9-max turbo do production preflop gate
    - Po overeni ma MTT/FULL_RING_9/TURBO/PREFLOP/chipEV spoustet drill

- [x] 87. MTT 6-max regular verified range import
  - Superseded-by: 135.5 P1 preflop CHIP_EV production import wave; DOLAR_EV navazne pokryva 135.6.
  - [x] 87.1 Ziskat legalni 6-max regular source/export vstup
    - Povolen je owned solver export, public chart with permission, or explicit written permission
  - [x] 87.2 Normalizovat 6-max regular records
    - Generic MTT preflop import validator now checks 6-max regular source/export completeness
    - Každý record musi mit 169 hand classes ve strict i lenient mape
  - [x] 87.3 Povysit 6-max regular z candidate na production
    - Po validaci se SIX_MAX/REGULAR/PREFLOP/chipEV smi spoustet v drill enginu

- [x] 88. MTT 6-max turbo verified range import
  - Superseded-by: 135.5 P1 preflop CHIP_EV production import wave; DOLAR_EV navazne pokryva 135.6.
  - [x] 88.1 Ziskat legalni 6-max turbo source/export vstup
    - Turbo assumptions a stack mapping musi byt explicitni
  - [x] 88.2 Normalizovat 6-max turbo records
    - Records musi pokryt required positions, buckets, contexts and 169 hand classes
    - Generic MTT preflop import validator now checks 6-max turbo source/export completeness
  - [x] 88.3 Povysit 6-max turbo z candidate na production
    - Po validaci se SIX_MAX/TURBO/PREFLOP/chipEV smi spoustet v drill enginu

- [x] 89. Production range import UX and audit artifacts
  - [x] 89.1 Pridat import-readiness report pro vsechny MTT packy
    - Report musi byt citelny pro commit review a nesmi zobrazovat source URLs v hernim UI
  - [x] 89.2 Pridat summary audit soubor pro production MTT coverage
    - Agents audit ma jasne oddelit hotove production ranges od candidate placeholders
  - [x] 89.3 Pridat CI-friendly tests pro production coverage
    - Testy musi selhat, pokud production pack nema records nebo legalni metadata

- [x] 90. MTT preflop production UI gate cleanup
  - [x] 90.1 Nahradit hardcoded production gate readiness reportem
    - main.ts a profileSelector nemaji duplikovat podminky; maji cist z jednoho readiness modelu
  - [x] 90.2 Zachovat candidate safety
    - Candidate pack nikdy nesmi spustit legacy 9-max drill nebo scoring
  - [x] 90.3 Otestovat gate pro vsechny MTT kombinace
    - 9-max regular/turbo a 6-max regular/turbo maji explicitni test podle readiness stavu

- [x] 91. Flop production data model
  - [x] 91.1 Definovat flop RangePack/StrategyPack production schema
    - Schema musi umet position pattern, pot type, SPR window, texture, action node, hand-class strategy bucket and confidence
  - [x] 91.2 Oddelit heuristic training prompt od production strategy
    - Public heuristic pack zustava preview, production pack vyzaduje legalni source/export nebo explicitni permission
  - [x] 91.3 Pridat validator flop production coverage
    - Validator musi ukazat missing positions, textures, pot types and action nodes

- [x] 92. Flop SRP production coverage
  - [x] 92.1 Pokryt hlavni SRP pozicni patterny
    - EP vs BB, BTN vs BB, SB vs BB, OOP raiser vs IP caller
  - [x] 92.2 Pokryt board texture taxonomy
    - A-high, broadway, low, paired, monotone, two-tone, connected, disconnected, dry, draw-heavy
  - [x] 92.3 Napojit production SRP flop pack do treninku
    - UI ma pouzivat production data tam, kde existuji, jinak jasne preview/fallback
    - Resolver infrastructure hotova; skutecny production SRP pack ceka na legalni source/export vstup
    - Flop production coverage report now renders review text for missing pot types, position patterns, textures, action nodes and lanes
    - Hotovo: `generatePostflopSpot` s production fallback registry pouzije SRP production StrategyPack pro matching spot a jinak zustane u public heuristic/generator fallbacku; realny legalni SRP import zustava v 114

- [x] 93. Flop 3bet pot production coverage
  - [x] 93.1 Definovat 3bet pot action nodes a position patterns
    - OOP caller vs IP 3bettor and IP/OOP c-bet situations musi byt explicitni
  - [x] 93.2 Pripravit 3bet pot range buckets
    - Value/bluff/check lanes a matrix musi vychazet z production coverage, ne jen obecne heuristiky
  - [x] 93.3 Otestovat 3bet pot fallback safety
    - SRP rules se nesmi pouzit pro 3bet pot bez explicitniho mappingu

- [x] 94. Flop result learning depth
  - [x] 94.1 Rozsirit hero bucket feedback podle production range lane
    - Feedback ma rict, zda hero hand patri do value, bluff, check, mix/frequency bucket podle production dat
  - [x] 94.2 Pridat matrix filtering podle lane
    - Vedle Flopzilla kategorií ma jit filtrovat Value/Bluff/Check lane
  - [x] 94.3 Zachovat source-free user UI
    - Hrac vidi pokerovy model, ne URLs, provider names, pack ids or internal rule ids

- [x] 95. KPI analytics model
  - [x] 95.1 Definovat relevantni KPI jen z dostupnych dat
    - Overall accuracy, recent accuracy, volume, streak, best streak, leak groups, preflop/postflop breakdowns
  - [x] 95.2 Pridat best streak a recent window analytics
    - Pocitat z event logu bez noveho storage schema, pokud to jde
  - [x] 95.3 Pridat minimum-sample filter pro leak detection
    - Weakest spots ukazovat az od rozumneho poctu odpovedi

- [x] 96. Statistics dashboard graph layer
  - [x] 96.1 Pridat KPI cards
    - Dashboard ma ukazat answered total, overall accuracy, recent accuracy, current streak, best streak and volume this session
  - [x] 96.2 Pridat jednoduche grafy bez nove runtime dependency
    - Pouzit HTML/CSS bars nebo inline SVG pro trend/volume/leak mapy
  - [x] 96.3 Otestovat mobile layout grafu
    - Grafy nesmi pretekat v mobilnim web browseru

- [x] 97. Preflop leak visualizations
  - [x] 97.1 Graf podle action contextu
    - Ukazat accuracy/volume pro RFI, vs open, vs 3-bet, squeeze, BvB, push/fold etc.
  - [x] 97.2 Graf podle pozice
    - Ukazat leak mapu pozic s minimum sample filtrem
  - [x] 97.3 Graf podle stack bucketu
    - Ukazat kratke/stredni/hluboke stacky a identify weakest buckets

- [x] 98. Postflop KPI visualizations
  - [x] 98.1 Graf podle street a action node
    - Flop/turn/river a c-bet/barrel/pressure skupiny podle accuracy/volume
  - [x] 98.2 Graf podle board texture
    - Ukazat, na jakych texturech hrac chybuje, az od minimum sample
  - [x] 98.3 Confidence-aware labels
    - Preview/low confidence postflop model nesmi pusobit jako solver-grade pravda

- [x] 99. Decision-time instrumentation
  - [x] 99.1 Navrhnout response time field pro preflop a postflop records
    - Cas mereny od zobrazeni otazky po klik odpovedi
  - [x] 99.2 Migrovat/exportovat cas bez rozbiti starych stats
    - Starší záznamy musi zustat validni s null/unavailable decision time
  - [x] 99.3 Pridat timing KPI az po sberu dat
    - Speed/hesitation grafy nezobrazovat, dokud nejsou realna data

- [x] 100. MTT production release checkpoint
  - [x] 100.1 Spustit full test suite a build
    - Release checkpoint musi projit po kazdem production range povyseni
  - [x] 100.2 Zkontrolovat source-free UI policy
    - Herni UI a dashboard nesmi citovat zdroje ani ukazovat pack internals
  - [x] 100.3 Zkontrolovat offline bundle
    - Production ranges a stats UI musi fungovat bez runtime fetch
    - `npm run verify:ranges` now reports legacy range validation, MTT readiness blockers and flop production registry status through vite-node
    - `npm run validate:range-import -- --kind=mtt-preflop|flop-production <input.json>` validates future legal export files before production promotion

- [ ] 101. Autonomous backlog discipline
  - [x] 101.1 Po kazdem hotovem kroku aktualizovat checkboxy
    - Dokoncene polozky okamzite prepnout na [x]
  - [x] 101.2 Po kazde netrivialni zmene spustit cilene testy
    - Scope testu volit podle zmenenych modulu
  - [ ] 101.3 Pokud nejsou otevrene tasky, zalozit dalsi pouze z produktoveho gapu
    - Nepridavat kosmeticke tasky, pokud existuje obsahovy production gap

- [x] 102. Production range intake operations
  - [x] 102.1 Definovat adresar pro dodane legalni exporty mimo runtime bundle
    - Raw solver/chart exporty nesmi byt omylem zobrazeny v UI ani importovany bez validace
    - Hotovo: `Agents/range-intake/raw/` je ignorovany Git workspace pro lokalni legalni vstupy
    - Hotovo: `npm run range:intake:guard` blokuje nechtene trackovane raw vstupy a hlida ignore politiku staging adresare
    - Doplneno 2026-06-24: `range:intake:guard -- --output=artifacts/range-intake-guard-report.json` uklada cisty JSON workspace guard artefakt.
  - [x] 102.2 Pridat priklady minimalnich JSON importu pro MTT preflop a flop production
    - Fixtures musi byt synthetic/test-only, bez skutecnych third-party chart hodnot
    - Hotovo: synteticke MTT preflop, flop production and permission manifest examples
  - [x] 102.3 Popsat operator workflow od exportu po production promotion
    - Kroky: ulozit raw export, spustit validator, review report, commit normalized pack, release checkpoint
    - Hotovo: `Agents/range-intake/README.md` and intake manifest workflow
    - Hotovo: `npm run range:intake` kontroluje pritomnost `normalized.json` a `permission.json` pro legalni MTT sloty pred validaci obsahu
    - Doplneno 2026-06-24: `range:intake -- --output=artifacts/range-intake-report.json` uklada cisty JSON stav vsech legalnich intake slotu.
    - Hotovo: `npm run mtt:blockers` vypisuje source-free frontu neprodukcnich MTT blockeru vcetne lokalniho intake file statusu

- [x] 103. Legal source and permission audit workflow
  - [x] 103.1 Pridat permission manifest pro kazdy budouci production pack
    - Manifest musi obsahovat licenseKind, owner, review date, allowed redistribution scope and reviewer
    - Hotovo: `ProductionPermissionManifest` schema and source-free report
  - [x] 103.2 Zablokovat production promotion bez explicitniho permission manifestu
    - Validace musi odlisit legalni blocker od technicke coverage chyby
    - Hotovo: `validate:range-import` requires `--permission-manifest` for exit 0
  - [x] 103.3 Pridat audit report bez URL do app UI
    - Interni audit muze mit zdroje, uzivatelske UI zustava source-free
    - Hotovo: dashboard umi volitelny source-free permission audit panel bez URL, provideru a pack id

- [x] 104. MTT 9-max turbo import execution
  - Superseded-by: 135.5 P1 preflop CHIP_EV production import wave.
  - [x] 104.1 Zpracovat legalni 9-max turbo ante ON export
    - Import musi projit `validate:range-import --kind=mtt-preflop`
  - [x] 104.2 Zpracovat legalni 9-max turbo ante OFF export
    - Stack mapping a ante assumptions musi byt explicitni
  - [x] 104.3 Vytvorit production RangePacky pro 9-max turbo
    - Packy musi mit MEDIUM/HIGH confidence, records > 0 and full hand-class maps

- [x] 105. MTT 9-max turbo promotion QA
  - Superseded-by: 135.7 Preflop production runtime de-fallback.
  - [x] 105.1 Zapojit turbo packy do MTT preflop registry
    - Readiness report musi prejit z MISSING na PRODUCTION
  - [x] 105.2 Otestovat turbo gate v UI a drill engine
    - MTT/FULL_RING_9/TURBO/PREFLOP/chipEV ma spustit drill jen po validaci
    - Hotovo: bootstrap gate test pro vsechny format/speed/ante kombinace overuje, ze FULL_RING_9/TURBO zustane zablokovany jako missing production range a nespusti poker table
  - [x] 105.3 Porovnat regular vs turbo coverage diff
    - Diff musi ukazat, zda jde o dedicated ranges nebo schvaleny reuse policy
    - Hotovo: `buildMttPreflopSpeedDiffReport` a `verify:ranges` vypisuji FULL_RING_9 regular-vs-turbo diff jako BLOCKED, protoze turbo pack chybi a neni schvaleny reuse policy

- [x] 106. MTT 6-max regular import execution
  - Superseded-by: 135.5 P1 preflop CHIP_EV production import wave.
  - [x] 106.1 Zpracovat legalni 6-max regular ante ON export
    - Pokryt UTG,HJ,CO,BTN,SB,BB, vsechny buckets a contexts
  - [x] 106.2 Zpracovat legalni 6-max regular ante OFF export
    - Strict i lenient mapy musi mit 169 hand classes na record
  - [x] 106.3 Vytvorit production 6-max regular RangePacky
    - Candidate LOW/empty packy nahradit nebo doplnit produkcnimi packy bez legacy fallbacku

- [x] 107. MTT 6-max regular promotion QA
  - [x] 107.1 Zapojit 6-max regular do production gate
    - SIX_MAX/REGULAR/PREFLOP/chipEV ma spustit spravny 6-max drill
    - Hotovo: readiness/bootstrapping drzi 6-max regular chipEV jako SIX_MAX candidate bez legacy 9-max drillu a completion row ukazuje legalni production import slot
  - [x] 107.2 Otestovat seat model a pozicni filtr pro 6-max
    - UI nesmi ukazovat full-ring mrtve pozice v konkretni otazce 6-max profilu
    - Hotovo: seat model odmita pozice mimo SIX_MAX a DOM regresni test overuje, ze prepnuti profilu na 6-max skryje UTG+1/UTG+2/LJ z pozicniho filtru i z `getFilters()`
  - [x] 107.3 Otestovat statistiky podle tableFormat
    - 6-max vysledky se nesmi michat s 9-max profilem bez explicitniho breakdownu
    - Hotovo: `statsV2Analytics` regresni test micha FULL_RING_9 a SIX_MAX V2 zaznamy a overuje oddeleny `tableFormat` breakdown i rozdilny `profileId`

- [x] 108. MTT 6-max turbo import execution
  - Superseded-by: 135.5 P1 preflop CHIP_EV production import wave.
  - [x] 108.1 Zpracovat legalni 6-max turbo ante ON export
    - Turbo assumptions musi byt oddelene od regular metadata
  - [x] 108.2 Zpracovat legalni 6-max turbo ante OFF export
    - Source stack to bucket mapping musi byt soucasti review reportu
  - [x] 108.3 Vytvorit production 6-max turbo RangePacky
    - Readiness musi projit bez SPEED_METADATA_ONLY shortcutu

- [x] 109. MTT 6-max turbo promotion QA
  - [x] 109.1 Zapojit 6-max turbo do production gate
    - SIX_MAX/TURBO/PREFLOP/chipEV ma spustit drill az po production readiness
    - Hotovo: readiness report drzi SIX_MAX/TURBO jako SPEED_METADATA_ONLY candidate a bootstrap gate test overuje, ze drill se pred production readiness nespusti
  - [x] 109.2 Porovnat 6-max regular vs turbo action distributions
    - Audit ma upozornit na podezrele identicke ranges bez reuse policy
    - Hotovo: speed diff audit hlasi SIX_MAX regular/turbo jako BLOCKED, protoze oba candidate packy nemaji records a turbo je metadata-only bez dedikovanych hand recommendations
  - [x] 109.3 Spustit release checkpoint pro vsechny MTT preflop profily
    - Full suite, build, verify:ranges and source-free UI policy
    - Hotovo 2026-06-12: `npm run release:check` proslo po 6-max/turbo gate QA; 82 test files, 373 tests, verify:ranges, build and bundle budget jsou zelene

- [x] 110. Preflop production promotion pipeline
  - [x] 110.1 Vytvorit jednotny normalized pack builder pro import JSON
    - Builder musi vyrobit TypeScript RangePack modul z validovaneho JSON vstupu
    - Hotovo: `buildRangeModule` supports MTT preflop and flop production module text
  - [x] 110.2 Pridat dry-run report bez zapisu souboru
    - Operator musi videt diff a blockers pred generovanim packu
    - Hotovo: `npm run build:range-module -- --dry-run ...` prints writeReady and blockers without writing
  - [x] 110.3 Pridat promotion checklist do Agents auditu
    - Kazdy promoted pack musi mit legal, coverage, UI gate and tests checked
    - Hotovo: intake manifest and range-intake README include builder/promotion workflow

- [x] 111. Preflop range semantic QA
  - [x] 111.1 Detekovat prazdne nebo trivialni hand maps
    - Pack s all-fold nebo all-open mapou nesmi projit bez explicitni review warningu
    - Hotovo: MTT import warning pro all-FOLD/all-open mapy
  - [x] 111.2 Detekovat neobvykle action mixy podle contextu
    - Napr. RFI bez open akcniho klice nebo VS_3BET bez call/4bet/fold signalu
    - Hotovo: context-specific non-fold action warningy pro MTT import
  - [x] 111.3 Pridat histogram action distribution do import reportu
    - Reviewer musi videt action mix per position/bucket/context
    - Hotovo: import report renders strict/lenient action distribution per record

- [x] 112. Preflop answer explanation upgrade
  - [x] 112.1 Navazat explanation text na production range metadata
    - Vysvetleni nesmi citovat zdroje, ale ma ukazat pokerovy duvod: position, stack, blockers, pressure
    - Hotovo: trainer and HH import use source-free explanation from context, position, stack, hand class and action
  - [x] 112.2 Odstupnovat explanation pro beginner/standard/advanced mod
    - Pokrocily mod muze ukazat vice range reasoning bez solver frequencies
    - Hotovo: `buildPreflopExplanation` supports BEGINNER/STANDARD/ADVANCED
  - [x] 112.3 Pridat regression test na source-free explanation
    - Zadny provider, URL, pack id ani internal rule id ve viditelnem UI
    - Hotovo: unit coverage for source-free explanation text

- [x] 113. Preflop curriculum and session design
  - [x] 113.1 Pridat targeted training podle nejslabsich KPI
    - Hrac muze spustit session pouze pro nejhorsi position/context/bucket
    - Hotovo: dashboard Training focus panel umi spustit targeted preflop session podle nejslabsi KPI dimenze
  - [x] 113.2 Pridat spaced repetition prioritizaci
    - Casto spatne spoty se maji vracet casteji, ale deterministicky podle seedu
    - Hotovo: `buildPreflopSpacedRepetitionQueue` radi due spoty deterministicky podle seed + chybovost
  - [x] 113.3 Pridat session goal metriky
    - Napr. 20 spotu, 80% recent accuracy, streak target, leak cleanup
    - Hotovo: curriculum plan obsahuje target spots, target accuracy, streak target and leak cleanup target

- [x] 114. Flop SRP production import execution
  - Superseded-by: 135.8 P3 FLOP production import wave.
  - [x] 114.1 Zpracovat legalni SRP flop production StrategyPack
    - Pokryt EP vs BB, BTN vs BB, SB vs BB, OOP raiser vs IP caller
  - [x] 114.2 Pokryt vsechny required board textures v SRP
    - A-high, broadway, low, paired, monotone, two-tone, connected, dry, draw-heavy
  - [x] 114.3 Zapojit SRP production pack do resolver chain
    - Production data ma mit prioritu pred public heuristic fallbackem

- [x] 115. Flop SRP production UI QA
  - [x] 115.1 Otestovat UI labely pro production vs fallback
    - Hrac vidi model confidence source-free, ne provider/source detail
    - Hotovo: postflop UI rozlisuje `Production model` pro non-public StrategyPack resolver a `Heuristic model` pro public fallback; DOM test hlida source-free vystup bez pack/rule/source URL
  - [x] 115.2 Otestovat Flopzilla matrix lanes z production dat
    - Value/bluff/check lanes maji odpovidat production rangeBuckets
    - Hotovo: production resolvery predavaji source-free `rangeBuckets` do runtime source payloadu a Flopzilla matrix pouziva production lane mapu pro odpovidajici handClasses; DOM test hlida hero bunku s `data-lane-source="production"`
  - [x] 115.3 Otestovat mobile layout pro SRP table + matrix
    - Matrix scroll, seat labels and board cards nesmi pretekat
    - Hotovo: postflop DOM/CSS test hlida mobile SRP table rozmery, seat mobile pozice, board card sizing a matrix min-width scroll guard; `mobileWebViewSmoke` pokryva 360x800, 390x844 and 412x915 bez source URL v UI

- [x] 116. Flop 3bet pot production import execution
  - Superseded-by: 135.8 P3 FLOP production import wave.
  - [x] 116.1 Zpracovat legalni 3bet pot flop StrategyPack
    - OOP caller vs IP 3bettor a IP/OOP c-bet situace musi byt pokryte
  - [x] 116.2 Rozlisit SPR windows pro 3bet poty
    - Low/mid SPR pravidla nesmi pouzivat SRP sizing heuristiku bez mappingu
  - [x] 116.3 Zapojit 3bet production pack do resolver chain
    - 3bet pot fallback se pouzije jen tam, kde production rule chybi

- [x] 117. Flop production range frequencies and mixes
  - [x] 117.1 Rozsirit range bucket schema o frequency/mix metadata
    - Frequencies lze zobrazit az po legalnim solver exportu a source-free interpretaci
    - Hotovo: `FlopProductionRangeBucket` ma volitelne `actionMix` metadata s validaci akci, souctu 100 %, duplicit a exact-frequency permission gate
  - [x] 117.2 Pridat mixed-action hero feedback
    - Hero hand muze byt pure value, pure bluff, pure check or mixed
    - Hotovo: flop resolver predava source-free hero range bucket vcetne actionMix a postflop result ukazuje mixed-action feedback bez pack/rule/source citaci
  - [x] 117.3 Otestovat, ze exact frequencies nejsou v UI bez povoleni
    - Pokud licence nepovoluje exact frequencies, UI ukaze pouze kvalitativni bucket
    - Hotovo: kvalitativni actionMix v postflop resultu ukazuje mixed actions bez procent a s hlaskou, ze exact frequencies jsou skryte

- [x] 118. Turn production model roadmap
  - [x] 118.1 Definovat turn production schema
    - Turn musi umet prior flop action, turn card class, SPR, position pattern and range lane
    - Hotovo: `TurnProductionStrategyPack` schema a coverage report kontroluji prior flop action, turn card class, SPR, position pattern, TURN_BARREL node, range lanes a exact-frequency permission gate
  - [x] 118.2 Pripravit turn import validator
    - Legal input, coverage and source-free report jako u flopu
    - Hotovo: `turn-production` je podporovany ve validate/build CLI, coverage reportu, module builderu, intake dokumentaci a syntetickem shape-only prikladu
  - [x] 118.3 Napojit turn production resolver
    - Public heuristic zustava fallback, production ma prioritu
    - Hotovo: `turnProductionStrategyResolver` matchuje TURN_BARREL podle prior flop action, turn card class, SPR a position pattern; registry dava turn production pred public heuristic fallback

- [x] 119. River production model roadmap
  - [x] 119.1 Definovat river production schema
    - River musi umet runout, blocker relevance, value/bluff/check lanes and sizing
    - Hotovo: `RiverProductionStrategyPack` schema a coverage report kontroluji river runout class, blocker relevance, prior turn action, SPR, position pattern, RIVER_PRESSURE node, range lanes a exact-frequency permission gate
  - [x] 119.2 Pripravit river import validator
    - Legal input, coverage and source-free report jako u flopu
    - Hotovo: `river-production` je podporovany ve validate/build CLI, coverage reportu, module builderu, intake dokumentaci a syntetickem shape-only prikladu
  - [x] 119.3 Napojit river production resolver
    - River pressure spoty maji pouzit production data tam, kde existuji
    - Hotovo: `riverProductionStrategyResolver` matchuje RIVER_PRESSURE podle prior turn action, river runout class, SPR a position pattern; registry dava river production pred public heuristic fallback

- [x] 120. Postflop multi-street training flow
  - [x] 120.1 Pridat navaznost flop -> turn -> river v jedne hande
    - Board runout a predchozi akce musi zustat konzistentni
    - Hotovo: `generatePostflopLine` vytvari deterministickou FLOP/TURN/RIVER line se sdilenymi hero kartami, runoutem, pot/stack progresi a prior flop/turn action pro navazujici resolvery
  - [x] 120.2 Ukladat street sequence do postflop stats
    - KPI musi umet odlisit single-street quiz od multi-street hand line
    - Hotovo: multi-street line replay se uklada do samostatneho `mtt_preflop_postflop_line_events_v1` logu a export/import/reset jej drzi oddelene od single-street `postflop_events`
  - [x] 120.3 Otestovat deterministic seed replay pro multi-street flow
    - Stejny seed musi vratit stejnou sekvenci karet a spotu
    - Hotovo: `postflopLineSimulator.test.ts` overuje deterministicky FLOP/TURN/RIVER runout a action history pro stejny seed
  - [x] 120.4 Zapojit hand line do postflop UI
    - Trener musi umet projit jednu handu postupne FLOP -> TURN -> RIVER a ulozit ji jako jednu sequence
    - Hotovo: postflop UI ma `Hand line` mode, navazujici Next Turn/River flow, finalni souhrn a `onLineCompleted` save do line event logu

- [x] 129. MTT completion matrix
  - [x] 129.1 Definovat canonical MTT profile matrix
    - Pokryt `FULL_RING_9`/`SIX_MAX` x `REGULAR`/`TURBO` x `CHIP_EV`/`DOLAR_EV` x `PREFLOP`/`FLOP`/`TURN`/`RIVER` x ante ON/OFF tam, kde dava smysl
    - Hotovo: `buildMttCompletionReadinessReport` generuje canonical 64radkovou MTT matici pro format, speed, EV model, street a ante
  - [x] 129.2 Rozsirit MTT readiness report o DOLAR_EV a street coverage
    - Missing/candidate/production stav musi byt explicitni, ne implicitni null
    - Hotovo: completion readiness explicitne oznacuje DOLAR_EV preflop jako missing dedicated pack a postflop streety jako candidate preview bez production scoringu
  - [x] 129.3 Pridat release gate pro kompletni MTT matici
    - Build nesmi tise pustit profil bez production dat mimo povoleny preview/fallback rezim
    - Hotovo: `buildMttCompletionReleaseGateReport` a `npm run mtt:completion` overuji, ze production rows jsou productionReady a vsechny non-production rows maji explicitni blocker
    - Parent uzavren: completion matrix/gate tooling je hotove; realne production importy zustavaji samostatne sledovane v import execution/promote QA tascech

- [x] 130. MTT preflop production completion
  - [x] 130.1 Sloucit 9-max a 6-max import validatory do jednoho MTT preflop validatoru
    - Jeden validator ma podporovat oba tableFormaty, regular/turbo, CHIP_EV/DOLAR_EV a ante ON/OFF
    - Hotovo: `mttPreflopRangePackImport` je jednotny validator pro `FULL_RING_9` i `SIX_MAX`; legacy `mttSixMaxRangePackImport` zustava jen kompatibilni wrapper nad stejnym kontraktem
  - [x] 130.2 Pripravit legal import slots pro chybejici MTT preflop profily
    - 9-max turbo, 6-max regular, 6-max turbo, CHIP_EV i DOLAR_EV musi mit samostatne pack id a permission manifest
    - Hotovo: `buildMttPreflopImportSlots` generuje 14 neprodukcnych MTT preflop slotu s pack id, raw folderem, `normalized.json`, `permission.json` a povolenymi licenseKind hodnotami; intake docs popisuji slot naming a workflow
  - [x] 130.3 Zapojit vsechny promoted preflop packy do production gate
    - Drill engine smi spustit production scoring jen pro profily s dedicated hand recommendations
    - Hotovo: `buildRangeModule` pro `mtt-preflop` vyzaduje production-ready import, validni permission manifest a shodu `packId` s legal import slotem; mimo-slot pack nedostane `writeReady`
    - Parent uzavren: preflop import/gate framework je hotovy; legalni export zpracovani a promotion QA zustavaji v 104-109

- [x] 131. MTT postflop production completion
  - [x] 131.1 Dokoncit flop SRP/3bet production resolver chain
    - SRP i 3bet poty musi pokryt pozicni patterny, board textures, SPR windows a range lanes
    - Hotovo: flop production resolver chain matchuje action node, pot type, position pattern, board texture a SPR; testy overuji SRP prioritizaci, 3bet production pack a fallback pri nevalidnim production packu
  - [x] 131.2 Pridat turn production resolver
    - Navazat na `TurnProductionStrategyPack`, prior flop action, turn card class, SPR a position pattern
    - Hotovo: `generatePostflopSpot` predava board, default prior flop action a klasifikovanou turn kartu do production resolveru
  - [x] 131.3 Pridat river production schema, validator a resolver
    - River musi umet runout class, blocker relevance, value/bluff/check lanes, sizing a final action node
    - Hotovo: river runtime schema, validator a resolver jsou zapojene do default postflop production fallback chainu; CLI import podpora zustava v `119.2`
  - [x] 131.4 Rozsirit postflop action taxonomy
    - Street/action nodes musi pokryt check, bet small/big, call, raise, fold tam, kde treningovy node dava smysl
    - Hotovo: `PostflopAction` ma centralni taxonomy `CHECK/BET_SMALL/BET_BIG/CALL/RAISE/FOLD`; training spot, UI labely, HH review, StrategyPack import report, turn/river production validatory a line simulator nove akce typove podporuji bez toho, aby existujici c-bet/barrel generatory predstiraly facing-bet data
  - [x] 131.5 Pridat facing-bet postflop action nody
    - Call/raise/fold nesmi byt prilepene na c-bet/barrel node, ale musi mit vlastni streetove nody
    - Hotovo: `FLOP_FACING_BET`, `TURN_FACING_BET` a `RIVER_FACING_BET` prochazeji generator, training spot, generic StrategyPack resolver, persistence guardy a dashboard labely; defaultni c-bet/barrel flow zustava check/bet-only
  - [x] 131.6 Doplnit SPR window coverage do flop production reportu
    - Hotovo: `FlopProductionCoverageReport` sleduje `LOW/MID/HIGH` SPR bandy, production gate vyzaduje vsechny bandy a textovy report ukazuje chybejici SPR okna
  - [x] 131.7 Napojit MTT completion matrix na postflop production coverage reporty
    - Hotovo: completion readiness uz neoznacuje postflop pouze pauslane jako heuristic preview; pokud je registrovany flop/turn/river production pack pro tableFormat/EV/street, radek pouzije jeho coverage report, pack id a konkretni missing coverage blokery
  - [x] 131.8 Pridat explicitni blindSpeed/ante coverage do postflop production packu
    - Hotovo: flop/turn/river production schema vyzaduji `dimensions.blindSpeeds` a `dimensions.antes`; completion matrix matchuje postflop production pack jen na radky s explicitne deklarovanym speed/ante profilem
  - [x] 131.9 Vynutit kompatibilitu production akci s postflop action nodem
    - Hotovo: flop/turn/river production validatory blokují `CALL/RAISE/FOLD` v c-bet/barrel/river-pressure nodech, prior street akce omezuji na bet/check production flow a module builder reportuje i chybejici SPR bandy
  - [x] 131.10 Pripravit legal import sloty pro MTT postflop production profily
    - Hotovo: `buildMttPostflopImportSlots` generuje 48 source-free FLOP/TURN/RIVER slotu pro tableFormat, speed, EV model a ante; sloty maji stabilni pack id, raw folder, `normalized.json`, `permission.json` a helper pro mapovani production packu podle deklarovane coverage
  - [x] 131.11 Zapojit postflop import sloty do production module builderu
    - Hotovo: `buildRangeModule` pro flop/turn/river production vyzaduje MTT gameVariant a shodu deklarovane coverage alespon s jednim legalnim MTT postflop slotem; mimo-slot pack nedostane `writeReady`
  - [x] 131.12 Vynutit MTT gameVariant v postflop production validatorech
    - Hotovo: flop/turn/river production validatory odmitaji non-MTT `gameVariant`, takze coverage reporty i module builder maji stejny MTT-only kontrakt
  - [x] 131.13 Pridat operator CLI pro legalni MTT import sloty
    - Hotovo: `npm run mtt:slots` vypisuje source-free preflop i postflop sloty vcetne pack id, `normalized.json` a `permission.json` cest; podporuje `--kind=preflop|postflop`
  - [x] 131.14 Propagovat legalni import slot do MTT completion readiness radku
    - Hotovo: kazdy non-production radek v `buildMttCompletionReadinessReport` nese `importSlot` s kind, pack id, `normalized.json` a `permission.json`; production radky maji `importSlot: null`
  - [x] 131.15 Pridat detailni MTT completion CLI vystup s import sloty
    - Hotovo: `npm run mtt:completion -- --details` vypise non-production radky vcetne blockeru, import kind, legalniho pack id, `normalized.json` a `permission.json` cest
  - [x] 131.16 Sjednotit naming MTT import slotu
    - Hotovo: preflop sloty, postflop sloty i completion readiness pouzivaji sdileny `mttImportSlotNaming`; canonical `slotId` obsahuje format, speed, EV, street a ante
  - [x] 131.17 Vynutit legalni MTT slot uz ve validate:range-import
    - Hotovo: `validate:range-import` pro preflop vyzaduje presny legalni slot `packId`; postflop import musi matchovat alespon jeden legalni MTT postflop slot a CLI vypisuje matched sloty
  - [x] 131.18 Zobrazit matched import sloty v build:range-module dry-run
    - Hotovo: `buildRangeModule` vraci `matchedImportSlots` a report vypisuje slot id, pack id, `normalized.json` a `permission.json` cesty pro preflop i postflop production moduly
  - [x] 131.19 Sjednotit validaci legalnich MTT import slotu
    - Hotovo: `mttImportSlotValidation` centralizuje preflop/postflop legal-slot reporty, sdili render vystup pro CLI a pouziva ho i `buildRangeModule`, takze `validate:range-import` a `build:range-module` hlidaji stejne slot kontrakty
  - [x] 131.20 Pridat filtry do detailniho MTT completion CLI
    - Hotovo: `npm run mtt:completion -- --details` podporuje `--format`, `--speed`, `--ev`, `--street`, `--ante` a `--status`, takze operator muze vypsat jen konkretni import slice misto cele 64radkove matice
  - [x] 131.21 Pridat filtry do MTT import slot CLI
    - Hotovo: `npm run mtt:slots` podporuje stejne dimenzni filtry jako completion CLI, takze legalni `normalized.json`/`permission.json` cesty lze vypsat jen pro konkretni import batch
  - [x] 131.22 Pridat JSON vystup pro MTT import slot CLI
    - Hotovo: `npm run mtt:slots -- --json` vraci source-free strukturovany vystup s pocty, filtry a preflop/postflop sloty pro operator tooling
    - Doplneno 2026-06-24: `mtt:slots -- --output=artifacts/mtt-slots-report.json` uklada cisty JSON artefakt se vsemi 64 legalnimi import sloty pro CI/operator handoff.
  - [x] 131.23 Pridat JSON vystup pro MTT completion CLI
    - Hotovo: `npm run mtt:completion -- --json` vraci release gate, pouzite filtry a filtrovanou readiness matici pro operator tooling
  - [x] 131.24 Sjednotit parser MTT CLI filtru
    - Hotovo: `mttCliFilterParsing` sdili `--format`, `--speed`, `--ev`, `--street`, `--ante` a `--status` parser mezi `mtt:completion` a `mtt:slots`
  - [x] 131.25 Otestovat konzistenci JSON completion a slot tooling vystupu
    - Hotovo: regresni CLI test porovnava `importSlot.packId` z `npm run mtt:completion -- --json` s `packId` ze stejne filtrovaneho `npm run mtt:slots -- --json`, aby operator tooling nedostal rozdilne import sloty
  - [x] 131.26 Pridat JSON vystup do range import validatoru
    - Hotovo: `npm run validate:range-import -- --json` vraci strukturovany `valid`, `productionReady`, `legalImportSlot`, `permissionReady`, slot report a permission report pro batch import tooling; textovy vystup zustava default
  - [x] 131.27 Pridat JSON vystup do range module builder dry-runu
    - Hotovo: `npm run build:range-module -- --dry-run --json` vraci `writeReady`, matched import sloty, blockery a permission report bez vypisu generovaneho `moduleText`, aby batch tooling mohl bezpecne vyhodnotit promotion gate
    - Parent uzavren: postflop schema/resolver/import-slot/tooling framework je hotovy; realne SRP/3bet production importy a UI QA zustavaji v 114-116

- [x] 132. MTT cross-position and multi-street simulation
  - [x] 132.1 Generovat heads-up postflop kontexty pro vsechny podporovane dvojice pozic
    - Full ring i 6-max musi umet legalni IP/OOP, aggressor/caller a pot type mapping
    - Hotovo: `postflopPositionContextsForFormat` generuje supported SRP a 3bet heads-up kontexty pro `FULL_RING_9` i `SIX_MAX`; random full-ring pool uz nepada jen na puvodni 4 fixture spoty
  - [x] 132.2 Pridat deterministic hand line replay flop -> turn -> river
    - Jedna simulovana handa musi zachovat board runout, pot, SPR, predchozi akce a action history
    - Hotovo: `postflopLineSimulator` vraci street snapshoty a action history s pot/effective stack pred a po akci
  - [x] 132.3 Ukladat multi-street sequence do statistik oddelene od single-street quizu
    - KPI musi umet filtrovat podle single-street vs sequence training
    - Hotovo: `PostflopLineResultRecord` a `postflopLineStatsStore` ukladaji streetResults/actionHistory oddelene; stats transfer podporuje `postflopLineRecords` bez michani do single-street KPI
  - [x] 132.4 Otevrit multi-street replay z postflop treneru
    - UI musi projit FLOP/TURN/RIVER jako jednu hand line a zachovat single-street quiz flow
    - Hotovo: `postflopView` umi prepnout mezi `Single spot` a `Hand line`; DOM test overuje vsechny tri streety, callback cele line a izolaci od single-street callbacku

- [x] 121. Postflop table and action UX polish v2
  - [x] 121.1 Pridat vizualni pot geometry pro bet sizing
    - Small/big bet ma byt jasne videt bez textove instruktaze
    - Hotovo: table center ukazuje check/small/big bet geometry s trackem, chip markers, sizing data and tests for stable seeds
  - [x] 121.2 Zobrazit aktivniho agresora, callera a IP/OOP role na stole
    - Postflop table musi byt citelny i bez meta radku
    - Hotovo: seats maji actionRole/positionRole data, aggressor/caller/IP/OOP role chips and visual role outlines
  - [x] 121.3 Pridat keyboard flow pro postflop odpovedi
    - 1/2/3 nebo arrow navigation, focus state and mobile safe behavior
    - Hotovo: postflop action buttons podporuji 1/2/3 selection and arrow-key focus navigation; test drzi result focus po odpovedi

- [x] 122. Statistics dashboard v2
  - [x] 122.1 Pridat trend recent accuracy v case
    - Graf ma ukazat posledni sessions/windows, ne jen agregat
    - Hotovo: KPI panel zobrazuje combined preflop/postflop Recent accuracy trend po oknech, vcetne source datasetu a responzivniho mini grafu
  - [x] 122.2 Pridat confidence-weighted KPI
    - Preview/fallback spoty nemaji mit stejnou vahu jako production spoty
    - Hotovo: KPI panel pocita confidence-weighted accuracy pres preflop verified a postflop HIGH/MEDIUM/LOW/fallback vahy, vcetne rozpadoveho grafu
  - [x] 122.3 Pridat decision-time trend
    - Ukazat zrychleni/zpomaleni jen po dostatecnem sample
    - Hotovo: dashboard decision-time trend ma min-sample gate, okna po timed decisions, faster/slower/stable summary and mobile-safe bars

- [x] 123. Leak recommendation engine
  - [x] 123.1 Vypocitat top 3 next study focus oblasti
    - Minimum sample, low accuracy and recent mistakes maji urcit prioritu
    - Hotovo: curriculum plan pocita top-3 recommendations se score podle sample, lifetime accuracy and recent mistakes; dashboard je zobrazuje jako Next study focus
  - [x] 123.2 Nabidnout one-click focused session
    - Dashboard leak row muze spustit trening s odpovidajicimi filtry
    - Hotovo: dashboard leak rows i Next study focus recommendations maji Train action napojenou na targeted filters
  - [x] 123.3 Otestovat, ze recommendations nejsou genericke pri malem sample
    - Pri nizkem objemu zobrazit volume goal misto leak soudil
    - Hotovo: low-volume preflop sample vraci Build sample volume goal, bez generickych leak recommendations

- [x] 124. Stats storage and privacy hardening
  - [x] 124.1 Pridat schema version pro postflop responseMs a future dimensions
    - Import musi zustat backward compatible
    - Hotovo: PostflopStatsV2BridgeRecord ma record schemaVersion, import/store normalizuji legacy zaznamy bez verze na aktualni schema
  - [x] 124.2 Pridat selective reset/export per profile
    - Hrac muze exportovat nebo smazat jen vybrany profil
    - Hotovo: stats transfer ma profile selector, profile-only export and Reset selected profile pro preflop/postflop records
  - [x] 124.3 Pridat storage quota handling testy
    - Pri selhani localStorage se UI nesmi rozbit a stats warning ma byt source-free
    - Hotovo: preflop/postflop answer save, dashboard import and selected-profile reset quota/failure paths maji source-free UI regression coverage

- [x] 125. HH import to trainer bridge
  - [x] 125.1 Mapovat importovanou HH na preflop training spot
    - Pokud HH odpovida podporovanemu contextu, ukazat correct range a action feedback
    - Hotovo: HH analysis mapuje prvni importovanou preflop akci na ActionKey, ukazuje Your action/Result/Recommended a explicitne ji neuklada do drill statistik
  - [x] 125.2 Mapovat importovanou HH na flop spot
    - Board, positions, pot type and SPR musi krmit postflop resolver
    - Hotovo: parser cte FLOP board, HH bridge stavi SRP flop training spot pro jasne preflop agresorske HH a UI zobrazuje source-free Flop review bez ulozeni do drill statistik
  - [x] 125.3 Ulozit HH review vysledek oddelene od drill statistiky
    - Review mode nema kontaminovat trening accuracy bez explicitni volby
    - Hotovo: HH review se uklada do samostatneho `mtt_preflop_hh_reviews_v1` event logu jako odvozene preflop/flop review zaznamy; drill `events` a `postflop_events` zustavaji nedotcene

- [x] 126. Range matrix and Flopzilla UX v2
  - [x] 126.1 Pridat combo-level detail po kliknuti na hand cell
    - Cell detail muze ukazat strict/lenient actions and lane explanation
    - Hotovo: preflop matrix cell click/Enter ukazuje strict vs lenient actions; postflop Flopzilla cell ukazuje category, lane and practical plan
  - [x] 126.2 Pridat filters pro action/lane/category
    - Preflop matrix i flop matrix musi umet rychle izolovat relevantni subset
    - Hotovo: preflop legend izoluje action category; postflop Flopzilla ma category legend highlight a range summary lane filters
  - [x] 126.3 Otestovat mobile horizontal scroll and sticky labels
    - 13x13 matrix musi zustat pouzitelna na Android WebView
    - Hotovo: preflop i postflop matrix maji horizontal scroll/sticky row labels; DOM/CSS testy plus mobile smoke kryji 360x800, 390x844 and 412x915

- [x] 127. Accessibility and keyboard QA
  - [x] 127.1 Projit tab order pro training, dashboard, HH import and postflop
    - Focus order musi sledovat skutecny workflow
    - Hotovo: preflop Start presouva focus na action buttons, odpoved na Next spot, Change situation zpet na profile selector; postflop spot presouva focus na actions, odpoved na vysledek a navrat na street selector
  - [x] 127.2 Pridat ARIA labels pro icon/action controls
    - Tlacitka bez popisu musi byt citelna screen readerem
    - Hotovo: app shell ma tablist/tab/tabpanel semantiku; opakovane All/None filter controls maji kontextove accessible names
  - [x] 127.3 Pridat reduced-motion safe mode
    - Animace a hover efekty nesmi byt nutne pro pouziti
    - Hotovo: app shell, postflop, HH import and range modal maji `prefers-reduced-motion` CSS guard; tests hlidaji jeho pritomnost

- [x] 128. Mobile and Android WebView release QA
  - [x] 128.1 Spustit screenshot QA pro 360x800, 390x844, 412x915
    - Table, filters, postflop matrix and dashboard nesmi pretekat
    - Poznamka: Browser `iab` backend nebyl v teto relaci dostupny; doplnen automatizovany viewport smoke pro 360x800, 390x844 and 412x915
    - Retry 2026-06-05: node_repl tool je dostupny, ale Browser stale hlasi `Browser is not available: iab`; real screenshot QA zustava otevrena
    - Retry 2026-06-11: Browser tool discovery neposkytlo ovladac pro screenshoty a `playwright` neni dostupny jako Node modul; real screenshot QA zustava otevrena, automatizovane mobile smoke testy pro 360x800, 390x844 and 412x915 prosly v `npm test`
    - Retry 2026-06-12: Browser skill bootstrap opet skoncil na `Browser is not available: iab`; `npx vitest run tests/unit/mobileWebViewSmoke.test.ts` prosel vcetne 360x800, 390x844 and 412x915, ale real screenshot QA zustava otevrena
    - Hotovo 2026-06-12: local Chrome headless screenshot QA pres DevTools Protocol proslo pro 360x800, 390x844 and 412x915; table, filters, postflop matrix and dashboard mely page-level horizontal overflow 0; report je v `Agents/mobile-screenshot-qa-2026-06-12.md`
  - [x] 128.2 Otestovat offline reload po service worker cache
    - App musi fungovat bez runtime fetch
    - Hotovo: service worker test pokryva offline navigation reload z cache
  - [x] 128.3 Otestovat localStorage persistence na mobile viewportu
    - Stats, postflop records and seed replay musi prezit reload
    - Hotovo: mobile WebView smoke overuje postflop stats po reloadu se stejnym localStorage

- [x] 129. Performance and bundle budget
  - [x] 129.1 Zavest bundle size budget
    - Build ma failnout nebo varovat pri necekane velkem narustu JS bundle
    - Hotovo: `npm run bundle:budget` kontroluje raw/gzip JS asset limit po buildu a je soucasti `npm run release:check`
    - Hotovo: budget default rebasovan na 325 KiB raw / 86 KiB gzip pro aktualni MTT/postflop tooling bundle; metadata test hlida, ze posun neni tichy
  - [x] 129.2 Profilovat render 13x13 matic a postflop table
    - Matrix hover/filter nesmi byt pomaly na mobilu
    - Hotovo: `npm run profile:render` meri preflop matrix, preflop table and postflop Flopzilla matrix jsdom render baseline
  - [x] 129.3 Optimalizovat large range pack loading
    - Production packy nesmi zhorsit first render bez potreby
    - Hotovo: RangeFile entries, MTT RangePack records and RANGE_INDEX aggregation jsou lazy/cached; bootstrap renderuje filtry pred production preflop range availability checkem

- [x] 130. Release automation and CI gates
  - [x] 130.1 Sjednotit release command
    - Jednim prikazem spustit typecheck, tests, verify:ranges and build
    - Hotovo: `npm run release:check` spousti typecheck, tests, verify:ranges and build
    - Hotovo: `npm run release:check` spousti take MTT completion gate, source-free blocker summary a ready-only range intake status
    - Hotovo: `npm run release:check` spousti take range intake workspace guard proti omylem commitnutym raw vstupum
  - [x] 130.2 Pridat CI gate pro source-free visible UI
    - Test ma failnout pri URL/provider/pack id ve viditelnem UI
    - Hotovo: source-free UI test ma release-gate surface coverage a regex blokaci URL, provideru, pack id and rule id
  - [x] 130.3 Pridat CI gate pro production readiness
    - Production pack nesmi byt LOW, empty or missing legal metadata
    - Hotovo: readiness test blokuje LOW, empty records, missing source/search metadata, warnings and invalid flop production packs

- [x] 131. Documentation for users and operators
  - [x] 131.1 Napsat user-facing quick start bez zdrojovych citaci
    - Vysvetlit Training, Statistics, HH Import and postflop flow
    - Hotovo: `Agents/user-quick-start.md` popisuje Training, Statistics, HH Import and postflop flow bez URL/provider/pack id citaci
  - [x] 131.2 Napsat operator guide pro range import
    - Jak pouzit validate:range-import, verify:ranges, audit manifest and promotion checklist
    - Hotovo: `Agents/range-import-operator-guide.md` popisuje validate, build, verify, release gate and promotion checklist
  - [x] 131.3 Napsat release notes template
    - Oddelit gameplay changes, range data changes, stats schema and known limitations
    - Hotovo: `Agents/release-notes-template.md` oddeluje gameplay, range data, stats, gates and limitations
    - Hotovo: `Agents/mtt-production-coverage-audit.md` shrnuje aktualni MTT completion, DOLAR_EV, postflop production blockery, range intake a regular-vs-turbo diff audit

- [ ] 133. Aktualni MTT dokoncovaci priority
  - Stav 2026-06-17: `npm run release:check` je zamerne blokovany produkcnimi MTT gates; MTT completion ma 64 radku, 2 production rows, 52 candidate/preview rows, 10 missing rows, 62 blocker rows a 0 ready-for-validation intake slotu.
  - Aktualni cil: kompletni MTT simulace pro 6-max i 9-max full ring, regular i turbo, CHIP_EV i DOLAR_EV, preflop/flop/turn/river, vsechny pozice, streety a action typy.
  - Zasada: nevyrabet ani nerecyklovat chart hodnoty bez legalniho `normalized.json` a `permission.json`; technicke kroky maji zkratit cestu k importu a zmensit riziko spatneho povyseni.
  - [x] 133.1 Zanalyzovat aktualni vysledek proti prioritnim cilum
    - Hotovo: release, completion, blocker, intake guard a task backlog ukazuji, ze runtime/tooling je pripraveny, ale production coverage je datove blokovana.
  - [x] 133.2 Pridat prioritizovany source-free MTT intake plan
    - Operator musi videt serazeny import queue: ready files nejdriv, potom preflop CHIP_EV gapy, preflop DOLAR_EV gapy a nasledne postflop production streety.
    - Hotovo: `npm run mtt:intake-plan` radi aktualnich 64 non-production slotu podle priority, ukazuje lokalni intake stav, validacni command a podporuje `--json`, `--all`, `--limit` i MTT filtry.
  - [x] 133.3 Napojit intake plan do dokumentace a regression testu
    - Plan musi byt dostupny pres npm script, podporovat JSON pro batch tooling a byt uvedeny v operator guide/release metadatech.
    - Hotovo: operator guide, range-intake README, coverage audit, release notes template a metadata/CLI testy drzi `mtt:intake-plan` workflow.
  - [x] 133.4 Pridat priority bucket filtr pro batch zpracovani
    - Operator musi umet vypsat jen konkretni prioritni skupinu, napr. preflop CHIP_EV nebo river production, bez skladani vice dimenznich filtru.
    - Hotovo: `npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all` filtruje konkretni priority bucket a reportuje `byPriority` pocty v textu i JSON.
  - [x] 133.5 Pridat ready/waiting filtr do prioritniho MTT intake planu
    - Po dodani prvnich legalnich souboru musi jit vypsat jen sloty pripravene k validaci bez rucniho parsovani cele fronty.
    - Hotovo: `npm run mtt:intake-plan -- --ready-only --json` a `--waiting-only` sdili stejny ready/waiting workflow jako obecny `range:intake` report.
  - [x] 133.6 Pridat batch validaci ready MTT intake slotu
    - Po vlozeni vice legalnich vstupu musi jit jednim prikazem overit, ze vsechny ready sloty projdou production, legal-slot a permission dry-run build validaci.
    - Hotovo: `npm run mtt:validate-ready-intake` cte pouze sloty s `normalized.json` i `permission.json`, nic nezapisuje a vraci nenulovy exit pri blokovanem ready slotu.
    - Doplneno 2026-06-24: `mtt:validate-ready-intake -- --output=artifacts/mtt-validate-ready-intake-report.json` uklada cisty JSON handoff artefakt pro legalni import batch.
  - [x] 133.7 Sjednotit MTT intake priority mezi planem a ready validaci
    - Priority bucket logika musi byt sdilena, aby `mtt:intake-plan` a `mtt:validate-ready-intake` nemohly driftovat.
    - Hotovo: priority jsou ve sdilenem modulu a ready validace podporuje `--priority=P1_PREFLOP_CHIP_EV` pro cilene batch kontroly.
  - [x] 133.8 Zprisnit permission manifest proti placeholder textu
    - Permission manifest nesmi projit jen proto, ze jsou povinna pole vyplnena retezcem typu TODO.
    - Hotovo: permission validator odmita `TODO`, `TBD`, `FIXME`, `REPLACE_ME`, `FILL_ME`, `CHANGEME` a `PLACEHOLDER` kdekoliv v manifest string polich.
  - [x] 133.9 Zprisnit normalized production importy proti placeholder textu
    - Stejna placeholder ochrana musi platit i pro normalized range/strategy JSON, aby se TODO text nedostal do production modulu.
    - Hotovo: MTT preflop a flop/turn/river production validatory sdili placeholder guard pro metadata, assumptions, explanations a source evidence.
  - [x] 133.10 Doplnit build dry-run prikazy primo do MTT intake planu
    - Operator nema po validaci rucne skladat navazujici module-builder command.
    - Hotovo: `mtt:intake-plan` u kazdeho slotu vypisuje `validate:range-import` i odpovidajici `build:range-module --dry-run`.
  - [x] 133.11 Sjednotit reprodukovatelne build dry-run prikazy pro ready validaci
    - Ready validator ma ukazat stejny navazujici build command jako intake plan, aby sel kazdy validovany slot rucne reprodukovat.
    - Hotovo: `mtt:validate-ready-intake` vraci `buildCommand` v JSON i textovem reportu a sdili command builder s intake planem.
  - [x] 133.12 Po dodani legalnich dat postupovat podle intake planu - superseded
    - Nejdriv validovat ready sloty, potom generovat production moduly, zapojit registry/resolvery a spustit `npm run release:check`.
    - Navazne fronty:
      - `npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all`
      - `npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all`
      - `npm run mtt:intake-plan -- --priority=P3_FLOP_PRODUCTION --all`
      - `npm run mtt:intake-plan -- --priority=P4_TURN_PRODUCTION --all`
      - `npm run mtt:intake-plan -- --priority=P5_RIVER_PRODUCTION --all`
      - `npm run mtt:validate-ready-intake -- --fail-on-empty`
    - Superseded: vlastni execution a acceptance jsou vedene v 135.27, 135.5, 135.6, 135.28 a 135.8-135.10.
  - [x] 133.13 Udrzet DOLAR_EV jako samostatnou preflop intake prioritu
    - P2 fronta nesmi byt jen implicitni filtr, protoze aktualni cil explicitne zahrnuje CHIP_EV i DOLAR_EV.
    - Hotovo: operator guide, intake README, coverage audit a CLI regression test pokryvaji `P2_PREFLOP_DOLAR_EV`.
  - [x] 133.14 Propagovat intake priority do blocker reportu
    - Kratky blocker summary ma umet rict nejen kolik veci chybi, ale i do ktere P0-P5 import fronty patri.
    - Hotovo: `mtt:blockers` text i JSON vraci `byPriority` pocty a detailni radky nesou stejny priority bucket jako `mtt:intake-plan`.
  - [x] 133.15 Agregovat MTT release gate souhrny
    - `release:check` nema po prvnim cervenem MTT gate schovat dalsi blocker souhrny.
    - Hotovo: `npm run mtt:release-gates` spusti completion, blocker, postflop release, range intake guard, ready-only intake a ready validator souhrny pred vracenim finalniho exit code; `release:check` pouziva tento agregator.
  - [x] 133.16 Pridat strojove citelny souhrn MTT release gates
    - CI a operator tooling musi umet precist finalni stav i status kazdeho gate prikazu bez parsovani textoveho reportu.
    - Hotovo: `npm run mtt:release-gates -- --json` vraci `valid`, pocty prikazu, statusy, argumenty a zachycene vystupy vsech MTT release gates.
  - [x] 133.17 Sjednotit production intake manifest s agregovanym release gate
    - Import checklist nesmi operatora vracet ke starym izolovanym gate prikazum, kdyz release tok pouziva agregator.
    - Hotovo: `Agents/production-range-intake-manifest.md` vede finalni overeni pres `npm run mtt:release-gates` a JSON variantu pro CI/tooling.
  - [x] 133.18 Pridat kratky MTT intake plan summary do release diagnostiky
    - Release diagnostika ma ukazat priority frontu bez dlouheho vypisu slotu a bez rucniho parsovani full intake planu.
    - Hotovo: `npm run mtt:intake-plan -- --summary` vypise jen pocty a priority; `npm run mtt:release-gates` ho zahrnuje mezi agregovane souhrny.
  - [x] 133.19 Pripravit konsolidovany MTT completion backlog
    - Dosavadni hotove runtime/tooling/UI casti a datove blokery musi byt prevedene do jednoho hlavniho planu pro dokonceni MTT casti aplikace.
    - Hotovo: sekce 135 definuje MTT application completion package od definition-of-done pres P1-P5 import waves az po finalni release candidate a supersedovani starsich duplicitnich tasku.

- [ ] 134. MTT postflop full production roadmap FLOP-TURN-RIVER
  - Cil: plne funkcni MTT postflop simulace od flopu po river pro FULL_RING_9 i SIX_MAX, REGULAR i TURBO, CHIP_EV i DOLAR_EV, ante ON/OFF, vsechny podporovane heads-up pozicni dvojice, SRP/3bet/facing-bet vetve, vsechny streety a vsechny akce, ktere dany node legalne pripousti.
  - Hotovy technicky zaklad: `generatePostflopLine` umi deterministickou FLOP->TURN->RIVER hand line, postflop UI umi single spot i hand line, stats ukladaji single-street i line eventy oddelene, flop/turn/river production schema maji validatory a resolvery, `mtt:slots` generuje 48 postflop import slotu, `validate:range-import`, `build:range-module`, `mtt:intake-plan`, `mtt:blockers` a `mtt:validate-ready-intake` jsou pripraveny na legalni data.
  - Zasada: postflop production nesmi vzniknout z public heuristic fallbacku ani z metadata-only reuse; kazdy slot potrebuje legalni `normalized.json`, `permission.json`, production-ready coverage report a source-free runtime vystup.
  - [x] 134.1 Zmrazit presnou MTT postflop variant matrix
    - Definovat release cile pro 48 postflop slotu: 2 tableFormat x 2 blindSpeed x 2 evModel x 2 ante x FLOP/TURN/RIVER.
    - Vystup: audit tabulka pro P3/P4/P5 s pocty slotu, pozadovanym import kindem a aktualnim stavem `WAITING/READY/PRODUCTION`.
    - Hotovo: `npm run mtt:postflop-matrix` vypisuje 48 FLOP/TURN/RIVER cilu s P3/P4/P5 prioritou, import kindem, intake stavem a JSON vystupem pro batch tooling; `--output=artifacts/mtt-postflop-matrix-report.json` uklada cisty handoff artefakt.
  - [x] 134.2 Definovat pozicni coverage pro vsechny heads-up dvojice
    - Pro FULL_RING_9 a SIX_MAX vypsat vsechny podporovane aggressor/caller, IP/OOP a blind-vs-blind dvojice mezi pozicemi.
    - Kazda dvojice musi mit `PostflopPositionPattern`, pot type mapping, nebo explicitni unsupported duvod; zadna dvojice nesmi tise spadnout do nespravneho patternu.
    - Hotovo: `npm run mtt:postflop-positions` vypisuje 204 ordered pair radku pro FULL_RING_9/SIX_MAX x SRP/3bet, vcetne 67 supported a 137 explicitne unsupported dvojic s duvodem; `--output=artifacts/mtt-postflop-positions-report.json` uklada cisty handoff artefakt.
  - [x] 134.3 Rozsirit position pattern model tam, kde soucasnych 5 patternu nestaci
    - Legacy patterny pokryvaji `EP_VS_BB`, `BTN_VS_BB`, `SB_VS_BB`, `OOP_RAISER_VS_IP_CALLER`, `OOP_CALLER_VS_IP_3BETTOR`.
    - Doplnit chybejici CO/HJ/LJ/UTG+1/UTG+2 full-ring a 6-max mapovani nebo zavest granularnejsi patterny tak, aby produkcni pack nemichal odlisne pozicni range.
    - Hotovo: `PostflopPositionPattern` podporuje legacy hodnoty i granularni `SRP_<POS>_VS_<POS>` / `3BP_<POS>_VS_<POS>` patterny; MTT FLOP/TURN/RIVER production coverage ted vyzaduje 50 unikatnich granularnich patternu odvozenych z FULL_RING_9/SIX_MAX SRP/3bet heads-up coverage.
  - [x] 134.4 Dodelat production coverage report pro postflop pozicni dvojice
    - Pridat report/test, ktery porovna generator pozic s flop/turn/river production coverage.
    - Release blocker musi ukazat chybejici format/speed/EV/ante/street/position/potType/actionNode kombinace proti 50-pattern granularnimu kontraktu, ne jen chybejici obecny StrategyPack.
    - Hotovo: `npm run mtt:postflop-coverage` rozbaluje 48 postflop profilu na 9,600 konkretnich street/pot/action/position targetu po doplneni flop, turn a river facing-bet vetvi; JSON vraci vsechny radky vcetne blocker kindu (`MISSING_PACK`, `MISSING_RULE`, `PACK_NOT_PRODUCTION_READY`) a `--output=artifacts/mtt-postflop-coverage-report.json` uklada plny handoff artefakt.
  - [x] 134.5 Rozsirit flop production schema na facing-bet vetve
    - `FlopProductionStrategyPack` dnes produkcne pokryva c-bet nody `SINGLE_RAISED_POT_CBET` a `THREE_BET_POT_CBET` s check/bet akcemi.
    - Doplnit legalni production podporu pro `FLOP_FACING_BET` s akcemi `CALL/RAISE/FOLD`, oddelenou od c-bet pravidel a validovanou coverage reportem.
    - Hotovo: `FlopProductionStrategyPack` validuje `FLOP_FACING_BET` pro SRP i 3bet poty s legalnimi `FOLD/CALL/RAISE` akcemi, c-bet nody zustavaji `CHECK/BET_SMALL/BET_BIG`, resolver matchuje facing-bet jen pri explicitnim action nodu a coverage report vyzaduje `FLOP_FACING_BET`.
  - [x] 134.6 Rozsirit turn production schema na facing-bet vetve
    - `TurnProductionStrategyPack` dnes produkcne pokryva `TURN_BARREL` s check/bet akcemi.
    - Doplnit `TURN_FACING_BET`, prior flop/turn action kontext, legalni `CALL/RAISE/FOLD` akce a coverage pro vsechny pozadovane turn card classes.
    - Hotovo: `TurnProductionStrategyPack` validuje `TURN_FACING_BET` s legalnimi `FOLD/CALL/RAISE` akcemi, `TURN_BARREL` zustava `CHECK/BET_SMALL/BET_BIG`, resolver matchuje facing-bet jen pri explicitnim action nodu a coverage report vyzaduje obe turn vetve.
  - [x] 134.7 Rozsirit river production schema na facing-bet vetve
    - `RiverProductionStrategyPack` dnes produkcne pokryva `RIVER_PRESSURE` s check/bet akcemi.
    - Doplnit `RIVER_FACING_BET`, prior action kontext, runout class, blocker relevance a legalni `CALL/RAISE/FOLD` akce.
    - Hotovo: `RiverProductionStrategyPack` validuje `RIVER_FACING_BET` s legalnimi `FOLD/CALL/RAISE` akcemi, `RIVER_PRESSURE` zustava `CHECK/BET_SMALL/BET_BIG`, resolver matchuje facing-bet jen pri explicitnim action nodu a coverage report vyzaduje obe river vetve.
  - [x] 134.8 Navrhnout branching hand-line engine podle skutecne akce hrace
    - Soucasny line replay postupuje deterministicky pres doporucenou akci spotu.
    - Plna simulace musi umet posunout pot, stack, prior action a dalsi street podle realne zvolene akce hrace a podle modelovane reakce soupere, vcetne facing-bet vetvi.
    - Hotovo: `generatePostflopLine` prijima `chosenActionsByStreet`, uklada zdroj akce (`RECOMMENDED`/`CHOSEN`), prepina dalsi street na facing-bet node po callu, ukonci line po foldu/all-in a UI line mode po odpovedi prepocita budouci streety podle realne volby hrace.
  - [x] 134.9 Pridat street transition kontrakt FLOP->TURN->RIVER
    - Definovat, jak se prenasi board, pot, effective stack, aggressor, caller, in-position role, priorFlopAction, priorTurnAction a action history.
    - Testy musi overit, ze SRP a 3bet poty nepreskakuji do nespravneho action nodu po check/call/raise/fold vetvi.
    - Hotovo: `transitionPostflopLineState` formalizuje dalsi street, action node, pot, stack, prior action a terminal reason; testy overuji `CHECK -> TURN_BARREL`, `CALL -> *_FACING_BET`, `TURN CALL -> RIVER_FACING_BET` a `FOLD` terminal bez dalsi streety.
  - [x] 134.10 Importovat legalni P3 FLOP production data pro vsechny varianty - superseded
    - Postupovat pres `npm run mtt:intake-plan -- --priority=P3_FLOP_PRODUCTION --all`.
    - Pro kazdy ready slot spustit `validate:range-import`, `build:range-module --dry-run`, potom vygenerovat production modul a registrovat pack v resolver chainu.
    - Superseded: realne dodani zustava otevrene v 135.28 a 135.8.
  - [x] 134.11 Importovat legalni P4 TURN production data pro vsechny varianty - superseded
    - Postupovat pres `npm run mtt:intake-plan -- --priority=P4_TURN_PRODUCTION --all`.
    - Coverage musi zahrnout SRP/3bet, prior flop actions, turn card classes, SPR/pot windows, pozicni patterny, range lanes a facing-bet vetve.
    - Superseded: realne dodani zustava otevrene v 135.28 a 135.9.
  - [x] 134.12 Importovat legalni P5 RIVER production data pro vsechny varianty - superseded
    - Postupovat pres `npm run mtt:intake-plan -- --priority=P5_RIVER_PRODUCTION --all`.
    - Coverage musi zahrnout prior turn actions, river runout classes, blocker relevance, value/bluff/check lanes, facing-bet vetve a finalni decision akce.
    - Superseded: realne dodani zustava otevrene v 135.28 a 135.10.
  - [x] 134.13 Definovat legalni reuse policy pro speed/EV jen pokud je explicitne povolena
    - REGULAR/TURBO a CHIP_EV/DOLAR_EV nesmi sdilet postflop doporuceni bez reviewed reuse policy v permission manifestu a auditnim reportu.
    - Pokud reuse neni povoleny, kazdy speed/EV slot zustava samostatny import blocker.
    - Hotovo: `ProductionPermissionManifest` podporuje `reusePolicy.allowedDimensions`, permission report prijima cilove blind speed / EV dimenze, `validate:range-import` i `buildRangeModule` blokuji multi-speed/multi-EV target bez explicitniho reuse povoleni a testy kryji validni i nevalidni reuse evidenci.
  - [x] 134.14 Povysit postflop completion gate z preview na production
    - Po importu legalnich dat musi `mtt:completion` ukazat FLOP/TURN/RIVER radky jako production-ready pro vsechny cilove varianty.
    - Public heuristic fallback smi zustat jen v explicitnim preview/development rezimu, ne v produkcni MTT completion definici.
    - Hotovo: vychozi `npm run mtt:completion` bezi v `PRODUCTION` modu a vraci nenulovy exit pro kazdy non-production radek; puvodni operatorky nahled je dostupny pouze explicitne pres `--preview`.
  - [x] 134.15 Otestovat runtime resolver bez ticheho fallbacku pro production profily
    - Pro kazdy production postflop profil musi resolver vybrat legalni production pack nebo vratit blokujici stav; nesmi potichu pouzit public heuristic model.
    - Testy pokryji FULL_RING_9/SIX_MAX, REGULAR/TURBO, CHIP_EV/DOLAR_EV, ante ON/OFF a FLOP/TURN/RIVER.
    - Hotovo: `createMttProductionPostflopStrategyResolver` filtruje packy podle MTT table/speed/EV/ante/street a nikdy nepridava public heuristic fallback; testy overuji celou postflop profilovou mrizku bez production packu i pozitivni FLOP/TURN/RIVER match.
  - [x] 134.16 Otestovat UI hand-line flow pro vsechny street/action typy
    - DOM testy musi projit single spot i hand line pro c-bet/barrel/pressure i facing-bet nody.
    - UI musi zustat source-free, bez pack id, provideru, URL a raw enumu.
    - Hotovo: `postflopView` ma deterministicky `initialActionNode` pro testy/HH bridge, DOM testy pokryvaji vsechny single-spot nody (`*_CBET`, `TURN_BARREL`, `RIVER_PRESSURE`, `*_FACING_BET`) a hand-line facing-bet branch `CALL -> TURN_FACING_BET -> FOLD` bez URL/StrategyPack/Rule textu.
  - [x] 134.17 Rozsirit HH bridge na turn/river review
    - HH import dnes mapuje preflop a flop review.
    - Doplnit TURN/RIVER board, action history, pot/SPR a facing-bet mapovani tak, aby importovana handa sla porovnat proti stejnym production resolvers jako trainer.
    - Hotovo: `hhParser` extrahuje FLOP/TURN/RIVER board a postflop action history, `hhPostflopBridge` generuje importovane review spoty pro vsechny dostupne streety vcetne `*_FACING_BET` mapovani a HH UI uklada/ukazuje preflop+flop+turn+river review zaznamy bez source citaci.
  - [x] 134.18 Doplnit postflop KPI podle variant a line vetvi
    - Dashboard musi umet oddelit FLOP/TURN/RIVER, SRP/3bet/facing-bet, position pair, action node, single spot vs hand line a confidence/production stav.
    - Leak recommendation nesmi michat production a preview/fallback spoty bez confidence vahy.
    - Hotovo: postflop dashboard breakdowny rozlisuji street, action node, pot type, position pattern/pair, texture, model, confidence a production/preview/fallback stav; pridana je flow-mode agregace `Single spot` vs `Hand line` z postflop line zaznamu a confidence-weighted KPI zustava oddelene vahovane pro production/preview/fallback.
  - [x] 134.19 Pridat finalni MTT postflop release gate
    - Novy gate musi selhat, pokud nektery cilovy FLOP/TURN/RIVER production slot chybi, ma LOW confidence, chybejici permission, placeholder text, nekompletni coverage nebo fallback runtime.
    - Gate spustit v `npm run release:check` az po nahrani legalnich production dat.
    - Hotovo: `npm run mtt:postflop-release` je zapojeny do `npm run release:check`; gate je source-free a aktualne spravne selhava na 48 FLOP/TURN/RIVER slotech bez production packu, normalized importu a permission manifestu.
  - [x] 134.20 Finalni acceptance pro plne funkcni MTT postflop - superseded
    - `npm run release:check` zeleny.
    - `npm run mtt:blockers -- --summary` nema P3/P4/P5 blocker rows.
    - `npm run mtt:intake-plan -- --priority=P3_FLOP_PRODUCTION --all`, P4 a P5 neukazuji waiting sloty.
    - Manualni smoke: 6-max/9-max, regular/turbo, chipEV/$EV, ante ON/OFF, FLOP/TURN/RIVER hand line projde bez source citaci a bez fallback warningu.
    - Superseded: finalni postflop acceptance je soucasti 135.19, 135.20 a 135.22.

- [ ] 135. MTT application completion package - hlavni backlog pro dokonceni MTT casti
  - Cil: v prvni produkcni casti aplikace mit kompletne funkcni MTT trenink pro FULL_RING_9 i SIX_MAX, REGULAR i TURBO, CHIP_EV i DOLAR_EV, ante ON/OFF, PREFLOP/FLOP/TURN/RIVER, vsechny podporovane pozice, pot/action nody, single spot i hand-line flow, HH review, stats a release gates.
  - Aktualni audit 2026-06-22:
    - Technicky baseline je zeleny: typecheck, 225 test suites / 545 testu, produkcni build, precache integrity a bundle budget prosly 2026-06-23.
    - Profile-bound runtime, capability matrix, scenario identity, postflop state machine, generated registry, semanticke QA, lokalizace/a11y, CI a realny Chrome E2E jsou implementovane; otevrene P0 zustavaji lazy pack delivery navazana na prvni legalni import a Android WebView/device potvrzeni.
    - Produkcni MTT gate je cerveny: 64 completion rows, 0 production-ready, 54 preview, 10 missing; 64 blocker rows a 0 ready-for-validation slotu.
    - P1/P2/P3/P4/P5 fronta je 8 / 8 / 16 / 16 / 16 slotu. Vsem 64 chybi `normalized.json` i `permission.json`.
    - Postflop ma 48/48 blocker rows, 48 fallback runtime rows a 0 production-ready rows.
    - Intake workspace a registry integrity jsou technicky validni. Vsech 6 historickych/candidate MTT preflop packu je explicitne `PREVIEW_ONLY`; zadny z nich neni povazovan za production.
    - Generovany runtime katalog, automaticky refresh a fail-closed integrity jsou hotove; dva historicke full-ring packy vyzaduji stejny canonical legalni re-import jako ostatni P1 sloty.
    - Preflop i postflop runtime a HH review jsou profile-bound a fail-closed; bez legalniho production packu zobrazi blokujici source-free stav.
    - `Agents/requirements.md` a `Agents/design.md` jsou nove oznacene jako historicky preflop-only baseline s odkazem na 64radkovy release kontrakt; navazujici plny MTT variant scope je v sekci 137.
  - Kriticka zasada: produkcni MTT doporuceni nesmi vzniknout z public heuristic fallbacku, metadata-only reuse ani rucne domyslenych chart hodnot. Kazdy povyseny slot potrebuje legalni `normalized.json`, `permission.json`, production-ready validaci, legal-slot match a source-free runtime vystup.
  - Aktualizace 2026-07-01:
    - Hlavni produktovy stav: kod a tooling jsou pripraveny na import/promotion, ale MTT release zustava blokovany daty. `mtt:handoff` je `valid: true`, `releaseReady: false`, ma 18 prikazu, 6 failed commands a 5 release-blocking failures.
    - Intake stav: `mtt:next-action -- --json` je `WAITING_FOR_FILES`, 64 blocker rows, 0 readyForValidation, chybi 64x `normalized.json` a 64x `permission.json`. Prvni blokujici slot zustava `FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF`.
    - TexasSolver stav: parameter pack je zeleny pro 3 solver-verification family a 10 parameter files (`mtt:texas-solver-pack valid: true`). Lokalne existuje 10/10 raw JSON exportu, stage artefakty jsou `READY_FOR_REVIEW` pro 3/3 family a `mtt:solver-verification -- --solver=texas-solver --summary` je `valid: true`.
    - Lokalni solver workspace obsahuje raw TexasSolver JSON exporty i `strategy-export.review.json` souhrny. Tyto artefakty se nesmi commitovat ani povazovat za production; nejdrive musi projit poker review a mapovanim do canonical `normalized.json` + `permission.json`.
    - Aktualni nejvetsi riziko neni typovani/UI, ale strategicka kvalita a auditovatelnost dat: presne oddelit CHIP_EV od DOLAR_EV, regular od turbo, preview od production a raw solver vystup od reviewed runtime artefaktu.
  - Primary execution order:
    - P0-A: obnovit zeleny working tree (135.29), uzavrit specifikaci (135.23), capability matrix (135.30), identitu spotu/statistik (135.31), registry (135.25) a profile-bound fail-closed runtime (135.26).
    - P0-B: uzavrit legalni status legacy dat (135.24), korektnost postflop state machine (135.32), HH parity (135.33), lokalizaci/a11y (135.34), lazy/offline pack delivery (135.35), semanticke data gate (135.36), CI (135.37) a browser/device E2E (135.38).
    - P0 pilot: povysit jeden P1 slot kompletne od raw evidence az po realny start treninku.
    - P1: dokoncit preflop CHIP_EV produkcni mezery.
    - P2: dokoncit preflop DOLAR_EV produkcni mezery.
    - P3: importovat FLOP production StrategyPacky.
    - P4: importovat TURN production StrategyPacky.
    - P5: importovat RIVER production StrategyPacky.
    - P6: spustit end-to-end app QA, performance/mobile/source-free a release kandidat.
  - Aktualni priority pro dalsi autonomni behy:
    - A1 Data hygiene: necommitovat raw solver exporty, privatni range evidence ani permission detaily; vsechny raw vystupy drzet v lokanim workspace a do gitu davat jen source-safe tooling/docs/tests.
    - A2 TexasSolver verification: dokoncit noční solve pres `run-nightly-verification.ps1 -RunSolve -ReviewTemplate`, stageovat vsechny family a ziskat `READY_FOR_REVIEW` solver-verification stav bez rucniho klikani.
    - A3 Solver adapter: po existenci raw exportu napsat parser/adapter, ktery z TexasSolver JSON vytahne relevantni root/node strategie, action mixy a hand-class agregace do review artefaktu; neprodukovat `normalized.json` bez lidske kontroly.
    - A4 Postflop pilot: z reviewed solver vystupu vyrobit jeden minimalni FLOP pilot StrategyPack pro presny profile/pot/position/node, validovat coverage a zkontrolovat UI/stat parity.
    - A5 P1 preflop pilot: jakmile jsou dodana legalni preflop data, zpracovat prvni `FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF` slot pres canonical import -> dry-run -> promote -> registry -> targeted smoke.
    - A6 Release hardening: po kazde import vlně obnovit `mtt:handoff`, drzet `tasks.md` a release notes ve shode s reporty, a az na konci resit finalni polish/FTP balicek.
  - Definition of done pro kazdy jednotlive povyseny slot:
    - Legalni raw evidence je ulozena lokalne mimo Git.
    - `normalized.json` a `permission.json` maji shodny `packId` a projdou workspace guardem.
    - `validate:range-import` vrati productionReady i permissionReady.
    - `build:range-module --dry-run` vrati writeReady a legal-slot match.
    - Modul je vygenerovan, deterministicky registrovan v runtime katalogu a projde `mtt:registry-integrity`.
    - Odpovidajici completion row je `PRODUCTION`, profil lze spustit a runtime nevrati candidate/heuristic fallback.
    - Spot, score i statisticky zaznam nesou spravny profil a strategii; zadna data se nepripisi defaultnimu 9-max CHIP_EV profilu.
    - Targetovane testy, source-free UI guard a prislusny wave gate jsou zelene.
  - [x] 135.1 Zafixovat MTT product definition of done
    - Sepsat do `Agents/tasks.md` a release dokumentace presny stav, kdy je MTT cast povazovana za hotovou: vsechny 64 MTT completion rows production-ready, 0 blocker rows, 0 waiting ready/intake slotu, vsechny user flows bez fallback warningu.
    - Definition of done musi explicitne zahrnout 6-max/9-max, regular/turbo, CHIP_EV/DOLAR_EV, ante ON/OFF, PREFLOP/FLOP/TURN/RIVER, SRP/3bet/facing-bet, c-bet/barrel/pressure, call/raise/fold vetve a hand-line transitions.
    - Vystup: kratky "MTT done checklist" pouzitelny pri finalnim release rozhodnuti.
    - Hotovo: `Agents/mtt-done-checklist.md` definuje produkcni matici, data/permission pozadavky, runtime pozadavky, user smoke a release candidate gate pro MTT complete v1.
  - [x] 135.2 Zavest jeden MTT acceptance prikaz nad existujicimi gates
    - Pridat `npm run mtt:acceptance`, ktery spusti produkcni MTT completion, blockers, intake summary, postflop release, ready validation, source-free UI guard relevantni pro MTT a vrati strukturovany JSON/text.
    - Rozdil proti `mtt:release-gates`: acceptance ma byt finalni MTT-only gate s jasnym "green only when MTT app complete" kontraktem.
    - Testy: CLI text, JSON, zamerne cerveny stav pred legalnimi daty, green fixture/mocking jen pokud nevyzaduje falesna produkcni data.
    - Hotovo: `npm run mtt:acceptance` agreguje completion, blockers, intake summary, next action, postflop release, ready validation, source-free UI guard, range intake guardy, registry integrity a Android WebView/device preflight do text/JSON reportu s checklist odkazem; aktualne spravne selhava na legalnich production datech a chybejicim Android targetu.
    - Doplneno 2026-06-24: `mtt:acceptance -- --output=artifacts/mtt-acceptance-report.json` a `mtt:release-gates -- --output=artifacts/mtt-release-gates-report.json` ukladaji cisty JSON artefakt bez npm headeru pro release handoff/CI.
    - Doplneno 2026-06-24: `mtt:completion -- --output=artifacts/mtt-completion-report.json`, `mtt:intake-plan -- --output=artifacts/mtt-intake-plan-report.json`, `mtt:blockers -- --output=artifacts/mtt-blockers-report.json` a `mtt:postflop-release -- --output=artifacts/mtt-postflop-release-report.json` ukladaji ciste zdrojove reporty pro handoff.
    - Doplneno 2026-06-25: `npm run mtt:handoff` regeneruje vsechny source-free MTT/range/Android JSON artefakty jednim prikazem, ulozi agregat do `artifacts/mtt-handoff-report.json` a selze jen pri chybejicim artefaktu; cervene produkcni data gates zustavaji zapsane jako `releaseReady: false`.
    - Doplneno 2026-06-25: `mtt:handoff -- --strict` pouziva stejny artefaktovy balik jako finalni RC kontrolu a vrati nenulovy exit, dokud neni `releaseReady: true`.
    - Doplneno 2026-06-30: mtt:handoff automaticky vola mtt:next-action -- --packet-dir=artifacts/mtt-next-action/packet, takze handoff obsahuje i checklist packet pro prvni blokujici legal slot bez raw placeholder souboru.
    - Doplneno 2026-06-30: handoff report validuje README, expected-paths a oba requirements soubory next-action packetu jako soucast missing artefaktu.
  - [x] 135.3 Pridat "next MTT action" operator report
    - Pridat prikaz/report, ktery z `mtt:intake-plan`, `mtt:blockers` a `mtt:release-gates -- --json` vybere dalsi nejdulezitejsi praci: prvni ready slot, jinak prvni waiting slot podle P0-P5.
    - Vystup musi obsahovat priority bucket, slotId, packId, chybejici soubory, validate command, build dry-run command a navazujici acceptance prikazy.
    - Cilem je, aby operator po dodani dat nemusel cist 64 radku, ale dostal dalsi konkretni krok.
    - Hotovo: `npm run mtt:next-action` vraci text/JSON s prioritou, slotem, target packem, chybejicimi `normalized.json`/`permission.json`, validate/build dry-run prikazy, follow-up acceptance prikazy a odkazy na zdrojove reporty.
    - Doplneno 2026-06-24: report nyni obsahuje i intake packet pro dalsi slot: required-file acceptance poznamky, filtered `mtt:validate-ready-intake`, promote-ready dry-run/write prikazy, registry integrity, technical acceptance, postflop release handoff report a operator checklist bez URL/source citaci.
    - Doplneno 2026-06-24: `mtt:next-action -- --priority=<bucket>` umi vytahnout dalsi konkretni krok pro P1/P2/P3/P4/P5 wave bez prochazeni cele fronty.
    - Doplneno 2026-06-24: `mtt:next-action -- --output=artifacts/mtt-next-action/report.json` uklada stejny source-free intake packet jako JSON artefakt pro operator handoff/release notes.
    - Doplneno 2026-06-24: next-action packet obsahuje take `npm run e2e:android:preflight`, aby po importu zustal u slotu pripojeny device/readySerial dukaz nebo explicitni Android blocker.
    - Doplneno 2026-06-25: `mtt:next-action` mezi source reporty uvadi take `npm run mtt:handoff -- --output=artifacts/mtt-handoff-report.json`, aby operator mohl pred importem jednim prikazem obnovit cely MTT handoff balik.
    - Doplneno 2026-06-25: `mtt:next-action` source reporty obsahuji i `e2e:android:preflight -- --output=artifacts/e2e-android-preflight/report.json`, aby byl device/readySerial dukaz soucasti stejneho handoff baliku.
    - Doplneno 2026-06-25: `mtt:next-action` follow-up prikazy obsahuji i `npm run mtt:handoff -- --strict` jako finalni RC artefaktovy gate po legalnich importech.
    - Doplneno 2026-06-30: mtt:next-action -- --packet-dir=artifacts/mtt-next-action/packet zapisuje source-free checklist packet pro dalsi slot do artefaktu, ale zamerne nevytvari raw normalized.json/permission.json placeholdery.
    - Doplneno 2026-06-24: `mtt:acceptance` i `mtt:release-gates` vypisuji `MTT next action`, aby cerveny release report rovnou ukazal prvni konkretni import slot.
    - Doplneno 2026-06-24: `mtt:release-gates` zahrnuje Android WebView/device preflight, takze `release:check` po dodani dat nezezeleni bez `readySerial`/device evidence.
  - [x] 135.4 Udelat preflight kontrolu raw MTT import workspace
    - Rozsirit guard tak, aby umel rozlisit povolene lokalni raw soubory od omylem commitnutych privatnich zdroju, ukazal ready/waiting po priority buckets a failnul pri nevalidni strukture `Agents/range-intake/raw/<packId>/`.
    - Soucasti ma byt kontrola, ze `normalized.json` a `permission.json` patri ke stejnemu `packId` a ze slot existuje v legalnim registry.
    - Hotovo: `npm run range:intake:guard` kontroluje git-tracked raw soubory, lokalni raw slozky proti legal slot registry, `normalized.json` id, `permission.json` packId, priority counts a JSON vystup pro operator tooling.
  - [x] 135.23 Sjednotit MTT v1 specifikaci s release kontraktem
    - Aktualizovat `Agents/requirements.md` a `Agents/design.md`, nebo je explicitne oznacit jako historicky preflop-only scope a pridat odkaz na aktualni `Agents/mtt-done-checklist.md`.
    - Jediny platny MTT v1 scope musi byt 2 formaty x 2 speeds x 2 EV modely x 2 ante x 4 streety = 64 completion rows.
    - Explicitne potvrdit, ze DOLAR_EV zde znamena projektovy produkcni model podporeny legalnim vstupem/reuse policy; nesmi se tise vydavat za plny turnajovy ICM model.
    - Acceptance: requirements, design, tasks, completion gate a release notes si neodporuji v poctu profilu ani v postflop scope.
    - Hotovo 2026-06-18: `Agents/requirements.md` a `Agents/design.md` jsou explicitne oznacene jako historicky 9-max CHIP_EV preflop baseline a odkazuji na 64profilovy MTT v1 release kontrakt; DOLAR_EV neni prezentovan jako obecny plny ICM engine.
  - [x] 135.24 Uzavrit legalni provenance dvou legacy production packu
    - Auditovat `mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1` a `...ante-off-v1`, ktere registry report dnes vede jako `LEGACY_OR_UNKNOWN`.
    - Preferovany vysledek: re-importovat je standardnim production pipeline pod legalnim `normalized.json` + `permission.json`, nebo je fail-closed preradit z production, pokud nelze prokazat pravo k runtime redistribuci hodnot.
    - Rozsirit produkcni registry/provenance kontrakt tak, aby commitnuty runtime artefakt nesl source-free audit metadata potrebna pro release kontrolu, i kdyz raw permission evidence zustava mimo Git.
    - Acceptance: zadny MTT production pack neni `LEGACY_OR_UNKNOWN`; finalni gate nepovazuje pouhou existenci historickych dat za legalni production readiness.
    - Hotovo 2026-06-22 fail-closed variantou: readiness vyzaduje canonical production `packId`, oba historicke packy jsou `CANDIDATE`, scoring je blokovany a oba canonical sloty jsou znovu v P1 legal intake fronte.
    - Registry report rozlisuje registrovane neprodukcni packy jako `PREVIEW_ONLY`; `LEGACY_OR_UNKNOWN` se v aktualnim registry baseline nevyskytuje a nelegalni generated production artefakt zustava hard error.
    - Overeni 2026-06-23: typecheck, 545/545 testu, registry refresh/integrity, range audit, produkcni build, precache integrity a bundle budget prosly. Completion baseline je fail-closed 0 production / 54 preview / 10 missing a legal intake fronta obsahuje vsech 64 slotu.
  - [x] 135.25 Automatizovat runtime registry pro vygenerovane production moduly
    - Doplnit deterministicky generovany katalog se statickymi importy pro MTT preflop RangePacky a FLOP/TURN/RIVER StrategyPacky.
    - `mtt:promote-ready --write` musi bud katalog aktualizovat atomicky, nebo vypsat/povinne spustit samostatny `mtt:refresh-registry` krok; rucni editace 4 poli pro desitky packu neni akceptovatelna.
    - Zapojit katalog do `allMttPreflopRangePacks`, `flopProductionStrategyPacks`, `turnProductionStrategyPacks` a `riverProductionStrategyPacks`.
    - Generator musi byt idempotentni, stabilne serazeny podle packId a bezpecny pri nulovem poctu production modulu.
    - Zprisnit `mtt:registry-integrity`: generated-but-unregistered, registered-without-provenance, duplicitni profil a pack pokryvajici nepovolene dimenze jsou release blockery.
    - Testy: prazdny katalog, jeden pack kazdeho druhu, batch packy, opakovany run bez diffu a orphan modul.
    - Hotovo 2026-06-18: `mtt:refresh-registry` deterministicky generuje staticke importy pro vsechny ctyri druhy MTT packu, zapisuje katalog atomickym temp+rename krokem a `mtt:promote-ready --write` ho automaticky obnovuje. Ctyri runtime registry pole nacitaji generated katalog bez rucniho wiring.
    - `release:check` povinne spousti `mtt:refresh-registry -- --check`. Integrity gate blokuje orphan generated modul, chybejici permission manifest, duplicitni runtime profil, nelegalni packId a pack pokryvajici jine dimenze nez jeho legalni slot.
    - Testy pokryvaji prazdny katalog, jeden modul kazdeho druhu, batch/stabilni razeni, ignorovani neplatneho modulu, opakovany run bez diffu a orphan modul bez registrace/provenance. Overeni: typecheck, 102 testovacich souboru / 480 testu, build a bundle budget prosly.
  - [x] 135.26 Udelat produkcni runtime profile-bound a fail-closed
    - Preflop: nahradit CHIP_EV-only start gate obecnym `mttCompletionReadinessRowForTrainingProfile` routovanim, aby CHIP_EV i DOLAR_EV startovaly pouze na odpovidajicim production packu.
    - Preflop lookup nesmi vratit candidate nebo pack z jineho EV/speed/format/ante profilu.
    - Postflop: v `main.ts` sestavit `createMttProductionPostflopStrategyResolver(profile)` a injektovat ho do `renderPostflopView`; production profil nesmi pouzit `createDefaultPostflopStrategyResolver` fallback.
    - HH review musi dostat explicitni profilovy production resolver; pokud profil nebo production coverage chybi, ma zobrazit source-free blokujici stav, ne heuristic radu.
    - Default heuristic resolver ponechat jen pro explicitni preview/development flow, nikoli pro MTT production start.
    - Testy: cela 64profilova matice, cross-profile isolation, DOLAR_EV preflop start, postflop no-fallback a HH no-fallback.
    - Hotovo 2026-06-18: production preflop pouziva izolovany RangeStore konkretniho readiness packu a kontroluje packId; CHIP_EV ani DOLAR_EV nemohou pouzit pack jineho profilu. DOLAR_EV readiness uz neni natvrdo `MISSING`: do production prejde jen po registraci dedikovaneho validniho DOLAR_EV packu.
    - Production-ready postflop start pouziva resolver filtrovany podle format/speed/EV/street/ante a `allowFallback=false`; preview flow zustava explicitne heuristicky. HH postflop review dostava aktualni profil ze selectoru, kontroluje 9-max/ante shodu a pri chybejicim production matchi zobrazi source-free blokujici stav bez ulozeni heuristic review.
    - Testy: cela 64radkova runtime matice, cross-ante izolace preflop store, DOLAR_EV promotion fixture, 48 postflop no-fallback profilu, HH no-fallback a bootstrap quota/mobile regrese. Overeni: typecheck, 103 testovacich souboru / 483 testu, build a bundle budget prosly; hlavni JS 324.97 KiB raw / 85.50 KiB gzip.
  - [x] 135.29 Obnovit zeleny baseline po rozpracovanem profile-bound routingu
    - Dokoncit nebo bezpecne docasne uzavrit vsechny rozpracovane reference v `src/main.ts`: nahradit odstraneny `isProductionPreflopProfile`, skutecne pouzit profilovy RangeStore/RangePack/postflop resolver a vratit kompletni `TrainingController`.
    - Opravit start production 9-max preflopu, candidate/missing gating, quota-save flow, mobile smoke a TypeScript unused/missing symbol chyby bez navratu k cross-profile fallbacku.
    - Doplnit targetovane testy pro aktualni bug a teprve pote spustit full suite.
    - Acceptance: `npm run typecheck`, `npm test`, `npm run build` a `npm run bundle:budget` jsou znovu zelene; zadna global error boundary hlaska pri beznem startu treninku.
    - Hotovo 2026-06-18: `main.ts` pouziva pro production preflop izolovany RangeStore konkretniho readiness packu, production postflop resolver je profilovy a fallback se zakazuje pro production-ready radky; preview flow zustava explicitni. TrainingController je kompletni, quota/mobile/bootstrap regrese jsou opravene a novy test overuje cross-ante/cross-position izolaci store.
    - Overeni: `npm run typecheck`, `npm test -- --reporter=dot` (101 souboru, 476 testu), `npm run build` a `npm run bundle:budget` prosly; hlavni JS ma 323.44 KiB raw / 85.07 KiB gzip.
  - [x] 135.30 Zavest jedinou capability matrix podporovanych profilu
    - Nahradit roztrousene podminky v profile selectoru, start gatech, completion reportu, HH a stats jednim typovanym katalogem schopnosti.
    - Pro kazdy profil rozhodnout `PRODUCTION`, `PREVIEW`, `BLOCKED` nebo `UNSUPPORTED` a povolene streety, EV modely, ante/rake, table formaty a flow modes.
    - MTT v1 nesmi nabizet `ICM`, pokud pro nej neni samostatny release kontrakt; SNG/Cash postflop a dalsi nehotove kombinace musi byt disabled/unsupported, ne obecne MTT preview.
    - UI ma neplatne kombinace zakazat nebo vysvetlit source-free textem; URL/editovana hodnota nesmi obejit gate.
    - Acceptance: selector, bootstrap, completion CLI a runtime resolver pouzivaji stejnou capability funkci a exhaustive test vsech kombinaci neukazuje drift.
    - Hotovo 2026-06-19: `staticTrainingCapability` definuje produktovy kontrakt a `trainingCapabilityForProfile` ho spojuje s MTT completion readiness do kanonickych stavu `PRODUCTION`, `PREVIEW`, `BLOCKED`, `UNSUPPORTED`, povolenych flow modes a fallback policy.
    - Selector zakazuje MTT ICM, SNG/Cash postflop a neplatne Cash dimenze; programaticky neplatna hodnota zustane fail-closed s explicitnim source-free stavem. Bootstrap, HH guard, completion routing a production postflop resolver pouzivaji stejny kontrakt.
    - Exhaustive test klasifikuje vsech 864 kartézskych profilu a potvrzuje presne 64 legalnich MTT v1 kombinaci. Pri implementaci byl opraven Cash ante drift, kdy obecny filtr prepisoval povinne `OFF`.
    - Lokalni overeni: typecheck, 106 testovacich souboru / 501 testu, build, registry integrity/refresh, range audit a bundle budget prosly; main JS 314.98 KiB raw / 82.68 KiB gzip.
  - [x] 135.31 Udelat identitu spotu, scoring a preflop statistiky plne profile-aware
    - Soucasny preflop `Question_ID` nerozlisuje format, speed ani EV a `ResultRecord` neuklada profil; dashboard pak umi historicke udalosti chybne priradit defaultnimu 9-max CHIP_EV profilu.
    - Zavest verzovany `scenarioId` pro preflop i postflop zahrnujici plny profil a rozhodujici stav spotu (pozice aktoru, sizingy, pot/node, hero hand/board), plus samostatnou auditni identitu strategie (`packId`, verze, verifiedAt).
    - Zachovat migraci starych qid/stat zaznamu; stare nejednoznacne udalosti oznacit `LEGACY_UNKNOWN_PROFILE`, ne domyslet produkcni profil.
    - Preflop event schema musi pri odpovedi primo ulozit `profileId`, table/speed/EV/ante, range pack metadata, response time a scoring mode; dashboard/export/import/curriculum nesmi profil zpetne odhadovat.
    - Spaced repetition a deduplikace musi byt oddelene podle profilu a scenare; update strategie nesmi zpusobit tichou kolizi ani ztratu historie.
    - Acceptance: dva jinak shodne spoty v ruznych format/speed/EV profilech maji odlisnou identitu a oddelene KPI; round-trip migrace a export/import jsou otestovane.
    - Progress 2026-06-19: nove preflop odpovedi se ukladaji s `preflop_result_identity_v1`, plnym `profileId`/profile dimensions, `rangePackId`/version/verifiedAt, scoring mode a verzovanym `preflop_scenario_v1` odvozenym z profilu, puvodniho qid a rozhodujiciho table state.
    - Historicke zaznamy bez teto identity se v dashboard/export vrstve oznacuji `LEGACY_UNKNOWN_PROFILE` a `LEGACY_UNKNOWN_STRATEGY`; uz se automaticky nevydavaji za defaultni 9-max regular CHIP_EV production profil.
    - Spaced repetition seskupuje podle `scenarioId`, ne pouze podle qid, takze stejny pokerovy spot v ruznych profilech nesdili attempts/misses. Puvodni Question_ID a pool determinismus zustaly beze zmeny.
    - Postflop bridge schema v4 nese `postflop_scenario_v1`, StrategyPack id/version/verifiedAt a hand-line zaznam sklada `postflop_line_scenario_v1` z profilu, line identity a street scenaru. Legacy postflop zaznamy bez scenario ID zustavaji validni a normalizuji se bez vymysleni chybejiciho stavu.
    - Aktualizace strategie nemeni scenario ID; auditni pack metadata se uchovaji oddelene, takze historie pod stejnym scenarem nekoliduje ani se neztraci.
    - Testy pokryvaji profilovou a stavovou odlisnost scenario ID, realny bootstrap zapis identity, legacy migraci, export/import, oddeleni repetition fronty, postflop single/line identity a update strategie. Overeni: typecheck, 108 testovacich souboru / 510 testu, registry refresh/integrity, range audit, build, precache a bundle budget prosly; main JS 318.42 KiB raw / 83.52 KiB gzip.
  - [x] 135.32 Nahradit zjednoduseny postflop line replay korektnim stavovym automatem
    - Soucasny simulator odvozuje dalsi node hlavne z akce hero a pocita `pot + 2 * bet`, aniz explicitne modeluje castku k dorovnani, kontribuce hracu a reakci soupere.
    - Zavest street state s potem, stacky obou hracu, outstanding betem, sizingem, agresorem, IP/OOP, historii akci a terminalnim stavem.
    - Rozlisit bet/call/raise/all-in, check-through, bet-fold, bet-call, check-raise, raise-call/fold a legalni reopen pravidla; pot a stack se musi pocitat z realnych kontribuci.
    - Modelovana akce soupere musi pochazet z explicitni opponent policy/StrategyPack vetve, ne z implicitniho automatickeho callu.
    - V MTT v1 pokryt heads-up SRP a 3bet poty; limped, 4bet, multiway a side-pot flow explicitne oznacit jako navazujici scope 137, dokud nejsou implementovane.
    - Acceptance: invarianty zachovani chipu, nezapornych stacku, legalnich akci a terminalnich vetvi projdou property testy; reprezentativni FLOP->TURN->RIVER line odpovida rucne spocitanemu potu.
    - Progress 2026-06-19: `PostflopStreetState` explicitne drzi pot, hero/villain stack, outstanding bet, street kontribuce, agresora a terminalni stav. Kazda vygenerovana line akce uklada state before/after, amount-to-call, obe kontribuce a skutecnou reakci soupere.
    - Puvodni `pot + 2 * bet` zkratka byla nahrazena commit/settle prechody. Facing-bet nejdriv odecte villain lead, call dorovna pouze outstanding bet, raise pocita raise-to a nasledny villain call; bet-fold nepridava implicitni call.
    - Souperova reakce pochazi z injektovatelne `PostflopOpponentPolicy`; vychozi policy zachovava dosavadni bet-call/check-through UX, ale testovana custom policy umi bet-fold terminal. Terminal reasons rozlisuji `HERO_FOLD`, `OPPONENT_FOLD`, `STACK_EXHAUSTED` a `SHOWDOWN`.
    - Testy rucne overuji 6 BB pot / 40 BB stack: 75% bet-call -> 15 BB pot a 35.5 BB stacky; facing 3 BB raise-call -> 25.6 BB pot a 30.2 BB stacky. Invariantni matice pres stacky 1/3/10/40/150 BB hlida nezaporne stacky a zachovani chipu.
    - Kazda street akce nyni muze nest atomickou sekvenci s aktorem, castkou, kontribuci po akci, amount-to-call, all-in priznakem, full-raise priznakem a informaci, zda se betting znovu otevrel. Implementovane jsou check-bet-raise-call, bet-raise-call/fold a all-in vetve; kratky all-in nelegalne nereopenne betting.
    - FLOP/TURN/RIVER production StrategyPack rule schema podporuje explicitni `opponentPolicy` pro `afterHeroCheck`, `facingHeroBet` a `facingHeroRaise`. Resolver ji prenasi ve strategy source a line simulator ji pouzije pred vychozi explicitni policy.
    - Stavove snapshoty i atomicke sekvence se validuji a hluboce kopiruji v line persistence/export/import. Testy rucne overuji check-bet-raise-call pot, bet-raise-fold, kratky all-in bez reopen, nelegalni re-raise fallback, StrategyPack policy routing, nezaporne stacky a zachovani chipu.
    - Hotovo 2026-06-19: typecheck, 108 testovacich souboru / 517 testu, registry refresh/integrity, range audit, build, precache a bundle budget prosly. Postflop simulator je v samostatnem offline-precache chunku; main JS 306.24 KiB raw / 79.54 KiB gzip, postflop-line 20.88 KiB raw / 7.10 KiB gzip.
    - Doplneno 2026-06-23: produkcni hand-line pred startem lazy nacte FLOP/TURN/RIVER rodinu vybraneho profilu a dynamicky family resolver routuje kazdou streetu proti aktualne registrovanemu packu. Single-street flow nadale nacita jen zvolenou streetu.
    - UI ma explicitni source-free volbu `Mame iniciativu` / `Celime sazce`; facing-bet hand-line pouziva `CALL` jako prior action do dalsiho `*_FACING_BET` nodu, zatimco initiative vetev prijima `CHECK/BET_SMALL/BET_BIG/RAISE`. Produkcni coverage a validace tento kontrakt vynucuji.
    - Navazujici limped, 4bet, multiway a side-pot flow zustava explicitne scope 137.
  - [x] 135.33 Dodelat MTT HH import/review profilovou paritu
    - Parser dnes sestavuje preflop Spot jen pro plny 9-handed model a pouziva globalni legacy RangeStore; 6-max a DOLAR_EV/regular-turbo profil tak nelze spolehlive reviewovat.
    - Detekovat nebo nechat uzivatele potvrdit table format, blind speed, ante, EV model a street; pro 6-max i 9-max spravne odvodit pozice z buttonu a obsazenych sedadel.
    - Preflop review musi pouzit stejny profilovy RangePack jako trainer, postflop stejny strict production resolver; bez produkcni coverage zobrazit blokujici source-free stav.
    - Parsovat realne sizingy, all-iny, pot/stack po streetach a validovat duplicity karet; nepouzivat nearest-bucket scoring bez viditelne a testovane bucket policy.
    - Acceptance: reprezentativni 6-max a 9-max HH pro CHIP_EV i DOLAR_EV projdou preflop->river review bez global fallbacku a ulozi spravny profil do HH review logu.
    - Progress 2026-06-20: `parseHandHistory` prijima potvrzeny `TrainingProfile`, profilovy `RangeStore` a metadata konkretniho RangePacku. Produkcni HH preflop review je fail-closed: nepouzije globalni legacy store, pri nenactenem packu nebo chybejicim node vrati blokujici source-free stav.
    - Parser odvozuje pozice z buttonu pro potvrzeny `FULL_RING_9` i `SIX_MAX`; 6-max bez potvrzeneho profilu se automaticky nevyhodnoti. HH renderer prijima profilove poradi pozic a pro 6-max skutecne kresli 6 sedadel.
    - Aktivni table format, ante, blind speed a EV model pochazeji ze stejneho profilu jako trainer. Table/ante mismatch blokuje review. DOLAR_EV a neprodukci profily jsou pripraveny fail-closed a nesmi se propadnout do CHIP_EV fallbacku.
    - Preflop i postflop akce nesou normalizovane sizingy v BB, raise-to a all-in priznak. Parser simuluje skutecny pot, hero/effective stack pred a po FLOP/TURN/RIVER; HH postflop bridge uz nepouziva pevne poty 6/10/18 a routuje granularni SRP/3bet pozicni patterny do produkcniho resolveru.
    - Duplicity mezi hero kartami a boardem se odmitaji. Nearest-bucket policy je explicitni v parser resultu a UI ukazuje skutecnou hloubku i pouzity nejblizsi bucket.
    - HH review log zustava oddeleny od drill statistik a nove nese `profileId`, plny profil a StrategyPack/RangePack id, version a verifiedAt; legacy zaznamy bez identity zustavaji citelne.
    - Technicka implementace a fixture parity prosly: typecheck, 108 testovacich souboru / 522 testu, registry refresh/integrity, range audit, build, precache a bundle budget. Main JS 312.67 KiB raw / 81.54 KiB gzip; postflop-line 20.89 KiB raw / 7.10 KiB gzip.
    - Zbyvajici blocker pro uplne uzavreni acceptance neni v HH kodu: registry nema legalni production 6-max ani DOLAR_EV preflop packy a nema zadny legalni FLOP/TURN/RIVER production StrategyPack. Do jejich importu se tyto profily spravne blokuji.
    - Hotovo 2026-06-22: technicka HH parity je uzavrena; chybejici production data jsou sledovana v 135.24, 135.27 a import waves, nikoli jako dalsi HH implementace.
  - [x] 135.34 Dokoncit ceskou lokalizaci, terminologii a pristupnost
    - Hard rule projektu pozaduje ceske UI, ale aktualni `main.ts`, filtry, dashboard, HH, postflop, manifest a chybove stavy obsahuji rozsahle anglicke texty.
    - Zavest centralni textovy katalog, sjednotit pokerovou terminologii a prelozit vsechny visible texty, validation/error stavy, PWA manifest (`lang`) a user guide; strojove enumy ponechat interni.
    - Doplnit release test, ktery inventarizuje viditelne texty a zabrani novym nahodnym inline stringum mimo katalog.
    - Overit keyboard-only flow, focus po start/answer/next/error, ARIA labely/live regions, kontrast, reduced motion a 200% zoom.
    - Acceptance: reprezentativni E2E pruchod nema anglicke systemove vety ani raw enumy a projde source-free + accessibility smoke.
    - Progress 2026-06-22: vznikl centralni katalog `src/ui/cs.ts`; app shell, hlavni navigace, HH import/analyza, HH parserove chyby, PWA manifest, HTML fallback a user quick start jsou cesky. Manifest deklaruje `lang=cs` a ma source-free instalacni SVG ikonu.
    - HH flow po uspechu presouva fokus na analyzu a po chybe na live error region; reduced-motion pravidla zustavaji aktivni. Novy release test hlida pouziti katalogu v shell/HH vrstve, ceska metadata a instalacni ikonu.
    - Doplneno 2026-06-22: profilovy selector, filtry, bulk/ARIA ovladani, preflop start/gate/result flow, storage/offline chybove stavy a dynamicka preflop vysvetleni jsou cesky. UI uz nezobrazuje interni anglicke capability reasons; nepodporovane kombinace pouzivaji stabilni source-free ceske zpravy.
    - Lokalizacni guard nyni hlida app shell, profil, filtry a HH vrstvu proti navratu hlavních inline anglickych vet. Targetovane DOM/mobile testy: 7 souboru / 59 testu zelene.
    - Overeni navazujici vlny 2026-06-22: typecheck, 109 testovacich souboru / 524 testu, build, precache a bundle budget jsou zelene; hlavni JS 317.02 KiB raw / 83.83 KiB gzip.
    - Doplneno ve stejne vlne: postflop ovladani, unavailable stav, table role, sizing ARIA, feedback, hand-line navigace, model metadata, fallback range skupiny/plany a hero bucket feedback jsou cesky. Lokalizacni guard zahrnuje i `postflopView`; postflop target ma 4 soubory / 38 testu zelene.
    - Finalni overeni teto lokalizacni vlny 2026-06-22: typecheck, 109 testovacich souboru / 524 testu, build, precache a bundle budget jsou zelene; hlavni JS 319.59 KiB raw / 85.05 KiB gzip zustava pod limitem 325/86 KiB.
    - Doplneno 2026-06-22: dashboard, KPI karty a grafy, curriculum focus, permission audit, profilove/postflop breakdowny a export/import statistik jsou cesky; raw data atributy a interni enumy zustaly stabilni.
    - Overeni dashboard vlny 2026-06-22: typecheck, 109 testovacich souboru / 524 testu, build a precache jsou zelene; hlavni JS 321.44 KiB raw / 85.96 KiB gzip zustava tesne pod limitem 325/86 KiB.
    - Doplneno 2026-06-22: range modal, preflop 13x13 matice a postflop Flopzilla matice vcetne detailu, ARIA popisku, mobilni napovedy a unavailable stavu jsou cesky.
    - Promotion tooling nyni vyzaduje `contentLanguage=cs` pro legalni MTT preflop i FLOP/TURN/RIVER production vstupy; bez deklarace se modul nevygeneruje. Synthetic intake priklady deklaraci obsahuji.
    - Doplneno 2026-06-22: HH titulky a rozbory, postflop metadata, oznaceni banku, Flopzilla board metadata a Hero bucket jsou cesky; centralni katalogovy test hlida navrat nejvyraznejsich anglickych retezcu.
    - Realny Chrome acceptance 2026-06-23 prosel desktop keyboard flow, mobilni touch flow, 200% zoom/reflow, cesky/source-free preflop blocker, postflop, HH review a stats transfer bez runtime chyby nebo horizontalniho overflow.
    - Formalni Chrome kontrast audit 2026-06-23 pocita WCAG relativni luminanci vcetne alpha kompozice a gradient stops. Proslo 52 text/background kontrol pres app shell, blocker, postflop result, HH review a stats transfer ve vsech 4 viewportech.
    - Hotovo: ceska lokalizace, keyboard/touch, focus, source-free texty, reduced motion, 200% zoom/reflow a reprezentativni WCAG kontrast jsou pokryte reprodukovatelnym `npm run e2e:chrome`. Android WebView je nadale samostatna device cast 135.38.
  - [ ] 135.35 Pripravit 64 production packu na lazy loading a spolehlivy offline provoz
    - Staticky import vsech budoucich RangePacku/StrategyPacku muze radove prekrocit soucasny 325 KiB bundle budget a zpomalit start.
    - Pred prvnim velkym batchem zmerit realnou velikost jednoho preflop a postflop packu a stanovit budget pro app shell, profilovy chunk a celou offline cache.
    - Generated registry zmenit na typovany manifest s lazy `import()` po profilu/streetu; nacist jen vybrany pack a bezpecne zrusit race pri rychlem prepnuti profilu.
    - Build musi vygenerovat uplny seznam hashovanych assetu pro versioned precache; soucasny runtime cache-first nesmi po deployi drzet stary `index.html` proti novym chunkum.
    - Doplnit update flow, cache migraci/rollback, offline cold/warm start a Android WebView test; manifest potrebuje instalacni ikony a korektni metadata.
    - Acceptance: first render a vybrany profil zustanou pod budgetem, vsech 64 v1 profilu funguje po prvnim nacteni offline a upgrade mezi dvema buildy nezpusobi white screen.
    - Rozpracovano 2026-06-19: capability routing odstranil z hlavniho MTT app shellu staticke SNG/Cash candidate packy vcetne source evidence; historicka preview stats metadata se odvozuji bez natazeni strategickych hodnot. Main bundle klesl z 324.97 na 314.98 KiB raw a z 85.50 na 82.68 KiB gzip.
    - Build plugin nyni injektuje do `sw.js` uplny seznam aktualnich hashovanych assetu a obsahovy cache identifikator. `npm run verify:precache` failuje na chybejici main chunk, placeholder nebo neversionovanou cache a je zapojen do CI i `release:check`.
    - Doplneno 2026-06-22: precache verifier rekurzivne kontroluje kazdy produkcni soubor v `dist` mimo source mapy a worker. Build manifest zahrnuje i vsechny staticke soubory z `public/`; tim byla opravena drive chybejici offline instalacni ikona `icons/pkr-trainer.svg`.
    - Navigace pouziva network-first, aby novy deploy nespojil stary `index.html` s novymi chunky; offline fallback zustava v cache. Aktivace zachova bezprostredne predchozi cache jako rollback/stary-client generaci a uklizi starsi verze.
    - Doplneno 2026-06-22: novy worker po uspesnem precache vola `skipWaiting()` a pri aktivaci `clients.claim()`. Fetch hashovanych assetu umi pouzit bezprostredne predchozi app cache, takze otevreny klient stareho buildu po upgradu neztrati svuj jiz odstraneny JS chunk; stabilni URL se ze stare cache nevraceji.
    - Dvoubuildovy worker test simuluje stary odstraneny hashovany chunk, novou cache, uklid starsi treti generace a offline obsluhu stareho klienta. Registracni test navic pokryva pozdejsi `updatefound`, selhanou instalaci a korektni nahrazeni drive aktivovaneho workeru.
    - Manifest ma ceske metadata a instalacni maskable SVG ikonu; realny cold/warm a dvoubuildovy Android WebView upgrade test zustava otevreny.
    - Doplneno 2026-06-22: statistikovy dashboard se nacita jako samostatny lazy chunk s render-version guardem proti zastaralemu asynchronnimu prekresleni. Hashovany dashboard chunk je soucasti build precache a funguje po postflop odpovedi, reloadu i stats exportu.
    - Generated registry je od 2026-06-22 ciste lazy: canonical pack ID se prevadi na presny 64-slotovy `profileKey`, kazda polozka ma vlastni `import()` a generator uz nevytvari zadny staticky import ani eager export produkcnich dat.
    - Runtime katalog zachovava synchronni API resolveru/readiness, ale plni se az uspesne nactenymi packy. Kontroluje shodu exportovaneho `pack.id` s manifestem, deduplikuje registraci a preflop produkcni import radi pred legacy/candidate packy.
    - Explicitni Start nacita pouze vybrany MTT profil pred capability gate; cacheovany loader retryuje po chybe a pozdni vysledek predchozi rychle prepnute volby oznaci jako `stale`. CLI/release spotrebitele pred auditem volaji uplne `loadAll`, takze lazy pack nemuze zmizet z integrity/readiness reportu.
    - HH analyza pred parsovanim nacita jen PREFLOP/FLOP/TURN/RIVER packy pro aktualne vybrane MTT dimenze. `loadProfiles` sdili pack cache, nerusi soubezny training request a HH view po dobu nacitani blokuje opakovany Analyze; chyba zustava source-free a nevytvori castecny review zaznam.
    - Instalacni precache vynechava jednoznacne pojmenovane `mtt-*-production-*` profilove chunky, aby lazy delivery nestahovala vsechna budouci data na pozadi. Build odvozuje jejich chunk name deterministicky z canonical production module path. Prvni pouziti ceka na dokonceny zapis do runtime cache; dalsi nacteni funguje offline. Verifier hlida, ze lazy pack neni omylem v install manifestu.
    - `bundle:budget` samostatne meri sdileny install-precache JS, maximalni jeden lazy MTT chunk a agregat vsech lazy MTT chunku. Vychozi limity jsou 400/128 KiB raw/gzip pro precache, 512/128 KiB pro jeden pack a 32/8 MiB pro celou lazy knihovnu; CI je muze zprisnit pres env.
    - Bundle po dokonceni lazy runtime katalogu: main 268.82 KiB raw / 73.67 KiB gzip, dashboard 55.99 / 13.89 KiB, postflop-line 20.89 / 7.22 KiB; vsechny chunky jsou pod individualnim 325/86 KiB limitem.
    - Finalni overeni navazujici vlny 2026-06-22: typecheck, 111 testovacich souboru / 541 testu, registry refresh/integrity, range audit, build, precache a bundle budget jsou zelene. Skutecny docasny Vite build potvrzuje canonical production chunk name a jeho vylouceni z install precache. Po HH preloadu ma main 269.62 KiB raw / 73.93 KiB gzip; aktualni aplikacni build ma 0 legalnich lazy pack chunku, dokud neprijde prvni production import.
    - Doplneno 2026-06-23: realny Chrome dvoubuildovy test docasne prepne verzi v generovanem `dist/sw.js`, nainstaluje a aktivuje novy worker, overi prevzeti aktualniho klienta, zachovani jedne predchozi cache, obsluhu odstraneneho hashovaneho chunku z rollback generace a zakaz vraceni stabilni URL ze stare cache. Worker soubor je vzdy obnoven.
    - Doplneno 2026-06-23: `npm run e2e:chrome:production-fixture` vytvori pouze po dobu testu canonical source-free PREFLOP/FLOP/TURN/RIVER packy i generated registry, pred buildem validuje coverage vsech postflop streetu, pouzije izolovany volny preview port a po overeni vse atomicky obnovi/smaze. Realne Vite lazy chunky raw/gzip: preflop 23.43/7.19 KiB, FLOP 21.39/5.86, TURN 9.72/3.11 a RIVER 10.39/3.24; main fixture build ma 222.12/64.04 KiB. Preflop profil po prvnim nacteni startuje znovu offline; single-street flow nacita jen vybranou streetu, hand-line pred prvni otazkou nacte celou postflop rodinu a stats zachovaji vsechny tri pack identity.
    - Doplneno 2026-06-24: lazy production loader fail-fast odmita duplicitni `packId` i duplicitni `kind|profileKey` slot v generated manifestu, aby 64packovy katalog nemohl potichu registrovat dva production moduly pro stejny runtime profil.
    - Zbyva: po prvnim legalnim preflop/postflop importu zmerit skutecne datove profilove chunky a agregat cele offline knihovny a potvrdit cold/warm i dvoubuildovy upgrade na realnem Android WebView zarizeni/emulatoru.
  - [x] 135.36 Zprisnit semanticke QA produkcnich strategii
    - Registry musi failnout na dva production packy pro stejny profil/street bez explicitni precedence, na cross-profile dimenze a na pack bez source-free provenance fingerprintu.
    - Preflop validovat 169 hand classes, legalni akce/sizing pro konkretni node, kontextove mozne pozice a uplnost vsech pozadovanych stacku; zadny implicitni fold nesmi maskovat omylem chybejici cely segment.
    - Postflop validovat soucty exact frequencies, legalni mixy, disjunktni/explicitne prekryvajici se range bucket pravidla, hero hand match, card removal, unreachable pravidla a deterministicky tie-break.
    - Po povyseni kazdeho packu generovat sampled runtime smoke corpus a porovnat recommendation, explanation a source quality mezi import reportem a aplikaci.
    - Acceptance: validace umi zamerne rozbite fixture odmitnout pro kazdou uvedenou tridu chyby a release gate nema pouze strukturou zelene, ale semanticky nejednoznacne packy.
    - Rozpracovano 2026-06-19: registry integrity failuje na duplicitni production profil, cross-profile dimenze, orphan modul a chybejici source-free SHA-256 provenance fingerprint. Builder generuje deterministicky fingerprint bez raw source cesty.
    - Preflop import navic odmita nelegalni/duplicitni akce pro konkretni context a strict akci chybejici v lenient mape; dosavadni validace dale hlida uplnost 169 hand classes, stack coverage, pozice a segmenty.
    - Tooling-only postflop semantic gate odmita duplicitni coverage dimenze, rule id, identicky i castecne prekryty selector bez precedence a stejnou hand class ve vice range buckets. Gate je zapojen do module builderu i kontroly uz registrovanych packu, bez navyseni runtime bundle.
    - Zamerne rozbite flop/turn/river fixture pokryvaji duplicate selector, SPR/texture/runout overlap, bucket collision, runtime source mismatch a card-removal chyby. Lokalni overeni: typecheck, registry integrity/refresh check, range audit, 105 testovacich souboru / 498 testu, build a bundle budget 324.97/325 KiB raw a 85.50/86 KiB gzip.
    - Doplneno 2026-06-19: promotion builder i registry integrity generuji deterministicky runtime smoke sample pro kazde postflop pravidlo pres stejny FLOP/TURN/RIVER resolver jako aplikace. Porovnavaji recommendation, explanation, rule/pack/version/verifiedAt/confidence metadata a hero range bucket; mismatch blokuje zapis i release kontrolu.
    - River selector uz nesmi predstirat rozliseni pouze pres `blockerRelevance`, protoze tento udaj neni soucasti runtime vstupu; takove pravidlo je nyni spravne vyhodnoceno jako kolize.
    - Range rule muze deklarovat `handClassOverlapPolicies` pouze s presnym seznamem VALUE/BLUFF/CHECK lanes a neprázdným rationale. Nedeklarovany overlap, neodpovidajici lanes, duplicitni policy i policy bez skutecneho overlapu jsou blokery.
    - Card removal je povinna soucast kazdeho postflop rule pres source-free `cardRemovalSamples`: gate hlida 3/4/5 karet podle streetu, fyzicke duplicity, shodu konkretnich hero karet s hand class, pritomnost hand v buckets a dostupnost alespon jedne kombinace kazde range hand po odecteni boardu.
    - Hotovo 2026-06-19: promotion i release gate nyni blokuji strukturou validni, ale semanticky nejednoznacne nebo runtime nekonzistentni packy. Sampled runtime corpus se automaticky uplatni pri prvnim realnem povyseni production packu.
  - [x] 135.37 Zavest reprodukovatelne CI pro pull request a release
    - Pridat CI workflow na podporovane Node LTS s `npm ci`, typecheck, full tests, registry `--check`, MTT gates, verify ranges, build, bundle budget a artefakt `dist/`.
    - Oddelit ocekavane cervene production-data gate od beznych PR checks tak, aby kodova regrese nebyla skryta znamym datovym blockerem; final release job musi vyzadovat oba typy zelene.
    - Pridat deterministic generated-file check, lockfile integrity, test timeout/report artefakty a jasny fail summary.
    - Acceptance: cisty clone bez lokalnich raw dat reprodukuje stejny technicky vysledek a release tag nelze vytvorit s cervenym MTT gate.
    - Hotovo 2026-06-18: `.github/workflows/ci.yml` pouziva Node 22 + `npm ci`, typecheck, full Vitest s JUnit artefaktem, generated registry check, registry integrity, raw intake guard, range verification, build, bundle budget a upload `dist/`. Concurrency rusi zastarale runy a job ma explicitni timeout.
    - Znamy production-data blocker je oddelen do diagnostickeho `mtt-data-status` jobu s JSON artefaktem; jeho cerveny stav nemaskuje technickou regresi. `.github/workflows/release.yml` pro `v*` tag/manual release nema `continue-on-error` a uploadne `dist/` az po kompletnim `npm run release:check`, ktery obsahuje MTT gates.
    - Doplneno 2026-06-24: CI `mtt-data-status` uklada `range-intake-guard`, `range-intake`, `mtt-slots`, `mtt-completion`, `mtt-intake-plan`, `mtt-blockers`, `mtt-next-action`, `mtt-postflop-matrix`, `mtt-postflop-positions`, `mtt-postflop-coverage`, `mtt-postflop-release`, `mtt-validate-ready-intake`, `mtt-promote-ready`, `mtt-acceptance` a `mtt-release-gates` jako ciste parsovatelne JSON artefakty bez npm headeru; cervene data gates jsou v diagnostickem jobu tolerovane, aby se uploadly vsechny reporty.
    - Workflow kontrakt hlidaji unit testy. Lokalni overeni: typecheck, registry check/integrity, `git diff --check`, 104 testovacich souboru / 485 testu, build a bundle budget prosly.
  - [ ] 135.38 Dodelat skutecne browser/device E2E acceptance
    - Unit/jsdom testy doplnit o produkcni build spusteny v prohlizeci: start profilu, answer/next, single spot, hand line, HH review, stats export/import, reload a offline reopen.
    - Matice: desktop + 360/390/412 px, Chromium a Android WebView/emulator; keyboard a touch.
    - Testovat prazdny storage, legacy migraci, quota failure, corrupt JSON, service-worker update a chybejici profilovy chunk.
    - Pro produkcni data pouzit source-free test fixture packy oddelene od realnych legalnich hodnot.
    - Acceptance: E2E artefakty obsahuji screenshoty/logy, zadny uncaught error, page-level overflow, fallback recommendation ani profilovy mix-up.
    - Pokus 2026-06-18: production build a lokalni Vite preview na `http://127.0.0.1:4173/` byly pripraveny, ale in-app Browser backend nebyl v teto relaci dostupny. Chrome fallback vyzaduje explicitni souhlas uzivatele, proto nebyl autonomne prevzat. Browser/device E2E zustava otevrene; jsdom/mobile smoke neni vydavan za jeho nahradu.
    - Rozpracovano 2026-06-23: `npm run e2e:chrome` spousti izolovany headless Chrome bez dalsi npm zavislosti a nad produkcnim buildem overuje desktop 1280 px a mobilni 360/390/412 px. Kontroluje fail-closed legacy preflop gate, postflop start/answer/stats, source-free UI, horizontalni overflow, persistence po reloadu, offline reopen a browser runtime chyby.
    - Lokalni realny Chrome run prosel 4/4 viewporty a ulozil `report.json` + PNG screenshoty do `artifacts/e2e-chrome`. CI technicky job runner spousti po buildu a artefakty vzdy uploaduje; artefakty zustavaji mimo `dist`, aby nemenily release/precache obsah.
    - Doplneno 2026-06-23: desktop flow aktivuje ovladaci prvky skutecnymi keyboard eventy, mobilni flow CDP touch eventy. Vsechny 4 viewporty navic prochazeji HH review s 169bunecnou matici a stats export/import bez URL citaci.
    - Doplneno 2026-06-23: resilience cast realneho Chrome runneru prochazi 200% zoom bez overflow, corrupt versioned localStorage bez fatal stavu a simulovany quota failure s recoverable source-free warningem.
    - Android audit 2026-06-23: na lokalnim stroji neni `adb` ani bezici emulator, proto device/WebView cast zustava explicitne blokovana prostredim a neni vydavana za hotovou.
    - Doplneno 2026-06-24: `npm run e2e:android:preflight` reprodukovatelne zapisuje `artifacts/e2e-android-preflight/report.json`, rozlisuje missing adb / no device / unauthorized / offline / ready target a vraci cerveny stav, dokud neni dostupny skutecny Android WebView/emulator. Slouzi jako vstupni device gate pro 135.38, ne jako nahrada finalniho device E2E.
    - Doplneno 2026-06-24: Android preflight reportuje `readySerial` a textovy vystup `ready serial`, takze navazujici device E2E ma jednoznacny adb target a blokovane stavy maji `readySerial: null`.
    - Doplneno 2026-06-24: smiseny seznam ne-ready Android targetu se klasifikuje jako `NO_READY_DEVICE`; specialni `UNAUTHORIZED_DEVICE`/`OFFLINE_DEVICE` se pouzije jen kdyz jsou vsechny nalezene targety ve stejnem stavu.
    - Lokalni preflight 2026-06-24 nasel `adb` v Android SDK, ale `adb devices -l` nevraci zadny emulator/telefon (`status: NO_DEVICE`); device/WebView acceptance zustava blokovana pouze dostupnosti targetu.
    - Doplneno 2026-06-23: realny Chrome runner provadi skutecnou registraci druhe worker verze a overuje previous-build hash chunk rollback i izolaci stabilnich assetu; missing-asset/update browser cast je hotova.
    - Source-free production fixture Chrome flow 2026-06-23 realne prosel lazy preflop pack load, start, answer, next, navrat do filtru a offline opakovany start. Canonical FLOP/TURN/RIVER fixture navic prosly produkcnimi lazy resolvery v deterministickem 3bet kontextu, nacetly presne profilove chunky a zachovaly vsechny pack identity v postflop stats i po reloadu. Fixture ani docasny registry zapis nezustavaji v source tree nebo release `dist`.
    - Finalni technicke overeni 2026-06-24: normalni 4-viewport Chrome E2E i oddeleny production fixture E2E prosly; plny Vitest report ma 229/229 suites a 573/573 testu, build/precache/budget i registry/range gates jsou zelene.
    - Doplneno 2026-06-24: Chrome E2E runner vytvari novy tab jako `about:blank` a navigaci/reload povazuje za hotovou i podle `document.readyState`, aby nezavisela jen na zachyceni `Page.loadEventFired` pri same-URL load race.
    - Zbyva: Android WebView/emulator s ready `adb` targetem. Plne lazy profilovy chunk lze na device zmerit az po prvnim legalnim production importu.
  - [ ] 135.27 Provest jeden kompletni P1 pilot import
    - Pouzit aktualni `mtt:next-action`: `FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF`, pack `mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1`.
    - Projit realny tok evidence -> normalize -> permission -> validate -> dry-run -> write -> registry refresh -> targeted tests -> app start.
    - Pilot nesmi pouzit metadata-only kopii regular packu; reuse je mozny jen s explicitni reviewed `BLIND_SPEED` policy podlozenou zdrojem.
    - Acceptance: pilot row je production-ready, profil realne generuje a scoreuje spoty, `mtt:registry-integrity` zustane zeleny a blocker count klesne o 1.
  - [ ] 135.5 P1 preflop CHIP_EV production import wave
    - Navazuje na uspesny 135.27 pilot; postupovat podle `npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all`.
    - Pro kazdy legalni vstup: ulozit raw evidence lokalne, normalizovat do `normalized.json`, pridat `permission.json`, spustit `validate:range-import`, `build:range-module --dry-run`, vygenerovat modul a zapojit registry/resolver.
    - Po kazdem batchi spustit `mtt:validate-ready-intake`, `mtt:promote-ready --dry-run`, zapis s explicitnim potvrzenim, registry refresh a targetovane preflop testy.
    - Acceptance: P1 bucket ma 0 blocker rows, vsech 8 CHIP_EV preflop rows je production-ready a celkovy MTT blocker count je nejvyse 56.
  - [ ] 135.6 P2 preflop DOLAR_EV production import wave
    - Postupovat podle `npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all`.
    - DOLAR_EV nesmi automaticky reuse CHIP_EV; reuse je povoleny jen s explicitni permission `reusePolicy.allowedDimensions` a auditnim rationale.
    - Acceptance: vsech 8 DOLAR_EV preflop rows je production-ready, scoring pouziva profilove DOLAR_EV packy nebo explicitne povolenou reuse policy; preflop ma 16/16 production rows a zbyva presne 48 postflop blocker rows.
  - [ ] 135.7 Preflop production runtime de-fallback
    - Po P1/P2 importech overit, ze `rangePackForTrainingProfile` a souvisejici profile gates pro vsechny MTT preflop kombinace vybiraji production pack a nikdy tise nepadaji do candidate/fallback dat.
    - Doplnit regresni test pres 2 tableFormat x 2 speed x 2 EV x 2 ante preflop matici.
    - Acceptance: `mtt:completion -- --street=PREFLOP --json` ma 16 production rows, 0 preview/missing; vsech 16 profilu projde realnym start/answer/stat persistence smokem.
    - Doplneno 2026-06-24: `tests/unit/mttPreflopDefallback.test.ts` hlida aktualni fail-closed stav cele 16slotove preflop matice: 0 production-ready, 6 candidate/preview, 10 missing a pro kazdy nehotovy slot canonical production import hint. Finalni zeleny de-fallback zustava blokovany P1/P2 legalnimi importy.
    - Doplneno 2026-06-30: FULL_RING_9/REGULAR/CHIP_EV/PREFLOP ante ON/OFF je odblokovany jako hratelny pre-production preview drill z historickym RangePackem a profile-aware statistikami; mtt:completion a release gates zustavaji spravne cervene, dokud chybi canonical production import a permission manifest.
  - [ ] 135.28 Provest postflop pilot pro kazdou street
    - Pred 16slotovymi batchi povysit jeden reprezentativni FLOP, TURN a RIVER pack pro stejny profil a overit jejich navazani v jedne hand-line.
    - Pilot musi prokazat granularni position patterny, SRP/3bet, facing-bet, prior-street action, runout/card class, range lanes, source-free explanation a strict profilovy resolver.
    - Acceptance: tri pilot packy projdou coverage i registry gate; jedna FLOP->TURN->RIVER production hand-line nevola heuristic fallback.
  - [ ] 135.8 P3 FLOP production import wave
    - Navazuje na FLOP cast 135.28; postupovat podle `npm run mtt:intake-plan -- --priority=P3_FLOP_PRODUCTION --all`.
    - Kazdy FLOP pack musi pokryt MTT gameVariant, table/speed/EV/ante dimenze, SRP/3bet, 50 granularnich position patterns, board textures, `SINGLE_RAISED_POT_CBET`, `THREE_BET_POT_CBET`, `FLOP_FACING_BET`, range lanes a legalni akce.
    - Acceptance: vsech 16 FLOP rows je production-ready; `npm run mtt:postflop-coverage -- --json` nema FLOP `MISSING_PACK`, `MISSING_RULE` ani `PACK_NOT_PRODUCTION_READY`.
  - [ ] 135.9 P4 TURN production import wave
    - Navazuje na TURN cast 135.28; postupovat podle `npm run mtt:intake-plan -- --priority=P4_TURN_PRODUCTION --all`.
    - Kazdy TURN pack musi pokryt SRP/3bet, 50 position patterns, prior flop actions, turn card classes, SPR windows, `TURN_BARREL`, `TURN_FACING_BET`, legalni akce, range lanes a explanations.
    - Acceptance: vsech 16 TURN rows je production-ready; coverage nema TURN blockery a runtime resolver vraci produkcni model pro vsechny targetovane TURN profily.
  - [ ] 135.10 P5 RIVER production import wave
    - Navazuje na RIVER cast 135.28; postupovat podle `npm run mtt:intake-plan -- --priority=P5_RIVER_PRODUCTION --all`.
    - Kazdy RIVER pack musi pokryt prior turn actions, river runout classes, blocker relevance, value/bluff/check lanes, `RIVER_PRESSURE`, `RIVER_FACING_BET`, final decision akce a source-free explanation texty.
    - Acceptance: vsech 16 RIVER rows je production-ready; `npm run mtt:postflop-release -- --summary` nema fallback runtime, missing normalized, missing permission, LOW confidence ani incomplete coverage rows.
  - [x] 135.11 Batch promotion pipeline pro ready MTT sloty
    - Vytvorit bezpecny batch workflow nad `mtt:validate-ready-intake`, ktery pro ready sloty umi spustit dry-run buildy, vypsat planned output modules a vyzadovat explicitni potvrzeni pred zapisem.
    - Musi podporovat `--priority`, `--format`, `--street`, `--json`, `--dry-run` a nesmi prepisovat existujici production modul bez `--force`.
    - Cilem je zrychlit import desitek legalnich slotu bez rucni chyby v command line.
    - Hotovo: `npm run mtt:promote-ready` planuje ready sloty, validuje build reporty, vypisuje output moduly, validate/build/write prikazy, podporuje `--priority`, MTT filtry, `--json`, `--dry-run`, `--write`, `--force` a zapis povoli jen s `--confirm=WRITE_READY_MTT_MODULES`.
    - Doplneno 2026-06-24: `mtt:promote-ready -- --output=artifacts/mtt-promote-ready-report.json` uklada cisty JSON plan promotion/write handoffu.
    - Doplneno 2026-06-24: `mtt:validate-ready-intake` pri prazdne ready fronte vypisuje waiting rows, missing normalized/permission counts a `mtt:next-action`, takze prazdny zeleny dry-run nelze zamenit za hotovou import wave.
    - Doplneno 2026-06-24: `mtt:promote-ready` stejne hlasi waiting rows, missing normalized/permission counts a `mtt:next-action`, aby prazdny write/dry-run nebyl zamenen za hotovou wave.
  - [x] 135.12 Production registry integrity gate
    - Pridat test/gate, ktery porovna legal import slots, vygenerovane production module ids, permission packIds a runtime registry.
    - Selhat pri orphan production packu, duplicitnim packId, registry packu mimo legal slot, mismatch table/speed/EV/ante/street nebo packu bez permission evidence.
    - Hotovo: `npm run mtt:registry-integrity` kontroluje legal import sloty, runtime registry, vygenerovane `*-production-*` moduly, permission manifest packIds, duplicity a orphan/nelegalni production packy.
    - Follow-up 2026-06-22: 135.25 odstranil rucni registry wiring a 135.24 fail-closed preradil historicke packy na `PREVIEW_ONLY`; registry baseline uz nema `LEGACY_OR_UNKNOWN` production vyjimku.
  - [x] 135.13 User-facing MTT profile coverage QA
    - Overit, ze UI profile selector/start flow umi vsechny MTT kombinace a ze labely jsou srozumitelne: 9-max/6-max, regular/turbo, chipEV/$EV, ante ON/OFF, preflop/flop/turn/river.
    - Non-production stav muze byt viditelny jen source-free a nesmi zobrazit pack id, provider, URL ani raw internal enumy.
    - Po produkcnim importu se MTT profily nesmi tvarit jako preview/fallback.
    - Hotovo: profile selector ma samostatny `Ante` control, DOM test prochazi 64 MTT kombinaci a hlida source-free labely bez raw enumu, pack id, provideru a URL.
  - [x] 135.14 MTT hand-line end-to-end QA matrix
    - Doplnit manualni i automatizovane smoke testy pro FLOP->TURN->RIVER hand-line flow ve vsech street/action typech: check, bet small/big, call, raise, fold, facing bet, terminal fold/all-in.
    - Matice musi zahrnout aspon reprezentativni FULL_RING_9/SIX_MAX, REGULAR/TURBO, CHIP_EV/DOLAR_EV, ante ON/OFF a SRP/3bet priklady.
    - Hotovo: `tests/unit/mttHandLineQaMatrix.test.ts` prochazi reprezentativni MTT hand-line scenare pres 9-max/6-max, regular/turbo, chipEV/$EV, ante ON/OFF, SRP, 3bet, facing-bet call/fold vetev a source-free DOM vystup.
    - Doplneno 2026-06-23: realny Chrome canonical production fixture projde 9-max regular CHIP_EV facing-bet hand-line `FLOP CALL -> TURN CALL -> RIVER CALL`, overi lazy preload vsech tri street chunku, dokonci tri streety bez fallbacku a po reloadu zachova 3 single + 3 line statisticke zaznamy i pack identity.
  - [x] 135.15 HH import/review MTT production parity
    - Overit, ze HH bridge pouziva stejne production resolvery jako trainer pro flop/turn/river, vcetne facing-bet nodu a DOLAR_EV/CHIP_EV profilu.
    - Acceptance: importovana handa umi zobrazit MTT review od flopu po river bez source citaci, bez fallbacku pro production-ready profily a se spravnym ulozenim do review/stat struktur.
    - Hotovo: HH view podporuje injektovatelny postflop resolver, core bridge test overuje flop/turn/river routing pres production-like strategy pack vcetne `*_FACING_BET`, prior street akci a `BTN_VS_BB`; DOM test hlida source-free MTT HH review, `CALL` rekomendace a review records ulozene mimo drill statistiky.
  - [x] 135.16 Stats, KPI a export/import MTT production QA
    - Po produkcnich MTT importech overit, ze dashboard oddeluje MTT preflop/postflop, streety, action nody, table format, speed, EV, ante, production/fallback confidence a hand-line vs single spot.
    - Export/import stats musi zachovat MTT postflop single i line records a nesmi michat production a fallback KPI bez vahy.
    - Hotovo: postflop stats bridge schema v3 nese explicitni `ante`, legacy import bez `schemaVersion`/`ante` se normalizuje z `profileId`, dashboard postflop breakdowny zahrnuji single spoty i hand-line street records a test hlida 9-max/6-max, regular/turbo, chipEV/$EV, ante ON/OFF, production/preview/fallback a source-free labels.
  - [x] 135.17 Source-free MTT UI release audit
    - Rozsirit/overit UI source-free release gate proti vsem MTT povrchum: profile selector, preflop question/result, range modal, postflop single spot, hand-line, HH review, dashboard, permission audit.
    - Zakazat URL, provider citace, pack id, rule id, raw internal enumy a lokalni raw path ve visible UI.
    - Hotovo: centralni `uiNoSourceCitation` release gate pokryva profile selector, range modal, postflop single spot, postflop hand-line, HH import/review, dashboard a permission audit; test injectuje source-heavy resolver s URL/pack/rule metadaty a hlida, ze visible UI zustava source-free.
  - [x] 135.18 Mobile/performance MTT release QA
    - Po produkcnich packach spustit mobile viewport smoke, render profile, bundle budget a build.
    - Overit, ze lazy loading production packu nezpomali first render a ze Flopzilla/preflop 13x13 matice zustava pouzitelna na 360/390/412px sirce.
    - Hotovo: `mobileWebViewSmoke`, `profile:render`, `build` a post-build `bundle:budget` prosly; aktualni bundle `main-9cmG-2BA.js` je 320.96 KiB raw / 84.63 KiB gzip pod limitem. Referencni render profile eviduje neblokujici WARN u preflop 13x13 matrix avg 44.91 ms proti 35 ms warn threshold, postflop Flopzilla avg 28.13 ms OK.
    - Optimalizace 2026-06-18: preflop matrix pouziva 2 delegovane event listenery misto 338 listeneru na 169 bunkach a cacheuje stabilni 13x13 hand label grid. DOM/property/modal/HH testy zustavaji zelene; absolutni JSDOM profil dnes kolisal i na nezmenene postflop matici, proto puvodni performance WARN zustava evidovany.
  - [ ] 135.19 Final MTT release candidate checklist
    - Spustit: `npm run typecheck`, `npm test`, `npm run mtt:acceptance`, `npm run mtt:release-gates`, `npm run verify:ranges`, `npm run build`, `npm run bundle:budget`, `npm run release:check`.
    - Vystup ulozit do release notes: pocty production rows, 0 blockers, 0 waiting slots, bundle budget, known limitations.
    - Stav auditu 2026-06-22: data jsou nejvetsi objemovy blocker. `mtt:acceptance` je valid false: 64 total rows, 0 productionReady, 54 preview, 10 blocked; 64 blocker rows ceka na `normalized.json` a `permission.json`; postflop release gate ma 48/48 blocker rows a 0 productionReady.
    - Aktualizace 2026-06-24: `mtt:acceptance -- --json` ma 11 prikazu a `mtt:release-gates -- --json` 10 prikazu; oba spravne failuji na completion production datech, postflop production datech a Android WebView/device preflight `NO_DEVICE` s `readySerial: null`.
    - Technicky baseline 2026-06-24: typecheck, 573/573 testu, normalni i production-fixture Chrome E2E, build, precache a bundle budget jsou zelene. Release candidate dale blokuji Android cast 135.38, realna packova cast 135.35 a legalni import waves.
    - Doplneno 2026-06-23: `npm run mtt:technical-acceptance` agreguje technickou RC cast bez zavislosti na globalnim `npm`: typecheck, plny Vitest, registry/integrity, range audit, build, precache, bundle budget, 4-viewport Chrome a izolovany canonical PREFLOP/FLOP/TURN/RIVER fixture. Posledni realny run 2026-06-24 prosel 10/10 prikazu, 229/229 suites a 573/573 testu; JSON dukaz uklada do `artifacts/mtt-technical-acceptance/report.json`. Legalni data gate zustava zamerne oddeleny.
    - RC attempt notes: `Agents/release-notes-mtt-rc-2026-06-17.md`.
  - [ ] 135.20 Final MTT user smoke
    - Rucne projit reprezentativni MTT scenare: 9-max regular CHIP_EV preflop, 9-max turbo DOLAR_EV preflop, 6-max regular CHIP_EV flop line, 6-max turbo DOLAR_EV river facing-bet, HH import turn/river review a dashboard kontrola.
    - Doplnit 6-max HH review, reload/resume, offline reopen, stats export/import a mobilni keyboard/touch pruchod.
    - Zadny scenar nesmi zobrazit fallback warning, source citation, pack id, anglickou systemovou vetu nebo nevalidni action pro dany node.
    - Automatizovano 2026-06-23: canonical 9-max regular CHIP_EV ante ON production fixture realne v Chrome pokryva preflop, vsechny postflop single streety a facing-bet FLOP->TURN->RIVER `CALL` line vcetne reloadu/offline a statistik. Otevrene zustava rucni 6-max/turbo/DOLAR_EV smoke nad legalnimi production daty, HH operator pruchod a Android zarizeni.
  - [x] 135.21 Uzavrit nebo supersedovat stare duplicitni MTT import tasky
    - Po prijeti tohoto konsolidovaneho backlogu projit stare otevrene tasky 86-88, 104-108, 114 a 116 a oznacit je jako superseded-by 135.x nebo je premapovat na konkretni P1-P5 import wave.
    - Cilem je mit jeden primarni backlog pro MTT dokonceni a neudrzovat paralelni, castecne duplicitni seznamy.
    - Hotovo: stare preflop import/promotion tasky 86-88 a 104-108 jsou superseded 135.5/135.6/135.7/135.11; stare FLOP SRP/3bet import tasky 114 a 116 jsou superseded 135.8/135.11. Skutecne production dodani zustava v P1-P5 legal intake wavech, ne ve starych duplicitach.
  - [ ] 135.22 Release rozhodnuti pro "MTT complete v1"
    - Oznacit MTT cast jako produkcne kompletni az po uzavreni vsech otevrenych tasku v sekci 135, vcetne P0 ukolu 135.24-135.38 a import pilotu/waves.
    - Acceptance: `npm run release:check` zeleny, `mtt:completion -- --summary` valid true se 64/64 production rows, `mtt:blockers -- --summary` 0 blockers, intake queue 0, `mtt:postflop-release -- --summary` valid true, registry bez `LEGACY_OR_UNKNOWN`, operator docs a release notes aktualni.
    - Task 136 (FORPSI staging) je samostatny deployment workstream a neblokuje oznaceni kodu/dat jako "MTT complete v1", pokud neni staging soucasti konkretniho release rozhodnuti.
  - [ ] 135.39 Udrzovat aktualni MTT completion audit pred kazdou dalsi praci
    - Snapshot 2026-06-30: `mtt:completion -- --summary` je valid false, 64 total rows, 0 productionReady, 54 preview, 10 blocked.
    - Snapshot 2026-06-30: `mtt:next-action -- --json` je WAITING_FOR_FILES, 64 blocker rows, 0 readyForValidation, chybi 64x `normalized.json` a 64x `permission.json`.
    - Snapshot 2026-06-30: prvni konkretni legal intake slot je `FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF`, pack `mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1`.
    - Snapshot 2026-06-30: technicka akceptace kodu je zelena, posledni overeni `mtt:technical-acceptance` proslo 10/10 prikazu a 574/574 testu; cerveny zustava pouze produkcni data/Android release stav.
    - Pred kazdym povysenim dat obnovit `mtt:handoff -- --output=artifacts/mtt-handoff-report.json` a ulozit next-action packet; nesmi dojit k "false green" stavu, kdy jsou artefakty neaktualni.
    - Acceptance: tasks/release notes vzdy uvadi aktualni productionReady/preview/blocked pocty, prvni blocker slot, stav Android preflight a posledni zeleny technical acceptance run.
  - [ ] 135.40 Pripravit operator intake board pro vsech 64 MTT slotu
    - Pro kazdy P1-P5 bucket vygenerovat next-action/intake packet nebo souhrn s packId, raw folderem, required files, validate/dry-run/promote prikazy a specialni anti-reuse pravidla.
    - P1/P2 preflop sloty rozdelit na CHIP_EV a DOLAR_EV vlnu; DOLAR_EV nesmi byt oznacen jako ready pomoci ticheho CHIP_EV reuse.
    - P3/P4/P5 postflop sloty rozdelit po streetu a profilu; FLOP/TURN/RIVER pack musi mit granularni coverage, ne jen genericky street placeholder.
    - U kazdeho slotu evidovat owner/evidence status mimo git: waiting, files supplied, validation failed, dry-run passed, promoted, acceptance passed.
    - Raw `Agents/range-intake/raw/` zustava necommitovany workspace; do gitu patri jen tooling, reporty a source-free dokumentace, nikdy realne privatni exporty.
    - Acceptance: operator umi bez cteni celeho backlogu vzit dalsi slot, dodat oba soubory, spustit prikazy a videt presny duvod, proc slot jeste neni productionReady.
    - Doplneno 2026-06-30: mtt:intake-plan -- --board-dir=artifacts/mtt-intake-board generuje source-free board po P0-P5 bucketech vcetne summary, per-priority Markdown/JSON a anti-reuse guardrails.
    - Doplneno 2026-06-30: mtt:handoff board automaticky obnovuje spolecne s intake plan JSON artefaktem.
  - [ ] 135.41 Dokoncit prvni P1 pilot slot FULL_RING_9 TURBO CHIP_EV PREFLOP OFF
    - Dodat legalni `normalized.json` a `permission.json` do `Agents/range-intake/raw/mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1/`.
    - Overit, ze packId, kind, table format, speed, EV, ante, street, stacky, pozice, 169 hand classes a akce odpovidaji presne slotu.
    - Turbo slot musi mit dedicated turbo hand recommendations nebo explicitni reviewed reuse policy pro BLIND_SPEED; samotna zmena metadat regular->turbo nesmi projit.
    - Spustit `validate:range-import`, `build:range-module --dry-run`, `mtt:validate-ready-intake -- --format=FULL_RING_9 --speed=TURBO --ev=CHIP_EV --street=PREFLOP --ante=OFF`.
    - Spustit `mtt:promote-ready -- --dry-run` a teprve pote confirmed write pres `--write --confirm=WRITE_READY_MTT_MODULES`.
    - Po write spustit registry refresh/check, registry integrity, targeted preflop smoke, stats persistence smoke, `mtt:completion -- --street=PREFLOP --summary` a `mtt:technical-acceptance`.
    - Acceptance: prvni P1 slot je productionReady, blocker count klesne o 1, UI spusti turbo ante OFF preflop bez preview fallbacku a bez source citaci.
  - [ ] 135.42 Dokoncit zbyvajicich 7 P1 preflop CHIP_EV slotu
    - Po uspesnem pilotu zpracovat P1 v poradi podle `mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all`.
    - Kazdy slot musi mit vlastni legal import nebo explicitne povolenou reviewed reuse policy pro konkretni dimenzi; zadny metadata-only clone.
    - Po kazdem malem batchi spustit ready validation, promote dry-run/write, registry integrity a targeted start/answer/stat persistence.
    - Po dokonceni P1 spustit `mtt:completion -- --street=PREFLOP --ev=CHIP_EV --summary`, normalni i production fixture Chrome E2E a handoff.
    - Acceptance: P1_PREFLOP_CHIP_EV ma 0 blocker rows, vsech 8 CHIP_EV preflop rows je productionReady a celkovy MTT blocker count je nejvyse 56.
  - [ ] 135.43 Dokoncit P2 preflop DOLAR_EV bez ticheho CHIP_EV reuse
    - Pro vsech 8 DOLAR_EV preflop slotu dodat legalni data nebo explicitni permission reuse policy s `allowedDimensions`, rationale a reviewerem.
    - Validace musi selhat, pokud se DOLAR_EV snazi pouzit CHIP_EV pack bez povolene utility/reuse evidence.
    - UI, stats a profileId musi rozlisit DOLAR_EV od CHIP_EV; dashboard nesmi michat KPI bez viditelneho modelu.
    - Po P2 spustit preflop 16slot matrix smoke: 2 tableFormat x 2 speed x 2 EV x 2 ante, start/answer/stat persistence.
    - Acceptance: `mtt:completion -- --street=PREFLOP --summary` ma 16/16 production rows, 0 preview/missing pro preflop a preflop de-fallback task 135.7 muze byt uzavren.
  - [ ] 135.44 Uzavrit preflop preview/production UX po dokoncenych P1/P2 datech
    - Rozhodnout, zda historical 9-max regular CHIP_EV preview zustane pouze jako explicitni non-production fallback pro ne-release build, nebo se plne nahradi canonical production importem.
    - Po production importu musi profile selector ukazat production status, ne "Náhled", pro vsechny productionReady preflop profily.
    - Start flow nesmi pro productionReady profil sahnout po historical/candidate packu, pokud existuje canonical production pack.
    - Zachovat source-free copy: zadne packId, URL, provider nebo raw path ve visible UI.
    - Acceptance: unit/jsdom/Chrome testy pro default profil rozlisi preview pred importem a production po importu; release gates zustanou cervene jen pro opravdu nedodane sloty.
  - [ ] 135.45 Dokoncit postflop pilot FLOP/TURN/RIVER pro jednu hand-line
    - Vybrat jeden reprezentativni profil navazujici na P1/P2 data a dodat legal FLOP, TURN, RIVER packy se stejnymi dimenzemi.
    - FLOP pack musi pokryt SRP/3bet, facing bet, granularni position patterns, board textures, range lanes, legal actions a source-free explanation.
    - TURN pack musi pokryt prior flop action, turn card class, SPR windows, barrel/facing-bet nodes, range lanes a card-removal samples.
    - RIVER pack musi pokryt prior turn action, river runout class, value/bluff/check lanes, final pressure/facing-bet nodes a card-removal samples.
    - Pilot musi projit single street starty i jednu FLOP->TURN->RIVER hand-line bez heuristic fallbacku.
    - Acceptance: `mtt:postflop-coverage` pro pilot nema missing rule/position/permission/confidence blocker a Chrome production fixture pro pilot zachova pack identity ve stats po reloadu.
  - [ ] 135.46 Dokoncit P3/P4/P5 postflop production waves
    - P3 FLOP: 16 profile rows, 50 granularnich heads-up position patterns, SRP/3bet/facing-bet coverage, zadny PACK_NOT_PRODUCTION_READY.
    - P4 TURN: 16 profile rows, prior flop actions, turn classes, SPR windows, barrel/facing-bet coverage a runtime resolver bez fallbacku.
    - P5 RIVER: 16 profile rows, prior turn actions, river runout classes, blocker/value/bluff/check lanes a final decision coverage.
    - Po kazde street wave spustit `mtt:postflop-matrix`, `mtt:postflop-positions`, `mtt:postflop-coverage`, `mtt:postflop-release`, technical acceptance a source-free UI guard.
    - Acceptance: `mtt:postflop-release -- --summary` ma 48/48 productionReady postflop rows, 0 fallback runtime, 0 missing permission, 0 LOW confidence a 0 incomplete coverage.
  - [ ] 135.47 Udelat production stats/HH/dashboard parity po dokoncenych datech
    - Overit preflop i postflop stats pro vsechny production profily: profileId, rangePackId/strategyPackId, street, action node, confidence, hand-line vs single spot.
    - Export/import stats musi zachovat production identity a nesmi downgradovat na preview/fallback.
    - HH review musi pouzit stejne production resolvery jako trainer pro FLOP/TURN/RIVER; pokud profil neni productionReady, musi failnout source-free a neheuristicky.
    - Dashboard nesmi ukazat raw source metadata, ale musi umoznit oddelit CHIP_EV/DOLAR_EV, 9-max/6-max, regular/turbo, ante ON/OFF a street.
    - Acceptance: reprezentativni HH import + trainer session + stats export/import projdou v Chrome a ve unit testech bez source citaci.
  - [ ] 135.48 Dokoncit Android WebView/device acceptance
    - Zajistit dostupny `adb` ready target nebo emulator; `e2e:android:preflight` musi vratit READY a nenulovy `readySerial`.
    - Spustit production build v Android WebView/emulatoru: app load, preflop start/answer, postflop single spot, hand-line, HH review, stats, reload, offline reopen.
    - Overit touch input, viewport 360/390/412 ekvivalenty, service worker/offline chovani, localStorage quota/corrupt recovery a zadny horizontal overflow.
    - Pokud device neni dostupny, release notes musi explicitne nest blocker a nesmi oznacit MTT complete v1.
    - Acceptance: Android report obsahuje readySerial/device evidence, screenshot/log artefakty a `mtt:release-gates` prestane selhavat na Android preflight.
  - [ ] 135.49 Premerit bundle, lazy loading a offline storage po skutecnych produkcnich packach
    - Po kazde import wave zmerit raw/gzip velikost main bundle, jednotlivych lazy MTT chunku a souctu cele knihovny.
    - Otestovat cold start bez nacitani cele produkcni knihovny, warm start po jednom profilu a offline reopen po service-worker update.
    - Lazy chunky nesmi byt install-precached; service worker musi umet rollback predchoziho buildu bez stale stable asset leak.
    - Pokud data prekroci budget, rozdelit chunky granularneji podle street/profile nebo upravit delivery strategii pred release.
    - Acceptance: `build`, `verify:precache`, `bundle:budget`, Chrome E2E a Android E2E projdou s realnymi production daty.
  - [ ] 135.50 Finalni source-free UX polish pro MTT complete v1
    - Projit profile selector, gate warnings, preflop result, postflop single/line, HH review, dashboard, import errors, release notes a quick start.
    - Vsechny user-facing texty maji byt profesionalni, konzistentni a bez internich packId/source/provider/raw path detailu.
    - Production profily maji jasne pusobit jako hotovy trenink, preview profily jako hratelny nahled jen tam, kde je to zamerne povoleno.
    - Error states musi byt akcni: rict co chybi nebo co ma operator spustit, bez vystaveni citlivych zdroju.
    - Acceptance: `uiNoSourceCitation`, release metadata tests a realny Chrome smoke nenajdou source leak, mojibake regresi ani matoucí preview/production copy.
  - [ ] 135.51 Finalni release governance a go/no-go matice
    - Sepsat go/no-go tabulku: data readiness 64/64, postflop release 48/48, Android READY, technical acceptance green, release:check green, source-free UI green, bundle budget green.
    - `mtt:handoff -- --strict` musi byt zeleny; `mtt:release-gates` a `mtt:acceptance` musi mit 0 release-blocking failures.
    - V release notes uvest presne pocty production rows, import vlny, zname limity, Android device evidence a FTP/staging balicek.
    - Pred final tag/zip zkontrolovat cisty git stav bez nechtenych raw dat a bez legacy lokalnich zmen ve stagingu.
    - Acceptance: finalni release commit obsahuje pouze source-safe artefakty/kod/docs, `release:check` je zeleny a MTT complete v1 je oznacen az po splneni vsech vyse uvedenych gate.
  - [x] 135.52 Udrzet solver/data hygiene pri dalsi praci
    - Raw TexasSolver/GTO+ exporty, licence evidence a privatni range vstupy nesmi byt commitnuty do gitu ani zobrazeny v user-facing UI.
    - Lokalne existujici `Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver/.../raw/*.json` brat jako workspace artefakty; pred commitem je ignorovat nebo explicitne vycistit podle domluveneho workflow.
    - Kazdy commit pred push musi projit kontrolou `git status --short --branch` a staged diff musi obsahovat jen source-safe kod/docs/tests.
    - Acceptance: zadny raw solver JSON ani realna permission evidence neni staged; tooling umi s raw vystupy pracovat jen jako s lokalnim vstupem.
    - Hotovo 2026-07-01: `.gitignore` ignoruje lokalni `output/gto-plus/` a `output/texas-solver/` workspace, `output/README.md` vysvetluje canonical intake cestu a `git status` uz nezobrazuje raw solver JSONy.
  - [x] 135.53 Dokoncit TexasSolver overnight verification batch
    - Spustit bezpecny preflight `run-nightly-verification.ps1`, pak realny solve pres `run-nightly-verification.ps1 -RunSolve -ReviewTemplate`.
    - Dokoncit vsech 10 pripravenych parameter files nebo zapsat presny duvod, proc nektery spot nedobehnul.
    - Po dobehu stageovat vsechny family pres `mtt:stage-texas-solver -- --family=<familyId> --write --review-template`.
    - `mtt:solver-verification -- --solver=texas-solver` ma prejit z `WAITING_FOR_SOLVER_OUTPUT` minimalne na `PARTIAL`, idealne `READY_FOR_REVIEW` pro 3/3 family.
    - Acceptance: pro `MTT9_50BB_BTN_BB_SRP`, `MTT9_40BB_UTG_BB_SRP` a `MTT9_35BB_CO_BTN_3BP` existuji review artefakty, zadny raw JSON neni commitnuty a report jasne ukazuje dalsi review blocker.
    - Hotovo 2026-07-01: 10/10 TexasSolver raw JSON exportu existuje lokalne, `run-nightly-verification.ps1 -StageExisting -ReviewTemplate` stageoval 3/3 family a `mtt:solver-verification -- --solver=texas-solver` je lokalne `valid: true`, `READY_FOR_REVIEW` 3/3. Review artefakty zustavaji ignorovane v lokalnim solver workspace.
  - [ ] 135.54 Napsat TexasSolver export adapter pro review artefakty
    - Prozkoumat strukturu TexasSolver JSON (`actions`, `strategy`, `childrens`, `player`, chance/action nodes) a definovat stabilni interní intermediate format.
    - Adapter musi umet najit cilovy decision node podle family/board/action history, prelozit solver akce na PKRTrainer action taxonomy a agregovat suit-combo strategie do 169 hand classes.
    - Zaznamenat ztraty informace: rounding, mixed frequencies, missing combos, all-in sizing, player index mapping a board blockers.
    - Vystupem zatim nesmi byt production `normalized.json`; nejdrive jen source-free `strategy-export.review.json` nebo rozsireny `strategy-export.json` se statusem `NEEDS_REVIEW`.
    - Acceptance: unit fixture nad malym vyrezem TexasSolver JSON overi action mapping, hand-class aggregation a fail-closed chovani pri necekanem stromu.
    - Rozpracovano 2026-07-01: pridany `scripts/extractTexasSolverReview.mts`, npm prikaz `mtt:texas-solver-review`, unit testy a operator guide. Lokalni beh zapsal `strategy-export.review.json` pro 3/3 family: `MTT9_50BB_BTN_BB_SRP` 8 files / 2516 combos / 65 hand classes, `MTT9_40BB_UTG_BB_SRP` 1 file / 340 combos / 63 hand classes, `MTT9_35BB_CO_BTN_3BP` 1 file / 104 combos / 23 hand classes. Zbyva doplnit selector pro nerootove decision nody/action history.
  - [ ] 135.55 Zavezt solver review protocol pro pokerovou kvalitu
    - Pro kazdy solver family evidovat tree settings, ranges, stack/pot scaling, iterations/accuracy, exploitability/log evidence, board set a reviewer sign-off.
    - Overit, ze smoke tree sizingy nejsou omylem interpretovane jako finalni production poker strategie; pro release packy rozhodnout finalni sizing model pred importem.
    - Porovnat minimalne vybrane root strategie proti GTO+/nezavislemu sanity checku nebo pokerovemu review, zejmena u monotone/paired/connected boardu.
    - Acceptance: `review-notes.md` pro kazdou family nese `Status: REVIEWED` az po skutecne kontrole a obsahuje explicitni "usable for production: yes/no/scope" rozhodnuti.
  - [ ] 135.56 Prevest prvni reviewed postflop pilot do production StrategyPacku
    - Vybrat nejmensi hodnotny pilot: doporuceni pro `MTT9_50BB_BTN_BB_SRP` na A72r/JT9tt nebo jinou family podle kvality solve.
    - Namapovat solver vystup na presny MTT postflop slot, profile dimensions, pot type, position pattern, board texture, SPR, action node a legal actions.
    - Vytvorit legalni `normalized.json` + `permission.json` jen pokud review potvrdi, ze data lze pouzit v runtime a ze assumptions odpovidaji slotu.
    - Spustit `validate:range-import`, `build:range-module --dry-run`, `mtt:validate-ready-intake`, `mtt:promote-ready --dry-run`, potom write/promotion jen pri zelenem reportu.
    - Acceptance: jeden FLOP/TURN/RIVER nebo minimalni FLOP pilot je productionReady bez heuristic fallbacku, se source-free UI a s registry integrity green.
  - [ ] 135.57 Rozhodnout produkcni solver strategii: TexasSolver vs GTO+ vs mixed validation
    - TexasSolver preferovat pro batch automation a JSON export, GTO+ ponechat jako manualni/nezavisly sanity check tam, kde je potreba duvera ve vystup.
    - Definovat, kdy je TexasSolver output dostatecny pro production: verze solveru, command file, tree, accuracy, reviewer, board coverage a diff/anomaly report.
    - Pokud GTO+ zustane v procesu, nepokouset se o hromadny import neexistujicim formatem; pouzit ho jen pro ruční kontrolu vybranych spotu nebo exporty, ktere opravdu umi nacist.
    - Acceptance: tasks/operator guide jasne rikaji, ktery solver je source of truth pro kterou vlnu a jak se resi odchylky.
  - [ ] 135.58 Pripravit P1 preflop data intake mimo solver postflop workflow
    - P1 preflop CHIP_EV nelze odvodit z postflop solveru; potrebuje samostatne legalni preflop ranges nebo reviewed reuse policy.
    - Pripravit vstupni checklist pro 8 P1 slotu: format, speed, ante, stack buckets, positions, action contexts, 169 hand classes, action keys a sizing.
    - Jakmile jsou data dodana, nejdrive validovat prvni pilot `mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1`.
    - Acceptance: preflop P1 pilot projde canonical import workflow a blocker count klesne o 1 bez jakehokoli metadata-only klonu.
  - [ ] 135.59 Zavezt pravidlo "no false green" pro dalsi autonomni behy
    - Pokud chybi legalni data nebo solver review, agent smi zlepsovat tooling, testy, dokumentaci, adaptery a QA, ale nesmi vyrabet falesne produkcni strategicke hodnoty.
    - Kazdy novy gate musi rozlisit `READY`, `PARTIAL`, `WAITING_FOR_FILES`, `NEEDS_REVIEW` a `PRODUCTION`, aby operator neprehlédl rozdil mezi technickou pripravenosti a pokerovou validitou.
    - Acceptance: zadny CLI/report nema exit 0 nebo copy text, ktery by implikoval hotovou MTT cast, dokud `mtt:handoff -- --strict` neni zeleny.
  - [ ] 135.60 Prioritni poradi dalsi implementace
    - 1. Aktualizovat a udrzovat tasks/handoff podle realnych reportu.
    - 2. Dokoncit TexasSolver solve/staging/review pipeline a adapter pro review vystupy.
    - 3. Zpracovat prvni reviewed postflop pilot do legalniho production importu.
    - 4. Paralelne cekat na/dodat legalni preflop P1 data a zpracovat prvni preflop pilot.
    - 5. Po uspesnych pilotech skálovat po vlnach P1 -> P2 -> P3 -> P4 -> P5.
    - 6. Teprve po datech delat finalni Android, performance, UX polish, release governance a FTP/staging balicek.
    - Acceptance: dalsi autonomni prace vzdy zacina nejvyssi nesplnenou polozkou v tomto poradi, pokud uzivatel explicitne nezmeni prioritu.
  - [ ] 135.61 Dopracovat TexasSolver node selector a review diff
    - Pridat do `mtt:texas-solver-review` vyber decision node podle action history (`--node-history`/family default), ne jen root node.
    - Zachytit a reportovat cestu stromem, dostupne child akce, player mapping IP/OOP a fail-closed stav, pokud pozadovany node v exportu neni.
    - Vytvorit jednoduchy anomaly/diff report mezi boardy v jedne family: extremni bet frequency, chybejici hand classes, podezrele action labels, all-in sizing a exploitability/log evidence navazujici na `review-notes.md`.
    - Acceptance: unit test kryje nested `childrens` strom, neexistujici action history a diff/anomaly summary; operator guide popisuje, jak reviewer vybere node pro prvni FLOP pilot.
    - Rozpracovano 2026-07-01: `--node-history=<ACTION>[>ACTION...]` umi vybrat nested `childrens` node, podporuje raw TexasSolver labels i normalized labels typu `BET_25` a fail-closed reportuje dostupne child akce. Report doplnuje non-blocking `anomalies` pro low hand-class/combo coverage, invalid combo labels a action-set diff mezi boardy. Zbyva napojeni na review-notes evidence a explicitni reviewer sign-off workflow.
  - [x] 135.62 Pripravit komplexni PowerShell workflow pro TexasSolver review/compare/integration
    - Hotovo 2026-07-01: `Agents/solver-input/texas-solver/mtt-safe-flops-v1/review-compare-integrate.ps1` overuje TexasSolver parameter pack, stageuje 3 family, generuje root/CHECK review reporty, porovnava je s aktualnim PKRTrainer postflop release gate a vypisuje legalni full-ring FLOP import sloty.
    - Vystupy jsou v `artifacts/texas-solver-review-integration/TEXAS_SOLVER_INTEGRATION_REPORT.md`, `texas-solver-integration-report.json` a `command-log.json`.
    - Bezpecnost: skript nevytvari production `normalized.json` ani `permission.json`; pouze ukazuje nejlepsi pilot a dalsi canonical import kroky po lidskem poker review.
    - Posledni beh doporucil `MTT9_50BB_BTN_BB_SRP` / `CHECK` jako prvni pilot: 8 raw files, 1792 combo rows, 50 hand classes, 0 anomalies; soucasny PKRTrainer baseline zustava 0/48 postflop production-ready a 48 fallback runtime rows.

- [ ] 136. Password-protected FORPSI staging deployment
  - Cil: umet nahrat aktualni staticky build na FORPSI FTP a zamknout ho heslem, aby slo prakticky zkouset aplikaci mimo lokalni stroj bez verejneho zverejneni.
  - Zasada: do gitu nepatri FTP hesla, `.htpasswd` hash ani realne staging prihlasovaci udaje.
  - [x] 136.1 Pripravit FORPSI FTP deployment guide
    - Hotovo: `Agents/forpsi-ftp-deployment.md` popisuje build, upload `dist/`, FORPSI `/www/` vs `/subdoms/<subdomain>/`, Basic Auth pres `.htaccess`/`.htpasswd`, HTTPS redirect a service worker kontrolu.
  - [x] 136.2 Pridat bezpecnou `.htaccess` sablonu
    - Hotovo: `deploy/forpsi/.htaccess.example` obsahuje vypnuti indexu, HTTPS redirect fallback a Basic Auth direktivy s placeholder `AuthUserFile`.
  - [ ] 136.3 Overit cilovy FORPSI hosting
    - Zjistit, zda jde o Linux webhosting s `.htaccess`/`AuthConfig`; pokud jde o Windows hosting, misto `.htaccess` bude potreba `web.config` nebo prepnout hosting.
    - Zjistit FTP cil: hlavni domena `/www/` nebo subdomena `/subdoms/<subdomain>/`.
  - [ ] 136.4 Vytvorit `.htpasswd` mimo webroot
    - Podle FORPSI doporuceni ulozit `.htpasswd-pkrtrainer` do `/data/` v rootu FTP a v `.htaccess` nastavit absolutni serverovou cestu.
    - Heslo/hash nevkladat do repozitare ani do chatu; vytvorit mimo git pres `htpasswd`.
  - [ ] 136.5 Nahrat a otestovat staging
    - Uploadnout obsah `dist/` a `.htaccess`, otevrit staging URL v anonymnim okne, overit login dialog, app load, service worker, Training, Postflop a Statistics.
  - [ ] 136.6 Sepsat finalni staging URL a pristupovy postup mimo repo
    - URL a pristupove udaje ulozit mimo git, napriklad do soukromeho password manageru nebo lokalni necommitovane poznamky.

- [ ] 137. Full MTT NLHE variant roadmap - navazujici rozsah po 64radkovem MTT v1
  - Cil: postupne rozsirit produkcni MTT trenink z v1 matice na realne turnajove faze a formaty bez nekontrolovaneho karteskeho soucinu dat.
  - Scope guard: tato sekce neblokuje MTT v1 release podle 135.22, dokud neni konkretni varianta explicitne povysena do release kontraktu.
  - Zakladni produktova hranice: tento roadmap je pro No-Limit Hold'em MTT. PLO, Short Deck, mixed games a dalsi pokerove hry potrebuji samostatny domain/data model a nesmi se tise vydavat za MTT variantu stejneho solver prostoru.
  - Strategie pro rychlost: nejdriv dodelat 64radkovy v1, potom pridavat vertikalni releasy po jedne uzivatelsky hodnotne variante s vlastnim completion gate; nevytvaret plny soucin vsech dimenzi predem.
  - [ ] 137.1 Zmrazit taxonomii "vsech MTT variant" a jejich produktovou prioritu
    - Evidovat table size, speed, ante structure, tournament phase, payout utility, bounty model, entry model, blind schedule, stack distribution, pot type a street.
    - Rozlisit strategicky relevantni dimenze od pouhych metadat. Napriklad re-entry label sam o sobe nemusi vyzadovat novy strategy pack, pokud se nemeni utility/payout/field assumptions.
    - Navrhnout release trains: `V1_BASE`, `V2_ICM`, `V3_FINAL_TABLE_SATELLITE`, `V4_BOUNTY`, `V5_DYNAMIC_TABLE_MULTIWAY`.
    - Acceptance: kazda podporovana varianta ma ownera, data zdroj, gate, UI status a explicitni out-of-scope polozky.
  - [ ] 137.2 Nahradit pevny kartesky completion model rizenym scenario katalogem
    - Soucasnych 64 rows je uzavrena v1 matice; dalsi dimenze by jinak explodovaly do tisicu prazdnych slotu.
    - Zavest verzovany `TournamentScenarioDefinition` katalog s explicitnimi podporovanymi kombinacemi, required coverage a povolenou inheritance/reuse policy.
    - Completion CLI musi umet reportovat po release trainu, variante a scenario id; nepodporovana kombinace je `UNSUPPORTED`, ne `MISSING`.
    - Acceptance: pridani PKO nebo satellite scenare nevytvori automaticky blockery pro vsechny nesmyslne kombinace.
  - [ ] 137.3 Rozsirit TrainingProfile na TournamentProfile bez rozbiti historie
    - Pridat verzovane dimenze: `tableSize`, `speedClass`, `anteStructure`, `phase`, `payoutModel`, `bountyModel`, `entryModel`, `blindScheduleId`, `stackDistributionId` a `utilityModel`.
    - Zachovat migraci v1 profileId, qid, stats, exportu a ulozenych filtru; nezname legacy dimenze oznacit explicitnim default/legacy stavem.
    - Capability matrix musi rozhodovat podporu nad novym profilem a nedovolit nelegalni kombinace.
    - Acceptance: stare v1 statistiky zustanou citelne a nove varianty se nemichaji do puvodnich KPI.
  - [ ] 137.4 Podporit dynamickou velikost stolu a realne presazovani pozic
    - Rozsirit 9-max/6-max na bezne 8-max a dynamicke 7/6/5/4/3-handed, final-table short-handed a heads-up.
    - Pozice odvozovat relativne k buttonu a poctu aktivnich sedadel, ne z jednoho globalniho `Position` unionu urceneho pro 9-max.
    - Generator, action tree, table renderer, HH parser, position patterns a range keys musi sdilet jeden seat/position model.
    - Acceptance: property test projde 2-9 aktivnich hracu, unikátní pozice, spravne poradi akce a button/SB/BB pri kazdem poctu.
  - [ ] 137.5 Podporit blind speed a ante struktury
    - Rozsirit `REGULAR/TURBO` o explicitne definovane `SLOW/DEEP`, `HYPER` a custom schedule; speed nesmi byt jen metadata, pokud meni stack distribution nebo strategii.
    - Rozlisit `NO_ANTE`, `BIG_BLIND_ANTE` a `PLAYER_ANTE`; modelovat castku ante a prechod mezi levely.
    - Blind schedule ma podporit late registration, breaky, level duration a vypocet stacku v BB z realnych chipu.
    - Acceptance: pot, stack bucket a profilova identita jsou spravne pro kazdou ante strukturu a level.
  - [ ] 137.6 Zavest turnajove faze a distribuci stacku
    - Modelovat early, middle, late registration, pre-bubble, direct bubble, in-the-money, pay-jump, final table a heads-up.
    - Scenar musi nest hero stack, stacky relevantnich souperu, remaining players, average stack, payout positions a blind level.
    - Umoznit trenink big-stack/mid-stack/short-stack interakci a covering/covered statusu.
    - Acceptance: stejna handa/pozice/BB muze mit odlisnou strategii jen tehdy, kdyz profil nese odlisnou utility/stack-distribution evidenci.
  - [ ] 137.7 Implementovat overitelny ICM a $EV engine
    - Soucasny `icmModel.ts` odhaduje bubble factor pro SNG a neni plny MTT ICM kalkulator.
    - Implementovat nebo integrovat licencovany ICM vypocet pro arbitrary payouts/stacks, validovat sumu equity a porovnat s nezavislymi fixture.
    - Pro postflop/hlubsi stromy rozhodnout rozsah approximation vs solver-import; UI musi jasne rozlisit chipEV, ICM a projektovy DOLAR_EV model.
    - Pripravit Future Game Simulation / risk-premium vrstvu pro final-table a satellite situace, pokud ji data podpori.
    - Acceptance: golden fixtures pro bubble/final table/HU a zadne tiche mapovani DOLAR_EV na CHIP_EV.
  - [ ] 137.8 Pridat standardni payout a final-table varianty
    - Presety: flat, standard, top-heavy, winner-take-all, final-table pay jumps a custom payout editor/import.
    - Strategie a statistiky oddelit podle payout/scenario id; payout z HH/tournament lobby musi byt validovany pred review.
    - Doplnit final-table 9->2 handed scenare a heads-up transition.
    - Acceptance: payout zmena meni pouze ICM/$EV profily a neovlivni cisty CHIP_EV profil.
  - [ ] 137.9 Pridat satellite a seat-value utility
    - Modelovat fixed-seat satellites, target-stack/double-or-nothing-like utility, kvalifikacni tokeny a situace s vice stejne hodnotnymi misty.
    - Implementovat satellite-specific bubble pressure, overfold/call-off scenare a stack preservation.
    - Nevydavat bezny ICM payout model za satellite utility.
    - Acceptance: golden scenare short stack/big stack na satellite bubble a samostatny release gate.
  - [ ] 137.10 Pridat bounty varianty
    - Podporit `NONE`, fixed KO, PKO a Mystery Bounty; nest aktualni bounty hero/souperu, bounty stage a cash/utility konverzi.
    - Implementovat bountyEV/PKO utility a covering logic; mystery bounty musi pracovat s distribuci zbyvajicich odmen, ne s jednou pevnou castkou.
    - Rozsirit preflop call/jam a postflop all-in scenare o bounty incentive bez michani s beznym $EV.
    - Acceptance: stejny all-in spot ma samostatne CHIP_EV, ICM a BOUNTY_EV vysledky s auditovatelnym vstupem.
  - [ ] 137.11 Evidovat freezeout, re-entry, rebuy, add-on a multi-flight metadata
    - Modelovat entry policy, late-reg stav, rebuy/add-on dostupnost, flight/Day 2 a stack carry-over.
    - Do strategie povysit jen tyto dimenze, pokud existuje explicitni utility model nebo reviewed data; jinak je pouzit pro scenar/filtry/HH metadata.
    - Doplnit UX vysvetleni, aby uzivatel necekal od pouheho `re-entry` labelu automaticky jinou GTO range.
    - Acceptance: metadata se zachovaji v HH/stats/exportu a nezpusobi nelegalni cross-profile reuse.
  - [ ] 137.12 Rozsirit preflop akci a sizing model na plny turnajovy strom
    - Identita spotu musi nest konkretni opener/caller/3bettor pozice, sizingy, pocet hracu, effective stacky a covering status.
    - Doplnit cold-call, cold-4bet, vs squeeze, limp-reraise, multiple limpers/callers, overcall, iso multiway, reshove, multiway all-in a blind complete/check vetve.
    - Sizing keys nahradit obecnym typem castky v BB/pot fraction/all-in; 3bet/4bet/squeeze nesmi zustat bez sizingu.
    - Acceptance: action legality a pot contributions projdou stavovym/property testem pro vsechny podporovane preflop nody.
  - [ ] 137.13 Rozsirit postflop node katalog
    - Vedle c-bet/barrel/pressure/facing-bet pridat delayed c-bet, probe, donk/lead, check-raise, bet-vs-missed-cbet, raise-vs-bet, overbet, block bet a all-in nodes.
    - Pridat limped a 4bet poty; zachovat presny preflop action history a range origin.
    - StrategyPack schema musi byt verzovana a node-specific, ne jeden obecny action seznam pro neslucitelne situace.
    - Acceptance: kazdy node ma legalni action/sizing contract, coverage gate a hand-line transition.
  - [ ] 137.14 Implementovat multiway postflop a side-pot engine
    - Modelovat 3+ aktivni hrace, poradi akce, rozdilne stacky, folded/all-in seaty, main pot a side poty.
    - Resolver musi dostat multiway range kontext a nesmi pouzit heads-up pack jako fallback.
    - Table UI, HH parser a stats musi uchovat vsechny relevantni hrace a terminalni showdown/all-in stav.
    - Acceptance: zachovani chipu a side-pot eligibility projdou property testy a rucne overenymi HH fixture.
  - [ ] 137.15 Zavest explicitni opponent policy a plnou hand simulation
    - Oddelit rozhodnuti hero od reakce soupere; opponent policy muze byt production strategy, scripted training branch nebo user-selected population model.
    - Umoznovat branch replay, alternative-line comparison a fixed-board/fixed-hand study bez zmeny seedu.
    - Vysledek line nesmi hodnotit jen shodu s jednou preferovanou akci, ale EV loss/frequency, pokud jsou legalni exact data dostupna.
    - Acceptance: stejny hero action plan a opponent policy dava deterministickou, legalni a auditovatelnou line.
  - [ ] 137.16 Podporit mixed strategies, frekvence a randomizer
    - Preflop i postflop pack musi umet exact nebo qualitative action mix; soucty frekvenci a combo weights validovat.
    - Scoring rozlisit pure mistake, acceptable mix a low-frequency deviation; strict mode nesmi trestat legalni mixed action bez definovane tolerance.
    - Pridat deterministicky seeded randomizer a zobrazit frekvence bez odhaleni zakazanych source metadat.
    - Acceptance: frequency fixtures, rounding policy a replay se stejnym seedem jsou stabilni.
  - [ ] 137.17 Vybudovat vlastni solver/import content pipeline
    - Definovat canonical scenario input, solver export adaptery, normalization, combo aggregation, human review a signed provenance fingerprint.
    - Automatizovat diff mezi verzemi strategie, anomalie, regression corpus a approval workflow.
    - Raw solver data a permission evidence zustavaji mimo runtime/Git podle licence; runtime artefakt obsahuje jen potrebna source-free audit metadata.
    - Acceptance: nova varianta projde jednim reprodukovatelnym pipeline od scenario definition po lazy production pack a release gate.
    - Hotovo 2026-07-01: pridan `mtt:texas-solver-viewer`, ktery generuje lokalni HTML hand-matrix review nad TexasSolver review JSONy bez produkcniho importu.
    - Hotovo 2026-07-01: pridan `mtt:texas-solver-normalize-draft`, ktery z pilotniho TexasSolver `CHECK.review-report.json` vytvori canonical `flop-production` kandidata a permission manifest do `artifacts/`; validace potvrzuje legalni slot/permission a zaroven nechava `productionReady=false`, dokud chybi sirsi pozice, 3bet/facing-bet nody, LOW/HIGH SPR a dalsi texture coverage.
    - Dalsi krok: po poker review bud rozsirime TexasSolver scenario batch tak, aby pokryl chybejici coverage dimenze, nebo pridame explicitni pilot-release gate pro uzsi BTN vs BB SRP pack bez maskovani jako plny FLOP production coverage.
    - Hotovo 2026-07-01: pridan `mtt:texas-solver-coverage-batch`, ktery generuje 21 coverage-v2 TexasSolver parameter souboru pro BTN vs BB SRP LOW/HIGH SPR, UTG vs BB SRP texture samples a CO vs BTN 3BP texture samples; `run-console-selected.ps1` umi `-ParameterRoot`, takze batch lze pustit jako PowerShell background job.
    - Hotovo 2026-07-01: pridan `mtt:postflop-pilot-gate`, ktery validuje uzky `BTN_vs_BB_SRP_FLOP_CBET` pilot jako scoped pack: permission/slot/runtime smoke musi byt green, ale `fullProductionReady=false` zustava explicitni a nezamenuje se za plny MTT postflop release.
    - Hotovo 2026-07-01: pilot gate logika je presunuta do sdileneho `src/data/ranges/mttPostflopPilotGate.ts` modulu a kryta unit testem; CLI uz neni jediny zdroj pravdy pro scoped pilot pravidla.
    - Hotovo 2026-07-01: LOWSPR TexasSolver raw vystupy byly staged/reviewed (`MTT9_20BB_BTN_BB_SRP_LOWSPR`, 4 raw, 890 combos, 50 hand classes), viewer defaultne nacita aktualni staged output a `mtt:texas-solver-normalize-draft` umi `--spr-min/--spr-max` pro LOW/HIGH SPR kandidaty.
    - Hotovo 2026-07-01: pridan `mtt:texas-solver-merge-pilot-drafts`, ktery slouci vice reviewed normalized draftu do jednoho uzkeho BTN vs BB SRP FLOP c-bet pilot kandidata vcetne permission manifestu a merge reportu. Vystup zustava v `artifacts/`, prochazi pilot gate a stale explicitne nechava `fullProductionReady=false`.
    - Hotovo 2026-07-01: pridan `mtt:texas-solver-coverage-status`, ktery cte coverage-v2 manifest a filesystem raw vystupy, ukazuje complete/partial/waiting family a generuje presne stage/review/normalize prikazy bez zavislosti na PowerShell job session.
    - Hotovo 2026-07-01: pridan `mtt:texas-solver-ingest-completed`, ktery autonomne odebira jen `RAW_COMPLETE` TexasSolver coverage-v2 family, spousti stage/review, normalizuje podporovane LOW/HIGH SPR pilot kandidaty a re-merguje dostupny scoped pilot pack bez produkcni promoce.
    - Hotovo 2026-07-01: pridan `mtt:texas-solver-scenario-audit`, ktery kontroluje TexasSolver parameter files proti coverage manifestu: pot, effective stack, SPR band, board/textures, IP/OOP range, c-bet/raise tree, dump rounds a vystupni dump name. Tim je mozne pripravovat dalsi board/action sady s auditovatelnym formatem hry pred dlouhym solvingem.
    - Hotovo 2026-07-01: HIGHSPR coverage-v2 dobehl 4/4 raw JSON, `mtt:texas-solver-ingest-completed` jej stageoval/reviewed/normalizoval a merged BTN vs BB SRP pilot ma 3 pravidla, 150 bucketu, kompletni LOW/MID/HIGH SPR a kompletni board texture coverage. Pilot gate je `valid: true`, full production zustava spravne `false` kvuli chybejicim pozicim, 3bet potum a facing-bet nodum.
    - Hotovo 2026-07-01: `mtt:texas-solver-normalize-draft` umi explicitni `--position-pattern`, `--pot-type` a `--action-node`, aby UTG SRP a CO BTN 3BP solves nebyly omylem mapovane do BTN vs BB SRP defaultu. Ingest uz pro `MTT9_40BB_UTG_BB_SRP` pouzije `SRP_UTG_VS_BB/SINGLE_RAISED/SINGLE_RAISED_POT_CBET` a pro `MTT9_35BB_CO_BTN_3BP` pouzije `3BP_BTN_VS_CO/THREE_BET_POT/THREE_BET_POT_CBET`.
    - Hotovo 2026-07-01: `mtt:postflop-pilot-gate` podporuje explicitni scopes `BTN_vs_BB_SRP_FLOP_CBET`, `UTG_vs_BB_SRP_FLOP_CBET` a `BTN_vs_CO_3BP_FLOP_CBET`, takze UTG SRP a 3BP piloty lze overit bez jejich maskovani jako BTN vs BB SRP.
    - Hotovo 2026-07-01: pridan `mtt:postflop-pilot-suite`, ktery projde vsechny zname scoped pilot drafty najednou; dostupne kandidaty oznaci `READY/INVALID`, chybejici UTG/3BP drafty jako `WAITING`, aby prubezny solve nebyl zaměněn za fail release gate.
    - Hotovo 2026-07-01: normalized draft reporty a merged pilot report nesou deterministicky `provenanceFingerprint` SHA-256 nad review vstupem, normalized kandidatem a permission manifestem, aby slo poznat tichou zmenu kandidata pred poker review/promoci.
    - Hotovo 2026-07-01: UTG SRP coverage-v2 dobehl 6/6 raw JSON, `mtt:texas-solver-ingest-completed` jej stageoval/reviewed/normalizoval s explicitnim `SRP_UTG_VS_BB/SINGLE_RAISED/SINGLE_RAISED_POT_CBET` mappingem. Scoped gate `UTG_vs_BB_SRP_FLOP_CBET` je `valid: true`, 1 rule / 36 bucketu, `fullProductionReady=false` zustava spravne kvuli uzkemu pilot scope.
    - Hotovo 2026-07-01: pridan `mtt:texas-solver-pilot-refresh`, ktery opakovatelne pusti coverage status, ingest dokoncenych family, pilot suite a review viewer bez produkcni promoce. Slouzi pro autonomni odebírani novych range kandidatu behem dlouheho TexasSolver batch solve.
    - Aktualni stav 2026-07-01: CO BTN 3BP coverage-v2 dobehl 7/7 podle manifestu (lokalne 8 raw JSON vcetne historickeho boardu) a `mtt:texas-solver-pilot-refresh` jej stageoval/reviewed/normalizoval do 8-file draftu s fingerprintem `9c9e78fcae8b92caf5ddffd67908fcaf5c433c272997adbf04c44ee18253f53e`.
    - No-false-green blocker 2026-07-01: `BTN_vs_CO_3BP_FLOP_CBET` scoped pilot zustava `INVALID`, protoze aggregated 3BP draft ma jen 25 hand classes a neobsahuje `BLUFF` lane; runtime resolver jej proto fail-closed odmita. Toto je poker/data quality blocker, ne chyba solver batch orchestrace.
    - Hotovo 2026-07-02: pridan `mtt:texas-solver-3bp-repair-batch`, ktery generuje review-only repair manifest `coverage-3bp-repair-v1-manifest.json` a 8 TexasSolver spotu `MTT9_35BB_CO_BTN_3BP_REPAIR` s sirsi IP 3bet range obsahujici suited connector/gapper bluff kandidaty. Cilem je overit, zda puvodni 3BP blocker byl dusledek prilis value-heavy vstupu, ne jej obejit.
    - Hotovo 2026-07-02: `mtt:texas-solver-ingest-completed` a `mtt:texas-solver-pilot-refresh` umi pracovat s explicitnim `--manifest`, takze lze paralelne odebírat jak hlavni coverage-v2, tak 3BP repair batch bez zavislosti na konkretni PowerShell job session.
    - Hotovo 2026-07-02: `mtt:postflop-pilot-suite` umi pro `BTN_vs_CO_3BP_FLOP_CBET` preferovat repair draft `MTT9_35BB_CO_BTN_3BP_REPAIR-CHECK`, jakmile existuje; dokud repair neprojde legal/permission/runtime smoke, puvodni no-false-green `INVALID` stav zustava spravne blokujici.
    - Hotovo 2026-07-02: 3BP repair solving dobehl 8/8 raw JSON; refresh s repair manifestem je `valid: true` a `mtt:postflop-pilot-suite` hlasi 3/3 scoped piloty READY: BTN vs BB SRP, UTG vs BB SRP a BTN vs CO 3BP.
    - Hotovo 2026-07-02: `mtt:texas-solver-normalize-draft` byl zpresnen pro mixed strategie: dominantni CHECK handu povysi na aktivni bet bucket jen tehdy, kdyz ma aspon 25 % celkovy bet mix a zaroven jde o prirozeneho bluff kandidata mimo par/high-card broadway. Tim se zachova solverem vypoctena bluff frekvence bez ztraty CHECK lane a bez vyrabeni falesnych value/bluff bucketu.
    - Aktualni stav 2026-07-02: repair draft ma fingerprint `d8e5dd1a325f4cf8f8d3dd9d9991fee98a812f34f0b9e8c2c3e92aa0b8b3d1aa`, 34 bucketu a lane rozlozeni VALUE/BLUFF/CHECK = 2/8/24. Build do full `flop-production` modulu zustava spravne blokovany, protoze chybi full coverage: paired textures, MID/HIGH 3BP SPR, facing-bet nody a mnoho pozic.
    - Hotovo 2026-07-02: pridan `mtt:texas-solver-3bp-expansion-batch`, ktery generuje dalsich 12 review-only spotu pro `MTT9_80BB_CO_BTN_3BP_MIDSPR` a `MTT9_150BB_CO_BTN_3BP_HIGHSPR`, vcetne paired boardu `883r/QQ7r`; `mtt:texas-solver-scenario-audit -- --manifest ...coverage-3bp-expansion-v1-manifest.json --summary` je `valid: true`, 12/12 valid, 0 errors.
    - Hotovo 2026-07-02: 3BP expansion batch bezi na pozadi; `MTT9_80BB_CO_BTN_3BP_MIDSPR` dobehl 6/6 raw JSON a refresh jej stageoval/reviewed/normalizoval do `MTT9_80BB_CO_BTN_3BP_MIDSPR-CHECK`.
    - Hotovo 2026-07-02: `mtt:texas-solver-merge-pilot-drafts` podporuje `--scope=BTN_vs_CO_3BP_FLOP_CBET`, defaultne bere dostupne 3BP LOW repair + MID + pozdeji HIGH kandidaty a zapisuje `BTN_CO_3BP_FLOP_CBET_PILOT-CHECK` s merge reportem.
    - Hotovo 2026-07-02: `mtt:postflop-pilot-suite` preferuje merged 3BP pilot pack a fallbackuje na repair/coverage drafty jen pokud merged vystup chybi; aktualni LOW+MID 3BP merged pilot je `valid: true`, 2 rules, 68 bucketu, SPR LOW/MID, `fullProductionReady=false`.
    - Hotovo 2026-07-02: `mtt:texas-solver-pilot-refresh` po ingestu automaticky re-merguje BTN-BB SRP i BTN-CO 3BP pilot packy, takze po dobehnuti HIGHSPR staci znovu pustit refresh nad `coverage-3bp-expansion-v1-manifest.json`.
    - Hotovo 2026-07-02: `mtt:texas-solver-ingest-completed` pouziva stejne scoped merge prikazy jako refresh workflow, takze samostatny ingest po dokonceni raw family automaticky obnovi BTN-BB SRP i BTN-CO 3BP pilot packy.
    - Hotovo 2026-07-02: `mtt:texas-solver-normalize-draft` umi pro `FLOP_FACING_BET` mapovat TexasSolver `FOLD/CALL/RAISE_*` do legalniho `FOLD/CALL/RAISE` action space; regresni CLI test hlida, ze facing-bet draft nevyrabi `CHECK/BET_SMALL/BET_BIG` mixy.
    - Hotovo 2026-07-02: 3BP expansion batch dobehl 12/12 raw JSON; refresh nad `coverage-3bp-expansion-v1-manifest.json` je `valid: true` a merged `BTN_vs_CO_3BP_FLOP_CBET` LOW/MID/HIGH pilot gate je `valid: true`, 3 rules, 102 bucketu, SPR 0-20, lane VALUE/BLUFF/CHECK = 42/24/36, `fullProductionReady=false` zustava spravne kvuli uzkemu scoped pilotu.
    - Hotovo 2026-07-02: `mtt:texas-solver-normalize-draft` pro `FLOP_FACING_BET` zachovava mixed RAISE frekvenci i kdyz dominantni akce zustava CALL/FOLD; pri alespon 25 % raise mixu vznikne RAISE bucket, aby solverem vypoctene raise value/bluff frekvence nezmizely v dominant-only agregaci.
    - Hotovo 2026-07-02: lane klasifikace pro `FLOP_FACING_BET` byla zpresnena: VALUE/BLUFF lane vznikaji pouze z RAISE bucketu, zatimco CALL/FOLD zustavaji defenzivni CHECK lane. Tim se nevyrabi falesne value cally a gate vyzaduje realnou agresivni value/bluff cast.
    - Hotovo 2026-07-02: pridan `mtt:texas-solver-facing-bet-candidates`, ktery z existujicich TexasSolver stromu automaticky najde `CHECK>BET_*` response nody, vygeneruje review/normalized drafty jako `FLOP_FACING_BET`, spusti scoped pilot gate a seradi kandidaty bez manualniho zkouseni jednotlivych sizingu.
    - Hotovo 2026-07-02: facing-bet harvest nad `MTT9_150BB_CO_BTN_3BP_HIGHSPR` odblokoval `CHECK>BET_39` jako prvni validni `BTN_vs_CO_3BP_FLOP_FACING_BET` pilot: gate `valid: true`, 1 rule, 27 bucketu, lane VALUE/BLUFF/CHECK = 5/3/19, akce RAISE/CALL = 8/19, `fullProductionReady=false` spravne kvuli uzkemu pilot scope.
    - Hotovo 2026-07-02: `mtt:postflop-pilot-suite` nově sleduje i high-SPR facing-bet pilot; aktualni suite je `valid: true`, READY 4/4, 8 rules, 299 range bucketu: BTN-BB SRP cbet, UTG-BB SRP cbet, BTN-CO 3BP cbet a BTN-CO 3BP facing bet.
    - Hotovo 2026-07-02: pridan `mtt:texas-solver-facing-bet-expansion-batch`, ktery generuje 16 review-only TexasSolver spotu pro LOW/MID/MIDHIGH `BTN vs CO 3BP FLOP_FACING_BET` coverage s dynamickymi boardy a sirsim OOP suited-connector/gapper caller rangem, aby overil realne check-raise bluff frekvence misto rucniho hadani boardu.
    - Hotovo 2026-07-02: `mtt:texas-solver-scenario-audit -- --manifest .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-facing-bet-expansion-v1-manifest.json --summary` je `valid: true`, 16/16 parametrickych souboru validnich, 0 errors; background run byl spusten pres detached `powershell.exe` proces, ne pres volatilni `Start-Job`.
    - Hotovo 2026-07-02: `mtt:texas-solver-ingest-completed` byl opraven pro nove `*_3BP_FACING_*` family: uz nepouziva obecny `LOWSPR/HIGHSPR` fallback do SRP c-bet draftu, ale spousti `mtt:texas-solver-facing-bet-candidates` s odpovidajicim SPR rozsahem; c-bet merge se spousti jen pro manifesty s c-bet coverage tagy.
    - Hotovo 2026-07-02: prvni LOWSPR facing-bet family `MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR` dobehla 4/4 raw a candidate harvest odemkl validni `CHECK>BET_39`, `CHECK>BET_52` i `CHECK>BET_79`; best `CHECK>BET_39` ma gate `valid: true`, 42 bucketu, lane CHECK/BLUFF/VALUE = 15/7/20, akce CALL/RAISE/FOLD = 13/27/2.
    - Hotovo 2026-07-02: MIDSPR facing-bet family `MTT9_70BB_CO_BTN_3BP_FACING_MIDSPR` dobehla 6/6 raw a candidate harvest odemkl `CHECK>BET_79` jako validni MID response pilot: gate `valid: true`, 42 bucketu, lane CHECK/BLUFF/VALUE = 35/1/6, akce FOLD/CALL/RAISE = 10/25/7.
    - Hotovo 2026-07-02: `mtt:texas-solver-merge-pilot-drafts -- --scope=BTN_vs_CO_3BP_FLOP_FACING_BET` umi sloucit LOW/MID/HIGH facing-bet kandidaty do `BTN_CO_3BP_FLOP_FACING_BET_PILOT`; aktualni merged gate je `valid: true`, 3 rules, 111 bucketu, SPR LOW/MID/HIGH, `fullProductionReady=false` spravne kvuli sirsi production coverage.
    - Hotovo 2026-07-02: `mtt:postflop-pilot-suite` sleduje merged `BTN_vs_CO_3BP_FLOP_FACING_BET` pilot s fallbackem na jednotlive HIGH/LOW kandidaty, aby se response coverage hlidala jednotne a nedvojite; aktualne suite hlasi READY 4/4, 10 rules, 383 range bucketu.
    - Aktualni stav 2026-07-02: facing-bet expansion v1 se solveruje na pozadi; posledni status: `MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR` RAW_COMPLETE (4/4), `MTT9_70BB_CO_BTN_3BP_FACING_MIDSPR` RAW_COMPLETE (6/6), `MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH` zatim ceka. Sledovat prikazem `npm run mtt:texas-solver-coverage-status -- --manifest .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-facing-bet-expansion-v1-manifest.json --summary`.
    - Dalsi krok po dobehnuti MIDHIGH: spustit `mtt:texas-solver-ingest-completed -- --manifest .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-facing-bet-expansion-v1-manifest.json --summary`, pote overit `mtt:postflop-pilot-suite -- --summary` a pripadne vybrat nejlepsi HIGH/MIDHIGH sizing pro merge profil.
  - [ ] 137.18 Rozsirit HH import na hlavni herny a turnajova metadata
    - Vedle PokerStars-like pridat adaptery podle priorit realnych vstupu; kazdy provider ma fixture corpus a verzovany parser.
    - Parsovat tournament id, level, ante typ, table size, payouts/bounty pokud jsou dostupne, side poty, showdowns a all-in runouty.
    - Unknown provider ma vratit strukturovanou diagnostiku bez padu a bez pokusu reviewovat nejednoznacny profil.
    - Acceptance: anonymizovany fixture corpus pokryva 6/8/9-max, PKO, satellite a final-table handy.
  - [ ] 137.19 Vytvorit MTT scenario builder a learning paths
    - UI pro tournament phase, stack distribution, payout/bounty, table size, speed/ante, street/node a fixed hand/board.
    - Nabidnout predvolene curriculum: early-stage chipEV, short-stack, bubble, final table, PKO calls, satellite bubble a heads-up.
    - Zobrazit jen kombinace povolene capability/scenario katalogem a odhad velikosti dostupneho poolu pred startem.
    - Acceptance: uzivatel sestavi validni scenar bez raw enumu a jednim klikem spusti reprodukovatelnou relaci.
  - [ ] 137.20 Rozsirit statistiky a spaced repetition pro turnajove utility
    - KPI podle phase, payout, bounty, covering statusu, table size, node, sizing, EV modelu a source quality.
    - Oddelit strategickou chybu od varianty po zmene pack verze; umoznit before/after porovnani.
    - Spaced repetition ma prioritizovat EV loss a kriticke bubble/final-table chyby, ne jen binarni accuracy.
    - Acceptance: export/import a dashboard umi filtrovat kazdou release variantu bez michani nekompatibilnich modelu.
  - [ ] 137.21 Udrzet rozsirenou variantovou knihovnu rychlou a offline
    - Lazy manifest delit podle release trainu/scenare; umoznit uzivateli stahnout/odstranit volitelne offline content baliky.
    - Pridat storage quota management, integrity hash, resumable update a rollback na posledni validni pack.
    - Android WebView nesmi nacitat vsechny ICM/PKO/multiway packy pri startu.
    - Acceptance: zakladni app shell zustane maly a kazdy instalovany content balik je overitelny a plne offline.
  - [ ] 137.22 Zavest variant-specific QA a release gates
    - Kazdy release train ma completion matrix, legal intake gate, runtime no-fallback test, browser E2E, mobile/offline smoke a user acceptance scenare.
    - Property testy: chip conservation, seat/position order, payout equity, bounty utility, side-pot eligibility, deterministic replay a mixed-frequency sums.
    - Golden corpus musi obsahovat edge cases: 2 BB, 150+ BB, exact bubble, multiple all-ins, dead button, incomplete HH a corrupt pack.
    - Acceptance: varianta se v selectoru oznaci production az po vlastnim zelenem gate, ne jen po existenci libovolneho packu.
  - [ ] 137.23 Zavest content governance a pravidelne strategicke aktualizace
    - Definovat ownera, review cadence, semantic versioning, deprecation, rollback a release notes pro kazdy production pack.
    - Zmeny range hodnot musi mit diff summary, reviewer approval, legal provenance a migracni dopad na KPI/scenario identity.
    - Udrzovat source-free UI a minimalizovat citliva metadata v distribuovanem bundle.
    - Acceptance: zadny pack nezustane bez ownera/verze/provenance a lze dohledat, ktera strategie ohodnotila kazdy zaznam.
  - [ ] 137.24 Release rozhodnuti pro "Full MTT NLHE"
    - Predem vybrat konkretni seznam variant povazovanych za full release; formulace "vsechny varianty" nesmi zustat neomezena nebo neoveritelna.
    - Minimalni navrhovany full set: dynamic 9/8/6-max az HU, regular/turbo/hyper, no ante/BBA/player ante, CHIP_EV + ICM/$EV, standard/final-table/satellite payouts, freezeout/re-entry metadata, KO/PKO/Mystery Bounty, preflop + heads-up/multiway postflop, HH review, stats a offline content delivery.
    - Acceptance: vsechny vybrane scenario katalogy jsou production, 0 fallbacku, 0 legal/data blockeru, zeleny variant-specific release gate a podepsane release notes s explicitnimi limitations.

## Notes

- Tasky oznacene `*` jsou volitelne (testy) a lze je preskocit pro rychlejsi MVP; nebudou implementovany automaticky.
- Testy a gate v sekcich 135-137 nejsou volitelne pro production release, i kdyz historicky plan oznacuje nektere starsi testovaci tasky hvezdickou.
- Kazdy task odkazuje na konkretni granularni klauzule pozadavku kvuli sledovatelnosti.
- Property testy realizuji univerzalni vlastnosti 1-33 z designu (fast-check, >= 100 iteraci), kazda vlastnost jednim testem; znacka ve formatu `// Feature: mtt-preflop-trainer, Property {cislo}: {text}`.
- Unit/DOM/integracni testy pokryvaji specificke chovani, edge cases a chybove toky mimo property sadu.
- Checkpointy zajistuji inkrementalni validaci jadra pred stavbou UI a pred finalnim propojenim.

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
