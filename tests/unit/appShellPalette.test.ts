// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

/**
 * The shell reads as a poker client, and the action colours stay the loudest.
 *
 * The owner asked for a game client rather than a form with a poker table in it.
 * The table already had felt; the page around it was neutral navy, so the felt
 * stopped at the table's edge and everything else looked like a settings screen.
 *
 * The constraint that shapes this: colour in this app carries meaning. Action
 * buttons wear their category's colour and the range matrix repeats it, so
 * pressing amber and finding amber is how a player reads the grid. A background
 * that competes with that would cost more than it gains, which is why the felt
 * is low-saturation and the accents are not.
 */

describe("app shell palette", () => {
  it("keeps the action colours distinct from each other", async () => {
    // The property the background must not break. Asserted against the palette
    // the matrix and the buttons share, not against the background itself.
    const { colorForActionKey } = await import("../../src/ui/rangeMatrixView");
    const keys = ["FOLD", "CALL", "OPEN_2X", "3BET", "JAM"] as const;
    const colours = keys.map((key) => colorForActionKey(key as never));
    expect(new Set(colours).size).toBe(keys.length);
  });

  it("states the verdict in colour before any text is read", async () => {
    // The moment a player is here for. A stripe down the leading edge says which
    // way it went at a glance; the text is confirmation rather than discovery.
    const { bootstrap } = await import("../../src/main");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const storage = {
      length: 0, clear: () => undefined, getItem: () => null,
      key: () => null, removeItem: () => undefined, setItem: () => undefined,
    } as Storage;
    bootstrap({ root, storage, registerSw: false });

    const sheet = [...document.querySelectorAll("style")]
      .map((node) => node.textContent ?? "").join("\n");
    expect(sheet).toContain(".result--correct");
    expect(sheet).toContain(".result--wrong");
    // Distinct leading edges, not two shades of the same idea.
    expect(sheet).toMatch(/\.result--correct\{[^}]*border-left:4px solid #2bd576/);
    expect(sheet).toMatch(/\.result--wrong\{[^}]*border-left:4px solid #e23b3b/);
  });

  it("respects a player who asked for less motion", async () => {
    const sheet = [...document.querySelectorAll("style")]
      .map((node) => node.textContent ?? "").join("\n");
    // Every animation added here has an escape, because a trainer is used for
    // hours and motion someone did not ask for is a reason to stop.
    expect(sheet).toContain("prefers-reduced-motion");
  });

  it("paints the page in felt, not navy", async () => {
    const sheet = [...document.querySelectorAll("style")]
      .map((node) => node.textContent ?? "").join("\n");
    const body = /body\{[^}]*\}/.exec(sheet)?.[0] ?? "";
    expect(body, "no body rule found").not.toBe("");
    // Green in the page background, which is what makes it read as a table
    // rather than a settings screen.
    expect(body).toMatch(/rgba\(34,150,96/);
  });
});
