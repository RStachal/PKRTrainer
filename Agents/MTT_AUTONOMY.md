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

Zdroj pravdy o mezerách je `npm run mtt:playable-beta`. Stav k 2026-08-08:

| # | Položka | Stav | Default, když chybí podklad |
|---|---|---|---|
| 1 | ~~Six-max preflop~~ | **hotovo 2026-08-08.** Regular je hratelné preview se 425 odvozenými záznamy; ověřeno proti třem veřejným zdrojům přes `npm run mtt:six-max-widths` — všechny sedačky uvnitř pásma. Turbo zůstává prázdné záměrně: odvozený turbo pack by byl regular s jiným štítkem. | — |
| 2 | Preflop produkce 4/8 | **Zjištěno 2026-08-08:** chybějící polovina nejsou ante/rychlost, ale `DOLAR_EV` (ICM). Devítistolový regular má nově odvozený bublinový pack jako hratelné preview; produkce zůstává 4/8 správně, protože odvozená data brána nepouští. | zbývající čtyři $EV sloty jsou turbo a šestistolové — odvozovat je nelze, měřený zdroj je jeden na režim ante |
| 3 | ~~Turn rodiny mimo scope brány~~ | **hotovo 2026-08-08.** Brána hlásí 9/9 rodin, 2 644 vyřešených turnů, 133 různých flopů, a dva nové limity: že obsah odpovídá jen na boardy, na kterých byl vyřešen, a že ho zatím nikdo neprošel. | — |
| 4 | Dvě rodiny míchají dva solverové stromy | `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR`, `MTT9_150BB_CO_BTN_3BP_HIGHSPR` | přesolvit v nočním okně; do té doby zůstávají označené |
| 5 | `mtt9_100bb_btn_bb_srp_facing_highspr` trénuje BET_17, solver hraje nejčastěji BET_25 | žádná velikost nemá většinu (nejvyšší 36 %) | nechat být a říct proč — přepnutí mění číslo víc než spot |
| 6 | EV pro VS_4BET | 3BET/4BET klíče nenesou sizing | zvolit standardní turnajové sizingy (3bet 2,2× IP / 3× OOP, 4bet 2,2×), zapsat jako assumption |
| 7 | EV pro VS_LIMP | není modelovaná limpovací range | odvodit z pasivní části obranné range, označit jako odvozené |
| 8 | Plochá poziční křivka | chybí měřené frekvence po sedačkách | ponechat; měnit tvar bez měření už jednou selhalo (viz commit o seam repair) |
| 9 | River jen heuristika | flop pilot, turn solved | po vyčerpání 1–7 zadat riverové rodiny do nočního okna |

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
