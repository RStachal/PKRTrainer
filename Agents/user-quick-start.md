# PKRTrainer – rychlý start

Tento průvodce je určen hráčům. Záměrně neobsahuje informace o zdrojích,
poskytovatelích ani interních datových balíčcích.

## Trénink

1. Otevřete záložku **Trénink**.
2. Vyberte profil: typ hry, formát stolu, rychlost blindů, streetu, model a rake.
3. Vyberte pozice, hloubky stacku a kontext akce.
4. Stiskněte **Spustit trénink**.
5. Zvolte nejlepší pokerovou akci pro zobrazený spot.

Stůl se zobrazí až po vygenerování konkrétní otázky. Před odpovědí zkontrolujte
pozice, stacky, pot, karty hráče a aktivní soupeře.

## Preflop

`MTT ChipEV Core` pokrývá produkční 9-max chipEV preflop trénink pro regular
i turbo blindy, s ante i bez ante. Ostatní formáty stolu a EV modely zůstávají
jasně označené jako náhled nebo nedostupné.

Preflop otázky se zaměřují na pozici, efektivní stack, ante a kontext akce:

- RFI / open,
- proti limpu,
- proti openu,
- proti 3-betu,
- proti 4-betu,
- squeeze,
- blind vs blind,
- push / fold,
- proti all-inu.

Po každé odpovědi projděte výsledek a matici range. Porovnejte svou akci
s doporučenou větví a sledujte, které handy patří do value, bluff, call/check
nebo fold části strategie.

## Postflop

Aktuální solverový postflop obsah tvoří sedm scoped FLOP pilotů. Nejde o plné
postflop pokrytí a pozdější streety zůstávají pouze v náhledovém režimu.

Postflop otázka vychází z vybraného profilu a zobrazuje konkrétní stůl.
Nejdříve zkontrolujte:

- pozice a stav IP/OOP,
- typ potu a SPR,
- karty hráče,
- board,
- popis textury boardu.

Poté vyberte jednu z dostupných akcí, například check, malý bet nebo velký bet.
Po odpovědi projděte range pohled, který seskupuje handy podle pokerové funkce,
například value, bluffy, draw, overkarty a check range.

## Statistiky

Záložka **Statistiky** slouží ke zlepšování hry. Sledujte hlavně:

- vývoj úspěšnosti,
- nejslabší pozici,
- nejslabší hloubku stacku,
- nejslabší kontext akce,
- postflop úniky podle streety a textury,
- čas rozhodnutí po nasbírání dostatečného počtu hand.

Z nejslabšího ukazatele spusťte cílený trénink pomocí akce **Trénovat zaměření**.

## Import HH

Do záložky **Import HH** vložte hand history a projděte rozhodnutí z odehraných
hand. Importované handy slouží k review; stejné situace si následně procvičte
v běžném tréninku.

## Doporučený cyklus

1. Odehrajte malý cílený vzorek.
2. Ihned projděte chybné odpovědi.
3. Ve Statistikách najděte nejslabší ukazatel.
4. Spusťte trénink tohoto zaměření.
5. Po stabilizaci úspěšnosti pokračujte s novým seedem.
