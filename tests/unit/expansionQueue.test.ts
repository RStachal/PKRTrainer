import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildExpansionQueue,
  familiesFinishingWithin,
  parseQueueFileName,
  QUEUE_STEM_PATTERN,
  queuedFamilies,
  queueRunway,
  runnerOrder,
  type CheckpointProbe,
} from "../../scripts/lib/expansionQueue.mts";

/**
 * Fronta noční expanze se čte na sedmi místech a rozhoduje o noci. Testy hlídají
 * dvě věci: že deska je jedna, ať ji nese kolik souborů chce, a že TypeScript
 * čte jména stejně jako runner v Pythonu - ten frontu doopravdy solví.
 */

const BASE = "out";
const checkpointOf = (family: string, board: string) => (
  `${BASE}/${family}/raw/pkrtrainer_${family}_${board}.json`.replace(/\//g, "\\")
);
const normalize = (path: string) => path.replace(/\//g, "\\");

function probe(solved: string[] = [], failed: Record<string, number> = {}): CheckpointProbe {
  const done = new Set(solved.map(normalize));
  const levels = new Map(Object.entries(failed).map(([path, level]) => [normalize(path), level]));
  return {
    solved: (checkpoint) => done.has(normalize(checkpoint)),
    failedLevel: (checkpoint) => levels.get(normalize(checkpoint)) ?? 0,
  };
}

describe("jméno souboru ve frontě", () => {
  it("rozloží číslo, rodinu a desku i u sedačky s podtržítkem", () => {
    expect(parseQueueFileName("0035_MTT9_40BB_UTG_1_BTN_SRP_742r.txt")).toEqual({
      name: "0035_MTT9_40BB_UTG_1_BTN_SRP_742r.txt",
      index: 35,
      familyId: "MTT9_40BB_UTG_1_BTN_SRP",
      boardId: "742r",
    });
    expect(parseQueueFileName("2096_MTT9_25BB_CO_BTN_SRP_AT4mono.txt")?.boardId).toBe("AT4mono");
  });

  it("nebere nic, co runner nebere", () => {
    expect(parseQueueFileName("0001_MTT9_40BB_HJ_BB_SRP_742r.json")).toBeUndefined();
    expect(parseQueueFileName("0001_poznamka.txt")).toBeUndefined();
  });

  it("vzor je tentýž jako v runneru", () => {
    // Dva vzory na dvou místech se rozejdou; runner frontu solví, takže jeho je
    // ten platný. Kdyby se změnil jen jeden, tenhle test spadne.
    const runner = readFileSync("Agents/solver-input/decomposition/run_night_expansion.py", "utf8");
    const found = /re\.match\(r"([^"]+)", stem\)/.exec(runner);
    expect(found, "vzor v pending_boards() nenalezen").not.toBeNull();
    // `re.match` kotví začátek sám; tady ho drží `^`.
    expect(`^${found?.[1]}`).toBe(QUEUE_STEM_PATTERN.source);
  });
});

describe("fronta", () => {
  it("desku nesenou dvěma soubory počítá jednou a bere první podle jména", () => {
    // Přesně případ z 15. 10. 2026: spadlá deska ve dvou kopiích.
    const family = "MTT9_40BB_UTG_BTN_SRP";
    const queue = buildExpansionQueue(
      [`1035_${family}_742r.txt`, `0035_${family}_742r.txt`, `0036_${family}_K98tt.txt`],
      probe([], { [checkpointOf(family, "742r")]: 1 }),
      3,
      BASE,
    );
    expect(queue.boards.map((board) => [board.name, board.state])).toEqual([
      [`0035_${family}_742r.txt`, "RETRY"],
      [`0036_${family}_K98tt.txt`, "FRESH"],
    ]);
    expect(queue.duplicateFiles).toBe(1);
    expect(queue.highestIndex).toBe(1035);
  });

  it("rozliší hotovou, čerstvou, k opakování a vyčerpanou", () => {
    const family = "MTT9_40BB_HJ_BB_SRP";
    const queue = buildExpansionQueue(
      ["0001", "0002", "0003", "0004"].map((index, at) => (
        `${index}_${family}_${["A72r", "883r", "742r", "986tt"][at]}.txt`
      )),
      probe([checkpointOf(family, "A72r")], {
        [checkpointOf(family, "742r")]: 2,
        [checkpointOf(family, "986tt")]: 3,
      }),
      3,
      BASE,
    );
    expect(queue.boards.map((board) => [board.boardId, board.state, board.level])).toEqual([
      ["A72r", "SOLVED", 0],
      ["883r", "FRESH", 0],
      ["742r", "RETRY", 2],
      ["986tt", "EXHAUSTED", 3],
    ]);
  });

  it("rodina ve frontě je držená, i když nemá jediný checkpoint", () => {
    // Bez toho rozšíření sedaček nabízelo k založení rodiny, které ve frontě
    // ležely, a zápis by je zapsal podruhé pod jiným číslem.
    const queue = buildExpansionQueue(
      ["0007_MTT9_40BB_BTN_BB_SRP_A72r.txt", "0008_MTT9_40BB_BTN_BB_SRP_883r.txt"],
      probe(),
      3,
      BASE,
    );
    expect([...queuedFamilies(queue)]).toEqual(["MTT9_40BB_BTN_BB_SRP"]);
  });
});

describe("co noc dokončí", () => {
  const A = "MTT9_40BB_HJ_BTN_SRP";
  const B = "MTT9_40BB_CO_BB_SRP";
  const C = "MTT9_25BB_UTG_BB_SRP";
  const R = "MTT9_40BB_HJ_BB_SRP";
  const boards = (family: string, from: number, count: number) => (
    Array.from({ length: count }, (_, at) => `${String(from + at).padStart(4, "0")}_${family}_b${at}x.txt`)
  );

  it("runner bere čerstvé podle jména a opakované pokusy až po nich", () => {
    const queue = buildExpansionQueue(
      [...boards(R, 1, 1), ...boards(A, 2, 2)],
      probe([], { [checkpointOf(R, "b0x")]: 1 }),
      3,
      BASE,
    );
    expect(runnerOrder(queue).map((board) => board.familyId)).toEqual([A, A, R]);
  });

  it("nic se nepřeskakuje: malá rodina za velkou, která se nevejde, se neslíbí", () => {
    // Batoh by B přeskočil a slíbil C. Runner ale jede popořadě, takže noc
    // skončí uprostřed B a na C nedojde.
    const queue = buildExpansionQueue(
      [...boards(A, 1, 2), ...boards(B, 3, 6), ...boards(C, 9, 1)],
      probe(),
      3,
      BASE,
    );
    const minutes = (family: string) => (family === C ? 5 : 20);
    expect(familiesFinishingWithin(queue, minutes, 100)).toEqual({ families: [A], finishedAt: 40 });
  });

  it("rodina, jejíž jediná deska je opakovaný pokus, čeká na konec fronty", () => {
    const queue = buildExpansionQueue(
      [...boards(R, 1, 1), ...boards(A, 2, 6)],
      probe([], { [checkpointOf(R, "b0x")]: 1 }),
      3,
      BASE,
    );
    expect(familiesFinishingWithin(queue, () => 20, 100).families).toEqual([]);
    expect(familiesFinishingWithin(queue, () => 20, 140).families).toEqual([A, R]);
  });

  it("rodina s vyčerpanou deskou se neslibuje, i když zbytek doběhne", () => {
    const queue = buildExpansionQueue(
      boards(A, 1, 3),
      probe([], { [checkpointOf(A, "b2x")]: 3 }),
      3,
      BASE,
    );
    expect(familiesFinishingWithin(queue, () => 10, 600).families).toEqual([]);
  });

  it("deska bez ceny slib zastaví", () => {
    const queue = buildExpansionQueue(
      [...boards(A, 1, 1), ...boards(B, 2, 1), ...boards(C, 3, 1)],
      probe(),
      3,
      BASE,
    );
    const minutes = (family: string) => (family === B ? undefined : 10);
    expect(familiesFinishingWithin(queue, minutes, 600).families).toEqual([A]);
  });
});

describe("výdrž fronty", () => {
  const A = "MTT9_25BB_UTG_BB_SRP";
  const B = "MTT9_50BB_HJ_BB_SRP";

  it("počítá jen desky, které runner nabídne, a deska bez ceny přidá nula minut", () => {
    const queue = buildExpansionQueue(
      [
        `0001_${A}_A72r.txt`, `0002_${A}_883r.txt`, `0003_${A}_742r.txt`, `0004_${A}_986tt.txt`,
        `0005_${B}_A72r.txt`,
      ],
      probe([checkpointOf(A, "A72r")], {
        [checkpointOf(A, "742r")]: 1,
        [checkpointOf(A, "986tt")]: 3,
      }),
      3,
      BASE,
    );
    // Hotová a vyčerpaná se nepočítají; čerstvá a opakovaný pokus ano.
    const minutes = (family: string) => (family === A ? 6.4 : undefined);
    expect(queueRunway(queue, minutes)).toEqual({ boards: 3, minutes: 12.8 });
  });
});
