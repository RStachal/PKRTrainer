# Requirements Document

## Introduction

Tento dokument popisuje požadavky první iterace nové aplikace **MTT Preflop Trainer**. Cílem je trénovat správné preflop rozhodování v turnajovém pokeru (MTT) na plně obsazeném stole **9-handed (full ring)** napříč efektivními hloubkami zásobníku od **5 BB do 150 BB**. Aplikace pokrývá kompletní preflop akční strom (open/RFI, limp, iso-raise, call, 3bet, 4bet, jam/shove, fold, blind-vs-blind, squeeze, push/fold krátkých stacků) a zobrazuje situace v grafice připomínající klienta pokerové herny (9 pozic u stolu, pot, board, karty, akční odznaky).

Aplikace je první kámen širší vize (preflop i postflop pro MTT, SNG a cash). Tato iterace je záměrně omezena pouze na **MTT preflop**.

Architektura: nová aplikace postavená na **Vanilla TypeScript + Vite**. Stávající legacy aplikace (`Legacy/PKRTrainer.html`, 6-max, 15–25 BB) slouží jako **referenční baseline** pro ověřenou logiku (deterministický RNG, formát otázek, scoring LENIENT/STRICT, perzistence, statistiky, range matrix, HH parser), nikoli jako kód k přímému znovupoužití beze změn.

### Klíčová rozhodnutí (potvrzená s uživatelem)

- **Architektura:** nový build na Vanilla TypeScript + Vite; legacy = referenční baseline.
- **Formát:** 9-handed full ring.
- **Hloubky:** efektivní stacky 5–150 BB, diskretizované do košů: 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150 BB.
- **Push/fold režim:** aktivní pro krátké stacky (≤ 12 BB).
- **Ante:** big blind ante zapnuté jako výchozí (s možností přepínače ON/OFF).
- **ICM:** mimo rozsah této iterace; ranges jsou cEV (chip-EV).
- **Zdroj ranges:** referenční MTT charty udržované jako data v projektu, oddělené od logiky.
- **Pozice (9):** UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN, SB, BB.
- **Jazyk UI:** čeština.
- **Offline:** aplikace musí fungovat offline a být kompatibilní s Android WebView.

## Glossary

- **MTT_Preflop_Trainer (Aplikace):** Celá aplikace popisovaná tímto dokumentem.
- **Drill_Engine:** Komponenta generující a vyhodnocující tréninkové otázky (spoty).
- **Range_Store:** Datové úložiště referenčních preflop ranges (pozice × hloubkový koš × akční kontext → doporučené akce/sizing).
- **Scoring_Engine:** Komponenta vyhodnocující odpověď uživatele proti referenčním ranges v režimu LENIENT nebo STRICT.
- **Table_Renderer:** Komponenta vykreslující grafiku stolu připomínající klienta pokerové herny (9 sedadel, pot, board, karty, akční odznaky).
- **Stats_Store:** Komponenta perzistující výsledky tréninku a poskytující statistiky.
- **Range_Matrix_View:** Vizualizace 13×13 mřížky startovních rukou pro daný spot/range.
- **HH_Parser:** Komponenta parsující hand history (historii rozdání).
- **RNG:** Deterministický generátor pseudonáhodných čísel inicializovaný seedem (vychází z `mulberry32` v baseline).
- **Seed:** Celé číslo inicializující RNG; stejný Seed produkuje stejnou sekvenci spotů.
- **Spot:** Jedna tréninková situace = pozice hrdiny, efektivní hloubka, předchozí akce u stolu, karty hrdiny a sada možných akcí.
- **Question_ID:** Stabilní identifikátor spotu odvozený z jeho parametrů (např. kategorie, pozice, hloubka, ruka).
- **Pool:** Množina unikátních spotů vygenerovaná pro danou kategorii a Seed.
- **Hloubkový_koš (Stack_Bucket):** Jedna z diskrétních hodnot efektivního stacku: 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150 BB.
- **Efektivní_stack:** Menší z dvou zásobníků zúčastněných hráčů, vyjádřený v big blindech (BB).
- **Pozice:** Jedna z 9 pozic full ring stolu: UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN, SB, BB.
- **RFI/Open:** První dobrovolné navýšení (raise first in), když před hrdinou nikdo nevstoupil do potu raisem.
- **Limp:** Dorovnání big blindu jako první akce (open-limp); **Over-limp:** dorovnání po předchozím limpu.
- **Iso-raise:** Navýšení proti jednomu či více limperům za účelem izolace.
- **3bet:** Re-raise proti open-raisu.
- **4bet:** Re-raise proti 3betu.
- **Jam/Shove (All-in):** Vsazení celého efektivního zásobníku.
- **Squeeze:** 3bet proti open-raisu, když je v potu i jeden či více callerů.
- **Blind-vs-blind (BvB):** Situace mezi SB a BB poté, co všichni před nimi složili.
- **Push/Fold:** Strategie krátkých stacků, kde jediné dvě akce jsou all-in nebo fold.
- **Call-jam:** Dorovnání all-inu protihráče (call proti shove).
- **LENIENT:** Režim hodnocení uznávající více přijatelných odpovědí (např. 2x i 2.5x sizing).
- **STRICT:** Režim hodnocení vyžadující přesnou doporučenou akci včetně sizingu.
- **Ante (Big_blind_ante):** Povinná sázka hrazená jedním hráčem za celý stůl, navyšující velikost potu a tím šířku ranges.
- **Akční_klíč (Action_Key):** Strojový identifikátor odpovědi (např. `OPEN_2X`, `OPEN_25X`, `3BET`, `4BET`, `JAM`, `CALL`, `FOLD`, `LIMP`, `ISO`, `OVERLIMP`).

