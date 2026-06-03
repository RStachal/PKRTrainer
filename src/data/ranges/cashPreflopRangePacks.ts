import type { TrainingProfile } from "../../core/trainingProfile";
import type { RangePack, RangeSourceEvidence } from "./rangePack";
import {
  buildRangePackImportReport,
  type RangePackImportReport,
} from "./rangePackImport";
import { rangePackMatchesTrainingProfile } from "./rangePackProfileGuard";

const VERIFIED_AT = "2026-06-03";

const CASH_SIX_MAX_PREFLOP_SEARCH_QUERIES = [
  "cash game 6-max preflop charts rake no rake poker source GTO Wizard",
  "6 max cash preflop ranges rake no rake poker charts source",
  "cash preflop no rake cEV solutions 6max GTO Wizard",
  "Upswing Poker 6-max cash game preflop ranges",
];

const CASH_SIX_MAX_PREFLOP_SOURCE_EVIDENCE: RangeSourceEvidence[] = [
  {
    title: "GTO Wizard solution overview",
    url: "https://lp.gtowizard.com/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as public sourcing and methodology evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public overview confirms 6-max cash game coverage and separate rake-format solution families.",
  },
  {
    title: "GTO Wizard 6max cash solution update",
    url: "https://blog.gtowizard.com/multitabling-new-solutions/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as rake-model evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public release notes describe GG rake, NL50/NL1K rake structures and high-accuracy 6max cash solves.",
  },
  {
    title: "GTO Wizard live cash solutions update",
    url: "https://blog.gtowizard.com/live-cash-solutions-and-4000-new-scenarios-for-cash-mtt-formats/",
    provider: "GTO Wizard",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as rake/no-rake model evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public release notes distinguish ChipEV no-rake and rake-based cash solution families.",
  },
  {
    title: "GTO Hero solver solution library",
    url: "https://gtohero.com/solutions",
    provider: "GTO Hero",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as independent solver-library comparison only; no raw chart content is copied.",
    methodologyNote:
      "Public page lists cash 6-max, 5% rake capped at 0.6bb, and multiple stack depths.",
  },
  {
    title: "Poker Academy cash game preflop charts",
    url: "https://poker.academy/bln/preflop-charts",
    provider: "Poker Academy",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as independent cash-chart coverage evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public page states 6-max cash support with separate calculations for different rake structures.",
  },
  {
    title: "BBZ Poker cash preflop charts",
    url: "https://bbzpoker.com/product/cash-charts/",
    provider: "BBZ Poker",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as independent format-separation evidence only; no raw chart content is copied.",
    methodologyNote:
      "Public product page explicitly warns that cash and tournament charts use different assumptions.",
  },
  {
    title: "GTO Sims 100BB 6-max cash no-rake chipEV",
    url: "https://gtosims.com/products/100bb-6-max-cash-norake-chipev",
    provider: "GTO Sims",
    verifiedAt: VERIFIED_AT,
    licenseNote:
      "Used as no-rake chipEV setup evidence only; no paid chart content is copied.",
    methodologyNote:
      "Public product page describes 100bb 6-max cash preflop solutions calculated without rake in chipEV.",
  },
];

function cashSixMaxCandidateRangePack(rakeMode: "RAKE" | "NO_RAKE"): RangePack {
  const rakeSlug = rakeMode === "RAKE" ? "rake" : "no-rake";

  return {
    id: `cash-six-max-regular-preflop-chip-ev-${rakeSlug}-candidate-v0`,
    version: "candidate-v0",
    createdAt: VERIFIED_AT,
    verifiedAt: VERIFIED_AT,
    confidence: "LOW",
    dimensions: {
      gameVariant: "CASH",
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode,
    },
    assumptions: [
      "Candidate RangePack for future cash 6-max support; not used for production scoring yet.",
      "Cash game ranges must never be reused for MTT or SNG profiles because stack depth, rake and payout assumptions differ.",
      rakeMode === "RAKE"
        ? "Rake mode is explicit and represents online cash-game rake families; exact site rake requires a later import target."
        : "No-rake mode is explicit and represents chipEV cash solves without rake.",
      "Initial target is 6-max, 100bb effective, no ante, fixed blind cash.",
      "Records are intentionally empty until legally usable chart data is imported and normalized through the RangePack workflow.",
    ],
    searchQueries: CASH_SIX_MAX_PREFLOP_SEARCH_QUERIES,
    sourceEvidence: CASH_SIX_MAX_PREFLOP_SOURCE_EVIDENCE,
    records: [],
  };
}

export const cashSixMaxPreflopRangePackCandidates = [
  cashSixMaxCandidateRangePack("RAKE"),
  cashSixMaxCandidateRangePack("NO_RAKE"),
] as const;

export const cashCandidateImportReports: readonly RangePackImportReport[] =
  cashSixMaxPreflopRangePackCandidates.map(buildRangePackImportReport);

export const allCashPreflopRangePacks = [
  ...cashSixMaxPreflopRangePackCandidates,
] as const;

export function cashPreflopRangePackForProfile(
  profile: TrainingProfile,
): RangePack | undefined {
  return allCashPreflopRangePacks.find((pack) => (
    rangePackMatchesTrainingProfile(profile, pack)
  ));
}

export function cashCandidateImportReportForProfile(
  profile: TrainingProfile,
): RangePackImportReport | undefined {
  const pack = cashPreflopRangePackForProfile(profile);
  if (!pack) return undefined;
  return cashCandidateImportReports.find((report) => report.packId === pack.id);
}
