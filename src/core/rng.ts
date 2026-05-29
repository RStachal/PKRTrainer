/**
 * Deterministická primitiva (RNG a hash) portovaná 1:1 z legacy baseline
 * (`Legacy/PKRTrainer.html`). Konstanty i bitové operace jsou zachovány beze
 * změny, aby stejný seed vždy produkoval identickou sekvenci napříč buildy.
 *
 * _Requirements: 6.1, 6.2_
 */

/**
 * Deterministický PRNG (mulberry32). Stejný seed ⇒ stejná sekvence ∈ [0, 1).
 *
 * Vrací generátor (closure), který při každém volání vydá další pseudonáhodné
 * číslo. Seed je 32-bit unsigned celé číslo (0 až 4 294 967 295); vnitřní stav
 * se posouvá o konstantu 0x6D2B79F5 a normalizuje přes `>>> 0` na uint32.
 *
 * @param seed Inicializační seed (32-bit unsigned celé číslo).
 * @returns Funkce bez argumentů vracející hodnotu v intervalu [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function (): number {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32-bit hash řetězce → uint32.
 *
 * Offset basis 2166136261, prime 16777619; pro každý znak XOR s code pointem a
 * násobení primem přes `Math.imul`, výsledek normalizován přes `>>> 0`.
 *
 * @param s Vstupní řetězec.
 * @returns 32-bit unsigned hash (0 až 4 294 967 295).
 */
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
