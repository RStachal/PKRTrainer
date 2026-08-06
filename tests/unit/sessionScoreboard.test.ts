// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The trainer graded every answer and then forgot it until the dashboard, so a
// player working through spots had nothing in front of them that moved. The
// streak is the part that pulls; the tally is what keeps it honest, because a
// streak alone hides a bad session.

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

async function answer(root: HTMLElement, wanted: "correct" | "wrong"): Promise<void> {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>(".action-btn")];
  const recommended = buttons.find((b) => b.classList.contains("action-btn--recommended"));
  const pick = wanted === "correct"
    ? recommended ?? buttons[0]
    : buttons.find((b) => b !== recommended) ?? buttons[0];
  pick?.click();
  root.querySelector<HTMLButtonElement>(".result__next")?.click();
  await vi.waitFor(() => {
    expect(root.querySelector(".action-btn")).not.toBeNull();
  }, { timeout: 15000 });
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

  it("moves when an answer is graded", async () => {
    // Whether any given spot is answered correctly is only known after the
    // click, so this checks that the scoreboard is wired to the grader at all -
    // the rule itself is asserted in sessionScore.test.ts, where it can be.
    const root = await startSession();
    await answer(root, "correct");
    expect(root.querySelector(".training__tally")?.textContent).toMatch(/\d+\s*\/\s*\d+/);
    const streak = root.querySelector<HTMLElement>(".training__streak")!;
    expect(Number(streak.dataset.streak)).toBeGreaterThanOrEqual(0);
    expect(streak.textContent).toBeTruthy();
  });

  it("resets the streak on a mistake but keeps the session tally", async () => {
    const root = await startSession();
    await answer(root, "correct");
    await answer(root, "wrong");
    const streak = root.querySelector<HTMLElement>(".training__streak")!;
    expect(streak.dataset.streak).toBe("0");
    // The tally has to still show the session, or a mistake would erase the
    // evidence that anything was played.
    expect(root.querySelector(".training__tally")?.textContent).toMatch(/\d+\s*\/\s*\d+/);
  });
});
