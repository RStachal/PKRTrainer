# Jak dokončit MTT bez čekání na zadavatele

Tenhle dokument existuje kvůli jedné opakované chybě: označil jsem položku za
„blokovanou na uživateli", oznámil to a zastavil se. Uživatel to musel několikrát
opakovat a nakonec pohrozil odchodem. Měl pravdu — skoro nic z toho blokované
nebylo. Chybělo rozhodnutí, ne data.

## Pravidlo číslo jedna: nikdy nečekat

**Není povoleno zastavit práci kvůli chybějícímu vstupu od uživatele.**

Když něco není jasné, platí tenhle postup — vždy, bez výjimky:

1. Zvol nejlepší dostupný default. Nemusí být dokonalý, musí být obhajitelný.
2. Zapiš ho jako `assumption` do datového packu nebo do komentáře u kódu — tak,
   aby ho šlo najít a přepsat, až přijde lepší podklad.
3. Označ důvěru podle skutečné síly podkladu (`LOW`, dokud to nikdo neprošel).
4. Pokračuj další položkou.

Uživateli se to sdělí **jednou větou v shrnutí**, ne jako otázka a ne jako
podmínka pokračování. „Zvolil jsem X, protože Y; pokud máš jiná čísla, přepíšu
to" je správný tvar. „Potřebuji od tebe X" je špatný.

Jediná výjimka: akce, která je nevratná nebo míří ven z projektu (publikace,
platba, mazání dat). Tam se ptát smí a má.

## Pravidlo číslo dvě: pravda o původu dat se neohýbá

Default zvolený podle pravidla jedna **nikdy** nesmí dostat nálepku
`SOLVER_BACKED`. Provenience je strukturální pole, ne formulace. Heuristika se
označí jako heuristika i tehdy, když je to jediné, co pro daný spot máme.

Produkční brána odmítá „inferred chart values" — odvozené hodnoty smí jít ven
jen jako preview a jen když to UI dá najevo.

UI nikdy necituje zdroje. Hlídá to `uiNoSourceCitation.test.ts`.

## Definice hotového pro jeden blok

Blok není hotový, dokud neprojde všechno tohle:

```
npx tsc --noEmit          # vitest netypuje, tohle je jediná typová kontrola
npx vitest run            # celá sada, ne jen dotčený soubor
npm run build             # tsc + vite, catch pro chyby v generovaných modulech
npm run bundle:budget     # per-chunk 512 KiB raw / 128 gzip, precache 400/128
```

K tomu: commit s vysvětlením **proč**, ne jen co. A nikdy needitovat zdroje,
zatímco běží sada — stálo to už tři falešné výsledky a jeden 219minutový běh.

## Fronta práce, seřazená podle dopadu

Zdroj pravdy o mezerách je `npm run mtt:playable-beta`. Stav k 2026-08-10:

