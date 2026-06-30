# GTO+ solver input packs

Tahle složka drží pracovní vstupy pro ruční nebo poloautomatický výpočet postflop spotů v GTO+.

Aktuální zjištění k formátu:

- GTO+ `.gto` save file je binární/proprietární projektový soubor, takže ho zde negenerujeme naslepo.
- Stabilní a bezpečně přenositelná část jsou textové range stringy, board subsety, sizing parametry a manifest spotů.
- GTO+ umí pracovat s více `.gto` soubory ve složce přes batch workflow. Cíl tohoto balíčku je tedy rychle připravit několik templated spotů v GTO+, uložit je jako `.gto` a potom je nechat přes noc dopočítat hromadně.

První testovací balíček:

- `sample-postflop-v1/` — 4 vzorkové MTT heads-up postflop spoty pro ověření workflow, ne produkční strategie.

Zásadní hranice:

- Tohle nejsou finální produkční ranges.
- Spoty jsou záměrně heads-up, protože GTO+ je prakticky použitelný hlavně pro postflop stromy, ne pro plné 9-max preflop řešení.
- Vzorky mají sloužit k ověření importu, batch výpočtu, exportu strategií a následného převodu do PKRTrainer normalizovaného formátu.
