# GTO+ loadable smoke pack v1

Tento adresář popisuje lokální smoke ZIP s reálnými `.gto` soubory.

Samotné `.gto` projekty necommitujeme do repozitáře:

- jsou binární,
- mohou být velké,
- mohou obsahovat solverová/raw data z externího pracovního procesu.

Lokálně připravený ZIP:

```text
artifacts/gto-plus-loadable-smoke-v1.zip
```

Účel ZIPu:

- ověřit, že GTO+ umí načíst více hotových `.gto` projektů,
- otestovat batch solve/process workflow,
- otestovat export strategií z hotových projektů.

Neřeší:

- generování nových `.gto` projektů z JSONu,
- automatické přepsání boardů/rangí uvnitř binárního `.gto`,
- produkční validaci MTT ranges.

Pro nové postflop spoty je aktuálně bezpečná cesta:

1. použít `sample-postflop-v1` jako source pack,
2. založit spot v GTO+,
3. vložit ranges/board/sizing,
4. uložit jako `.gto`,
5. nechat GTO+ batchově dopočítat všechny `.gto` ve složce.
