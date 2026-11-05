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
- Jeden monolit drží 5-7 logických procesorů z 16 (2. 11. 2026). Od 3. 11.
  běží pokus D6: dvě desky souběžně po 8 vláknech (`--parallel=2 --threads=8`
  v `night-expansion.ps1`), strop a rezerva krát 1,5, druhá deska jen při
  aspoň 8 GB volné paměti (do 5. 11. 12 GB: 1,38 desky za hodinu, v průměru
  1,3 desky naráz). Vyhodnocuje se řádkem `propustnost:` na konci noci proti
  1,35 desky za hodinu (noc 2.-3. 11., jeden monolit) a řádkem `vytížení
  procesoru:`. Zpět = smazat oba parametry.
- Noc NEW_FAMILIES a noc DECOMPOSITION se střídají a víkend se počítá za jednu
  noc: od pátečního večera do pondělní sedmé jede ten, na koho vyjde páteční
  řada. Čas stroje to neubírá, rozklad má riverových vrstev na stovky hodin.
- Fronta se doplňuje sama pod dvě noci: napřed dvojice sedaček, od 5. 11. pak
  `mtt:board-growth`. 100 bb a 3BP zůstávají rozhodnutí majitele.
- Solver z relace nespouštěj; ověřuj na logu příští noci.
