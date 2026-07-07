# PKRTrainer payment and entitlement model

Status: working design draft  
Updated: 2026-07-07

## Product goal

PKRTrainer should be usable as a professional poker training app with clear product tiers, predictable offline behavior and no accidental access to paid strategy content. Payment/access logic must be separated from range correctness: ranges are validated by solver/provenance gates, while user access is controlled by subscription/license entitlements.

## Recommended commercial model

### Free

- App shell, UI preview, sample public/heuristic training content.
- Limited daily training volume.
- No export-heavy workflows.
- Purpose: user trust, device compatibility, onboarding.

### Pro

- Core preflop trainer.
- MTT 9-max regular chipEV modules that are production-ready.
- Personal statistics, spaced repetition, offline cache for licensed packs.
- Suitable as the first paid tier.

### Pro Plus / Solver Lab

- Postflop pilot packs and advanced MTT modules after validation.
- Solver-backed drills, range matrix review, external cross-check reports.
- More scenarios, deeper analytics, future ICM/PKO/final-table packs.

### Team / Coach

- Multi-user licenses.
- Coach-managed groups, shared drills, student progress.
- Seat-based billing.

## Access model

Use content entitlements, not hard-coded product flags.

Entitlement examples:

- `app.free`
- `mtt.preflop.9max.regular.chip_ev`
- `mtt.preflop.9max.turbo.chip_ev`
- `mtt.postflop.flop.srp_btn_bb.cbet.pilot`
- `mtt.postflop.flop.srp_btn_bb.facing_bet.pilot`
- `mtt.postflop.flop.3bp_btn_co.cbet.pilot`
- `mtt.postflop.flop.3bp_btn_co.facing_bet.pilot`
- `analytics.advanced`
- `export.cross_check`
- `coach.team`

Production packs should declare required entitlements in metadata. Runtime should load a pack only when both are true:

1. pack is technically valid and registered;
2. current user/device has the required entitlement.

## Payment provider boundary

Keep provider-specific code behind a backend adapter. Do not let the app directly trust client-side payment state.

Backend responsibilities:

- create checkout sessions;
- receive payment webhooks;
- normalize provider subscription/customer status;
- write signed entitlement records;
- expose `/me/entitlements`;
- issue short-lived access tokens or signed offline licenses.

The app responsibilities:

- login or license activation;
- fetch and cache current entitlements;
- verify signed entitlement/license payload;
- enable/disable content packs and UI affordances;
- degrade gracefully when offline.

Provider candidates can be evaluated later. The architecture should support Stripe-like checkout, app-store subscriptions, or a merchant-of-record provider without changing training/range code.

## Offline behavior

PKRTrainer has important offline value, so paid access needs a cached license.

Recommended policy:

- Online check after purchase/login.
- Store signed entitlement payload locally.
- Payload contains:
  - user/license id;
  - entitlements;
  - issuedAt;
  - expiresAt;
  - graceUntil;
  - device binding hash if needed;
  - signature/key id.
- Offline access allowed until `graceUntil`.
- When grace expires, keep app shell and free/sample content available, but lock paid packs.

## Anti-abuse without punishing normal users

- Limit active devices per account/license.
- Allow self-service device reset.
- Use server-side entitlement truth.
- Avoid putting raw payment/provider secrets in the app.
- Do not rely on localStorage alone for paid access.
- Never mix “range provenance permission” with “user payment entitlement”.

## Content release interaction

A pack can be visible to a user only if all gates pass:

```text
solver/data validity
  -> production/pilot gate
  -> pack registry
  -> entitlement match
  -> runtime load
```

This prevents a paid user from seeing unvalidated strategic content while also preventing unpaid users from loading valid paid packs.

## Minimum backend data model

```text
User
  id
  email
  status

Subscription
  id
  provider
  providerCustomerId
  providerSubscriptionId
  status
  currentPeriodEnd
  cancelAtPeriodEnd

EntitlementGrant
  id
  userId
  entitlement
  source
  startsAt
  endsAt
  status

DeviceLicense
  id
  userId
  deviceIdHash
  issuedAt
  expiresAt
  graceUntil
  signedPayload
```

## MVP implementation phases

1. Define entitlement constants and pack-to-entitlement mapping.
2. Add frontend entitlement guard that can run from a mocked local entitlement payload.
3. Add backend checkout/webhook integration.
4. Add signed offline license cache.
5. Add account/device management.
6. Add analytics for conversion, churn and content usage.

## Immediate repo tasks

- Add a typed entitlement model in `src/core`.
- Add a pack-access guard separate from strategy correctness gates.
- Add release report rows that distinguish:
  - missing range data;
  - unvalidated range data;
  - validated but unpaid/locked content;
  - available content.
- Keep `permission.json` naming confined to range provenance until it can be renamed to `provenance.json` in a compatibility-safe migration.
