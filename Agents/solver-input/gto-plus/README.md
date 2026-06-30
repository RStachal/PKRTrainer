# GTO+ solver input packs

Tahle složka drží pracovní vstupy pro ruční nebo poloautomatický výpočet postflop spotů v GTO+.

Aktuální zjištění k formátu:

- GTO+ `.gto` save file je binární/proprietární projektový soubor, takže ho zde negenerujeme naslepo.
- GTO+ Open dialog očekává hotový `.gto` projekt; `manifest.json`, `.spot.json`, range `.txt` ani board `.txt` nejsou přímo loadovatelný GTO+ import.
- GTO+ databáze není import libovolných spotů z JSONu. Prakticky je to databáze více stromů pro jednu rodinu spotu, typicky stejný stack/range/tree/sizing přes více flopů.
- Stabilní a bezpečně přenositelná část mimo GTO+ jsou textové range stringy, flop listy, sizing parametry a manifest spotů.
- GTO+ umí zpracovat databázi stromů a při nedostatku RAM ji umí exportovat na jednotlivé tree soubory, zpracovat je ve složce a znovu sloučit.

První testovací balíček:

- `sample-postflop-v1/` — source pack pro 4 vzorkové MTT heads-up postflop spoty; není to přímý `.gto` import.
- `GTO_PLUS_DATABASE_WORKFLOW.md` — doporučená cesta přes GTO+ database workflow.

Zásadní hranice:

- Tohle nejsou finální produkční ranges.
- Spoty jsou záměrně heads-up, protože GTO+ je prakticky použitelný hlavně pro postflop stromy, ne pro plné 9-max preflop řešení.
- Vzorky mají sloužit k ověření importu, batch výpočtu, exportu strategií a následného převodu do PKRTrainer normalizovaného formátu.
