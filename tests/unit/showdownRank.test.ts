import { describe, expect, it } from "vitest";

import { compareShowdown, showdownRank } from "../../src/core/showdownRank";

/**
 * Vyhodnocení showdownu je základ výpočtu EV na riveru.
 *
 * Solver EV nevypisuje, takže se dopočítává ze strategie a rangí - a showdown je
 * jediné místo toho výpočtu, kde jde udělat tichou chybu s dopadem na každé
 * číslo. Špatně porovnaná ruka nevyhodí výjimku, jen vrátí věrohodně vypadající
 * EV, které je celé špatně.
 *
 * Testy proto míří na případy, kde se vyhodnocovače pletou: kolo s esem jako
 * jedničkou, barva proti postupce, dva páry s kickerem z desky, a pátá karta,
 * která u dvou hráčů se stejnou dvojicí rozhoduje.
 */
const rank = (cards: string) => showdownRank(cards.split(" "));

describe("síla ruky na showdownu", () => {
  it("řadí kategorie od nejvyšší po nejnižší", () => {
    const order = [
      "As Ks Qs Js Ts", // postupková hromádka
      "9s 9h 9d 9c 2s", // čtveřice
      "8s 8h 8d 3c 3s", // full house
      "As 7s 5s 4s 2s", // barva
      "9s 8h 7d 6c 5s", // postupka
      "4s 4h 4d 9c 2s", // trojice
      "Js Jh 3d 3c 9s", // dva páry
      "Ks Kh 8d 5c 2s", // pár
      "As Jh 8d 5c 2s", // vysoká karta
    ].map((hand) => rank(hand) ?? -1);
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1], `pořadí selhalo na indexu ${index}`)
        .toBeGreaterThan(order[index]);
    }
  });

  it("kolo je nejnižší postupka, ne nejvyšší", () => {
    // Eso platí jako jednička jen tady. Kdyby se to neošetřilo, bylo by kolo
    // nejsilnější postupka - tichá chyba přesně tam, kde se nejmíň hledá.
    const wheel = rank("As 2h 3d 4c 5s") ?? 0;
    const sixHigh = rank("2s 3h 4d 5c 6s") ?? 0;
    const broadway = rank("As Kh Qd Jc Ts") ?? 0;
    expect(wheel).toBeLessThan(sixHigh);
    expect(wheel).toBeLessThan(broadway);
  });

  it("kolo v barvě je postupková hromádka, ne jen barva", () => {
    const wheelFlush = rank("As 2s 3s 4s 5s") ?? 0;
    const plainFlush = rank("As Ks Qs Js 9s") ?? 0;
    expect(wheelFlush).toBeGreaterThan(plainFlush);
  });

  it("ze sedmi karet vybere nejlepší pětici", () => {
    // Deska dává barvu, ruka k tomu nižší pár - barva musí vyhrát nad tím párem.
    const withPair = rank("2h 2d As Ks Qs Js 9s") ?? 0;
    const flushOnly = rank("3h 4d As Ks Qs Js 9s") ?? 0;
    expect(withPair).toBe(flushOnly);
  });

  it("rozhoduje kicker, když je dvojice stejná", () => {
    const board = ["Ks", "9h", "4d", "2c", "7s"];
    // Oba mají pár králů, liší se druhou kartou.
    expect(compareShowdown(["Kh", "Qd"], ["Kc", "Jd"], board)).toBe(1);
    expect(compareShowdown(["Kc", "Jd"], ["Kh", "Qd"], board)).toBe(-1);
  });

  it("stejná ruka je dělený pot", () => {
    const board = ["Ks", "9h", "4d", "2c", "7s"];
    // Oba hrají desku plus stejný kicker; barvy o ničem nerozhodují.
    expect(compareShowdown(["Ah", "Qd"], ["Ad", "Qh"], board)).toBe(0);
  });

  it("barva bije postupku", () => {
    const board = ["9s", "8s", "7h", "2s", "3d"];
    expect(compareShowdown(["As", "4s"], ["Th", "Jd"], board)).toBe(1);
  });

  it("full house bije barvu", () => {
    const board = ["9s", "9h", "7s", "2s", "3s"];
    expect(compareShowdown(["9d", "7h"], ["As", "4s"], board)).toBe(1);
  });

  it("nečitelný vstup se přizná, místo aby vrátil nejhorší ruku", () => {
    // Nula by znamenala "nejhorší možná ruka", což je odpověď. Tady odpověď není.
    expect(showdownRank(["Xx", "2h", "3d", "4c", "5s"])).toBeUndefined();
    expect(showdownRank(["2h", "3d", "4c", "5s"])).toBeUndefined();
    expect(compareShowdown(["Ah", "Kd"], ["Qh", "Jd"], ["2h", "3d"])).toBeUndefined();
  });
});

