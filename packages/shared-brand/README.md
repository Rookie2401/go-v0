# Go identity
The shared Go logo uses a bold G and a globe as the O, based on the supplied Global Outreach photo, in the Western Canon brown.
Colour, decided by the owner on 2026-10-27: the mark is the Western Canon BROWN (#6b4f2a) on paper (#f7f2e8), the reading palette of both apps, not the navy it was first generated in. The two masters below were recoloured from the navy originals (every pixel's ink amount re-expressed as brown; the transparent master keeps its alpha). The headers draw go-logo.png as a CSS mask filled with the accent colour, so the mark is brown on paper and the lighter brown of the dark theme. Both GoLearn and GoReview use this mark; their app names stay visible alongside it.
- go-logo.png: transparent master for application headers.
- go-icon-source.png: opaque square master for app icons.
Generated with the built-in image_gen tool on 2026-10-26.
Prompt: Design a modern navy G plus simplified desktop globe as the O, based on the reference. No university wording or slogan. Transparent background.
Icon prompt: Adapt the exact shared G and globe logo to an opaque ivory square app icon, centered with safe margins. No extra text.
Regenerate icon sizes with: powershell -ExecutionPolicy Bypass -File scripts/sync-go-brand.ps1
The gopractice/scripts/make-icons.mjs entry point also delegates to the shared icon pipeline.
These are local source changes. Hosted pages, installed extensions and native apps need rebuilding and release before they display the new identity.
Revision: removed all latitude and longitude grid lines using the built-in image_gen tool. Edit prompt: Remove only the internal globe grid lines; preserve the G, continents, globe outline, external meridian support and stand. Transparent master and opaque app icon updated on 2026-10-26.

Revision: Extended the outer globe support bar past the pedestal to join the lower-left axis. Built-in image_gen edit prompt: Add the missing lower-left outer meridian arc, matching its existing thickness and radius, preserving the G, continents, globe rim, stand and backgrounds. No latitude or longitude lines.
