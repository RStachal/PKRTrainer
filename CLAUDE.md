# DrillEV (dřív PKRTrainer)

Offline trenažér pokeru, MTT. Vanilla TypeScript + Vite + Vitest, Node 22,
české UI i dokumentace. Solver TexasSolver 0.2.0 (`console_solver.exe`) běží
jen v nočních úlohách Plánovače, Python 3.14 runnery v
`Agents/solver-input/decomposition/`.

## Kde je co

- **Pravidla práce:** `Agents/AGENTS.md` - platí i pro Clauda, ne jen pro
  Codex z nadpisu. Hlavně: do dokumentu jen změřené; `npm run mtt:known`
  před měřením; dlouhé běhy odpojeně; řádek deníku má čtyři buňky.
- **Cíl a pořadí práce:** `Agents/plan-dokonceni-mtt-2026-11.md` (MTT 1.0,
  rozhodnutí D1-D7 přijatá majitelem 3. 11. 2026, fáze A-D).
- **Deník:** `Agents/MTT_AUTONOMY.md`; otevřené body `npm run mtt:agenda`.
- **Noc:** `Agents/daily/` (porada a denní zprávy), logy v
  `artifacts/decomposition/`, úlohy v `scripts/scheduled/`.

## Jak se pracuje (majitel, 2. 11. 2026)

Víc skills, méně předávání mezi agenty - kompaktováním se ztrácí podstatné.
Jedna relace na blok; kroky přes skills v `.claude/skills/`:

| skill | kdy |
|---|---|
| `drillev-start` | začátek relace a po kompaktování |
| `drillev-rano` | ráno po noci |
| `drillev-blok` | uzavření bloku: brána, deník, commit, push |
| `drillev-davka` | fronta a úlohy noci |
| `drillev-majitel` | rozhodnutí a čtení majitelem |
| `drillev-vydani` | balíček na FTP a poznámky k vydání |

Subagenti jen na čtení a s výsledkem do souboru.

## Brána a git

- Definice hotového je `npm run verify:block`; přes den `npm run verify:day`.
- Po ověřeném bloku commit **a push** (rozhodnutí D7, 3. 11. 2026).
  Neověřené se necommituje.
- Během běhu sady se neupravují zdroje ani deník.

## Pravidla, která vynucuje hook (majitel, 4. 11. 2026)

Tvrdá pravidla nestojí jen v textu: hlídá je hook `PreToolUse`
(`scripts/hooks/guardToolUse.mjs`, testy `tests/unit/guardToolUse.test.ts`).

- Solver se z relace nespouští (`console_solver`, `run_night_*.py`,
  `solve_plan.py`); čtecí příkazy projdou.
- V okně solveru (po-pá 20:00-07:00, víkend celý) neběží build, E2E,
  `verify:*`, celá sada testů ani generování packů. Výjimka jen se souhlasem
  majitele: `DRILLEV_ALLOW_NIGHT=1` v příkazu.
- Dokud žije zámek v `artifacts/locks/` (zapisuje ho sada testů a
  `verify:day`), nemění se `src/`, `scripts/`, `tests/`, dokumenty v kořeni
  `Agents/` ani konfigurace.

Hook je v uživatelském nastavení `~/.claude/settings.json`, protože se relace
spouští z `C:\Users\stachal`. Nastavení repozitáře (`.claude/settings.json`)
by se v takové relaci nenačetlo, stejně jako se nenačítají skills a tenhle
soubor. Mimo DrillEV hook nic nedělá. Prohlédnout nebo vypnout jde přes
`/hooks`.
