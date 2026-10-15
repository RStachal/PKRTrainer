/**
 * Kdy ranní cyklus smí přeskočit přegenerování packu.
 *
 * Testuje se to důkladněji než ostatní brány, protože **chyba na jednu stranu
 * je tichá**: přeskočená rodina, která se změnit měla, znamená zastaralý obsah
 * u hráče a nic o tom nezakřičí. Každý test proto říká, na kterou stranu se
 * v tom případě musí mýlit.
 */
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  familiesToGenerate,
  newestCheckpointMs,
  newestRiverLayerMs,
  newestTurnLayerMs,
  packSlug,
  sharedInputsHash,
  type PackInputsRecord,
} from "../../scripts/lib/packInputs.mts";

const FAMILY = "MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR";
const STREET = "flop";

/** Kostra na disku: rodina s jedním checkpointem a hotovým packem. */
function scaffold(options: { withPack?: boolean; checkpointMs?: number } = {}): {
  checkpointRoot: string;
  packDir: string;
  checkpointMs: number;
} {
  const root = mkdtempSync(join(tmpdir(), "pack-inputs-"));
  const checkpointRoot = join(root, "checkpoints");
  const packDir = join(root, "packs");
  mkdirSync(join(checkpointRoot, FAMILY, "raw"), { recursive: true });
  mkdirSync(packDir, { recursive: true });
  const checkpoint = join(checkpointRoot, FAMILY, "raw", `pkrtrainer_${FAMILY}_742r.json`);
  writeFileSync(checkpoint, "{}", "utf8");
  if (options.checkpointMs !== undefined) {
    const seconds = options.checkpointMs / 1000;
    utimesSync(checkpoint, seconds, seconds);
  }
  if (options.withPack !== false) {
    writeFileSync(join(packDir, `${packSlug(FAMILY)}.generated.json`), "{}", "utf8");
  }
  return { checkpointRoot, packDir, checkpointMs: newestCheckpointMs(checkpointRoot, FAMILY) };
}

function decide(
  record: Record<string, PackInputsRecord>,
  shared: string,
  scaffolded: { checkpointRoot: string; packDir: string },
) {
  return familiesToGenerate({
    street: STREET,
    families: [FAMILY],
    checkpointRoot: scaffolded.checkpointRoot,
    packDir: scaffolded.packDir,
    shared,
    record,
  });
}

