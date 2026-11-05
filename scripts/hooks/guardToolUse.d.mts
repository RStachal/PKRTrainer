/**
 * Typy k `guardToolUse.mjs`. Hook je čistý JavaScript, protože ho Claude Code
 * spouští před každým voláním nástroje a nesmí čekat na překlad.
 *
 * `declare` u každé deklarace: `scriptsParse.test.ts` překládá i tenhle soubor
 * jako běžný modul a bez něj by `const` bez hodnoty neprošel.
 */
export declare const REPO: string;
export declare const LOCK_DIR: string;

export interface SuiteLock {
  name: string;
  kind: string;
  pid: number;
  startedAt?: string;
}

export interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
}

export interface Verdict {
  block: boolean;
  reason?: string;
}

export declare function inSolverWindow(now: Date): boolean;
export declare function liveLocks(lockDir?: string, now?: number): SuiteLock[];
export declare function decide(
  input: HookInput,
  options?: { now?: Date; locks?: () => SuiteLock[]; repo?: string },
): Verdict;
