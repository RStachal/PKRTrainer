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
