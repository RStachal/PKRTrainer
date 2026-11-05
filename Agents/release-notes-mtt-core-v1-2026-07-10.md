# MTT ChipEV Core v1

Date: 2026-07-10
Scope id: `MTT_CORE_V1`
Verification status: full scoped release chain and Chrome E2E passed

## Release Decision

This is the scoped MTT content release target. It does not claim completion of
the 64-profile Full MTT NLHE library.

## Included

- Production 9-max chipEV preflop for regular and turbo blind speeds.
- Ante ON and OFF for each blind speed: 4/4 scoped production profiles.
- Four generated lazy-loaded production modules and four owned-export provenance manifests.
- Seven explicitly named FLOP solver pilots: 7/7 `READY`, 19 rules and 972 range buckets.
- Separate pilot entitlements and `SCOPED_PILOT` runtime mode. Pilot content is
  never reported as full FLOP, TURN or RIVER production coverage.
- HH review and persisted preflop statistics use the canonical production pack identity.

## Not Included

- Production 6-max preflop.
- Production DOLAR_EV or ICM strategy.
- Full postflop profile coverage.
- Production TURN or RIVER strategy packs.
- A claim that the Full MTT NLHE 64-row gate is green; its current state is 4/64.

## Provenance And Access

The four preflop inputs are confirmed owned solver exports. The project owner
confirmed runtime distribution rights, acts as rights owner and poker reviewer,
and approved the explicit regular-to-turbo `BLIND_SPEED` reuse policy.

`permission.json` is an internal provenance and review record. Customer access
is controlled separately by content entitlements. It is not a paid-user license.

## Release Gates

- `npm run mtt:core-release`: scoped content gate; must pass.
- `npm run release:mtt-core`: complete scoped release verification chain.
- `npm run mtt:completion -- --summary`: Full MTT NLHE gate; expected to remain red.
- `npm run mtt:postflop-release -- --summary`: full postflop gate; expected to remain red.

Verified build measurements:

- Full `release:mtt-core` chain: passed, including 135 test files and 664 tests.
- Four preflop lazy chunks: 31-34 KiB raw and 4.6-4.9 KiB gzip each.
- Total lazy MTT JavaScript: 558.21 KiB raw and 64.43 KiB gzip.
- Install precache integrity: valid; five MTT runtime assets remain lazy.
- Chrome E2E: desktop and 360/390/412 px passed with no console errors.
- HH review, statistics, reload, offline reopen, 200% zoom, corrupt storage,
  quota failure, 48 contrast checks and service-worker upgrade/rollback passed.
- All seven scoped pilot resolvers start for an entitled `PRO_PLUS` grant and
  remain separate from full production.

FTP artifact:

- `deploy/pkrtrainer-ftp-20260710-144407-4773268-mtt-core-v1.zip`
- SHA-256: `65FC0E2641BE638474CC673D483CB953FE184845D0925A42A65575867B746E7B`
- Current production `dist` matches all 21 packaged application files; the
  twenty-second ZIP entry is the deployment-only `.htaccess.example`.

## Known Limits

- The seven postflop pilots are available only for their reviewed FLOP nodes.
- The payment backend, checkout and server-signed customer license issuance are
  separate commercial-delivery work and are not supplied by content provenance files.
- Raw private solver exports are not shipped or tracked.
