// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The trainer graded every answer and then forgot it until the dashboard, so a
// player working through spots had nothing in front of them that moved. The
// streak is the part that pulls; the tally is what keeps it honest, because a
// streak alone hides a bad session.
//
// Since 4. 11. 2026 this runs on the new GUI only (the classic training screen
// was removed); the scoreboard sits in the trainer frame's head.

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const GAME = ".training__game";
const ACTION = `${GAME} .dx-trainer__actions button`;
/** Outcomes the scoreboard counts as a hit (`isHit` in sessionScore.ts). */
const HITS = new Set(["BEST", "CORRECT", "EQUIVALENT", "ACCEPTABLE"]);

async function startSession(): Promise<HTMLElement> {
  vi.resetModules();
  document.body.innerHTML = "";
  const { bootstrap } = await import("../../src/main");
  const root = document.createElement("div");
  document.body.appendChild(root);
  bootstrap({ root, storage: new MemoryStorage(), registerSw: false });
  root.querySelector<HTMLButtonElement>(".filter-start")?.click();
  // The preflop pack is fetched, so the session appears a tick after the click.
  // Asserting straight away tests an empty panel, which is how the first version
  // of this file passed its opening case and clicked nothing in the other two.
  await vi.waitFor(() => {
    expect(root.querySelector<HTMLElement>(GAME)?.hidden).toBe(false);
    expect(root.querySelector(ACTION)).not.toBeNull();
  }, { timeout: 15000 });
  return root;
}

/**
 * Answer the current spot and report how it was graded.
 *
 * Which button is right is only revealed after the click, so a test cannot
 * choose to be wrong. The first version of this file pretended it could and
 * failed differently on every run. So this observes instead of forcing, and the
 * caller keeps its own expectation from what actually happened.
 */
async function answer(root: HTMLElement, index = 0): Promise<boolean> {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>(ACTION)];
  buttons[index % buttons.length]?.click();

  const outcome = root.querySelector<HTMLElement>(`${GAME} .dx-trainer__verdict .dx-chip`)?.dataset.outcome ?? "";
  expect(outcome, "the answer was graded").not.toBe("");
  const hit = HITS.has(outcome);

  root.querySelector<HTMLButtonElement>(`${GAME} .dx-trainer__next`)?.click();
  await vi.waitFor(() => {
    expect(root.querySelector(`${ACTION}:not(:disabled)`)).not.toBeNull();
  }, { timeout: 15000 });
  return hit;
}

describe("session scoreboard", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("starts a session at zero", async () => {
    const root = await startSession();
    const streak = root.querySelector<HTMLElement>(`${GAME} .dx-trainer__streak`);
    expect(streak?.textContent).toBe("Série 0");
    // Nothing to celebrate before the first answer.
    expect(streak?.dataset.hot).toBe("false");
    expect(root.querySelector(`${GAME} .dx-trainer__tally`)?.textContent).toBe("Zatím bez odpovědí");
  });

  it("tracks what the grader actually decided, answer after answer", async () => {
    // Six spots, cycling through the offered buttons so both outcomes turn up,
    // with the expectation computed from the grading rather than assumed. This
    // is the strongest claim a DOM test can make here; the rule itself lives in
    // sessionScore.test.ts, where outcomes can be chosen.
    const root = await startSession();
    let expectedStreak = 0;
    let answered = 0;
    let correct = 0;

    for (let index = 0; index < 6; index += 1) {
      const hit = await answer(root, index);
      answered += 1;
      if (hit) {
        correct += 1;
        expectedStreak += 1;
      } else {
        expectedStreak = 0;
      }

      const streak = root.querySelector<HTMLElement>(`${GAME} .dx-trainer__streak`)!;
      expect(streak.textContent, `after ${answered} answers`).toBe(`Série ${expectedStreak}`);
      expect(streak.dataset.hot).toBe(String(expectedStreak >= 3));
      // The tally must keep showing the session even right after a miss, or a
      // mistake would erase the evidence that anything was played.
      expect(root.querySelector(`${GAME} .dx-trainer__tally`)?.textContent)
        .toContain(`${correct} z ${answered} správně`);
    }
  });
});
