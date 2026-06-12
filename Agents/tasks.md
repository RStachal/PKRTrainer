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

- [ ] 86. MTT 9-max turbo production path
  - [x] 86.1 Rozhodnout turbo strategy policy
    - Bud importovat turbo-specific ranges, nebo explicitne zdokumentovat legalni reuse regular chipEV ranges pro stejny stack/ante node
  - [ ] 86.2 Pripravit 9-max turbo RangePack records
    - Turbo pack musi mit records, source evidence, assumptions and validation bez candidate gate
    - Generic MTT preflop import validator is ready; actual 9-max turbo records still require legal source/export input
  - [ ] 86.3 Zapojit 9-max turbo do production preflop gate
    - Po overeni ma MTT/FULL_RING_9/TURBO/PREFLOP/chipEV spoustet drill

- [ ] 87. MTT 6-max regular verified range import
  - [ ] 87.1 Ziskat legalni 6-max regular source/export vstup
    - Povolen je owned solver export, public chart with permission, or explicit written permission
  - [ ] 87.2 Normalizovat 6-max regular records
    - Generic MTT preflop import validator now checks 6-max regular source/export completeness
    - Každý record musi mit 169 hand classes ve strict i lenient mape
  - [ ] 87.3 Povysit 6-max regular z candidate na production
    - Po validaci se SIX_MAX/REGULAR/PREFLOP/chipEV smi spoustet v drill enginu

- [ ] 88. MTT 6-max turbo verified range import
  - [ ] 88.1 Ziskat legalni 6-max turbo source/export vstup
    - Turbo assumptions a stack mapping musi byt explicitni
  - [ ] 88.2 Normalizovat 6-max turbo records
    - Records musi pokryt required positions, buckets, contexts and 169 hand classes
    - Generic MTT preflop import validator now checks 6-max turbo source/export completeness
  - [ ] 88.3 Povysit 6-max turbo z candidate na production
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

- [ ] 92. Flop SRP production coverage
  - [x] 92.1 Pokryt hlavni SRP pozicni patterny
    - EP vs BB, BTN vs BB, SB vs BB, OOP raiser vs IP caller
  - [x] 92.2 Pokryt board texture taxonomy
    - A-high, broadway, low, paired, monotone, two-tone, connected, disconnected, dry, draw-heavy
  - [ ] 92.3 Napojit production SRP flop pack do treninku
    - UI ma pouzivat production data tam, kde existuji, jinak jasne preview/fallback
    - Resolver infrastructure hotova; skutecny production SRP pack ceka na legalni source/export vstup
    - Flop production coverage report now renders review text for missing pot types, position patterns, textures, action nodes and lanes

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
  - [x] 102.2 Pridat priklady minimalnich JSON importu pro MTT preflop a flop production
    - Fixtures musi byt synthetic/test-only, bez skutecnych third-party chart hodnot
    - Hotovo: synteticke MTT preflop, flop production and permission manifest examples
  - [x] 102.3 Popsat operator workflow od exportu po production promotion
    - Kroky: ulozit raw export, spustit validator, review report, commit normalized pack, release checkpoint
    - Hotovo: `Agents/range-intake/README.md` and intake manifest workflow

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

- [ ] 104. MTT 9-max turbo import execution
  - [ ] 104.1 Zpracovat legalni 9-max turbo ante ON export
    - Import musi projit `validate:range-import --kind=mtt-preflop`
  - [ ] 104.2 Zpracovat legalni 9-max turbo ante OFF export
    - Stack mapping a ante assumptions musi byt explicitni
  - [ ] 104.3 Vytvorit production RangePacky pro 9-max turbo
    - Packy musi mit MEDIUM/HIGH confidence, records > 0 and full hand-class maps

- [ ] 105. MTT 9-max turbo promotion QA
  - [ ] 105.1 Zapojit turbo packy do MTT preflop registry
    - Readiness report musi prejit z MISSING na PRODUCTION
  - [ ] 105.2 Otestovat turbo gate v UI a drill engine
    - MTT/FULL_RING_9/TURBO/PREFLOP/chipEV ma spustit drill jen po validaci
  - [ ] 105.3 Porovnat regular vs turbo coverage diff
    - Diff musi ukazat, zda jde o dedicated ranges nebo schvaleny reuse policy