## Requirements

### Requirement 1: Full ring 9-handed stůl a pozice

**User Story:** Jako trénující hráč chci, aby aplikace modelovala plně obsazený 9-handed stůl se správnými pozicemi, abych trénoval rozhodování odpovídající full ring MTT.

#### Acceptance Criteria

1. THE MTT_Preflop_Trainer SHALL modelovat stůl s právě 9 sedadly, kde každé sedadlo odpovídá právě jedné z 9 unikátních pozic pojmenovaných UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN, SB, BB, přičemž žádná z těchto pozic se u stolu neopakuje.
2. THE MTT_Preflop_Trainer SHALL uspořádat pozice ve fixním preflop pořadí akce přesně takto: UTG → UTG+1 → UTG+2 → LJ → HJ → CO → BTN → SB → BB, kde UTG jedná jako první a BB jako poslední.
3. WHEN je generován Spot, THE Drill_Engine SHALL přiřadit hrdinovi právě jednu z 9 definovaných pozic.
4. WHEN je generován Spot, THE Drill_Engine SHALL obsadit všech 9 pozic stolu (full ring) tak, aby žádná z 9 pozic nezůstala neobsazená.
5. THE MTT_Preflop_Trainer SHALL definovat každou ze 9 pozic v Glossary před jejím použitím v requirements a v UI.

### Requirement 2: Diskrétní hloubky efektivního zásobníku 5–150 BB

**User Story:** Jako trénující hráč chci trénovat napříč celým rozsahem efektivních hloubek od 5 do 150 BB, abych zvládal krátké, střední i hluboké zásobníky.

#### Acceptance Criteria

1. WHEN je generován Spot, THE Drill_Engine SHALL přiřadit mu Efektivní_stack výhradně z definované sady 13 Hloubkových_košů (5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150 BB) a SHALL nikdy nepřiřadit hodnotu mimo tuto sadu.
2. THE MTT_Preflop_Trainer SHALL vyjadřovat všechny hloubky zásobníku v celých jednotkách big blind (BB).
3. WHERE je Efektivní_stack menší nebo roven 12 BB, THE Drill_Engine SHALL generovat Spot v režimu Push/Fold.
4. WHERE je Efektivní_stack větší než 12 BB, THE Drill_Engine SHALL generovat Spot, jehož nabídka akcí zahrnuje všechny raise-sizing akce definované v Range_Store pro danou Pozici, Hloubkový_koš a akční kontext.
5. WHEN uživatel zvolí jeden či více Hloubkových_košů jako filtr, THE Drill_Engine SHALL generovat Spoty výhradně ve zvolených Hloubkových_koších a v žádném jiném.
6. WHILE uživatel nemá zvolený žádný Hloubkový_koš jako filtr, THE Drill_Engine SHALL vybírat Efektivní_stack ze všech 13 definovaných Hloubkových_košů.