describe("familiesToGenerate", () => {
  it("přeskočí rodinu, jejíž checkpointy ani sdílené vstupy se nezměnily", () => {
    // Tenhle případ je celý smysl brány: 32 checkpointů z 27. 7. 2026, 6 GB,
    // 112,5 minuty každé ráno na bajt za bajt tentýž pack.
    const scaffolded = scaffold();
    const decision = decide(
      { [`${STREET}:${FAMILY}`]: { shared: "abc", checkpointMs: scaffolded.checkpointMs } },
      "abc",
      scaffolded,
    );
    expect(decision.skipped).toEqual([FAMILY]);
    expect(decision.generate).toEqual([]);
  });

  it("generuje, když přišel novější checkpoint", () => {
    const scaffolded = scaffold();
    const decision = decide(
      { [`${STREET}:${FAMILY}`]: { shared: "abc", checkpointMs: scaffolded.checkpointMs - 60_000 } },
      "abc",
      scaffolded,
    );
    expect(decision.generate).toEqual([FAMILY]);
  });

  it("generuje, když se změnily sdílené vstupy", () => {
    // Tabulka velikostí sázek nebo generátor: packy z nich nesou obsah, takže
    // jejich změna musí přegenerovat **všechno**, i rodiny bez nových desek.
    const scaffolded = scaffold();
    const decision = decide(
      { [`${STREET}:${FAMILY}`]: { shared: "stary-otisk", checkpointMs: scaffolded.checkpointMs } },
      "novy-otisk",
      scaffolded,
    );
    expect(decision.generate).toEqual([FAMILY]);
  });

  it("generuje, když o rodině není záznam", () => {
    // Prázdný záznam znamená „nevím" - a nevím se musí vyrobit, ne přeskočit.
    const scaffolded = scaffold();
    expect(decide({}, "abc", scaffolded).generate).toEqual([FAMILY]);
  });

  it("generuje, když pack na disku chybí, i kdyby záznam sedl", () => {
    // Záznam může přežít smazání packu (je v `artifacts/`, pack v `src/`).
    // Věřit záznamu proti disku by znamenalo nedodat pack vůbec.
    const scaffolded = scaffold({ withPack: false });
    const decision = decide(
      { [`${STREET}:${FAMILY}`]: { shared: "abc", checkpointMs: scaffolded.checkpointMs } },
      "abc",
      scaffolded,
    );
    expect(decision.generate).toEqual([FAMILY]);
  });

  it("generuje rodinu bez jediného checkpointu", () => {
    // `checkpointMs === 0` znamená, že se nedá o co opřít. Shoda dvou nul není
    // důkaz, že se nic nezměnilo - je to jen nepřítomnost informace.
    const root = mkdtempSync(join(tmpdir(), "pack-inputs-empty-"));
    mkdirSync(join(root, "packs"), { recursive: true });
    writeFileSync(join(root, "packs", `${packSlug(FAMILY)}.generated.json`), "{}", "utf8");
    const decision = familiesToGenerate({
      street: STREET,
      families: [FAMILY],
      checkpointRoot: join(root, "checkpoints"),
      packDir: join(root, "packs"),
      shared: "abc",
      record: { [`${STREET}:${FAMILY}`]: { shared: "abc", checkpointMs: 0 } },
    });
    expect(decision.generate).toEqual([FAMILY]);
  });

  it("drží záznamy oddělené po ulicích", () => {
    // Flop hotový neznamená turn hotový: každá ulice má vlastní pack a vlastní
    // generátor, takže klíč musí nést ulici.
    const scaffolded = scaffold();
    const record = { [`turn:${FAMILY}`]: { shared: "abc", checkpointMs: scaffolded.checkpointMs } };
    expect(decide(record, "abc", scaffolded).generate).toEqual([FAMILY]);
  });
});

