import type { AnteMode } from "../../core/types";
import type { BlindSpeed, TrainingProfile } from "../../core/trainingProfile";
import { sixMaxPositionMap, unmappedFullRingPositions } from "../../core/tableFormatConversion";
import type { RangeFile } from "./schema";
import type { RangePack, RangeSourceEvidence } from "./rangePack";
import {
  buildRangePackImportReport,
  type RangePackImportReport,
} from "./rangePackImport";
import { rangePackMatchesTrainingProfile } from "./rangePackProfileGuard";
import { anteOffRanges } from "./ante-off";
import { anteOnRanges } from "./ante-on";
import { runtimeMttPreflopRangePacks } from "./mttProductionRuntimeRegistry";
import { isPlayableMttPreflopPreview } from "./trainingCapability";

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

const MTT_SIX_MAX_PREFLOP_SEARCH_QUERIES = [
  "MTT 6-max preflop charts chipEV tournament ranges 6max source",
  "GTO Wizard MTT 6max ChipEV preflop charts ante stack depth",
  "Poker Academy MTT 6 max preflop charts ChipEV BB ante",
  "GTOBase MTT 6-max preflop chipEV tournament ranges",
];

const MTT_SIX_MAX_PREFLOP_SOURCE_EVIDENCE: RangeSourceEvidence[] = [
  {
    title: "GTO Wizard full ChipEV 6-max MTT solutions update",
    url: "https://blog.gtowizard.com/live-cash-solutions-and-4000-new-scenarios-for-cash-mtt-formats%2A%2A/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as sourcing and methodology evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public update confirms full ChipEV 6-max MTT solutions from preflop to river for multiple stack depths.",
  },
  {
    title: "GTO Wizard MTT mixed-stack expansion",
    url: "https://blog.gtowizard.com/thousands-of-new-solutions-and-interface-updates/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as sourcing and methodology evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public update lists ChipEV 6max MTT mixed-stack preflop solutions and distinguishes them from 9max.",
  },
  {
    title: "GTO Wizard status and info about solutions",
    url: "https://blog.gtowizard.com/status-and-info-about-our-solutions/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as sourcing and methodology evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public solution list includes ChipEV 6max mixed-stack preflop solutions and stack-depth dimensions.",
  },
  {
    title: "Poker Academy format coverage",
    url: "https://poker.academy/",
    provider: "Poker Academy",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as comparison evidence only; current internal data is not copied raw chart content.",
    methodologyNote:
      "Public FAQ states MTT coverage and stack depths from 3bb to 100bb; format details require paid access before import.",
  },
  {
    title: "BBZ Poker ChipEV MTT chart package",
    url: "https://bbzpoker.com/product/mtt-charts/",
    provider: "BBZ Poker",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as comparison evidence only; no paid chart content is copied.",
    methodologyNote:
      "Public description confirms chipEV MTT methodology and broad stack-depth coverage, but 6-max-specific data is not publicly exposed.",
  },
];

export function rangeFileToMttPreflopRangePack(file: RangeFile): RangePack {
  const anteSlug = file.ante === "ON" ? "ante-on" : "ante-off";
  let records: RangePack["records"] | null = null;

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
    get records(): RangePack["records"] {
      if (records === null) {
        records = file.entries.map((record) => ({
          position: record.position,
          bucket: record.bucket,
          context: record.context,
          lenient: record.lenient,
          strict: record.strict,
        }));
      }
      return records;
    },
  };
}

function mttSixMaxCandidateRangePack(
  blindSpeed: BlindSpeed,
  ante: AnteMode,
): RangePack {
  const speedSlug = blindSpeed === "REGULAR" ? "regular" : "turbo";
  const anteSlug = ante === "ON" ? "ante-on" : "ante-off";

  return {
    id: `mtt-six-max-${speedSlug}-preflop-chip-ev-${anteSlug}-candidate-v0`,
    version: "candidate-v0",
    createdAt: VERIFIED_AT,
    verifiedAt: VERIFIED_AT,
    confidence: "LOW",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "SIX_MAX",
      blindSpeed,
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante,
      rakeMode: "NONE",
    },
    assumptions: [
      "Candidate RangePack for future MTT 6-max support; not used for scoring or production drilling yet.",
      "Canonical 6-max seats: UTG, HJ, CO, BTN, SB, BB.",
      "chipEV strategy without ICM.",
      ante === "ON" ? "Big blind ante is active." : "No ante.",
      "Regular and turbo currently differ by blind schedule and stack distribution; hand recommendations require legally usable chart import.",
      "Records are intentionally empty until source ranges are imported and normalized through the RangePack workflow.",
    ],
    searchQueries: MTT_SIX_MAX_PREFLOP_SEARCH_QUERIES,
    sourceEvidence: MTT_SIX_MAX_PREFLOP_SOURCE_EVIDENCE,
    records: [],
  };
}

/**
 * Six-max records carried across from the measured nine-handed pack.
 *
 * The six-max packs shipped with zero records - the format was supported and had
 * nothing to teach - while nine-handed carries 507 measured records per ante mode.
 * `tableFormatConversion` maps the seats by how many opponents are still to act,
 * so a six-max under-the-gun inherits the nine-handed lojack: both have five
 * behind them and face the same chance of running into a better hand.
 *
 * Marked derived, not measured. Confidence stays LOW, the assumption list says
 * where every record came from, and the three nine-handed early seats that no
 * six-max seat matches are named rather than quietly folded into the nearest one.
 * A real six-max field is looser than a nine-handed one at equal seats-behind, so
 * these will run tight - they are a floor for measurement to correct, which is how
 * every derived number in this project is treated.
 */
