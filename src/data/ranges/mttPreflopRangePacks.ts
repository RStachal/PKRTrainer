import type { AnteMode } from "../../core/types";
import type { RangeFile } from "./schema";
import type { RangePack, RangeSourceEvidence } from "./rangePack";
import { anteOffRanges } from "./ante-off";
import { anteOnRanges } from "./ante-on";

const VERIFIED_AT = "2026-06-01";

const CURRENT_MTT_PREFLOP_SEARCH_QUERIES = [
  "MTT 9 max preflop charts chipEV regular speed turbo poker tournament ranges source",
  "GTO Wizard MTT 9 max preflop charts chipEV ante tournament ranges",
  "PokerCoaching MTT preflop charts 9 max tournament ante chipEV",
  "ICMIZER MTT preflop charts chipEV 9 max tournament turbo regular",
];

const CURRENT_MTT_PREFLOP_SOURCE_EVIDENCE: RangeSourceEvidence[] = [
  {
    title: "GTO Wizard status and info about solutions",
    url: "https://blog.gtowizard.com/status-and-info-about-our-solutions/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as methodology/comparison evidence only; current internal data is not copied raw chart content.",
    methodologyNote:
      "Public solution list includes ChipEV 9max mixed-stack preflop solutions and ante/stack-depth dimensions.",
  },
  {
    title: "Poker Academy preflop charts",
    url: "https://poker.academy/preflop-charts",
    provider: "Poker Academy",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as comparison evidence only; current internal data is not copied raw chart content.",
    methodologyNote:
      "Public chart catalogue describes MTT 8-max/9-max, ChipEV, BB ante, 23 stack sizes and multiple preflop scenarios.",
  },
  {
    title: "GTO Sims 9-MAX MTT 30BB ChipEV ante 12%",
    url: "https://gtosims.com/products/9-max-mtt-30bb-chipev-ante-12",
    provider: "GTO Sims",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as paid-solution methodology evidence only; no raw range images/files are copied.",
    methodologyNote:
      "Public product description confirms full-ring 9-max, ChipEV, ante 12%, 30bb, open/3bet/all-in and limp/isolate nodes.",
  },
  {
    title: "GTOBase MTT 9-max library",
    url: "https://gtobase.com/",
    provider: "GTOBase",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as methodology/comparison evidence only; current internal data is not copied raw chart content.",
    methodologyNote:
      "Public library description lists MTT 9-max, 15-30bb stack coverage and Simple Preflop Holdem solver methodology.",
  },
  {
    title: "PokerCoaching push/fold charts",
    url: "https://pokercoaching.com/push-fold-charts/",
    provider: "PokerCoaching",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as short-stack comparison evidence only; current internal data is not copied raw chart content.",
    methodologyNote:
      "Public free charts cover 9-handed full-ring push/fold, stack depths up to 15bb and multiple ante formats.",
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
      "Turbo currently changes blind schedule/stack distribution, not hand recommendations at the same chipEV stack/ante node.",
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
