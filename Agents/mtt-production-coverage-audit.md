# MTT Production Coverage Audit

Updated: 2026-06-04

## Current production surface

- Game: MTT
- Street: Preflop
- Model: chipEV
- Rake: none
- Production-ready profiles:
  - FULL_RING_9 / REGULAR / ante ON
  - FULL_RING_9 / REGULAR / ante OFF
- Current production baseline:
  - 2 production RangePacks
  - 487 records per pack
  - 169 normalized hand classes per record
  - MEDIUM confidence
  - Source metadata present, but no source citations are shown in app UI

## Candidate or missing profiles

- FULL_RING_9 / TURBO / ante ON: missing dedicated production hand recommendations
- FULL_RING_9 / TURBO / ante OFF: missing dedicated production hand recommendations
- SIX_MAX / REGULAR / ante ON: candidate metadata only, no records
- SIX_MAX / REGULAR / ante OFF: candidate metadata only, no records
- SIX_MAX / TURBO / ante ON: candidate metadata only, no records
- SIX_MAX / TURBO / ante OFF: candidate metadata only, no records

## Production rules now enforced

- Production requires MEDIUM or HIGH confidence.
- Production requires non-empty normalized records.
- Production requires at least two source evidence entries and at least three recorded searches.
- Production coverage must include every required position, stack bucket and action context for the profile.
- Turbo cannot become production by changing blind speed metadata only.
- Turbo needs dedicated turbo hand recommendations or an explicit reviewed reuse policy.
- Candidate packs must not start legacy 9-max scoring.

## Verification hooks

- `tests/unit/mttProductionReadiness.test.ts`
- `tests/unit/mttPreflopRangePackImport.test.ts`
- `tests/unit/mttPreflopRangeAudit.test.ts`
- `tests/unit/profileSelector.test.ts`
- `tests/unit/bootstrapIntegration.test.ts`
- `tests/unit/uiNoSourceCitation.test.ts`

## Import intake now prepared

- Generic MTT preflop production import validator supports FULL_RING_9 and SIX_MAX.
- The same intake covers REGULAR and TURBO blind speeds, ante ON/OFF, legal license kind, source evidence, stack mapping, positions, action contexts, stack buckets and 169 hand-class completeness.
- It does not bundle or infer any chart values. Production promotion still requires legally usable records.
- Required legal input fields are tracked in `Agents/production-range-intake-manifest.md`.

## Open data blockers

- 9-max turbo records require a legal source/export input before production.
- 6-max regular records require a legal source/export input before production.
- 6-max turbo records require a legal source/export input before production.
- Public metadata and marketing pages are useful for assumptions, but are not sufficient permission to copy full chart values.