### Requirement 3: Kompletní preflop akční strom

**User Story:** Jako trénující hráč chci trénovat všechny preflop akce, které mohou ve full ring MTT nastat, abych měl pokryté celé spektrum rozhodnutí.

#### Acceptance Criteria

1. WHILE Spot není v režimu Push/Fold a před hrdinou nikdo dobrovolně nevstoupil do potu (neproběhl žádný Limp, žádné navýšení ani all-in) a hrdina není na pozici BB, THE Drill_Engine SHALL nabídnout hrdinovi akci RFI/Open.
2. WHILE Spot není v režimu Push/Fold a před hrdinou neproběhlo žádné navýšení ani all-in a před hrdinou neproběhl žádný Limp a hrdina není na pozici BB, THE Drill_Engine SHALL nabídnout hrdinovi akci Limp jako open-limp.
3. WHERE je hrdina na pozici BB, WHILE Spot není v režimu Push/Fold, WHEN před hrdinou proběhl jeden až osm Limpů a žádné navýšení, THE Drill_Engine SHALL nabídnout hrdinovi akce Limp (check) a Iso-raise.
4. WHILE Spot není v režimu Push/Fold a před hrdinou neproběhlo žádné navýšení ani all-in, WHEN před hrdinou proběhl jeden až osm Limpů, THE Drill_Engine SHALL nabídnout hrdinovi akci Iso-raise.
5. WHILE Spot není v režimu Push/Fold a před hrdinou neproběhl all-in, WHEN před hrdinou proběhl Open, THE Drill_Engine SHALL nabídnout akce Fold, Call a 3bet.
6. WHILE Spot není v režimu Push/Fold a před hrdinou neproběhl all-in, WHEN před hrdinou proběhl Open a jeden až sedm Callů, THE Drill_Engine SHALL nabídnout akci Squeeze jako jednu z nabízených možností.
7. WHILE Spot není v režimu Push/Fold a před hrdinou neproběhl all-in, WHEN před hrdinou proběhl 3bet, THE Drill_Engine SHALL nabídnout akce Fold, Call a 4bet.
8. WHILE Spot není v režimu Push/Fold a před hrdinou neproběhl all-in, WHEN před hrdinou proběhl 4bet, THE Drill_Engine SHALL nabídnout akce Fold, Call a Jam.
9. WHILE je Spot v režimu Push/Fold a před hrdinou neproběhl all-in, THE Drill_Engine SHALL nabízet výhradně akce Jam a Fold a žádné jiné akce.
10. WHEN před hrdinou proběhl all-in, THE Drill_Engine SHALL nabídnout výhradně akce Call-jam (dorovnání all-inu) a Fold a žádné jiné akce, nezávisle na tom, zda je Spot v režimu Push/Fold.
11. WHEN nastane situace Blind-vs-blind, THE Drill_Engine SHALL generovat Spoty mezi SB a BB a nabídnout hrdinovi akce odpovídající akčnímu kontextu z ostatních kritérií tohoto požadavku (3.1–3.10 a 3.13), přičemž platí stejné stavové stráže pro režim Push/Fold a pro all-in.
12. THE Drill_Engine SHALL reprezentovat každou nabízenou akci právě jedním Akčním_klíčem.
13. WHILE Spot není v režimu Push/Fold a před hrdinou neproběhlo žádné navýšení ani all-in a hrdina není na pozici BB, WHEN před hrdinou proběhl jeden až osm Limpů, THE Drill_Engine SHALL nabídnout hrdinovi akci Over-limp.

### Requirement 4: Referenční ranges jako oddělená data

**User Story:** Jako tvůrce obsahu chci mít referenční preflop ranges uložené jako data oddělená od logiky, abych je mohl upravovat bez zásahu do kódu trenažéru.

#### Acceptance Criteria

