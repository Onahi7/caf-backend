# Local Docker API fixes and verification

Verified 2026-10-17 with the real Nest backend, Docker MongoDB replica set, and a dedicated disposable Redis instance. The latest exact operation matrix is in `results/local-api-validation.md`; requests and outcomes are in `results/local-api-validation.json`.

## Results

- 301 documented operations checked for authentication.
- 881 role-denial checks passed.
- 264 operations have a successful authenticated workflow or read response.
- 1,657 checks: 1,655 passed, zero failed, zero missing fixtures, two explicit external blocks.
- The complete backend unit suite passes: 180 tests across 27 suites; see `results/unit-validation.json` for exact counts.
- Backend compilation passes. The test API and disposable Redis container are stopped after the run.

An authenticated response alone does not certify all business semantics. Explicit assertions also verify persisted payroll state, checkout quantities, user reassignment, reference schema types, product/batch stock totals, Redis session persistence and revocation, generated PDF headers, and actual bytes received by a local TCP print receiver.

## Fixed

| Area | Change and verification |
| --- | --- |
| Sessions | Refresh requires a present, matching session. Refresh cannot recreate state deleted by overlapping logout. New logins use distinct refresh IDs. Keyv Redis uses the installed cache integration correctly and propagates adapter failures; configured Redis failure no longer silently switches sessions to memory. Logout/replay and cache-delete failure regressions pass. |
| Reference schemas | BSON reference options use `Schema.Types.ObjectId` throughout, while TypeScript values remain `Types.ObjectId`. Checkout and marketer assignment now match fresh API-created records correctly. |
| Populated references | Purchases, transfer approval/rejection and payroll extract `_id` from populated documents. Existing display population remains available. Audit extraction also handles populated branch references. |
| Purchase receipts | Receipt transactions create sellable batches as well as updating product totals. Duplicate product lines are rejected; conditional receipt updates prevent stale quantities being applied. Final product/batch ledger assertions pass across receipt, checkout, transfer, cycle count and marketer workflows. |
| Report ownership | Saved reports and recurring invoices use the authenticated `userId`; creator CRUD and cross-user denial checks pass. |
| Cycle counts | Submission explicitly copies stored line fields and persists counted quantities/variances. Submission and approval now complete. |
| PDFs and exports | Correct pdfmake constructor import, validated export query fields, BSON-safe sales report labels, and actual PDF byte assertions. |
| Report cache | Keys include caller identity, current role and branch. Direct Express/file responses bypass caching; ordinary reports retain a 60-second default expiration. |
| Passkeys | Decode named CBOR fields; enforce supported none attestation, challenge purpose/owner/expiry and trusted ceremony origins. P-256 verification supports existing persisted raw EC keys. Step-up nested DTO validation works. Valid registration, named/discoverable login, step-up, replay rejection, expiry before TTL deletion, bad signatures, foreign origins and UV enforcement pass. Recovery-code login/replay is also exercised. |
| Bulk pricing | Validated nested request DTO, zero-price/zero-markup handling, and branch scoping for manager writes. |
| Printers | Bounded TCP connection/delivery to configured active printers; byte values and size are validated. Local receiver confirms exact payload. Native-only transports report that device-side testing is required. |
| Jobs | Queue startup permits commands during connection readiness; a real Redis-backed low-stock job completes without startup errors. |
| Unit fixtures | Updated obsolete dependency mocks and service signatures; property generators now construct valid IDs/passwords directly instead of hanging or generating invalid positive examples. |

## Existing data

`scripts/normalize-objectid-references.cjs` repairs schema-declared string references, including nested arrays. It defaults to dry run, requires an explicit `REFERENCE_MIGRATION_URI`, and uses compare-before-write filters. It does not load .env or rewrite non-reference text. An older isolated validation database had seven affected documents; apply converted them without conflicts, and a repeated dry run found zero. A dry run of local `carefaam_dev` found zero affected documents; its data was not changed.

Before deploying against another existing database, build and run this explicit dry run against that database. Apply conversions only to the intended database after reviewing the result. Schema fixes do not retroactively repair historical stock-ledger differences or recover ownership that was previously saved with a random ID.

## Limits

The two recorded external blocks are physical platform authenticator testing and Cloudinary document-upload delivery. Downstream customer-order read/update uses an explicitly seeded persisted fixture. Software passkey ceremonies and TCP print delivery are tested; physical printer output and native USB/Bluetooth transport are not established. Live email, EMR/LAB and other external integrations remain unconfigured and are not certified by this run. These results do not claim every possible variant of every operation has been tested.