- [ ] 106. MTT 6-max regular import execution
  - [ ] 106.1 Zpracovat legalni 6-max regular ante ON export
    - Pokryt UTG,HJ,CO,BTN,SB,BB, vsechny buckets a contexts
  - [ ] 106.2 Zpracovat legalni 6-max regular ante OFF export
    - Strict i lenient mapy musi mit 169 hand classes na record
  - [ ] 106.3 Vytvorit production 6-max regular RangePacky
    - Candidate LOW/empty packy nahradit nebo doplnit produkcnimi packy bez legacy fallbacku

- [ ] 107. MTT 6-max regular promotion QA
  - [ ] 107.1 Zapojit 6-max regular do production gate
    - SIX_MAX/REGULAR/PREFLOP/chipEV ma spustit spravny 6-max drill
  - [ ] 107.2 Otestovat seat model a pozicni filtr pro 6-max
    - UI nesmi ukazovat full-ring mrtve pozice v konkretni otazce 6-max profilu
  - [ ] 107.3 Otestovat statistiky podle tableFormat
    - 6-max vysledky se nesmi michat s 9-max profilem bez explicitniho breakdownu

- [ ] 108. MTT 6-max turbo import execution
  - [ ] 108.1 Zpracovat legalni 6-max turbo ante ON export
    - Turbo assumptions musi byt oddelene od regular metadata
  - [ ] 108.2 Zpracovat legalni 6-max turbo ante OFF export
    - Source stack to bucket mapping musi byt soucasti review reportu
  - [ ] 108.3 Vytvorit production 6-max turbo RangePacky
    - Readiness musi projit bez SPEED_METADATA_ONLY shortcutu

- [ ] 109. MTT 6-max turbo promotion QA
  - [ ] 109.1 Zapojit 6-max turbo do production gate
    - SIX_MAX/TURBO/PREFLOP/chipEV ma spustit drill az po production readiness
  - [ ] 109.2 Porovnat 6-max regular vs turbo action distributions
    - Audit ma upozornit na podezrele identicke ranges bez reuse policy
  - [ ] 109.3 Spustit release checkpoint pro vsechny MTT preflop profily
    - Full suite, build, verify:ranges and source-free UI policy

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

- [ ] 114. Flop SRP production import execution
  - [ ] 114.1 Zpracovat legalni SRP flop production StrategyPack
    - Pokryt EP vs BB, BTN vs BB, SB vs BB, OOP raiser vs IP caller
  - [ ] 114.2 Pokryt vsechny required board textures v SRP
    - A-high, broadway, low, paired, monotone, two-tone, connected, dry, draw-heavy
  - [ ] 114.3 Zapojit SRP production pack do resolver chain
    - Production data ma mit prioritu pred public heuristic fallbackem

- [ ] 115. Flop SRP production UI QA
  - [ ] 115.1 Otestovat UI labely pro production vs fallback
    - Hrac vidi model confidence source-free, ne provider/source detail
  - [ ] 115.2 Otestovat Flopzilla matrix lanes z production dat
    - Value/bluff/check lanes maji odpovidat production rangeBuckets
  - [ ] 115.3 Otestovat mobile layout pro SRP table + matrix
    - Matrix scroll, seat labels and board cards nesmi pretekat

- [ ] 116. Flop 3bet pot production import execution
  - [ ] 116.1 Zpracovat legalni 3bet pot flop StrategyPack
    - OOP caller vs IP 3bettor a IP/OOP c-bet situace musi byt pokryte
  - [ ] 116.2 Rozlisit SPR windows pro 3bet poty
    - Low/mid SPR pravidla nesmi pouzivat SRP sizing heuristiku bez mappingu
  - [ ] 116.3 Zapojit 3bet production pack do resolver chain
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