1. THE Range_Store SHALL uchovávat referenční preflop ranges jako data oddělená od logiky Drill_Engine a Scoring_Engine.
2. THE Range_Store SHALL indexovat ranges podle kombinace Pozice, Hloubkového_košu a akčního kontextu.
3. WHEN Scoring_Engine vyhodnocuje odpověď, THE Scoring_Engine SHALL vycházet výhradně z dat poskytnutých Range_Store pro Spot odpovídající jeho kombinaci Pozice, Hloubkového_košu a akčního kontextu.
4. THE Range_Store SHALL poskytovat pro každý generovaný Spot sadu jednoho či více doporučených Akčních_klíčů.
5. WHERE je doporučená akce pro daný Spot raise (RFI/Open, Iso-raise, 3bet, 4bet nebo Squeeze), THE Range_Store SHALL poskytnout doporučený sizing vyjádřený Akčním_klíčem s konkrétní velikostí navýšení (např. OPEN_2X pro navýšení 2× BB).
6. IF Range_Store nelze načíst ani zpřístupnit jako celek, THEN THE Drill_Engine SHALL negenerovat žádné Spoty, ponechat tréninkovou relaci nespuštěnou a zobrazit uživateli v češtině chybové upozornění informující o nedostupnosti referenčních ranges, a to bez pádu aplikace.
7. WHERE pro konkrétní kombinaci Pozice, Hloubkového_košu a akčního kontextu obsahuje Range_Store alespoň jeden doporučený Akční_klíč, avšak nikoli kompletní sizing pro všechny doporučené raise akce, THE Drill_Engine SHALL takový Spot povolit a generovat jej na základě dostupných Akčních_klíčů.
8. IF pro konkrétní kombinaci Pozice, Hloubkového_košu a akčního kontextu neobsahuje Range_Store žádný doporučený Akční_klíč, THEN THE Drill_Engine SHALL pro tuto kombinaci negenerovat Spot.
9. THE Range_Store SHALL reflektovat cEV (chip-EV) strategii bez aplikace ICM.

### Requirement 5: Big blind ante

**User Story:** Jako trénující hráč chci trénovat s big blind ante, protože ante je standard v moderních MTT a mění správné ranges.

#### Acceptance Criteria

1. THE MTT_Preflop_Trainer SHALL ve výchozím stavu generovat Spoty s aktivním Big_blind_ante o velikosti 1 BB hrazeném hráčem na pozici BB.
2. WHERE je Big_blind_ante aktivní, THE Range_Store SHALL pro daný Spot poskytovat data z varianty ranges určené pro hru s ante (ante-on).
3. WHEN uživatel přepne nastavení ante na vypnuto, THE MTT_Preflop_Trainer SHALL generovat Spoty bez Big_blind_ante se startovním potem tvořeným pouze blindy (SB 0,5 BB a BB 1 BB) a THE Range_Store SHALL poskytovat data z varianty ranges pro hru bez ante (ante-off).
4. WHEN se mění stav nastavení ante, THE Table_Renderer SHALL zobrazit aktuální velikost potu v BB tak, že při zapnutém ante zahrnuje 1 BB ante a při vypnutém ante jej nezahrnuje.

### Requirement 6: Deterministické generování spotů (Seed a Pool)

**User Story:** Jako trénující hráč chci, aby série spotů byla deterministická podle seedu, abych mohl opakovat stejnou sadu situací a sledovat zlepšení.

#### Acceptance Criteria

1. WHEN je zahájena tréninková relace s daným Seedem, THE Drill_Engine SHALL inicializovat RNG tímto Seedem, přičemž Seed je celé číslo v rozsahu 0 až 4 294 967 295 (32-bit unsigned, v souladu s mulberry32 baseline).
2. WHEN je RNG inicializován stejným Seedem a stejnými filtry, THE Drill_Engine SHALL vygenerovat identickou sekvenci Spotů, tj. stejný počet Spotů ve stejném pořadí, kde každý Spot má shodné Question_ID i shodné parametry (Pozice, Efektivní_stack, předchozí akce u stolu a karty hrdiny).
3. WHEN je generován Pool pro danou kombinaci kategorie (zvoleného akčního kontextu) a Seedu, THE Drill_Engine SHALL odstranit Spoty se shodným Question_ID tak, aby Pool obsahoval pouze unikátní Spoty v deterministicky daném pořadí.
4. THE Drill_Engine SHALL přiřadit každému Spotu Question_ID deterministicky odvozené z jeho parametrů (kategorie, Pozice, Efektivní_stack a ruka hrdiny) tak, že totožné parametry vždy vedou na shodné Question_ID napříč relacemi i opakovaným spuštěním aplikace.
5. WHILE probíhá tréninková relace a Pool obsahuje dosud nezobrazené Spoty, THE Drill_Engine SHALL v rámci jednoho průchodu Poolem zobrazit každé Question_ID nejvýše jednou.
6. WHEN jsou během tréninkové relace vyčerpány všechny unikátní Spoty v Poolu, THE Drill_Engine SHALL zahájit nový průchod Poolem od jeho prvního Spotu ve stejném deterministickém pořadí jako první průchod, přičemž Question_ID se napříč průchody mohou opakovat.
7. IF je tréninková relace zahájena bez explicitně zadaného platného Seedu, THEN THE Drill_Engine SHALL vygenerovat a použít Seed v platném rozsahu 0 až 4 294 967 295 a zpřístupnit jej uživateli tak, aby bylo možné stejnou sekvenci Spotů později zopakovat.

