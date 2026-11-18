# GoLearn Chrome Web Store submission draft

**Status: internal draft. Do not submit or publish until the owner resolves every `[OWNER DECISION]` item below and adopts the linked legal documents.**

Operator: Christian Walker (Arizona, United States). Public contact: GoLearntech@outlook.com. Planned distribution: public searchable Chrome Web Store listing. The owner clarified that 4+ means proposed content suitability, not minimum account age, and requests no additional reading restrictions beyond the browser's permitted content. A separate child mode or parent-managed cloud-profile product has not been requested. The privacy review must still account for the actual audience and collection practices; a suitability rating alone does not establish those facts or satisfy notice/consent requirements. See `child-release-readiness.md` for the prior data-flow review and its corrected scope. These owner facts are recorded, not a legal determination.

## Store listing copy

### Name

GoLearn reader

### Short description

Look up words as you read. See meanings, grammar and pronunciation. Your history stays on this device unless you sign in.

### Detailed description

Select a word on a web page to see its form, meaning, grammar and pronunciation. GoLearn keeps your lookup history on this device by default. If you choose to sign in, your learning record syncs to your account.

GoLearn works on supported desktop Chromium browsers. Select a word and use the extension action, keyboard shortcut, or context menu. GoLearn Active is optional and asks for site access before it scans pages on this device. You can switch it off and revoke that access.

Language packs may be machine-drafted and can be wrong. Some reading apps block extensions. The extension does not support Chrome on mobile devices.

### Category

Education

### Support and privacy URLs

- Support URL: **[OWNER DECISION: publish a monitored support page; public contact selected: GoLearntech@outlook.com]**
- Privacy policy URL: **[OWNER DECISION: publish the final, publicly accessible policy]**
- Terms URL: **[OWNER DECISION: publish the final terms]**

## Permissions explanation draft

- `activeTab` and `scripting`: inject the lookup feature into the current tab after the user invokes it.
- `contextMenus`: add “Look up with GoLearn” to the selection context menu.
- `storage` and `unlimitedStorage`: keep the learner’s local history, settings, dictionary data and sync queue on this device. The existing learner event log can exceed Chrome’s default storage quota, so `unlimitedStorage` supports the current local-history feature.
- `alarms`: retry account sync on a schedule when the learner is signed in.
- Optional access to `http://*/*` and `https://*/*`: requested only after the learner turns on GoLearn Active. This enables page scanning and selection lookup on sites the learner visits. Switching Active off removes the registered script; the learner can also revoke browser access in Chrome settings.

## Privacy and data-use answers to complete

These are proposed answers based on current source behavior, not final declarations. Reconcile them with the adopted policy and verify against the release build before entering them in the Web Store dashboard.

- Data collected by the extension: account identifiers/email and authentication session when the learner signs in; lookup/learning events and language preferences when syncing; optional word, phrase, or sentence text only when a learner explicitly enables and uses remote speech. The exact data categories and purposes require owner confirmation.
- Data use: core extension functionality, account sync, security and learner-requested speech. No advertising use is intended. Confirm analytics, logging, and service-provider behavior before asserting this in the dashboard.
- Sale or unrelated transfer: current product intent is no sale or advertising sharing. Confirm actual server, email, speech and hosting providers and contracts.
- Local-only mode: lookup history is stored locally unless the learner signs in and syncs. Page text is not intended to be stored or sent for ordinary lookup. Verify telemetry, error reporting, Active scan and speech paths before making a final claim.
- Encryption: service connections use HTTPS. Confirm deployment and storage practices.

## Unresolved owner decisions

1. Publish the supplied operator identity/contact through a monitored public support/privacy channel and provide final public URLs.
2. Resolve the child data model before launch: adult-supervised device-only use versus child profiles with cloud sync. There is no implemented verified parental-consent flow; see `child-release-readiness.md`.
3. Adopt the privacy policy and terms; replace draft markers. Confirm actual service host, hosting region, processors, log/back-up retention, deletion behavior, and breach contact/process. Current operations information reported for this review: Render in Oregon, Resend for mail, and backups retained as seven daily plus four weekly copies. `go-v0.onrender.com` is the live API host; `repo.golearn-global-languages.com` is canonical. **[OWNER DECISION: confirm these facts and disclose them consistently.]**
4. Confirm data-use answers against production configuration and release build. Scope supported-site claims to real-browser checks; prepare screenshots and promotional artwork.
5. Chrome Web Store positioning is desktop Chrome plus the separately installable mobile web experience. Chrome mobile does not install extensions.

## Release artifact

The packaging script produces an immutable versioned folder under `artifacts/golearn-store/` containing the ZIP, SHA-256 sidecar, sorted file digests, and an embedded package manifest. The script builds in a temporary replacement for `packages/golearn-extension/dist/` and restores the existing dist tree after normal completion or build/test errors. A forced process termination can leave temporary build files for manual recovery. The package allowlists the extension runtime including the user-visible GoPractice feature and rejects harness files, source maps, translation credentials, unexpected build outputs and credential-shaped config entries.

