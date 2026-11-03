---
name: drillev-majitel
description: Kolo pro majitele DrillEV - připraví otevřená rozhodnutí a čtecí stránky (review desk), přeloží vrácené odpovědi a zapracuje je. Použij, když práce čeká na rozhodnutí nebo čtení majitelem, nebo když majitel vrátí odpovědi.
---

# Kolo pro majitele

Majitel rozhoduje o obsahu a rozsahu; agent měří, navrhuje s doporučením
a zapracovává. Otázka bez čísla a bez doporučení se neposílá
(`Agents/MTT_AUTONOMY.md`, pravidlo jedna).

## Co čeká

`npm run mtt:agenda` - přihrádka „na majiteli". Bod bez stavu se nepřiřazuje
odhadem; doplní se mu v deníku, na kom visí.

## Rozhodnutí

1. Otázky žijí v `scripts/lib/ownerDecisions.mts` (s měřením a doporučením).
2. `npm run mtt:decisions` vyrobí stránku
   `artifacts/review-desk/rozhodnuti.html` (statická, bez odkazů ven).
3. Majitel vyplní a vrátí export (první řádek token s otiskem znění otázek).
4. `npm run mtt:decision-answers -- --answers-file=<soubor>` (nebo
   `--answers="DRILLEV-DECISIONS-V1 <otisk> 1a 2b"`). Otisk musí sedět na
   dnešní znění, jinak se odpověď nepřeloží.
5. Zapracovat rukou, zapsat do deníku a do plánu, pak `drillev-blok`.

## Čtení obsahu

`npm run mtt:review-desk` připraví jednu složku pro FTP se vším, co čeká na
potvrzení. Nic nenahrává - nahrání je majitelův krok. Lidské verdikty jsou
jediná cesta, jak obsah dostat nad mechanickou kontrolu (plán, oddíl 7).

## Krátká rozhodnutí v chatu

Když majitel odpoví v konverzaci („souhlasím s návrhy"), zapiš rozhodnutí
s datem a jeho slovy do plánu (tabulka rozhodnutí) a do deníku. Ústní souhlas
nežije nikde jinde a příští relace ho jinak nezná.