describe("vrstvy rozkladu a verdikt jsou vstup", () => {
  /** Rozklad jedné desky: turnová vrstva a jedna riverová podhra. */
  function layers(atMs: number): string {
    const root = mkdtempSync(join(tmpdir(), "pack-inputs-layers-"));
    const board = join(root, `${FAMILY}__742r`);
    mkdirSync(join(board, "river", "CHECK_CHECK__2d"), { recursive: true });
    writeFileSync(join(board, "plan.json"), "{}", "utf8");
    const turn = join(board, "CHECK_CHECK__2d.json");
    writeFileSync(turn, "{}", "utf8");
    utimesSync(turn, atMs / 1000, atMs / 1000);
    utimesSync(join(board, "river", "CHECK_CHECK__2d"), atMs / 1000, atMs / 1000);
    utimesSync(join(board, "river"), atMs / 1000, atMs / 1000);
    return root;
  }

  const base = (scaffolded: { checkpointMs: number }, extra: Partial<PackInputsRecord> = {}) => ({
    [`turn:${FAMILY}`]: { shared: "abc", checkpointMs: scaffolded.checkpointMs, ...extra },
  });

  it("čte čas vrstev ze souborů turnu a z adresářů riveru, plán nepočítá", () => {
    const root = layers(Date.parse("2026-10-05T10:00:00Z"));
    expect(newestTurnLayerMs(root, FAMILY)).toBe(Date.parse("2026-10-05T10:00:00Z"));
    expect(newestRiverLayerMs(root, FAMILY)).toBe(Date.parse("2026-10-05T10:00:00Z"));
    expect(newestTurnLayerMs(root, "MTT9_25BB_JINA_SRP")).toBe(0);
  });

  it("generuje turn, když rozklad přinesl novější vrstvy - i při stejném checkpointu", () => {
    // Přesně 15. 10. 2026: 7 ze 48 turnových packů starších než jejich vrstvy.
    const scaffolded = scaffold();
    const decision = familiesToGenerate({
      street: "turn", families: [FAMILY], checkpointRoot: scaffolded.checkpointRoot, packDir: scaffolded.packDir,
      shared: "abc", record: base(scaffolded, { layersMs: 1_000 }), layersMs: () => 2_000,
    });
    expect(decision.generate).toEqual([FAMILY]);
  });

  it("přeskočí turn, když se nezměnily ani vrstvy", () => {
    const scaffolded = scaffold();
    const decision = familiesToGenerate({
      street: "turn", families: [FAMILY], checkpointRoot: scaffolded.checkpointRoot, packDir: scaffolded.packDir,
      shared: "abc", record: base(scaffolded, { layersMs: 2_000, verdict: "ACCEPTED|h|MECHANICAL" }),
      layersMs: () => 2_000, verdictFor: () => "ACCEPTED|h|MECHANICAL",
    });
    expect(decision.skipped).toEqual([FAMILY]);
  });

  it("generuje, když se změnil verdikt - druhý průchod ranního cyklu", () => {
    // Do 15. 10. 2026 nepřegeneroval nic: první průchod těmže rodinám právě
    // zapsal tytéž vstupy a verdikt mezi nimi nebyl. Nová rodina zůstala LOW.
    const scaffolded = scaffold();
    const decision = familiesToGenerate({
      street: "turn", families: [FAMILY], checkpointRoot: scaffolded.checkpointRoot, packDir: scaffolded.packDir,
      shared: "abc", record: base(scaffolded, { layersMs: 2_000, verdict: "" }),
      layersMs: () => 2_000, verdictFor: () => "ACCEPTED|h|MECHANICAL",
    });
    expect(decision.generate).toEqual([FAMILY]);
  });

  it("starý záznam bez nových polí neví, a tedy se generuje", () => {
    const scaffolded = scaffold();
    const decision = familiesToGenerate({
      street: "turn", families: [FAMILY], checkpointRoot: scaffolded.checkpointRoot, packDir: scaffolded.packDir,
      shared: "abc", record: base(scaffolded), layersMs: () => 2_000, verdictFor: () => "",
    });
    expect(decision.generate).toEqual([FAMILY]);
  });
});

describe("sharedInputsHash", () => {
  it("se změní, když se změní obsah kteréhokoli vstupu", () => {
    const root = mkdtempSync(join(tmpdir(), "shared-"));
    const file = join(root, "a.ts");
    writeFileSync(file, "prvni", "utf8");
    const before = sharedInputsHash([file]);
    writeFileSync(file, "druhy", "utf8");
    expect(sharedInputsHash([file])).not.toBe(before);
  });

  it("se nezmění, když se přepíše tentýž obsah", () => {
    // Přesně tohle dělá cyklus s tabulkou velikostí sázek každé ráno. Kdyby
    // otisk šel podle času zápisu, nepřeskočilo by se nikdy nic.
    const root = mkdtempSync(join(tmpdir(), "shared-same-"));
    const file = join(root, "a.ts");
    writeFileSync(file, "stejny", "utf8");
    const before = sharedInputsHash([file]);
    utimesSync(file, Date.now() / 1000 + 600, Date.now() / 1000 + 600);
    writeFileSync(file, "stejny", "utf8");
    expect(sharedInputsHash([file])).toBe(before);
  });

  it("chybějící vstup odliší od prázdného", () => {
    const root = mkdtempSync(join(tmpdir(), "shared-missing-"));
    const missing = join(root, "chybi.ts");
    const empty = join(root, "prazdny.ts");
    writeFileSync(empty, "", "utf8");
    expect(sharedInputsHash([missing])).not.toBe(sharedInputsHash([empty]));
  });
});

describe("packSlug", () => {
  it("přeloží jméno rodiny na jméno souboru packu", () => {
    expect(packSlug(FAMILY)).toBe("mtt9-100bb-sb-bb-srp-oop-cbet-highspr");
    expect(packSlug("MTT9_40BB_UTG_2_HJ_SRP")).toBe("mtt9-40bb-utg-2-hj-srp");
  });
});