### Requirement 7: Vyhodnocení odpovědí (LENIENT / STRICT)

**User Story:** Jako trénující hráč chci volit mezi mírnějším a přísnějším hodnocením, abych nejdřív trénoval správné akce a teprve poté přesný sizing.

#### Acceptance Criteria

1. THE Scoring_Engine SHALL podporovat režimy hodnocení LENIENT a STRICT.
2. WHEN uživatel odpoví ve STRICT režimu, THE Scoring_Engine SHALL označit odpověď za správnou právě tehdy, je-li zvolený Akční_klíč prvkem sady přesných Akčních_klíčů (včetně sizingu) definované pro daný Spot v Range_Store, a v opačném případě ji označit za nesprávnou.
3. WHEN uživatel odpoví v LENIENT režimu, THE Scoring_Engine SHALL označit odpověď za správnou právě tehdy, je-li zvolený Akční_klíč prvkem sady přijatelných Akčních_klíčů definované pro daný Spot, a v opačném případě ji označit za nesprávnou.
4. WHEN je odpověď vyhodnocena, THE Scoring_Engine SHALL zobrazit indikaci správnosti a zdůvodnění (vysvětlení) k danému Spotu včetně doporučených Akčních_klíčů z Range_Store.
5. IF zobrazení zdůvodnění selže, THEN THE Scoring_Engine SHALL i přesto dokončit vyhodnocení, uložit výsledek odpovědi, indikovat nedostupnost zdůvodnění a neprovést pád aplikace.
6. THE Scoring_Engine SHALL uchovávat pro každý Spot sadu přijatelných Akčních_klíčů (pro LENIENT) a sadu přesných Akčních_klíčů (pro STRICT), přičemž každá z těchto sad obsahuje alespoň jeden Akční_klíč.
7. IF zvolený Akční_klíč není prvkem příslušné sady správných Akčních_klíčů pro aktuální režim hodnocení, THEN THE Scoring_Engine SHALL označit odpověď za nesprávnou a zobrazit doporučené Akční_klíče z Range_Store.

### Requirement 8: Grafika stolu jako klient pokerové herny

**User Story:** Jako trénující hráč chci vidět situaci ve vizuálně přehledné podobě připomínající pokerový klient, abych rychle rozpoznal pozice, akce a karty.

#### Acceptance Criteria

1. THE Table_Renderer SHALL vykreslit ovál stolu s právě 9 sedadly, kde každé sedadlo je označeno názvem právě jedné z 9 definovaných Pozic v bijektivním přiřazení.
2. THE Table_Renderer SHALL po celou dobu zobrazení Spotu vizuálně odlišit právě jedno sedadlo hrdiny od ostatních 8 sedadel.
3. THE Table_Renderer SHALL zobrazit hrdinovy právě dvě hole karty, každou s jednou ze 13 hodnot a jednou ze 4 barev, vzájemně rozlišitelné.
4. WHEN hráč u stolu provede akci, THE Table_Renderer SHALL zobrazit u jeho sedadla právě jeden akční odznak odpovídající Akčnímu_klíči jeho poslední akce.
5. THE Table_Renderer SHALL zobrazit aktuální velikost potu v BB zaokrouhlenou na nejvýše jedno desetinné místo, odpovídající aktuálnímu nastavení Big_blind_ante.
6. THE Table_Renderer SHALL zobrazit u každého aktivního sedadla (hráč dosud nesložil karty) jeho Efektivní_stack v BB zaokrouhlený na nejvýše jedno desetinné místo.
7. THE Table_Renderer SHALL vyznačit rozlišitelnými značkami pozici buttonu (BTN) a blindů (SB, BB).
8. WHERE hráč na daném sedadle složil karty nebo není v rozdání, THE Table_Renderer SHALL toto sedadlo vizuálně označit jako neaktivní/složené odlišně od aktivních sedadel.