function deriveSixMaxRecords(source: RangePack): RangePack["records"] {
  const map = new Map(sixMaxPositionMap().map((pair) => [pair.fullRing, pair.sixMax]));
  const out: RangePack["records"] = [];
  for (const record of source.records) {
    const seat = map.get(record.position);
    if (seat === undefined) continue;
    out.push({ ...record, position: seat });
  }
  return out;
}

export function mttSixMaxDerivedRangePack(
  blindSpeed: BlindSpeed,
  ante: AnteMode,
): RangePack {
  const base = mttSixMaxCandidateRangePack(blindSpeed, ante);
  const source = ante === "ON" ? mttPreflopAnteOnRangePack : mttPreflopAnteOffRangePack;
  const records = deriveSixMaxRecords(source);
  const dropped = unmappedFullRingPositions().join(", ");
  return {
    ...base,
    id: base.id.replace("candidate-v0", "derived-v1"),
    version: "derived-v1",
    assumptions: [
      ...base.assumptions.filter((line) => !line.startsWith("Records are intentionally empty")),
      "DERIVED, not measured: every record is a nine-handed record re-labelled to the six-max seat with the same number of opponents left to act.",
      `Seat mapping: ${sixMaxPositionMap().map((p) => `${p.sixMax}<-${p.fullRing}`).join(", ")}.`,
      `Nine-handed seats with no six-max counterpart, and so not carried over: ${dropped}.`,
      "A six-max field plays looser at equal seats-behind, so these ranges are expected to be tight until measured six-max charts replace them.",
    ],
    records,
  };
}

export const mttPreflopAnteOnRangePack = rangeFileToMttPreflopRangePack(anteOnRanges);
export const mttPreflopAnteOffRangePack = rangeFileToMttPreflopRangePack(anteOffRanges);

export const mttPreflopRangePacks = [
  mttPreflopAnteOnRangePack,
  mttPreflopAnteOffRangePack,
] as const;

export const mttSixMaxDerivedRangePacks = [
  mttSixMaxDerivedRangePack("REGULAR", "ON"),
  mttSixMaxDerivedRangePack("REGULAR", "OFF"),
  mttSixMaxDerivedRangePack("TURBO", "ON"),
  mttSixMaxDerivedRangePack("TURBO", "OFF"),
] as const;

export const mttSixMaxPreflopRangePackCandidates = [
  mttSixMaxCandidateRangePack("REGULAR", "ON"),
  mttSixMaxCandidateRangePack("REGULAR", "OFF"),
  mttSixMaxCandidateRangePack("TURBO", "ON"),
  mttSixMaxCandidateRangePack("TURBO", "OFF"),
] as const;

export const mttSixMaxCandidateImportReports: readonly RangePackImportReport[] =
  mttSixMaxPreflopRangePackCandidates.map(buildRangePackImportReport);

const mutableAllMttPreflopRangePacks =
  runtimeMttPreflopRangePacks as RangePack[];
mutableAllMttPreflopRangePacks.push(
  ...mttPreflopRangePacks,
  ...mttSixMaxPreflopRangePackCandidates,
);

export const allMttPreflopRangePacks: readonly RangePack[] =
  mutableAllMttPreflopRangePacks;

export function currentMttPreflopRangePack(ante: AnteMode): RangePack {
  return ante === "ON" ? mttPreflopAnteOnRangePack : mttPreflopAnteOffRangePack;
}

export function mttPreflopRangePackForProfile(
  profile: TrainingProfile,
): RangePack | undefined {
  return allMttPreflopRangePacks.find((pack) => (
    rangePackMatchesTrainingProfile(profile, pack)
  ));
}

export function mttSixMaxCandidateImportReportForProfile(
  profile: TrainingProfile,
): RangePackImportReport | undefined {
  const pack = mttPreflopRangePackForProfile(profile);
  if (!pack || pack.dimensions.tableFormat !== "SIX_MAX") return undefined;
  return mttSixMaxCandidateImportReports.find((report) => report.packId === pack.id);
}

/**
 * The preflop pack a profile may actually train against, or undefined.
 *
 * This is the only thing standing between a blocked profile and a drill. The
 * postflop path refuses explicitly on `canStartTraining`; the preflop path does
 * not, and instead depends on this returning nothing - so a six-max profile with
 * no data was kept out of training by a helper's internal logic rather than by
 * the capability contract, and nothing said so or tested it.
 *
 * Two ways a pack is startable and no others. Production requires the pack to be
 * the exact one readiness declared, so a stale or renamed pack cannot stand in.
 * Preview is limited to the 9-max chipEV shape that has playable historical data,
 * and must have records.
 */
export function startableMttPreflopRangePack(
  profile: TrainingProfile,
  capability: {
    status: string;
    mttReadiness: { productionReady?: boolean; packId?: string | null } | null;
  },
): RangePack | undefined {
  const pack = mttPreflopRangePackForProfile(profile);
  const readiness = capability.mttReadiness;
  if (capability.status === "PRODUCTION" && readiness?.productionReady === true) {
    return pack?.id === readiness.packId ? pack : undefined;
  }
  if (
    capability.status === "PREVIEW" &&
    isPlayableMttPreflopPreview(profile) &&
    pack &&
    pack.records.length > 0
  ) {
    return pack;
  }
  return undefined;
}
