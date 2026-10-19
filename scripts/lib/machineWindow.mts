import { cpus, freemem, totalmem } from "node:os";

/**
 * Kolik ze stroje si tenhle běh smí vzít, podle toho, kolik je hodin.
 *
 * ## Proč to musí vzniknout
 *
 * Majitel 10. 9. 2026: „V okně 7 - 21 můžeme HW vytěžovat jen částečně."
 * Do té chvíle to pravidlo v projektu nikde nebylo - noční okno bylo popsané
 * a hlídané, denní ne, takže se dlouhá měření pouštěla přes den na plný plyn.
 * Stroj je přitom přes den **jeho pracovní stroj**: naměřeno v 10:20, kdy nic
 * z projektu neběželo, **9,7 GB volných z 31,2**, tedy dvě třetiny paměti drží
 * jeho vlastní práce.
 *
 * ## Co znamená „částečně"
 *
 * Půlka logických jader a nechat aspoň čtvrtinu paměti volnou. Není to
 * odvozené z teorie, je to nejmenší zásah, který splňuje zadání a dá se
 * zkontrolovat: při osmi jádrech ze šestnácti zůstane stroj plynulý i pod
 * zátěží, kdežto při šestnácti se zadrhává i psaní.
 *
 * V noci (21:00-07:00) platí opak a je to popsané v `MTT_AUTONOMY.md`: stroj
 * patří solveru a bere si ho celý.
 *
 * ## Jak to používat
 *
 * Nástroj, který umí běžet paralelně, se zeptá na `workerCap()` a nepřekročí
 * ho. Nástroj, který běží dlouho a na jednom jádře, nemusí dělat nic - jedno
 * jádro ze šestnácti je z definice „částečně". Ale **říct, jak dlouho to
 * potrvá, má oboje**: běh, o kterém majitel neví, že poběží tři hodiny, je
 * horší než běh, který si vezme víc jader.
 */

export type MachineWindow = "DEN" | "NOC" | "VÍKEND";

/**
 * Denní okno je 07:00-21:00 ve všední den; noc a celý víkend jsou plné.
 *
 * Víkend platí od 15. 10. 2026, slovy majitele: „stroj na vývoj a solvení na
 * 100 % můžeš využít v těchto termínech: pondělí až pátek 21 - 7, kdykoli
 * o víkendu. Přes den zde asi na 50 % částečně používáme HW."
 */
export function machineWindow(now = new Date()): MachineWindow {
  const day = now.getDay();
  if (day === 0 || day === 6) return "VÍKEND";
  const hour = now.getHours();
  return hour >= 7 && hour < 21 ? "DEN" : "NOC";
}

/** Nejvyšší počet souběžných procesů, který si běh v tomhle okně smí vzít. */
export function workerCap(now = new Date()): number {
  const logical = Math.max(1, cpus().length);
  return machineWindow(now) === "DEN" ? Math.max(1, Math.floor(logical / 2)) : logical;
}

/**
 * Věta o tom, co si běh bere a v jakém okně, k vypsání na začátku.
 *
 * Píše se **před** prací, ne po ní. Odhad délky je povinný argument schválně:
 * bez něj se nedá poznat, jestli běh doběhne do konce denního okna, a přesně
 * na tom stálo zadání.
 */
export function windowNotice(workers: number, expectedMinutes: number): string {
  const window = machineWindow();
  const cap = workerCap();
  const free = freemem() / 1024 ** 3;
  const total = totalmem() / 1024 ** 3;
  const over = window === "DEN" && workers > cap;
  return [
    `okno ${window}, beru ${workers} z ${cpus().length} jader (strop ${cap})`,
    `odhad ${expectedMinutes.toFixed(0)} min, volná paměť ${free.toFixed(1)} z ${total.toFixed(1)} GB`,
    over ? "POZOR: přes denní strop, běž s --force jen když to majitel ví" : "",
  ].filter(Boolean).join("; ");
}