### Requirement 9: Perzistence a statistiky

**User Story:** Jako trénující hráč chci, aby si aplikace pamatovala mé výsledky a ukazovala statistiky, abych viděl svůj pokrok i slabá místa.

#### Acceptance Criteria

1. WHEN uživatel odpoví na Spot, THE Stats_Store SHALL trvale uložit jeden záznam výsledku obsahující Question_ID, zvolený Akční_klíč, příznak správnosti odpovědi a kategorii akce, Pozici a Hloubkový_koš daného Spotu, a to nejpozději před zobrazením následujícího Spotu.
2. THE Stats_Store SHALL uchovávat data lokálně tak, aby přetrvala mezi spuštěními aplikace.
3. THE MTT_Preflop_Trainer SHALL zobrazit souhrnné statistiky obsahující celkový počet zodpovězených Spotů a úspěšnost, kde úspěšnost je podíl počtu správně zodpovězených Spotů k celkovému počtu zodpovězených Spotů vyjádřený v procentech zaokrouhlených na jedno desetinné místo.
4. THE MTT_Preflop_Trainer SHALL zobrazit úspěšnost rozčleněnou samostatně podle kategorie akce, podle Pozice a podle Hloubkového_košu.
5. WHILE běží tréninková relace, THE MTT_Preflop_Trainer SHALL zobrazovat aktuální sérii správných odpovědí (streak) a počet zodpovězených Spotů v dané relaci, přičemž streak se po každé správné odpovědi zvýší o 1 a po každé nesprávné odpovědi se vynuluje na 0.
6. IF trvalé uložení záznamu výsledku selže, THEN THE Stats_Store SHALL ponechat dříve uložená data nezměněná, dokončit vyhodnocení odpovědi a zobrazit chybové upozornění indikující, že výsledek nebyl uložen.
7. WHERE pro danou kategorii akce, Pozici nebo Hloubkový_koš dosud neexistuje žádný zodpovězený Spot, THE MTT_Preflop_Trainer SHALL pro tuto skupinu zobrazit počet zodpovězených Spotů rovný nule a indikaci nedostupné úspěšnosti namísto procentní hodnoty.

### Requirement 10: Vizualizace range matrix 13×13

**User Story:** Jako trénující hráč chci po odpovědi vidět celou doporučenou range v mřížce 13×13, abych pochopil své rozhodnutí v kontextu celé strategie.

#### Acceptance Criteria

1. THE Range_Matrix_View SHALL zobrazit mřížku o 13 řádcích a 13 sloupcích reprezentující všech 169 tříd startovních rukou.
2. WHEN uživatel otevře Range_Matrix_View pro daný Spot, THE Range_Matrix_View SHALL přiřadit každému z 169 polí vizuální kategorii podle doporučeného Akčního_klíče z Range_Store tak, že jednotlivé akce jsou navzájem vizuálně odlišitelné a ruce bez doporučené akce (fold) jsou vyznačeny odlišně od všech akčních kategorií.
3. WHILE je Range_Matrix_View otevřena pro daný Spot, THE Range_Matrix_View SHALL vyznačit pole konkrétní ruky aktuálního Spotu způsobem vizuálně odlišitelným od barvení akcí podle kritéria 2.
4. THE Range_Matrix_View SHALL rozlišit suited, offsuit a páry ve standardním rozložení mřížky (páry na diagonále, suited nad diagonálou, offsuit pod diagonálou).
5. THE Range_Matrix_View SHALL zobrazit legendu mapující každou vizuální kategorii na odpovídající Akční_klíč včetně kategorie fold.
6. IF pro daný Spot nejsou v Range_Store dostupná data ranges, THEN THE Range_Matrix_View SHALL zobrazit indikaci nedostupnosti dat a neprovést pád aplikace.

### Requirement 11: Parser hand history

**User Story:** Jako trénující hráč chci načíst historii rozdání, abych mohl analyzovat reálné preflop situace v trenažéru.

#### Acceptance Criteria

