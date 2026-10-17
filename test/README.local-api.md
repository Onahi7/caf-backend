# Local API integration validation

Run `pnpm test:api:local` from the backend directory after starting Docker MongoDB.

Requirements: Node 22, installed backend dependencies, Docker, the cached `redis:7-alpine` image, and MongoDB listening on `127.0.0.1:27017` with a writable `rs0` primary. The single-node replica set is sufficient for transaction tests.

The runner builds the application, uses a new `caf_api_validation_<timestamp>` database, starts a private disposable Redis container on a random loopback port, and starts the real backend on port 3109. Existing local and remote databases and Redis data are not modified. Environment-file settings are overridden for the test process; remote service credentials are neutralized. Test tokens and passwords are redacted from recorded responses.

The bootstrap administrator and an explicitly identified persisted customer-order fixture are directly seeded. The latter covers downstream operations while Cloudinary credentials are unavailable. Branches, staff, suppliers, customers, products, batches, shifts, and other workflow fixtures are created through real HTTP requests. Test-role JWTs allow role checks without exceeding the login rate limit; password login, refresh, and logout are also exercised separately. MongoDB assertions inspect the actual persisted results.

The runner checks every Swagger-documented operation for authentication, probes authenticated reads, checks role denials declared by controller policy, and probes authenticated write validation. Explicit workflows cover supported CRUD and state transitions. Boundary probes and HTTP validation errors do not count as successful business operations. The operation matrix distinguishes authenticated success from boundary coverage.

Reports are generated under `test/results/`:

- `local-api-validation.md`: human-readable results and the complete operation matrix.
- `local-api-validation.json`: individual checks, failure responses, and coverage counts.
- `local-api-server.log`: runtime diagnostics for the application instance.
- `local-api-openapi.json`: the exact API inventory used for the run.

Exit status is 1 when a check fails. Failure does not automatically mean a test is wrong: review the response, server log, and persisted state. A blocked prerequisite can prevent later workflow steps. External email/cloud/EMR/LAB delivery and physical printer/authenticator hardware are not certified by this local run. Software-generated P-256 passkeys exercise registration, signed login and step-up, expiry, replay, bad signatures and foreign-origin rejection. A local TCP receiver verifies exact printer bytes.

The runner stops its API process and deletes its own Redis container on completion. Test MongoDB databases remain available for inspecting failures. It never runs the application's general-purpose seed or production cleanup scripts.

## Existing reference data

Build first. Set `REFERENCE_MIGRATION_URI` explicitly to the intended database, then run `node scripts/normalize-objectid-references.cjs` for a dry run. Add `--apply` to convert schema-declared 24-character string references to BSON IDs. The script does not load environment files, skips non-reference text and uses compare-before-write guards. Repeating the dry run after conversion should report zero affected documents. Stop application writes during a deployment migration to avoid conflicts. Historical stock discrepancies require a separate inventory reconciliation.

Configure `WEBAUTHN_RP_ID` and the comma-separated `WEBAUTHN_ORIGINS` for deployed browser/native clients; origins must exactly match signed client data. Localhost development defaults include ports 5173 and 3000. Configured Redis is required to be reachable; `ENABLE_REDIS=false` explicitly selects process-local development caching.
