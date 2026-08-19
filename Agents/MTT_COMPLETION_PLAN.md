# Plán dokončení MTT části

Napsáno 19. 8. 2026 na zadání „vytvoř plán tak, abys byl schopen sám, bez mých
vstupů, reálně dokončit MTT část".

## Nejdřív poctivá odpověď: sám ji dokončit nemůžu

Knihovna má **64 profilů** (2 formáty stolu × 2 rychlosti blindů × 2 EV modely ×
4 ulice × 2 ante). Dnes jsou 4 produkční, 54 v náhledu, 6 blokovaných.

Z těch 64 je **48 zablokovaných na datech nebo hardwaru, které si neopatřím**:

| skupina | řádků | co chybí | proč si to neseženu |
|---|---|---|---|
| six-max | 16 | změřené preflop charty | odvozovat je brána zakazuje, a správně; vlastněné materiály jsou 9-max |
| $EV / ICM | 32 | změřená ICM data | dnešní `bubble-derived` pack se od nezávislého ICM zdroje liší o 13,4 bodu a má jiný tvar |
| blend 51 desek | — | stroj s 48+ GB RAM | commit 25,9 GB proti ~20 GB použitelné paměti; hardwarová odpověď, ne plánovací |

Tvrdit, že to dokončím, by znamenalo buď odvodit data, která brána odmítá, nebo
prohlásit za pokryté něco, co pokryté není. Ani jedno neudělám.

**Co dokončit můžu, je full-ring 9 chipEV**, tedy 16 z těch 64 řádků, a k tomu
funkce, které na datech nezávisí. To je konec cesty, kterou zvládnu sám.

## Fáze 1 — EV dopočtem z riveru

**Proč první:** odemyká dvě funkce, které majitel chce (EV ostatních akcí po
odpovědi, EV u každé kombinace v matrixu), a je to největší číslo v bráně
(`preflop action EV: 0/472862`, `scoped FLOP action EV: 0/972`).

**Proč to jde:** TexasSolver v0.2.0 EV nevypisuje - ověřeno v binárce, existuje
jen `dump_result` a `dump_strategy`, žádný `dump_ev`. Přesolvení by nepomohlo.
Dopočítat ho ale lze: dumpy nesou strategii v každém uzlu, obě range i strom, a
to je všechno, co k výpočtu EV potřeba je.

**Proč river první:** na dokončené desce je showdown jen porovnání karet, žádná
rekurze. Výsledek jde ověřit ručně na spotu, kde je odpověď známá dopředu
(nutová ruka proti blafu), což u turnu a flopu nejde.

1. Modul EV pro riverový uzel: pro každou kombinaci a akci spočítat EV proti
   soupeřově range s odečtením karet.
2. Ověřit na spotech se známou odpovědí, ne na shodě s vlastním výpočtem.
3. Rozšířit riverový pack o EV, hlídat rozpočet modulu.
4. UI: EV ostatních akcí po odpovědi, EV v matrixu.

## Fáze 2 — EV pro turn a flop

Rekurzí přes podstrom, který dumpy nesou. Dražší a snáz se v tom udělá chyba,
proto až po riveru a s riverovým výpočtem jako základem.

## Fáze 3 — postflopové řádky knihovny

Řádky `FULL_RING_9|CHIP_EV|FLOP|*`, `TURN|*`, `RIVER|*` sledují
`*ProductionStrategyPack`, ne `*SolvedStrategyPack`. Vyřešený obsah je tedy
bráně neviditelný.

**Není to ale jen propojení.** Vyřešený pack odpovídá na desky, na kterých vznikl,
a všude jinde odmítá. Prohlásit kvůli němu profil za produkčně pokrytý by bylo
přehnané tvrzení. Fáze proto začíná měřením, jaký podíl rozdávaných spotů
vyřešený obsah doopravdy pokryje, a teprve podle toho se rozhodne, jestli to
znamená produkci, nebo pojmenované částečné pokrytí.

## Fáze 4 — šířka riveru

Běží sama každou noc. Turn je 577/577 hotový, takže celé okno 21:00-08:00 jde do
riveru. Žádná moje práce, jen dohled.

## Průběžně

- Kontrola, že každý řádek manifestu jde postavit (dnes chybí - našlo se náhodou,
  že se dodával riverový pack, který už z aktuálních dat vyrobit nejde).
- 104 typových chyb ve `scripts/`, z toho 29 zastaralá `lib`.
- Mechanická kontrola po každé noci, aby nový obsah nezůstal na LOW.

## Co zůstane nedokončené a čeká na majitele

1. **Six-max charty** - 16 řádků knihovny.
2. **ICM data** - 32 řádků.
3. **Stroj s 48+ GB RAM** - 51 desek s blendem.
4. **Čtení hráči** - mechanická kontrola chytá hrubé rozbití, ne kvalitu hry.
   Verdikt od člověka ji vždy přebije.
