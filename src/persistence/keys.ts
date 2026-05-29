/**
 * Persistence — verzované klíče localStorage.
 *
 * Req 14.1: Veškerá nová lokálně uložená data používají klíče obsahující
 * explicitní identifikátor verze (`v1`). Žádný z nových klíčů se nesmí
 * shodovat s legacy klíči (`fuf_drill_v5_JungleStyle1`,
 * `fuf_drill_v5_JungleStyle1_events_v1`, `fuf_hh_jungle_v1`).
 *
 * Legacy klíče jsou zde definovány výhradně jako read-only zdroj migrace
 * (viz `persistence/migration.ts`); do legacy klíčů se nikdy nezapisuje.
 */

/** Identifikátor verze schématu pro nové klíče. */
export const SCHEMA_VERSION = "v1";

/** Namespace prefix nových klíčů (odlišuje od legacy `fuf_*`). */
export const NS = "mtt_preflop";

/** Nové verzované klíče (Req 14.1 — nesmí kolidovat s legacy). */
export const KEY_STATE = `${NS}_state_${SCHEMA_VERSION}`; // mtt_preflop_state_v1
export const KEY_EVENTS = `${NS}_events_${SCHEMA_VERSION}`; // mtt_preflop_events_v1
export const KEY_HH = `${NS}_hh_${SCHEMA_VERSION}`; // mtt_preflop_hh_v1
export const KEY_MIGRATED = `${NS}_migrated_${SCHEMA_VERSION}`; // příznak dokončené migrace

/**
 * Legacy klíče (read-only zdroj migrace).
 * Tyto klíče pocházejí z legacy baseline (`Legacy/PKRTrainer.html`) a slouží
 * pouze ke čtení při jednorázové migraci do verzovaných klíčů.
 */
export const LEGACY_KEYS = {
  state: "fuf_drill_v5_JungleStyle1",
  events: "fuf_drill_v5_JungleStyle1_events_v1",
  hh: "fuf_hh_jungle_v1",
} as const;

/** Typ pojmenování legacy klíčů (state | events | hh). */
export type LegacyKeyName = keyof typeof LEGACY_KEYS;

/** Všechny nové verzované klíče pohromadě (pro iteraci/validace). */
export const VERSIONED_KEYS = {
  state: KEY_STATE,
  events: KEY_EVENTS,
  hh: KEY_HH,
  migrated: KEY_MIGRATED,
} as const;

/** Typ pojmenování nových verzovaných klíčů. */
export type VersionedKeyName = keyof typeof VERSIONED_KEYS;
