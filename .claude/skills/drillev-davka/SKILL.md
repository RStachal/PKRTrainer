---
name: drillev-davka
description: Dávka pro noční solving DrillEV - stav fronty monolitů, nastagování nových desek a rodin, rozdělení nocí mezi expanzi a rozklad, kontrola připravenosti noci a úloh Plánovače. Použij před nocí, když fronta dochází, nebo když se mění okno či úlohy.
---

# Dávka pro noc

## Jak noc funguje

- Úlohy Plánovače `PKRTrainer-Night-Decomposition` (20:00) a
  `PKRTrainer-Night-Expansion` (20:01) pod SYSTEM, priorita 4. Spouští se taky
  po startu, přihlášení, odemčení a otevření víka (`Kernel-Power 507`).
  Okno hlídá `scripts/scheduled/lib-night-window.ps1`: po-pá 20:00-07:00,
  víkend od pátku 20:00 do pondělní 07:00. Mimo okno skript skončí bez práce.
- Instalace a změna úloh: `scripts/scheduled/install-night-tasks.ps1` (jako
  správce; log `artifacts/install-night-tasks.log`). Úlohy se registrují
  s `-Force` (přepis definice), proto se instaluje přes den, mimo okno.
- Na začátku noci rozklad pustí poradu `npm run mtt:daily -- --write`. Ta
  rozhodne prioritu do `Agents/daily/tonight.json` a doplní frontu, když
  zásoba klesne pod dvě noci. Noci se střídají 1:1 (`NEW_FAMILIES` /
  `DECOMPOSITION`), dokud jsou vyřešené desky bez rozkladu
  (`scripts/lib/nightAlternation.mts`). Kdo noc nemá, ustoupí.
- Expanze solví desky po jedné. Deska bez checkpointu = práce
  (`scripts/lib/expansionQueue.mts`). Spadlá deska jde další noc na vyšší
  stupeň žebříku podle značky `.failed`.

## Kroky

1. `npm run mtt:night-ready` - kontroly noci (úlohy, okno, napájení, fronta).
2. Fronta: `npm run mtt:seat-pair-expansion` (náhled), `-- --write` (zápis
   parametrů do `Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_seat_pair_expansion_v1`).
   Od 2. 11. 2026 generátor bere jako hotové rodiny z dodaného flopového
   manifestu - checkpointy starých rodin se ztratily se strojem.
3. Víc desek pro rodiny, které už jsou: `npm run mtt:board-growth`.
4. Cena desky a zásoba: `npm run mtt:board-cost` (měří z `expansion.log`).

## Pasti

- Na baterii noc solví dál, ale Windows ji uspí, až baterie dojde - stroj na
  noc do zásuvky (`POZOR: napajeni je BATERIE` v logu).
- Deska rozdělaná v 06:59 doběhne. Přetažení je nejvýš její strop (90 min).
- Jeden monolit drží 5-7 logických procesorů z 16 (2. 11. 2026). Pokus
  o dva souběžné monolity je rozhodnutí D6 v plánu; dokud neběží,
  `--thread-trial` v `night-expansion.ps1` neměň.
- Solver z relace nespouštěj; ověřuj na logu příští noci.