- [ ] 129. MTT completion matrix
  - [x] 129.1 Definovat canonical MTT profile matrix
    - Pokryt `FULL_RING_9`/`SIX_MAX` x `REGULAR`/`TURBO` x `CHIP_EV`/`DOLAR_EV` x `PREFLOP`/`FLOP`/`TURN`/`RIVER` x ante ON/OFF tam, kde dava smysl
    - Hotovo: `buildMttCompletionReadinessReport` generuje canonical 64radkovou MTT matici pro format, speed, EV model, street a ante
  - [x] 129.2 Rozsirit MTT readiness report o DOLAR_EV a street coverage
    - Missing/candidate/production stav musi byt explicitni, ne implicitni null
    - Hotovo: completion readiness explicitne oznacuje DOLAR_EV preflop jako missing dedicated pack a postflop streety jako candidate preview bez production scoringu
  - [x] 129.3 Pridat release gate pro kompletni MTT matici
    - Build nesmi tise pustit profil bez production dat mimo povoleny preview/fallback rezim
    - Hotovo: `buildMttCompletionReleaseGateReport` a `npm run mtt:completion` overuji, ze production rows jsou productionReady a vsechny non-production rows maji explicitni blocker

- [ ] 130. MTT preflop production completion
  - [x] 130.1 Sloucit 9-max a 6-max import validatory do jednoho MTT preflop validatoru
    - Jeden validator ma podporovat oba tableFormaty, regular/turbo, CHIP_EV/DOLAR_EV a ante ON/OFF
    - Hotovo: `mttPreflopRangePackImport` je jednotny validator pro `FULL_RING_9` i `SIX_MAX`; legacy `mttSixMaxRangePackImport` zustava jen kompatibilni wrapper nad stejnym kontraktem
  - [x] 130.2 Pripravit legal import slots pro chybejici MTT preflop profily
    - 9-max turbo, 6-max regular, 6-max turbo, CHIP_EV i DOLAR_EV musi mit samostatne pack id a permission manifest
    - Hotovo: `buildMttPreflopImportSlots` generuje 14 neprodukcnych MTT preflop slotu s pack id, raw folderem, `normalized.json`, `permission.json` a povolenymi licenseKind hodnotami; intake docs popisuji slot naming a workflow
  - [x] 130.3 Zapojit vsechny promoted preflop packy do production gate
    - Drill engine smi spustit production scoring jen pro profily s dedicated hand recommendations
    - Hotovo: `buildRangeModule` pro `mtt-preflop` vyzaduje production-ready import, validni permission manifest a shodu `packId` s legal import slotem; mimo-slot pack nedostane `writeReady`

- [ ] 131. MTT postflop production completion
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
  - [x] 131.23 Pridat JSON vystup pro MTT completion CLI
    - Hotovo: `npm run mtt:completion -- --json` vraci release gate, pouzite filtry a filtrovanou readiness matici pro operator tooling
  - [x] 131.24 Sjednotit parser MTT CLI filtru
    - Hotovo: `mttCliFilterParsing` sdili `--format`, `--speed`, `--ev`, `--street`, `--ante` a `--status` parser mezi `mtt:completion` a `mtt:slots`
  - [x] 131.25 Otestovat konzistenci JSON completion a slot tooling vystupu
    - Hotovo: regresni CLI test porovnava `importSlot.packId` z `npm run mtt:completion -- --json` s `packId` ze stejne filtrovaneho `npm run mtt:slots -- --json`, aby operator tooling nedostal rozdilne import sloty
  - [x] 131.26 Pridat JSON vystup do range import validatoru
    - Hotovo: `npm run validate:range-import -- --json` vraci strukturovany `valid`, `productionReady`, `legalImportSlot`, `permissionReady`, slot report a permission report pro batch import tooling; textovy vystup zustava default

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

- [ ] 128. Mobile and Android WebView release QA
  - [ ] 128.1 Spustit screenshot QA pro 360x800, 390x844, 412x915
    - Table, filters, postflop matrix and dashboard nesmi pretekat
    - Poznamka: Browser `iab` backend nebyl v teto relaci dostupny; doplnen automatizovany viewport smoke pro 360x800, 390x844 and 412x915
    - Retry 2026-06-05: node_repl tool je dostupny, ale Browser stale hlasi `Browser is not available: iab`; real screenshot QA zustava otevrena
    - Retry 2026-06-11: Browser tool discovery neposkytlo ovladac pro screenshoty a `playwright` neni dostupny jako Node modul; real screenshot QA zustava otevrena, automatizovane mobile smoke testy pro 360x800, 390x844 and 412x915 prosly v `npm test`
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

## Notes

- Tasky oznacene `*` jsou volitelne (testy) a lze je preskocit pro rychlejsi MVP; nebudou implementovany automaticky.
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