1. WHEN uživatel vloží neprázdný text hand history v podporovaném formátu o délce nejvýše 100 000 znaků, THE HH_Parser SHALL z něj vytěžit pole hrdiny (pozice, akce, hloubky v BB a karty) a dokončit zpracování do 2 sekund.
2. IF je vstupní text hand history prázdný, tvořený pouze bílými znaky, neplatný nebo v nepodporovaném formátu, THEN THE HH_Parser SHALL zobrazit chybovou zprávu označující, že vstup je neplatný nebo nepodporovaný a která z polí (pozice, akce, hloubky, karty) se nepodařilo přečíst, vytěžit z dostupných dat tolik z těchto polí, kolik je čitelných, a neprovést pád aplikace.
3. IF se extrakce dat z neplatného nebo neúplného vstupu podaří jen částečně, THEN THE HH_Parser SHALL dokončit zpracování bez pádu aplikace, vrátit částečný výsledek a označit pole, která se nepodařilo vytěžit.
4. WHEN je hand history úspěšně naparsována a vytěžená data odpovídají modelu 9-handed stolu (9 definovaných Pozic) a Efektivní_stack spadá do Hloubkových_košů 5–150 BB, THE HH_Parser SHALL sestavit z dat odpovídající Spot zobrazitelný v Table_Renderer.
5. IF se hand history naparsuje, ale vytěžená data neodpovídají modelu 9-handed stolu nebo Efektivní_stack leží mimo rozsah Hloubkových_košů 5–150 BB, THEN THE HH_Parser SHALL nesestavit Spot, zobrazit chybovou zprávu označující nekompatibilitu dat s modelem trenažéru, a neprovést pád aplikace.
6. IF vstupní text hand history překročí 100 000 znaků, THEN THE HH_Parser SHALL zpracování odmítnout, zobrazit chybovou zprávu označující překročení maximální délky vstupu, a neprovést pád aplikace.

### Requirement 12: Offline provoz a kompatibilita s Android WebView

**User Story:** Jako trénující hráč chci aplikaci používat bez připojení k internetu na mobilu i desktopu, abych mohl trénovat kdekoliv.

#### Acceptance Criteria

1. WHERE první načtení aplikace proběhlo úspěšně s nakešováním všech potřebných zdrojů (kód, styly, data Range_Store a charty), THE MTT_Preflop_Trainer SHALL provozovat základní tréninkové funkce (generování Spotů, vyhodnocení, statistiky, range matrix) bez jakéhokoliv síťového požadavku na externí server.
2. WHILE běží v prostředí Android WebView, THE MTT_Preflop_Trainer SHALL zpřístupnit všechny funkce dle kritéria 1 bez pádu a bez vyžadování aktivního připojení k internetu.
3. THE MTT_Preflop_Trainer SHALL prezentovat veškerý text uživatelského rozhraní v češtině, včetně popisků akcí, chybových upozornění a zdůvodnění odpovědí.
4. IF nakešování potřebných zdrojů při prvním načtení selže, THEN THE MTT_Preflop_Trainer SHALL zobrazit chybové upozornění informující, že aplikaci nelze používat offline, a neprovést pád aplikace.
5. WHEN je aplikace po úspěšném prvním načtení znovu spuštěna bez připojení k internetu, THE MTT_Preflop_Trainer SHALL načíst se z nakešovaných zdrojů a zpřístupnit základní tréninkové funkce dle kritéria 1.

### Requirement 13: Filtrování a konfigurace tréninku

**User Story:** Jako trénující hráč chci si vyfiltrovat, jaké typy spotů trénuji, abych se mohl soustředit na konkrétní pozice, hloubky nebo akce.

#### Acceptance Criteria

