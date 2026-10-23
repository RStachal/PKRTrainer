// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The trainer graded every answer and then forgot it until the dashboard, so a
// player working through spots had nothing in front of them that moved. The
// streak is the part that pulls; the tally is what keeps it honest, because a
// streak alone hides a bad session.

import { CS } from "../../src/ui/cs";

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

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
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(false);
    expect(root.querySelector(".action-btn")).not.toBeNull();
  }, { timeout: 15000 });
  return root;
}

/**
 * Answer the current spot and report how it was graded.
 *
 * Which button is right is only revealed after the click - `--recommended` is
 * added during the reveal - so a test cannot choose to be wrong. The first
 * version of this file pretended it could, picking "any button that is not the
 * recommended one" while nothing was recommended yet, and then asserted a broken
 * streak that was often not broken at all. It failed differently on every run.
 *
 * So this observes instead of forcing, and the caller keeps its own expectation
 * from what actually happened.
 */
async function answer(root: HTMLElement, index = 0): Promise<boolean> {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>(".action-btn")];
  buttons[index % buttons.length]?.click();

  const result = root.querySelector<HTMLElement>(".result");
  const verdict = root.querySelector<HTMLElement>(".result__verdict")?.textContent ?? "";
  // The scoreboard counts an equivalent or acceptable answer as a hit, so the
  // correct/wrong class alone is not the rule - the verdict text carries it.
  const hit = result?.classList.contains("result--correct") === true ||
    verdict === CS.training.equivalent ||
    verdict === CS.training.acceptable;

  root.querySelector<HTMLButtonElement>(".result__next")?.click();
  await vi.waitFor(() => {
    expect(root.querySelector(".action-btn")).not.toBeNull();
  }, { timeout: 15000 });
  return hit;
}

describe("session scoreboard", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("starts a session at zero", async () => {
    const root = await startSession();
    const streak = root.querySelector<HTMLElement>(".training__streak");
    expect(streak).not.toBeNull();
    expect(streak!.dataset.streak).toBe("0");
    // Nothing to celebrate before the first answer.
    expect(streak!.classList.contains("training__streak--hot")).toBe(false);
    expect(root.querySelector(".training__tally")?.textContent).toBeTruthy();
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

      const streak = root.querySelector<HTMLElement>(".training__streak")!;
      expect(streak.dataset.streak, `after ${answered} answers`).toBe(String(expectedStreak));
      expect(streak.classList.contains("training__streak--hot"))
        .toBe(expectedStreak >= 3);
      // The tally must keep showing the session even right after a miss, or a
      // mistake would erase the evidence that anything was played.
      expect(root.querySelector(".training__tally")?.textContent)
        .toContain(`${correct}/${answered}`);
    }
  });
});
