# Fonts shipped with Biblia

These are the web fonts of the Biblia app (`C:\Users\CJWal\dev\biblia-v0`, its `dist/assets/*.woff2`), copied here with the hash taken out of
each file name. `styles.css` declares them with their family names.

| Family | Files | Used for | Licence |
|---|---|---|---|
| EB Garamond | `eb-garamond-latin-*`, `eb-garamond-greek-*`, `eb-garamond-greek-ext-*` (400, 400 italic, 600) | the interface, the Greek text | SIL Open Font License 1.1, `EB-Garamond-OFL.txt` |
| Frank Ruhl Libre | `frank-ruhl-libre-hebrew-400-normal`, `-500-normal` | the Hebrew text | SIL Open Font License 1.1, `frank-ruhl-libre-OFL.txt` |

Both families are free software under the SIL Open Font License 1.1: they may be used, copied and redistributed with the licence text, which
sits beside them in this folder and is linked from Settings (Sources & licences). The fonts are not modified here; the woff2 files are the
subsets the families' maintainers publish through Fontsource.

Where they go: `vite build` copies `public/` as it is, so `fonts/` lands beside `index.html`; in the standalone edition the service worker
precaches it as part of the shell (everything of the build except `data/` and `lexicon/`).