1. THE MTT_Preflop_Trainer SHALL umožnit uživateli filtrovat Spoty výběrem 1 až 9 Pozic z definované sady (UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN, SB, BB).
2. THE MTT_Preflop_Trainer SHALL umožnit uživateli filtrovat Spoty výběrem 1 až 13 Hloubkových_košů z definované sady (5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150 BB).
3. THE MTT_Preflop_Trainer SHALL umožnit uživateli filtrovat Spoty podle typu akčního kontextu z uzavřené sady: RFI/Open, vs-limp (Iso-raise), vs-open, vs-3bet, vs-4bet, Squeeze, Blind-vs-blind, Push/Fold a vs-all-in (Call-jam).
4. WHILE uživatel dosud nepotvrdil start tréninku explicitní akcí, THE Drill_Engine SHALL negenerovat žádné Spoty bez ohledu na způsob spuštění relace (start, obnovení, přímá navigace).
5. WHEN uživatel změní filtry a následně potvrdí start tréninku explicitní akcí, THE Drill_Engine SHALL generovat následující Spoty výhradně v rámci zvolených filtrů.
6. IF zvolená kombinace filtrů neodpovídá žádnému Spotu v Range_Store, THEN THE MTT_Preflop_Trainer SHALL negenerovat žádný Spot, zachovat zvolený výběr filtrů a zobrazit upozornění indikující prázdný výsledek s výzvou k úpravě filtrů.
7. WHERE uživatel nezvolil v některé filtrovací dimenzi (Pozice, Hloubkový_koš nebo akční kontext) žádnou hodnotu, THE MTT_Preflop_Trainer SHALL tuto dimenzi považovat za neomezenou (zahrnuje všechny její hodnoty).
8. WHEN jsou zvoleny filtry ve více dimenzích současně, THE Drill_Engine SHALL generovat pouze Spoty splňující logický průnik všech zvolených dimenzí (Pozice AND Hloubkový_koš AND akční kontext).

### Requirement 14: Migrace a kompatibilita lokálního úložiště

**User Story:** Jako stávající uživatel legacy aplikace chci, aby nová aplikace bezpečně zacházela s mými lokálně uloženými daty, abych nepřišel o progress a statistiky.

#### Acceptance Criteria

1. THE Stats_Store SHALL pro veškerá nová lokálně uložená data používat klíče obsahující explicitní identifikátor verze, přičemž žádný z těchto nových klíčů se nesmí shodovat s legacy klíči `fuf_drill_v5_JungleStyle1`, `fuf_drill_v5_JungleStyle1_events_v1` ani `fuf_hh_jungle_v1`.
2. WHEN se MTT_Preflop_Trainer spouští a pod alespoň jedním legacy klíčem (`fuf_drill_v5_JungleStyle1`, `fuf_drill_v5_JungleStyle1_events_v1`, `fuf_hh_jungle_v1`) existují data, zatímco pod novými verzovanými klíči data dosud neexistují, THE Stats_Store SHALL migrovat data, jejichž struktura odpovídá novému formátu, do nových verzovaných klíčů a zaznamenat příznak dokončené migrace, aby se migrace při dalších spuštěních neopakovala.
3. IF migrace dat selže, THEN THE Stats_Store SHALL ponechat data pod legacy klíči beze změny, inicializovat čistý nový stav pod novými verzovanými klíči a zobrazit chybovou zprávu indikující, že migrace neproběhla a trénink začíná s prázdnými statistikami.
4. WHEN Stats_Store ukládá nový stav, THE Stats_Store SHALL zapisovat výhradně do nových verzovaných klíčů a SHALL ponechat legacy klíče beze změny, dokud není zaznamenán příznak úspěšně dokončené migrace.
5. IF migrace proběhla úspěšně, ale následná inicializace nového stavu selže, THEN THE MTT_Preflop_Trainer SHALL pokračovat v provozu s migrovanými daty.
6. IF nelze dokončit migraci ani inicializaci čistého nového stavu pod novými verzovanými klíči, THEN THE MTT_Preflop_Trainer SHALL zobrazit chybovou zprávu indikující nekonzistentní stav lokálního úložiště a SHALL nespustit tréninkovou relaci, dokud pod novými verzovanými klíči neexistuje buď platný migrovaný stav, nebo platný čistý nový stav.

## Mimo rozsah této iterace (budoucí fáze)

Následující oblasti jsou záměrně mimo rozsah první iterace a budou řešeny v navazujících fázích:

- **Postflop trénink pro MTT** (flop/turn/river rozhodování) – navazuje na stávající postflop logiku v legacy baseline.
- **SNG varianta** včetně specifik ICM a bublinové dynamiky.
- **Cash game varianta** (hluboké stacky, jiné ranges, rake).
- **ICM model** a převod ranges z cEV na ICM-aware (tato iterace používá výhradně cEV).
- **Multi-way postflop** a pokročilé exploitové úpravy.
- **Synchronizace/cloud** – tato iterace zůstává čistě offline a lokální.
