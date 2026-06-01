import type { AnteMode } from "../../core/types";
import type { BlindSpeed, TableFormat, TrainingProfile } from "../../core/trainingProfile";
import type { RangePack, RangeSourceEvidence } from "./rangePack";

const VERIFIED_AT = "2026-06-01";

const SNG_CHIP_EV_PREFLOP_SEARCH_QUERIES = [
  "SNG chipEV preflop charts sit and go poker ranges stack depths source",
  "GTO Wizard Spin and Go SNG chipEV preflop solutions stack depths",
  "HoldemResources SNG chipEV preflop ranges sit and go Nash push fold",
  "ICMIZER SNG chipEV mode preflop ranges sit and go",
];

const SNG_CHIP_EV_PREFLOP_SOURCE_EVIDENCE: RangeSourceEvidence[] = [
  {
    title: "GTO Wizard status and info about solutions",
    url: "https://blog.gtowizard.com/status-and-info-about-our-solutions/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as sourcing and methodology evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public solution list includes Spin & Go 1-25bb and HU SnG 1-72bb all-spots solutions with varying stacks.",
  },
  {
    title: "GTO Wizard MTT, Spin & Go and HU SnG solutions",
    url: "https://blog.gtowizard.com/introducing-mtt-spin-go-and-hu-sng-postflop-solutions-for-free/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as sourcing and methodology evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public article describes Spin & Go and HU SnG solutions from preflop to river, including non-uniform stack situations.",
  },
  {
    title: "GTO Wizard custom preflop solutions help",
    url: "https://help.gtowizard.com/how-to-build-custom-solutions/",
    provider: "GTO Wizard Help",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as solver setup evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public documentation confirms configurable preflop solving with player count, stack sizes, blinds and antes.",
  },
  {
    title: "GTO Charts Spin and Go charts",
    url: "https://www.gtocharts.com/spin-and-go-charts/",
    provider: "GTO Charts",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as comparison evidence only; no chart content is copied.",
    methodologyNote:
      "Public page advertises Spin and Go preflop chart coverage for short stack depths.",
  },
  {
    title: "PokerMasterminds push/fold charts",
    url: "https://www.danielhopson.com/wp-content/uploads/2021/04/PokerMastermindsPushFoldCharts.pdf",
    provider: "PokerMasterminds",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as public short-stack chipEV methodology evidence only; no raw ranges are copied.",
    methodologyNote:
      "Public PDF states HRC-generated +chipEV shove charts, useful only as short-stack comparison evidence.",
  },
];

function sngChipEvCandidateRangePack(
  tableFormat: TableFormat,
  blindSpeed: BlindSpeed,
  ante: AnteMode,
): RangePack {
  const tableSlug = tableFormat === "FULL_RING_9" ? "full-ring-9" : "six-max";
  const speedSlug = blindSpeed === "REGULAR" ? "regular" : "turbo";
  const anteSlug = ante === "ON" ? "ante-on" : "ante-off";

  return {
    id: `sng-${tableSlug}-${speedSlug}-preflop-chip-ev-${anteSlug}-candidate-v0`,
    version: "candidate-v0",
    createdAt: VERIFIED_AT,
    verifiedAt: VERIFIED_AT,
    confidence: "LOW",
    dimensions: {
      gameVariant: "SNG",
      tableFormat,
      blindSpeed,
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante,
      rakeMode: "NONE",
    },
    assumptions: [
      "Candidate RangePack for future SNG chipEV support; not used for production scoring yet.",
      tableFormat === "FULL_RING_9"
        ? "Full ring 9-max single-table SNG profile."
        : "6-max single-table SNG profile.",
      "chipEV strategy without ICM; ICM model and payout pressure will be added separately.",
      ante === "ON" ? "Big blind ante is active." : "No ante.",
      "Regular and turbo currently differ by blind schedule and stack distribution; hand recommendations require legally usable chart import.",
      "Records are intentionally empty until source ranges are imported and normalized through the RangePack workflow.",
    ],
    searchQueries: SNG_CHIP_EV_PREFLOP_SEARCH_QUERIES,
    sourceEvidence: SNG_CHIP_EV_PREFLOP_SOURCE_EVIDENCE,
    records: [],
  };
}

export const sngChipEvPreflopRangePackCandidates = [
  sngChipEvCandidateRangePack("FULL_RING_9", "REGULAR", "ON"),
  sngChipEvCandidateRangePack("FULL_RING_9", "REGULAR", "OFF"),
  sngChipEvCandidateRangePack("FULL_RING_9", "TURBO", "ON"),
  sngChipEvCandidateRangePack("FULL_RING_9", "TURBO", "OFF"),
  sngChipEvCandidateRangePack("SIX_MAX", "REGULAR", "ON"),
  sngChipEvCandidateRangePack("SIX_MAX", "REGULAR", "OFF"),
  sngChipEvCandidateRangePack("SIX_MAX", "TURBO", "ON"),
  sngChipEvCandidateRangePack("SIX_MAX", "TURBO", "OFF"),
] as const;

export function sngPreflopRangePackForProfile(
  profile: TrainingProfile,
): RangePack | undefined {
  return sngChipEvPreflopRangePackCandidates.find((pack) => (
    pack.dimensions.gameVariant === profile.gameVariant &&
    pack.dimensions.tableFormat === profile.tableFormat &&
    pack.dimensions.blindSpeed === profile.blindSpeed &&
    pack.dimensions.street === profile.street &&
    pack.dimensions.evModel === profile.evModel &&
    pack.dimensions.ante === profile.ante &&
    pack.dimensions.rakeMode === profile.rakeMode
  ));
}
