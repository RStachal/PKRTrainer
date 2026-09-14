# Flopové piloty – třetí čtení, 14. 9. 2026

Čtenář: Radim, nad mixem (stránka od 9. 9. kreslí celý mix, ne jednu barvu
na třídu). Token zapsaný přes `npm run mtt:pilot-answers`:

```
DRILLEV-PILOT-V1 0ce021c9 0x123 1x12 2x14 3x145 4x123 5x134 6o
```

Verdikty jsou v `verdicts.json` (basis `PLAYER_READ`); tady jsou důvody, které
token neunese a bez kterých by se příště nevědělo, co se hledalo.

## 0. BTN vs BB SRP c-bet – ✗ (1, 2, 3)

Range není otevírací range BTN. Chybí A9s–A7s, K9s–K6s a 22/33/44 – přesně
to, co má pilot 4 na CO – ale jsou tam K5s, K4s, 53s, 43s. Tvar 3bet/bluff
range, ne open range; BTN vychází užší (50 tříd) než CO (54). Na 20 bb AA
checkuje 57 %, zatímco A3s sází 57 % a K4s 60 %. Na 80 bb sází 54s 85 % a
43s 82 %, víc než AA (82 %) a dvakrát tolik co 66 (52 %). BET_BIG na 50 bb
0 %, na 80 bb v nabídce vůbec není – strom měl jedinou velikost.

**Ověřeno 14. 9. 2026 v parametrech solvu** (`mtt:solver-range-drift`):
`set_range_ip` rodiny `MTT9_50BB_BTN_BB_SRP` opravdu nemá 22–44 ani A9s–A7s
a má K5s:0.25, K4s:0.25, 53s, 43s. Není to vada pilota, ale vstupní range
solvu – a stojí pod flopovým, turnovým i riverovým packem té rodiny.

## 1. BTN vs BB SRP facing-bet – ✗ (1, 2)

Hlavička na SPR<3 říká RAISE, ale range raisuje 27 % a calluje 49 %; u 29
z 58 tříd nemá nejsilnější akce ani polovinu. Na 25 bb AA raisuje 15 % – míň
než KTs (44 %), 53s (37 %), T9s (37 %) i KQs (36 %); 55 raisuje 6 %. Na
100 bb je největší raiser 22 (36 %). AA/KK/QQ/AKs sedí na 25 bb v callovací
range BB, kam při té hloubce nepatří.

## 2. BTN vs CO 3bet-pot c-bet – ✗ (1, 4)

Na 80 bb nemá nejsilnější akci nad 50 % ani jedna z 34 tříd (medián 40 %),
range se dělí 36/32/32; AA hraje 44/43/13. Přes hloubky si to odporuje:
CHECK (SPR<3) → BET_BIG (3–8) → BET_SMALL (8–20) v témže uzlu. Range sama
je v pořádku – problém je strategie nad ní.

## 3. BTN vs CO 3bet-pot facing-bet – ✗ (1, 4, 5)

Na SPR<3 hlavička říká RAISE, mix je CALL 39 / RAISE 36, u 30 ze 42 tříd
chybí většinová akce. Pásmo 8–20 stojí na 6 deskách (ostatní 24–25) a range
se v něm scvrkne ze 42 na 27 tříd. Mění se i sázka soupeře, na kterou se
odpovídá: BET_52, BET_52, BET_39. V šestideskovém vzorku JJ raisuje 2 %,
zatímco 77 raisuje 40 %.

## 4. CO vs BB SRP c-bet – ✗ (1, 2, 3)

Na SPR<3 je range 49 % CHECK vs 49 % BET_SMALL – „doporučuje CHECK" stojí na
remíze o jeden bod. AA sází 52 %, míň než AKo (67 %), ATo (66 %) i QTo
(66 %), zatímco JTs, 98s a 54s checkují 66–67 %. BET_BIG 2 % na 25 bb, na 50
i 100 bb vůbec není.

## 5. SB vs BB SRP OOP c-bet – ✗ (1, 3, 4)

Přes hloubky: BET_SMALL 56 % (25 bb) → BET_SMALL 60 % (50 bb) → CHECK 60 %
(100 bb); stejná sedačka, stejných 32 desek, doporučení se mezi 50 a 100 bb
otočí. BET_BIG 7 % → 0 % → není. Na 25 bb sází A7o a A9o 78 %, zatímco KQs
53 %, KTs 51 %, KJs 47 %. Na 100 bb nejméně sázejí 77 (25 %), 66 (27 %),
55 (28 %) a 43s sází 50 %.

## 6. UTG vs BB SRP c-bet – ✓

Jediný pilot, který drží pohromadě. Range (36 tříd) odpovídá otevření z UTG
(~20 %). Medián nejsilnější akce 71 % a žádná z 36 tříd není pod 50 %.
Řazení dává smysl: AA 85 %, KK 81 %, AKs 81 %, KQo 80 % nahoře; ATs 54 %,
AJs 61 %, QJs 65 % dole; A2s/A3s 75–77 % jako bluffy. Výhrada mimo hru:
BET_BIG 1 % = jediná velikost ve stromu, pilot kryje jen SPR 3–8.
