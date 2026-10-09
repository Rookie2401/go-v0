# Privacy and security — final report (Prompt 6 §20, §22)

Status: 2026-10-09. A summary of the adversarial lanes and their remediation; the detail, per test, is in
`docs/ecosystem/audit/SECURITY.md`, `PRIVACY-PORTABILITY.md` and `OFFLINE-FAILURE.md`. This is the work of an
automated audit by a model with tests, not a penetration test by a security professional, and no TLS, real sockets,
browser storage quotas or real screen readers were involved.

## 1. Security (§20)

```
npx vitest run test/audit/security.*.test.ts --reporter=dot     # 8 files, 341 tests, 0 it.fails
```

| area | result |
|---|---|
| authentication | scrypt password hashes, 256-bit session tokens stored as SHA-256 digests, constant-time comparison, sessions expire; offline sign-out queues the revocation and keeps only the token until it succeeds (P-08) |
| authorization and cross-user access | every route is scoped to the session's learner; another learner, a team leader and an anonymous caller get 401/403/404 on events, knowledge, candidates and documents (certification step 43; `security.authz`, `privacy.team`) |
| reader text and prompt injection | all page text is data: the card never sets markup, unit ids are validated identifiers, instructions inside a book change nothing (`security.reader`); no LLM provider is wired, so there is nothing to inject into |
| malformed Unicode | NFD/NFC, combining marks, bidi, zero-width and over-long inputs are normalised or refused (`security.reader`, `a11y.unicode`) |
| XSS | textContent everywhere in the card, popup and GoPractice; the service answers JSON with `nosniff`, `default-src 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (S-12) |
| extension privilege boundary | the content script is messaging-only; the worker validates senders; `chrome.storage` access level is set to trusted contexts (S-13, verified against a fake chrome only) |
| credential storage | the password never reaches storage; the token lives in the worker's storage area / the app's origin storage; exports never contain it |
| Repository API validation | text-like keys refused at any depth, surfaces ≤ 4 words, id caps, nesting limit (400), future `at` (422), device bound to the session or a registered device (S-05), enrolment ownership (S-06), language–enrolment match (P-07), `producer.app: 'repository'` refused from clients (S-04), empty subject arrays refused (S-11) |
| event forgery | a forged event for another learner is refused; duplicates on id and dedupeKey store nothing (certification 41) |
| account switching | a second sign-in replaces the session and clears the cached profile; the first learner's local events stay under their pseudonym |
| private writing documents | per-learner; cross-learner read/delete refused; deletion tombstones the body and the title (P-03) |
| team-data separation | membership grants no data access; there is no team-level or aggregate query at all |
| unauthorized remote AI | no provider is configured; GoTell's gate accepts only the literal `true` consent and records `ConsentGiven/Withdrawn` (S-14, P-09 for the speech switches too); the Repository makes no outbound call |
| language-pack integrity | manifests carry checksums; the install step re-verifies 16 checks on the device; the shipped dictionary manifest no longer promises the unshipped sidecar |
| logging of sensitive material | diagnostics redact to lengths; the service logs no bodies; events carry hashes, counts and ids, never sentences (every lane asserts no text leak) |

Fixed this phase: S-01…S-14 (14 of 14). Open: none from the security lane. Known limits: `setAccessLevel` is unverified in a real browser; the audit found no critical or high defect, which is a statement about what it tried, not a guarantee.

## 2. Privacy and portability (§22)

```
npx vitest run test/audit/privacy.*.test.ts --reporter=dot      # 6 files, 167 tests
```

| requirement | state |
|---|---|
| learner-data export | `GET /export` (`go-repository-export@1`), now importable by `importLearner` (P-01); no token, no password hash, nothing of another learner |
| writing export | the draft (json/text/markdown) and all writing at once, token-free |
| document deletion | body and title gone; tombstoned; absent from later exports and pulls; other devices learn of it on pull (P-03, P-04) |
| account deletion | `DELETE /me` erases events, documents, sessions and knowledge on both stores; SQLite runs with `secure_delete` and a WAL checkpoint after erasure; `compact()` (VACUUM) is the operator's step (P-11) |
| team switching and membership | an enrolment can be ended (`POST /enrolments/:id/end`, P-06); membership exposes nothing; a leader has no progress view |
| language switching | events per enrolment and language; a mismatch is refused (P-07) |
| device synchronisation | durable queue, exactly-once under lost acks, two devices see each other's events, conflict copies for documents |
| local data cleanup | "clear local data" and "forget this device" remove the learner's keys, including quarantined rows |
| remote-AI and remote-speech consent | off by default; consent events recorded by GoTell, the setup app and GoPractice; nothing is sent without it |
| private writing access | per learner only |

Open: **P-12 (low)** — since the certification fix that registers looked-up surfaces, a surface the learner met lives in the shared linguistic tables (`units`, `analyses`) with no learner id and survives `DELETE /me`; it is a dictionary word, not learner text, but it is a trace that the word was looked up by someone. Fixing it needs per-row provenance (a schema decision for the owner). Logical erasure also does not reach backups or replicas, which the operations doc states.

## 3. Offline and failure (§23)

```
npx vitest run test/audit/offline.*.test.ts --reporter=dot      # 5 files, 207 tests
```

All seven defects (O-01…O-07) are fixed: a corrupt queue row is quarantined with a diagnostic instead of blocking the
queue; damaged cursors and indexes are rebuilt with a note; a lost device id forces re-sign-in with a visible status;
one refused event no longer blocks a batch in either app; an offline dictionary miss says "offline". The "what works
offline" table is in `OFFLINE-FAILURE.md` §4 (reading assistance, encounter capture, written review, GoTell checking
and autosave work offline; first sign-in, candidates, account copies, pack installs and any remote voice need a
connection; listening in Albanian is unavailable online or offline because no audio exists).

## 4. What the owner should still do

1. Decide the repository LICENSE and have the eight questions in `RIGHTS-AND-ATTRIBUTION.md` reviewed by counsel.
2. Run the service behind TLS with the documented headers; rotate nothing in this repo (no secrets are held here).
3. Verify `storage.session.setAccessLevel` and the CSP behaviour with the unpacked extension in Chrome.
4. Decide P-12 (provenance on shared linguistic rows).
