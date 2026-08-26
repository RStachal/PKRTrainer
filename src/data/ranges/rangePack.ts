import type {
  ActionContext,
  ActionKey,
  AnteMode,
  HandLabel,
  Position,
  StackBucket,
} from "../../core/types";
import type { ActionEvSet } from "../../core/actionEv";
import type {
  BlindSpeed,
  EvModel,
  GameVariant,
  RakeMode,
  TableFormat,
  TrainingStreet,
} from "../../core/trainingProfile";
import type { IcmSpotType, SngIcmContext } from "../../core/icmModel";
import {
  type RangeFile,
  type RangeRecord,
  validateRangeRecord,
} from "./schema";

export interface RangeSourceEvidence {
  title: string;
  url: string;
  provider: string;
  verifiedAt: string;
  licenseNote: string;
  methodologyNote?: string;
}

export interface RangePackDimensions {
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  street: TrainingStreet;
  evModel: EvModel;
  ante: AnteMode;
  rakeMode: RakeMode;
}

export interface RangePackRecord {
  position: Position;
  bucket: StackBucket;
  context: ActionContext;
  /**
   * Sedačka, která jednala před hrdinou; chybí u obecného záznamu.
   *
   * **Nezapočítává se do úplnosti.** Pack, který má jen zpřesněné záznamy, na
   * obecnou otázku „co s tím na BTN proti otevření" neodpoví, takže by prohlásit
   * ho za pokrytý znamenalo tvrdit odpověď, kterou hráč nedostane. Zpřesnění
   * je nadstavba nad obecnou odpovědí, ne její náhrada.
   */
  vsSeat?: Position;
  /** Rozložení stacků u stolu, pro které záznam platí. Viz `vsSeat`. */
  stackSetupId?: string;
  lenient: Record<HandLabel, ActionKey[]>;
  strict: Record<HandLabel, ActionKey[]>;
  actionEvs?: Partial<Record<HandLabel, ActionEvSet<ActionKey>>>;
}

export interface RangePack {
  id: string;
  version: string;
  createdAt: string;
  verifiedAt: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  dimensions: RangePackDimensions;
  assumptions: string[];
  searchQueries: string[];
  sourceEvidence: RangeSourceEvidence[];
  icmContext?: SngIcmContext;
  icmSpotTypes?: readonly IcmSpotType[];
  records: RangePackRecord[];
}

export function validateRangePack(pack: RangePack): string[] {
  const errors: string[] = [];

  if (pack.id.trim().length === 0) errors.push("RangePack id is required.");
  if (pack.version.trim().length === 0) errors.push("RangePack version is required.");
  if (pack.createdAt.trim().length === 0) errors.push("RangePack createdAt is required.");
  if (pack.verifiedAt.trim().length === 0) errors.push("RangePack verifiedAt is required.");

  if (pack.searchQueries.length < 3) {
    errors.push("RangePack must record at least 3 independent chart searches.");
  }

  if (pack.sourceEvidence.length < 2) {
    errors.push("RangePack must cite at least 2 source evidence entries.");
  }

  for (const [index, source] of pack.sourceEvidence.entries()) {
    const tag = `sourceEvidence[${index}]`;
    if (source.title.trim().length === 0) errors.push(`${tag}.title is required.`);
    if (source.provider.trim().length === 0) errors.push(`${tag}.provider is required.`);
    if (source.verifiedAt.trim().length === 0) errors.push(`${tag}.verifiedAt is required.`);
    if (source.licenseNote.trim().length === 0) errors.push(`${tag}.licenseNote is required.`);
    if (!isHttpUrl(source.url)) errors.push(`${tag}.url must be an http(s) URL.`);
  }

  for (const record of pack.records) {
    errors.push(...validateRangeRecord(rangePackRecordToRangeRecord(record)));
  }

  return errors;
}

export function rangePackRecordToRangeRecord(record: RangePackRecord): RangeRecord {
  return {
    position: record.position,
    bucket: record.bucket,
    context: record.context,
    lenient: record.lenient,
    strict: record.strict,
    // Zpřesnění musí projít i sem, jinak by se dva legitimní záznamy slily do
    // jednoho klíče a validace by je hlásila jako duplicitu.
    ...(record.vsSeat ? { vsSeat: record.vsSeat } : {}),
    ...(record.stackSetupId ? { stackSetupId: record.stackSetupId } : {}),
    ...(record.actionEvs ? { actionEvs: record.actionEvs } : {}),
  };
}

export function rangePackToRangeFile(pack: RangePack): RangeFile {
  return {
    version: pack.version,
    ante: pack.dimensions.ante,
    entries: pack.records.map(rangePackRecordToRangeRecord),
  };
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