/**
 * Nezávislá kontrola: rozdělení kategorií na náhodných sedmikaretních rukách.
 *
 * Vybrané případy výše ověří, že vyhodnocovač zná pravidla. Neověří, že je
 * používá na všem - vyhodnocovač může mít systematickou chybu v kategorii, kterou
 * jsem nevymyslel, a všechny ruční testy projdou.
 *
 * Četnosti kategorií mezi všemi C(52,7) sedmikaretními kombinacemi jsou ale známé
 * číslo, které s tímhle kódem nemá nic společného. Když se vzorek trefí do nich,
 * je to doklad, jaký ruční případy dát nemohou.
 */
const SEVEN_CARD_SHARE: Record<string, number> = {
  STRAIGHT_FLUSH: 0.000311,
  QUADS: 0.00168,
  FULL_HOUSE: 0.0260,
  FLUSH: 0.0303,
  STRAIGHT: 0.0462,
  TRIPS: 0.0483,
  TWO_PAIR: 0.235,
  PAIR: 0.438,
  HIGH_CARD: 0.174,
};
const CATEGORY_NAMES = [
  "HIGH_CARD", "PAIR", "TWO_PAIR", "TRIPS", "STRAIGHT",
  "FLUSH", "FULL_HOUSE", "QUADS", "STRAIGHT_FLUSH",
];

describe("rozdělení kategorií sedí se známými četnostmi", () => {
  it("vzorek náhodných sedmikaretních ruk odpovídá tabulkovým podílům", () => {
    const deck: string[] = [];
    for (const rankChar of "23456789TJQKA") for (const suit of "shdc") deck.push(`${rankChar}${suit}`);
    expect(deck.length).toBe(52);

    // Vlastní generátor, aby byl běh opakovatelný: náhodný test, který spadne
    // jednou za deset běhů, se přestane číst.
    let seed = 20260819;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const counts = new Map<string, number>();
    const samples = 120000;
    for (let draw = 0; draw < samples; draw += 1) {
      const pool = [...deck];
      const hand: string[] = [];
      for (let pick = 0; pick < 7; pick += 1) {
        hand.push(...pool.splice(Math.floor(next() * pool.length), 1));
      }
      const score = showdownRank(hand);
      expect(score).toBeDefined();
      const category = CATEGORY_NAMES[Math.floor((score ?? 0) / 16 ** 5)];
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    for (const [category, expected] of Object.entries(SEVEN_CARD_SHARE)) {
      const share = (counts.get(category) ?? 0) / samples;
      // Tolerance podle velikosti: u vzácných kategorií rozhoduje vzorkovací šum,
      // u častých by široká mez schovala systematickou chybu.
      const tolerance = Math.max(expected * 0.12, 0.0004);
      expect(
        Math.abs(share - expected),
        `${category}: naměřeno ${(share * 100).toFixed(3)} %, čekáno ${(expected * 100).toFixed(3)} %`,
      ).toBeLessThan(tolerance);
    }
  }, 120000);
});
