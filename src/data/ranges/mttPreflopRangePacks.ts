import type { AnteMode } from "../../core/types";
import type { RangeFile } from "./schema";
import type { RangePack, RangeSourceEvidence } from "./rangePack";
import { anteOffRanges } from "./ante-off";
import { anteOnRanges } from "./ante-on";

const VERIFIED_AT = "2026-06-01";

const CURRENT_MTT_PREFLOP_SEARCH_QUERIES = [
  "MTT preflop charts 9 max chip EV",
  "GTO Wizard tournament preflop 9 max",
  "PokerCoaching tournament preflop charts",
];

const CURRENT_MTT_PREFLOP_SOURCE_EVIDENCE: RangeSourceEvidence[] = [
  {
    title: "GTO Wizard multiway preflop solving",
    url: "https://blog.gtowizard.com/introducing-multiway-preflop-solving/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as methodology/comparison evidence only; current internal data is not copied raw chart content.",
    methodologyNote:
      "Public notes confirm up-to-9-player preflop solving, chipEV/raked dimensions, antes and custom stacks.",
  },
  {
    title: "PokerCoaching preflop charts",
    url: "https://pages.pokercoaching.com/100bb-charts/",
    provider: "PokerCoaching",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as comparison evidence only; current internal data is not copied raw chart content.",
    methodologyNote:
      "Public chart material is useful as a sanity check for fundamentally sound preflop ranges.",
  },
];

export function rangeFileToMttPreflopRangePack(file: RangeFile): RangePack {
  const anteSlug = file.ante === "ON" ? "ante-on" : "ante-off";

  return {
    id: `mtt-full-ring-9-regular-preflop-chip-ev-${anteSlug}-v1`,
    version: file.version,
    createdAt: VERIFIED_AT,
    verifiedAt: VERIFIED_AT,
    confidence: "MEDIUM",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: file.ante,
      rakeMode: "NONE",
    },
    assumptions: [
      "Existing PKRTrainer MTT preflop data converted without changing recommendations.",
      "Full ring 9-max: UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN, SB, BB.",
      "chipEV strategy without ICM.",
      file.ante === "ON" ? "Big blind ante is active." : "No ante.",
      "Regular blind speed metadata; current drill still uses fixed BB stack buckets.",
    ],
    searchQueries: CURRENT_MTT_PREFLOP_SEARCH_QUERIES,
    sourceEvidence: CURRENT_MTT_PREFLOP_SOURCE_EVIDENCE,
    records: file.entries.map((record) => ({
      position: record.position,
      bucket: record.bucket,
      context: record.context,
      lenient: record.lenient,
      strict: record.strict,
    })),
  };
}

export const mttPreflopAnteOnRangePack = rangeFileToMttPreflopRangePack(anteOnRanges);
export const mttPreflopAnteOffRangePack = rangeFileToMttPreflopRangePack(anteOffRanges);

export const mttPreflopRangePacks = [
  mttPreflopAnteOnRangePack,
  mttPreflopAnteOffRangePack,
] as const;

export function currentMttPreflopRangePack(ante: AnteMode): RangePack {
  return ante === "ON" ? mttPreflopAnteOnRangePack : mttPreflopAnteOffRangePack;
}
