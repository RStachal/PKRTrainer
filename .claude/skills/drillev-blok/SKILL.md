---
name: drillev-blok
description: Uzavření bloku práce na DrillEV - brána (verify:day přes den, verify:block jako definice hotového), bod deníku, commit a push. Použij vždy, když je kus práce hotový, a před koncem relace.
---

# Uzavření bloku

Blok je hotový, až projde brána. Pak se hned commituje **a pushuje** -
rozhodnutí majitele D7 z 3. 11. 2026 („push po každém ověřeném bloku"), po
ztrátě týdne nepushnutých commitů 23.-30. 10. Neověřené se necommituje.

## 1. Brána

- Přes den: `npm run verify:day` - kroky `verify:block` až po meze EV, bez
  buildu a Chrome E2E, sada na jednom workeru, před krokem čeká na volnou
  paměť. Asi 30 minut.
- Definice hotového: `npm run verify:block` (typecheck, sada, `verify:ranges`,
  `mtt:post-answer`, build, precache, rozpočty, Chrome E2E). Build chce ve
  špičce kolem 11 GB, proto jen při volném stroji.
- Výstup do logu, např.
  `npm run verify:day > artifacts/verify-day-<datum>.log 2>&1`.
- Během běhu **neupravovat zdroje** ani deník (`diaryTable` čte deník).
- Červená: najdi příčinu. Spadlý krok je poslední řádek
  `> mtt-preflop-trainer@... <skript>` v logu.

## 2. Deník (`Agents/MTT_AUTONOMY.md`)

Jen když blok změřil něco, co paměť projektu nezná
(`npm run mtt:known -- "<téma>"`). Řádek tabulky má **čtyři buňky**:

`| <další číslo> | <titulek: co se zjistilo> | **<datum>.** <fakta s čísly a příkazy> | <stav a na kom visí> |`

Svislítko uvnitř textu escapuj `\|`. `npm run mtt:agenda` skončí nenulovým
kódem, když je tabulka rozbitá.

## 3. Commit a push

- Logické commity, styl repozitáře (česky, proč, ne jen co):
  `fix(noc): ...`, `feat(gui): ...`, `data(obsah): ...`, `docs(plán): ...`.
- Generované packy a logy noci patří do `data(...)` commitu zvlášť od kódu.
- `git push origin <větev>` (dnes `agent/mtt-ev-feedback-release`).
- V plánu (`Agents/plan-dokonceni-mtt-2026-11.md`) odškrtni krok fáze, který
  blok uzavřel.

## 4. Hlášení

Jedno hlášení na blok (pravidlo 3): co je hotové, čím je to změřené, co
zůstává a na kom visí.