| # | Položka | Stav | Default, když chybí podklad |
|---|---|---|---|
| 1 | ~~Six-max preflop~~ | **hotovo 2026-08-08.** Regular je hratelné preview se 425 odvozenými záznamy; ověřeno proti třem veřejným zdrojům přes `npm run mtt:six-max-widths` — všechny sedačky uvnitř pásma. Turbo zůstává prázdné záměrně: odvozený turbo pack by byl regular s jiným štítkem. | — |
| 2 | Preflop produkce 4/8 | **Zjištěno 2026-08-08:** chybějící polovina nejsou ante/rychlost, ale `DOLAR_EV` (ICM). Devítistolový regular má nově odvozený bublinový pack jako hratelné preview; produkce zůstává 4/8 správně, protože odvozená data brána nepouští. | zbývající čtyři $EV sloty jsou turbo a šestistolové — odvozovat je nelze, měřený zdroj je jeden na režim ante |
| 3 | ~~Turn rodiny mimo scope brány~~ | **hotovo 2026-08-08.** Brána hlásí 9/9 rodin, 2 644 vyřešených turnů, 133 různých flopů, a dva nové limity: že obsah odpovídá jen na boardy, na kterých byl vyřešen, a že ho zatím nikdo neprošel. | — |
| 4 | Rodiny míchající dva solverové stromy | **Částečně hotovo 2026-08-08.** Míchají tři, ne dvě — a dvě z nich (`MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH`, `MTT9_150BB_CO_BTN_3BP_HIGHSPR`) jsou turn rodiny, které se dodávají. Turn generátor teď redukované boardy vynechá, takže žádný turn pack dva stromy nemísí (2 644 → 2 537 turnů, 133 → 119 flopů). Flopová strana zůstává, tam se míchání jen hlásí. | flop rodiny přesolvit v nočním okně; do té doby zůstávají označené |
| 5 | ~~Pinovaná velikost sázky~~ | **ověřeno 2026-08-08.** BET_17 na 14,1 %, BET_25 na 17,8 %, nejvyšší velikost je 36 % sázek — žádná nemá většinu, default „nechat být" platí a limit to říká. Cestou opraven nepodložený příslib „queued for re-solve": nic je nefrontí a přesolvení je monolitický solve mimo tenhle pipeline. | — |
| 6 | ~~EV pro VS_4BET~~ | **hotovo 2026-08-08.** Sizingy zvoleny (3bet 2,2× IP / 3× OOP, 4bet 2,2×), zastropovány stackem. Všech 6 000 nabídnutých jamů oceněno. Mělký čtyřbet je fakticky all-in, tam se počítá dorovnání bez fold equity. | — |
| 7 | EV pro VS_LIMP | **Uzavřeno jako neocenitelné 2026-08-08, s jiným důvodem, než jsem psal.** Limpovací range modelovaná je (105 tříd) — můj předpoklad byl mylný. Změřeno: každý limp spot s jamem je z big blindu a žádný nenabízí fold, protože BB má vloženo a může checknout. Ostatní větve porovnávají jam proti skládání za nulu; tady je alternativou flop zdarma, kterou produkt neumí ocenit. Nula by jam nadhodnotila právě tam, kde je alternativa nejlevnější. | otevřít až bude postflopový model, který ocení check z BB |
| 8 | Plochá poziční křivka | chybí měřené frekvence po sedačkách | ponechat; měnit tvar bez měření už jednou selhalo (viz commit o seam repair) |
| 10 | Noční běh spálil noc tiše | **opraveno 2026-08-10.** Log hlásil 119× „plan failed:" bez důvodu (zahazoval návratový kód) a `--until=07:00` spuštěné ráno dalo 23hodinové okno, takže běh držel jádra přes pracovní den. Obojí opraveno; běh se mimo noční okno odmítne spustit. | — |
| 9 | River jen heuristika | **Nástroje hotové 2026-08-08.** `plan_river.py` plánuje riverové podhry z vyřešené turnové (ověřeno: 65 podher, pokrytí 1,000, všech 48 riverových karet). Noční běh má fázi `--river-budget=N`, která běží až po turnové a výběr rozprostírá po deskách. Vlastní solvení je práce nočního okna. | rozpočet zvyšovat po nocích; turn má přednost, protože nedokončený turn blokuje review bránu |

Položky 6 a 7 byly dřív vedené jako „blokované na uživateli". Nejsou. Mají
default ve sloupci vpravo.

## Denní rytmus

- **07:00–21:00** vývoj. Cron budí práci; každé probuzení vezme nejvyšší
  nehotovou položku z fronty a udělá z ní celý blok podle definice hotového.
- **21:00–07:00** solver na plný výkon. Pokud v 21:00 běží vývojový blok,
  solving počká na jeho dokončení. Pokud ráno solving reálně doběhne do 60 minut,
  počká vývoj.
- ZIP balíček jen na vyžádání, orientačně jednou týdně. Nedělat automaticky.

## Co hlásit uživateli

Co je hotové, co se změnilo v datech a jaký default jsem zvolil. Ne otázky, ne
seznam možností, ne žádost o potvrzení. Když jsem něco zvolil špatně, řekne to
a opraví se to — to je levnější než čekat.
