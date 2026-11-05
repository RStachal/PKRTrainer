/**
 * Žebřík pokusů noční expanze, čtený z runneru.
 *
 * ## Proč to má vlastní soubor
 *
 * Spadlá deska je od 2. 10. 2026 dvojí: ta, které zbývají stupně žebříku, se
 * příští noc **nabídne** a je to čekající práce; ta, která žebřík vyčerpala,
 * drží rodinu nehotovou navždy. Splést je dohromady znamená lhát v obě strany -
 * hlásit zaseknutou rodinu nad deskou, která má v noci přijít na řadu, nebo
 * naopak mlčet o rodině, která se sama nedokončí.
 *
 * To rozlišení potřebují **dva** skripty: ranní cyklus (rozhoduje, jestli
 * přegenerovat pack) a hlídač noci (hlásí stav). Do 6. 10. 2026 ho měl jen
 * hlídač a ranní cyklus u obou druhů tvrdil „monolit ji už nenabídne" -
 * u desek, které runner tu samou noc znovu zkusil.
 *
 * ## Proč se počet stupňů čte z runneru
 *
 * Dvě čísla na dvou místech se rozejdou. Žebřík vlastní runner (Python), takže
 * je jeho literál jediným zdrojem pravdy a tady se jen čte.
 */
import { readFileSync } from "node:fs";

const RUNNER = "Agents/solver-input/decomposition/run_night_expansion.py";

/**
 * Kolik stupňů má žebřík. Když se vzor nenajde, vrátí 1 - tedy bezpečná strana,
 * na které se každá spadlá deska počítá za vyčerpanou a nahlásí se jako
 * zaseknutá rodina. Volající to má ohlásit jako vadu, ne spolknout: hlídač na to
 * má vlastní řádek `žebřík pokusů se přečetl z runneru`.
 */
export function escalationSteps(): number {
  try {
    const source = readFileSync(RUNNER, "utf8");
    const found = /^ESCALATION = \((.+)\)\s*$/m.exec(source);
    return found === null ? 1 : (found[1].match(/\(/g) ?? []).length || 1;
  } catch {
    return 1;
  }
}

/**
 * Stupeň ze značky `.failed`.
 *
 * Značky z doby před žebříkem (30. 9. 2026) stupeň neuvádějí; čtou se jako
 * první pád, takže dostanou další pokus, ne nekonečno.
 */
export function failureLevel(marker: string): number {
  try {
    const found = /stupen=(\d+)/.exec(readFileSync(marker, "utf8"));
    return found === null ? 1 : Number(found[1]);
  } catch {
    return 1;
  }
}
