import { beforeAll, describe, expect, it } from "vitest";

import { runtimeSolvedTurnPacks } from "../../src/data/ranges/turnSolvedRuntimeRegistry";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";

/**
 * Kontrola všeho, co se z turnu dodává, proti solverovým vlastním frekvencím.
 *
 * Detektor odchylek porovnává rodiny mezi sebou, takže chybu, kterou by udělal
 * celý pipeline stejně, nepozná - to je v jeho komentáři napsané jako vědomá
 * mez. Tohle je ta druhá strana: nesrovnává rodiny, ale každý kbelík se
 * strategií, ze které vznikl.
 *
 * Kbelík tvrdí, že jeho ruce hrají nějakou akci. Frekvence v `mix` říkají, jak
 * často která akce padne. Když se ty dvě věci rozejdou, čte se strategie špatně
 * - a je to chyba, kterou zvenku nikdo nepozná, protože pack vypadá úplně stejně.
 *
 * Měřeno při zavedení: 8 290 kbelíků, nula neshod. Test má hlídat, aby to tak
 * zůstalo i s rodinami, které teprve přibudou.
 */
describe("konzistence kbelíků s frekvencemi", () => {
  beforeAll(async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  });

  it("označená akce kbelíku je jeho nejčastější", () => {
    const mismatched: string[] = [];
    let buckets = 0;
    for (const pack of runtimeSolvedTurnPacks) {
      for (const rule of pack.rules) {
        for (const bucket of rule.buckets) {
          buckets += 1;
          const mix = bucket.mix ?? [];
          if (mix.length === 0) {
            mismatched.push(`${rule.sourceDirectory}: ${bucket.action} bez frekvencí`);
            continue;
          }
          const top = [...mix].sort((left, right) => right.frequency - left.frequency)[0];
          if (top.action !== bucket.action) {
            mismatched.push(`${rule.sourceDirectory}: kbelík ${bucket.action}, nejčastější ${top.action}`);
          }
        }
      }
    }
    expect(buckets).toBeGreaterThan(1000);
    expect(mismatched.slice(0, 5)).toEqual([]);
  });

  it("frekvence v kbelíku dávají dohromady jedničku", () => {
    // Součet mimo jedničku znamená, že se při průměrování přes třídy něco
    // ztratilo nebo přičetlo dvakrát - a strategie, která nesečte na sto procent,
    // není strategie.
    const off: string[] = [];
    for (const pack of runtimeSolvedTurnPacks) {
      for (const rule of pack.rules) {
        for (const bucket of rule.buckets) {
          const total = (bucket.mix ?? []).reduce((sum, item) => sum + item.frequency, 0);
          if (Math.abs(total - 1) > 0.02) {
            off.push(`${rule.sourceDirectory}: ${bucket.action} = ${total.toFixed(3)}`);
          }
        }
      }
    }
    expect(off.slice(0, 5)).toEqual([]);
  });

  it("žádná třída neleží ve dvou kbelících téhož pravidla", () => {
    // Ruka se dvěma převažujícími akcemi neexistuje; kdyby se objevila, resolver
    // by podle pořadí kbelíků vydal jednu z nich a druhou zahodil.
    const duplicated: string[] = [];
    for (const pack of runtimeSolvedTurnPacks) {
      for (const rule of pack.rules) {
        const seen = new Set<string>();
        for (const bucket of rule.buckets) {
          for (const handClass of bucket.handClasses) {
            if (seen.has(handClass)) duplicated.push(`${rule.sourceDirectory}: ${handClass}`);
            seen.add(handClass);
          }
        }
      }
    }
    expect(duplicated.slice(0, 5)).toEqual([]);
  });
});
