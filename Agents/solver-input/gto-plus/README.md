# GTO+ solver input packs

Tahle složka drží pracovní vstupy pro ruční nebo poloautomatický výpočet postflop spotů v GTO+.

Aktuální zjištění k formátu:

- GTO+ `.gto` save file je binární/proprietární projektový soubor, takže ho zde negenerujeme naslepo.
- GTO+ Open dialog očekává hotový `.gto` projekt; `manifest.json`, `.spot.json`, range `.txt` ani board `.txt` nejsou přímo loadovatelný GTO+ import.
- Stabilní a bezpečně přenositelná část mimo GTO+ jsou textové range stringy, board subsety, sizing parametry a manifest spotů.
- GTO+ umí pracovat s více `.gto` soubory ve složce přes batch workflow. Cíl `sample-postflop-v1` je tedy rychle připravit několik templated spotů v GTO+, ručně je uložit jako `.gto` a potom je nechat přes noc dopočítat hromadně.

První testovací balíček:

- `sample-postflop-v1/` — source pack pro 4 vzorkové MTT heads-up postflop spoty; není to přímý `.gto` import.
- Lokální ZIP `artifacts/gto-plus-loadable-smoke-v1.zip` může obsahovat reálné `.gto` soubory převzaté z uživatelské ukázky, pokud jsou dostupné v lokálním tempu. Ty jsou určeny jen pro ověření, že GTO+ batch workflow umí načíst více `.gto` projektů.

Zásadní hranice:

- Tohle nejsou finální produkční ranges.
- Spoty jsou záměrně heads-up, protože GTO+ je prakticky použitelný hlavně pro postflop stromy, ne pro plné 9-max preflop řešení.
- Vzorky mají sloužit k ověření importu, batch výpočtu, exportu strategií a následného převodu do PKRTrainer normalizovaného formátu.
