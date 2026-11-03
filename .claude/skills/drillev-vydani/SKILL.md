---
name: drillev-vydani
description: Vydání DrillEV - hratelná MTT beta jako balíček na FTP, poznámky k vydání a přejímka majitelem. Použij ve fázi D plánu dokončení MTT nebo když majitel chce novou verzi na FTP.
---

# Vydání

Rozsah „MTT 1.0" je rozhodnutí D1 v `Agents/plan-dokonceni-mtt-2026-11.md`
(full ring 9, chipEV, regular i turbo, ante on/off; vyřešený postflop SRP
a 3BP; nové GUI jako výchozí).

## Kroky

1. Čistý strom (`git status` prázdný) a všechno pushnuté (`drillev-blok`).
2. `npm run verify:block` zelený na stejném commitu - je to definice hotového.
   `release:check` **bránou není**: padá na branách úplnosti knihovny
   (4/64 profilů), které s kódem nesouvisí (`Agents/AGENTS.md`, pravidlo 2).
3. Stav obsahu pro poznámky: `npm run mtt:playable-beta -- --summary`.
4. Náhled balíčku: `npm run mtt:ftp-package -- --summary`.
5. Balíček: `npm run mtt:ftp-package -- --write --confirm=PACKAGE_MTT_PLAYABLE_BETA --summary`.
   Archiv nesmí obsahovat `agents/`, `artifacts/`, `src/`, `solver-input/`
   ani podklady s licencí (`normalized.json`, `permission.json`) - hlídá to
   skript. Nasazení na Forpsi: `Agents/forpsi-ftp-deployment.md`.
6. Poznámky k vydání: co přibylo od minula (počty rodin a rozhodnutí ze
   `mtt:playable-beta`), přiznané limity, co je mimo MTT 1.0.
7. Přejímka: majitel na telefonu (360 px, offline). Nálezy jdou do deníku
   a do rezervy plánu (týden 5-6).

Nahrání na FTP dělá majitel, pokud výslovně neřekne jinak - je to akce
mimo projekt.
