---
name: drillev-rano
description: Ráno po noci solvingu DrillEV - souhrn nočních logů (desky, pády, ustoupení, spánek), dokončené rodiny, packy pro ně a brána. Použij první pracovní den ráno po nočním okně nebo kdykoli se ptá „jak dopadla noc".
---

# Ráno po noci

Okno je po-pá 20:00-07:00 a od pátku 20:00 do pondělní 07:00 (majitel
2. 11. 2026). Rozhodnutí o noci padá na jejím začátku (porada `mtt:daily`)
a leží v `Agents/daily/tonight.json` a `Agents/daily/<datum večera>.md`.

## 1. Co noc udělala - z logů, ne z dojmu

Expanze (monolity), Git Bash:

```
cd /c/Work/DrillEV
n=$(grep -n "konec okna" artifacts/decomposition/expansion.log | tail -1 | cut -d: -f1)
sed -n "$n,\$p" artifacts/decomposition/expansion.log | tr -d '\r' \
  | grep -E "solving|hotovo|SELHALO|spadlo|deadline|expansion:|ustupuji|POZOR|SPAL"
```

- `expansion: hotovo X, selhalo Y, zbývá Z` je souhrn noci.
- `SELHALO ... příští noc stupeň N` = deska půjde znovu na dalším stupni
  žebříku (značka `.failed` vedle checkpointu); `žebříček vyčerpán` = rozhodnutí
  o rodině je na majiteli.
- `spadlo po 0.x min (rc=3221225477)` a pak `hotovo (napodruhé)` je známý
  přechodný pád solveru, ne vada desky.
- Pokus D6 (dvě desky souběžně, od 3. 11. 2026): `propustnost: N desek za
  H h` proti 1,35 desky za hodinu z noci 2.-3. 11. (jeden monolit). Rodiny se
  mezi nocemi liší cenou, takže srovnání čti i s `mtt:board-cost`. Řádky
  výsledku nesou `paměť X GB` (špička desky) a `[rodina deska]`; `souběh:
  čekám na paměť` říká, kolikrát pojistka druhou desku nepustila (práh od
  5. 11. 2026 8 GB). `vytížení procesoru: průměr N %` je měřítko otázky, jestli
  noc jede naplno; po změně prahu ho poprvé přečti a řekni majiteli.
- `stroj mezi tím SPAL` / `POZOR: stroj během okna spal` = ztracené okno; pak
  události `Kernel-Power` 42/107/506/507. Samotné 506/507 přes noc jsou
  normální (Modern Standby; runner drží požadavek na běh) - rozhoduje mezera
  v logu.

Rozklad: konec `artifacts/decomposition/night.log` (`ustupuji` = noc patřila
expanzi; jinak počty turnových a riverových vrstev).

## 2. Které rodiny jsou hotové

Rodina jde do packu, až má checkpoint ke **každé** nastagované desce:
`Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver/<rodina>/raw/`.
Ranní cyklus rozdělané rodiny sám drží zpátky (`families()` v
`scripts/runAfterNight.mts`).

## 3. Packy

`npm run mtt:after-night` (bez `--write` jen ukáže stav). Odpojeně, jen pro
hotové rodiny a jen flop (turn a river nová rodina mít nemůže, dokud ji noc
rozkladu nerozloží):

```
Start-Process cmd.exe -ArgumentList '/c cd /d C:\Work\DrillEV && npm run mtt:after-night -- --write --streets=flop --family=<RODINA> > artifacts\after-night-manual.log 2>&1' -WindowStyle Hidden
```

Tabulka velikostí sázek: první checkpoint nové rodiny ji zastará, i když rodina
ještě není hotová, a první brána dne pak zčervená na `postflopBetSizing.test.ts`
(5. 11. 2026: tři rodiny). Cyklus ji obnovuje, ale sám běží jen v sobotu, takže
ve všední den po noci s novou rodinou: `npm run mtt:postflop-bet-sizing -- --write`
a commit s daty noci. Packy na ní nezávisí.

Čti log; běží minuty až hodiny. Před 3. 11. 2026 cyklus nesměl běžet vůbec:
tabulka velikostí sázek by po ztrátě checkpointů přišla o dodávané rodiny
(oprava v `buildPostflopBetSizing.mts`, `shippedFamilies`) a generátory turnu
a riveru by vypustily pravidla z desek, které obnovený rozklad nemá
(`packBoardGuard.mts`; odmítnutí „dodaný ... pack stojí na N deskách" je
pojistka, ne vada).

Záloha checkpointů (D7): ranní tik noční úlohy je zabalí do
`zaloha/checkpointy` (log `artifacts/backup-checkpoints.log`, řádek „záloha
checkpointů: zabaleno N"). Ručně `python scripts/backup/backup_checkpoints.py`,
obnova po ztrátě `--restore`. Mimo stroj ji kopíruje majitel.

Sobota: plný cyklus pouští úloha `PKRTrainer-After-Night-TurnEv` v 07:00
(log `artifacts/after-night-full.log`). Necommituje - v pondělí ho projdi,
ověř branou a commitni jako data.

## 4. Brána a zápis

`npm run verify:day` (asi 30 min, sada na jednom workeru), pak skill
`drillev-blok`: commit `data(obsah): noc D.-D. M. - ...` a push.
Bod deníku jen tehdy, když noc změřila něco nového (pravidlo 6).

## Nedělat

- Nespouštět solver ručně a neměnit frontu mimo `drillev-davka`.
- Neopravovat test, aby prošel; spadlý test se čte.
- Neupravovat zdroje, zatímco běží sada (falešné výsledky).
