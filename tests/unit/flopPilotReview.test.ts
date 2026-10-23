import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { CLI_SPAWN_TIMEOUT_MS } from "../cliSpawnBudget";
import { generatedMttPostflopPilotPacks } from "../../src/data/ranges/mttPostflopPilotPacks.generated";
import { flopPilotContentHash } from "../../src/data/ranges/turnReviewVerdict";
import { classifyConfidenceClaim } from "../../src/data/ranges/confidenceBacking";
import {
  pilotHeroSeat,
  pilotReviewOrder,
  pilotReviewPageHash,
} from "../../scripts/lib/flopPilotReview.mts";

/**
 * Cesta z `SOLVE_PROVENANCE` do `PLAYER_REVIEW` u flopových pilotů.
 *
 * Majitel 3. 9. 2026 zvolil, že piloty projdou týmž čtením jako turn. Do té
 * doby se ale jejich claim stavěl **bez rodiny a bez otisku**, takže verdikt
 * neměl kam sednout a přečtení by nezměnilo nic. Test hlídá právě to: že se
 * čtení propíše, a že se nepropíše, když nemá na čem stát.
 */
function answers(args: readonly string[]): { out: string; code: number } {
  try {
    const out = execFileSync(
      process.execPath,
      ["scripts/run-cli.mjs", "scripts/applyFlopPilotAnswers.mts", ...args],
      { encoding: "utf8", timeout: CLI_SPAWN_TIMEOUT_MS },
    );
    return { out, code: 0 };
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; status?: number };
    return { out: `${detail.stdout ?? ""}${detail.stderr ?? ""}`, code: detail.status ?? 1 };
  }
}

describe("čtení flopových pilotů", () => {
  it("verdikt na přečtený pilot povýší doklad z původu solvu na čtení", () => {
    const entry = generatedMttPostflopPilotPacks[0];
    const contentHash = flopPilotContentHash(entry.pack.rules);
    const input = {
      packId: "pilot",
      street: "FLOP",
      confidence: "MEDIUM" as const,
      familyId: entry.catalogId,
      contentHash,
      sourceEvidenceCount: 6,
    };

    // Bez verdiktu: pack tvrdí MEDIUM a stojí jen na tom, odkud data jsou.
    const before = classifyConfidenceClaim(input, []);
    expect(before.backing).toBe("SOLVE_PROVENANCE");
    expect(before.overclaims, "MEDIUM bez čtení je tvrzení nad doklad").toBe(true);

    const after = classifyConfidenceClaim(input, [{
      street: "FLOP",
      familyId: entry.catalogId,
      contentHash,
      outcome: "ACCEPTED",
      reviewedAt: "2026-09-03",
      reviewer: "Radim",
      basis: "PLAYER_READ",
    }]);
    expect(after.backing).toBe("PLAYER_REVIEW");
    expect(after.overclaims).toBe(false);
  });

  it("otisk propadne, když se obsah pilota změní", () => {
    const entry = generatedMttPostflopPilotPacks[0];
    const changed = flopPilotContentHash([
      // Táž pravidla, jiná doporučená akce: čtenář posuzoval jinou hru.
      { ...entry.pack.rules[0], recommendedAction: "FOLD" },
      ...entry.pack.rules.slice(1),
    ]);
    expect(changed).not.toBe(flopPilotContentHash(entry.pack.rules));
  });

  it("zápis odmítne token s cizím otiskem stránky", () => {
    const result = answers(['--answers=DRILLEV-PILOT-V1 deadbeef 0o', "--write", "--reviewer=Test"]);
    expect(result.code, "fail-closed, ne varování").toBe(1);
    expect(result.out).toContain("Otisk stránky nesedí");
  });

  it("u čelení sázce hraje ten druhý v názvu vzoru", () => {
    // Vzor je `<agresor>_VS_<dorovnávající>`. Druhé čtení 9. 9. 2026 přečetlo
    // `3BP_BTN_VS_CO` jako „hrdina BTN" a vytklo jako blokující nález, že range
    // nemá AA, KK ani AK - jenže u čelení sázce drží cutoffa, který 3bet
    // dorovnal, a tam ty ruce nepatří. Data byla správně, jméno zavádělo.
    const facing = pilotHeroSeat("3BP_BTN_VS_CO", "FLOP_FACING_BET");
    expect(facing.seat).toBe("CO");
    expect(facing.role).toContain("dorovnal 3bet");

    const cbet = pilotHeroSeat("3BP_BTN_VS_CO", "THREE_BET_POT_CBET");
    expect(cbet.seat).toBe("BTN");

    // Ze small blindu je agresor mimo pozici, proti big blindu v ní - a čtenář
    // to na mřížce nepozná, takže to musí být napsané.
    expect(pilotHeroSeat("SRP_SB_VS_BB", "SINGLE_RAISED_POT_CBET").role).toContain("mimo pozici");
    expect(pilotHeroSeat("SRP_BTN_VS_BB", "SINGLE_RAISED_POT_CBET").role).toContain("v pozici");
  });

  it("výtka připnutá k „něco je špatně“ se přečte a pojmenuje", () => {
    // Stránka výtky nabízí a do tokenu je zapisuje. Do 9. 9. 2026 je zapisovač
    // nepřipouštěl, takže `0x13` skončilo mezi nepřečtenými tokeny a celý
    // vyplněný draft se tvářil jako nezodpovězený - bez jediné chybové hlášky.
    const hash = pilotReviewPageHash(pilotReviewOrder(generatedMttPostflopPilotPacks));
    const result = answers([`--answers=DRILLEV-PILOT-V1 ${hash} 0x13`]);
    expect(result.code).toBe(0);
    expect(result.out).not.toContain("nepřečtené tokeny");
    expect(result.out).toContain("NEEDS_WORK");
    expect(result.out, "verdikt bez diagnózy se příště nedá zkontrolovat")
      .toContain("chybí velikost sázky");
  });

  it("zápis odmítne token, kterému nerozumí celý", () => {
    // Zapsat jen tu část, které skript rozumí, by v souboru vypadalo úplně.
    const hash = pilotReviewPageHash(pilotReviewOrder(generatedMttPostflopPilotPacks));
    const result = answers([
      `--answers=DRILLEV-PILOT-V1 ${hash} 0x1 1y9`, "--write", "--reviewer=Test",
    ]);
    expect(result.code).toBe(1);
    expect(result.out).toContain("Zápis odmítnut");
  });

  it("zápis odmítne verdikt bez toho, kdo četl", () => {
    // Otisk se počítá ze sdílené knihovny, ne ze stránky na disku. První verze
    // četla `artifacts/pilot-review/review.html` a prošla jen proto, že jsem ji
    // chvíli předtím vygeneroval - `artifacts/` je gitignorovaný, takže na
    // čistém checkoutu i v CI by test spadl na chybějícím souboru. Táž vada,
    // před kterou varuje commit 8005caf: nepředstírat, že vygenerované vstupy
    // v repozitáři jsou.
    const hash = pilotReviewPageHash(pilotReviewOrder(generatedMttPostflopPilotPacks));
    const result = answers([`--answers=DRILLEV-PILOT-V1 ${hash} 0o`, "--write"]);
    expect(result.code).toBe(1);
    expect(result.out).toContain("povinné");
  });
});
