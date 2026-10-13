# Flopové číslo — co na flopu hráč dostane — k vyplnění vlastníkem

**Vznik:** 13. 10. 2026, na pokyn vlastníka „začít pracovat na principu flopové EV,
ať vyvíjíme produkt rovnoměrně, abychom v budoucnu neřešili nějaký bloker"
**Zpracuje:** rozhodnutí se zapíše do `Agents/MTT_COMPLETION_PLAN.md` a do deníku
**Vyplň prosím oddíl „Tvoje odpověď" dole.**

---

## Nejdřív to, co ti musím říct rovnou

Tvoje úvaha o rovnoměrném vývoji je správná a míří na skutečnou díru. Ale
„flopová EV" jsou **dvě různé věci** a jedna z nich je změřeně mrtvá:

**(A) Flopová EV jako EV** — tedy očekávaná hodnota flopové akce. Ta se počítá
průměrem přes turnové karty a každá z nich potřebuje pod sebou riverovou vrstvu.
Změřeno 14. 9. 2026 (`npm run mtt:flop-ev-nights`), deska po desce, ne z průměru:
**11 189 417 riverových podher = 342 nocí.** Zrychlení 4× dá pořád 85 nocí;
hrubší vrstva (pokrytí linek 0,8 místo 0,99) dá 205 nocí, tedy o 40 % míň, ne
o řád. Dnes nemá vrstvu pod **každou** svou podherou ani jedna deska. Bod 218
doufal, že „až podíl přeroste, otázka se otevírá znovu" — bod 247 to zavřel
slovy **„nepřeroste"**. Touhle cestou to tedy nejde a nocí to není otázka.

**(B) Flopová cena akce** — tedy „kolik ta akce musí vydělat, aby se zaplatila".
Ta na flopu **už existuje**, v kódu od 28. 8. 2026 (`src/core/postflopDecisionPrice.ts`),
a počítá se ze skutečné linie vyřešeného pravidla, ne z modelu. Změřeno 6. 9.:
dojde k hráči na **flopu ve 25,0 %** rozdaných spotů (turn 36,3 %, river 51,7 %),
a `mtt:post-answer` to hlídá podlahou 20 % uvnitř `verify:block`.

**Takže flop není bez čísla.** Frekvence tam dojde ve 100 % spotů, cena ve 25 %.
Prázdno je jen tam, kde (A) nejde spočítat.

*(Vedlejší nález: `MTT_COMPLETION_PLAN.md` na řádku 350 pořád tvrdí „zůstává
nezměřené, jestli cena dojde k hráči i na postflopu". To je od 6. 9. vyvrácené —
ten sloupec `mtt:post-answer` má. Opravím to.)*

## Kde ta díra na flopu opravdu je

Z těch 75 % flopových spotů bez ceny je drtivá většina `NEČELÍ_SÁZCE`: **hrdina
jedná první a nemá co dorovnávat.** Cena vlastní sázky se schválně nepočítá a
důvod je v kódu napsaný takhle:

> „Vlastní sázka hrdiny (`BET_SMALL`, `BET_BIG`, `RAISE`). Její velikost je
> **model** (třetina a tři čtvrtiny potu), ne solverovo číslo (…) Jedno prázdné
> místo je lepší než dvě čísla, ze kterých jedno tiše lže."

To je dobrý princip. **Jenže jeho předpoklad dnes neplatí** a to je ten nález
z 13. 10., kvůli kterému ti tenhle dokument píšu:

| | velikost |
|---|---|
| co **solver skutečně hrál** na flopu (parametry stromů) | `oop bet 50` · `ip bet 25,50` · `raise 100` |
| co **produkt modeluje** ([postflopLineSimulator.ts:958](../../src/core/postflopLineSimulator.ts#L958)) | `BET_SMALL = 0,33` · `BET_BIG = 0,75` |

Velikost hrdinovy sázky **ve stromě je** — čtvrtina a polovina potu. Model
třetiny a tří čtvrtin je proti tomu **druhé, jiné číslo**, a `betSizeBB()` ho
používá bezpodmínečně, bez ohledu na to, co pravidlo pod tím hrálo.

### Tuhle část jsem si musel opravit, a dopadla jinak, než jsem psal

Nejdřív to vypadalo, že produkt ukazuje model všude. **Neukazuje.** Tlačítko
velikost ze stromu bere ([postflopView.ts:977](../../src/ui/postflopView.ts#L977)):

```ts
const solved = solvedSizing(spot, "BET_SMALL");
const ratio = solved?.ratio ?? 0.33;
```

Tedy 0,33 je **záložní** hodnota pro spot bez vyřešené velikosti, ne to, co se
ukazuje. Existuje na to i generovaná tabulka `postflopBetSizing.generated.ts`
a v její hlavičce stojí doslova: *„The view used to render a fixed 33 and 75
percent of pot regardless, which described neither."* Pohled tedy **opravený
byl** — a tahle otázka už jednou rozhodnutá je.

**Co opravené nezůstalo, je simulátor linky.** `betSizeBB()` žádný takový
řetězec nemá a model používá bezpodmínečně. A jeho výsledek se hráči ukazuje:
[postflopView.ts:699](../../src/ui/postflopView.ts#L699) vypisuje
*„Bank po akci {potBBAfter} BB"*.

**Změřeno 13. 10. 2026** na všech 76 rodinách té tabulky:

| | velikost ve stromě je u | rozchází se s modelem |
|---|---|---|
| `BET_SMALL` (model 0,33) | 20 rodin | **17 = 85,0 %** |
| `BET_BIG` (model 0,75) | 63 rodin | **63 = 100,0 %** |

Rozdělení: `BET_SMALL` je ve stromě 0,75 (9 rodin), 0,5 (4), 0,25 (4), 0,33 (3).
`BET_BIG` je **0,50 u všech 63**, nikdy 0,75.

**Takže hráč u 63 rodin vidí na tlačítku půlpotovou sázku a pod ní banku
spočítanou ze tří čtvrtin.** To není chybějící číslo, to jsou dvě čísla, která
si odporují — tedy přesně to, čemu se princip „jedno prázdné místo je lepší než
dvě čísla, ze kterých jedno tiše lže" chtěl vyhnout.

Jedna dobrá zpráva: simulátor sám SPR nepočítá, takže si tím **nevybírá jiné
pravidlo**. Je to vada zobrazení, ne vada obsahu.

---

## Tvoje odpověď

**1) Mám ten rozpor v simulátoru opravit, tedy dát `betSizeBB()` tentýž řetězec,
jaký má pohled (velikost ze stromu, 0,33/0,75 jen jako záloha)?**

```
ANO / NE:
```

*Tohle podle mě není otázka produktu, ale vada — pohled už rozhodnutý je a tabulka
velikostí existuje právě proto. Ptám se jen proto, že jde o změnu dodaného
chování: banka po akci se u 63 rodin změní. Doporučuji ano. Je to práce na
půl dne a `verify:block` to pokryje.*

**2) Až bude banka souhlasit — dodat i cenu hrdinovy vlastní sázky?**

```
ANO, u vyřešených rodin ji spočítat z velikosti ve stromě
  /  NE, nechat tam prázdno jako dnes

Volím:
```

*Argument z 28. 8. („velikost je model") u vyřešených rodin **padá** — ve stromě
je. Zbývá ale jiná věc, kterou musím říct: těch 20 rodin s velikostí pro
`BET_SMALL` je z 76, takže by cena u vlastní sázky dojít **nemohla všude** a
vznikla by nerovnost mezi rodinami. Proto se ptám a nerozhoduji za tebe.*

**3) Flopová EV jako EV (těch 342 nocí) — zavřít, nebo nechat otevřené?**

```
ZAVŘÍT (bod 247 platí, k tomu se nevracíme)
  /  NECHAT OTEVŘENÉ pro případ, že přijde solver, který counterfactual values vypisuje

Volím:
```

*Bod 131 to měl zapsané přesně: „Co by rozhodnutí změnilo: solver, který
counterfactual values vypisuje — pak je to práce, ne výzkum." Ve dvanácti
dumpech je dnes **nula** výskytů klíče začínajícího `"ev`.*

---

*Rovnoměrný vývoj, o který ti jde, tímhle nespadne: flop má frekvenci ve 100 %
a cenu ve 25 % spotů, a to prázdné místo je pojmenované a hlídané bránou, ne
zamlčené. Bloker by vznikl z toho druhého — z čísla, které se tiše rozchází se
stromem. Proto to měření navrhuju udělat dřív než cokoli dalšího.*
