# Local translation model catalog

The local service accepts only the source-language codes listed here with target `en`. Each language maps to a fixed repository and immutable revision. Setup downloads snapshots explicitly; request handling loads only installed files and never contacts a model host. The process keeps at most one translation model resident at a time.

| Source | Model | Revision | License on model card | Notes |
| --- | --- | --- | --- | --- |
| Albanian (`sq`) | [opus-mt-sq-en](https://huggingface.co/Helsinki-NLP/opus-mt-sq-en/tree/10c8d34bcc202e0d8d75bd454b5e34bbea4c2909) | `10c8d34bcc202e0d8d75bd454b5e34bbea4c2909` | Apache-2.0 | Direct Albanian→English model. |
| Hindi (`hi`) | [opus-mt-hi-en](https://huggingface.co/Helsinki-NLP/opus-mt-hi-en/tree/a7d96a16729f812578bd55e7366147beda625d86) | `a7d96a16729f812578bd55e7366147beda625d86` | Apache-2.0 | Direct Hindi→English model. |
| Spanish (`es`) | [opus-mt-es-en](https://huggingface.co/Helsinki-NLP/opus-mt-es-en/tree/c96e2c5399ebfae4fc43d9669556b9afa74bb69d) | `c96e2c5399ebfae4fc43d9669556b9afa74bb69d` | Apache-2.0 | Direct Spanish→English model. |
| German (`de`) | [opus-mt-de-en](https://huggingface.co/Helsinki-NLP/opus-mt-de-en/tree/1a922f3b32a8e809e17a47d4b32142d8105924e5) | `1a922f3b32a8e809e17a47d4b32142d8105924e5` | Apache-2.0 | Direct German→English model. |
| Thai (`th`) | [opus-mt-th-en](https://huggingface.co/Helsinki-NLP/opus-mt-th-en/tree/0fff80be1c3f40d6180efd59f566ece956ace689) | `0fff80be1c3f40d6180efd59f566ece956ace689` | Apache-2.0 | Direct Thai→English model. |
| Norwegian Bokmål (`nb`) | [opus-mt-tc-big-gmq-en](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-gmq-en/tree/b243b46fc9e1eaf068ae0d8ae896ac1acd7d2380) | `b243b46fc9e1eaf068ae0d8ae896ac1acd7d2380` | CC-BY-4.0 | Shared North Germanic model; card lists `nob`. Variety-specific performance is uncertain. |
| Norwegian Nynorsk (`nn`) | [opus-mt-tc-big-gmq-en](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-gmq-en/tree/b243b46fc9e1eaf068ae0d8ae896ac1acd7d2380) | `b243b46fc9e1eaf068ae0d8ae896ac1acd7d2380` | CC-BY-4.0 | Same shared North Germanic model; card lists `nno`. Variety-specific performance is uncertain. |

The tc-big-gmq-en model card describes a North Germanic→English system and lists Danish, Faroese, Icelandic, Norwegian Nynorsk (`nno`), Norwegian Bokmål (`nob`), Norwegian (`nor`), and Swedish. It uses SentencePiece; the published usage example translates plain source text without a language-prefix token. The service maps both `nb` and `nn` to this same pinned snapshot and does not claim that it reliably distinguishes Norwegian varieties. Smoke checks on paired generated Bokmål/Nynorsk sentences found that this model translated common subjects, negation, past tense, and future tense more consistently than the smaller shared model; the brief checks do not establish general translation quality.

The Norwegian model card declares CC-BY-4.0. Attribution: OPUS-MT / Helsinki-NLP, [opus-mt-tc-big-gmq-en](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-gmq-en/tree/b243b46fc9e1eaf068ae0d8ae896ac1acd7d2380), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This project uses the published model snapshot locally for machine-generated English translation.

Generated local smoke checks are examples, not a translation benchmark. The Norwegian candidate consistently translated six paired Bokmål/Nynorsk samples for common subjects, negation, first person, past, and future tense. For example, both `Jenta leser en bok.` and `Jenta les ei bok.` produced “The girl is reading a book.” The previous smaller gmq snapshot left `Jenta` untranslated and sometimes changed the Bokmål future subject to plural, which is why the catalog now uses the larger candidate. Other tested models also made meaning errors: Hindi `कल लड़की ने किताब पढ़ी।` produced “Tomorrow the girl read a book,” and Thai `เด็กผู้หญิงไม่อ่านหนังสือ` produced “Girls don't read books.” These outputs show why model text must remain labeled machine-generated and unreviewed.

There is no direct `opus-mt-nb-en`, `opus-mt-nn-en`, or `opus-mt-no-en` repository in the Helsinki-NLP model API at catalog verification. The `opus-mt-no-no` model is Norwegian→Norwegian and is not used as an English translator.

Setup usage:

```powershell
./scripts/setup-local-translation.ps1
```

This explicitly installs all listed snapshots. To install a subset, pass `-Languages sq,hi` (the script keeps the existing per-user service token). If a language snapshot is absent locally, the service returns an unavailable response and does not download it while handling a page request. Models are machine-generated English. Use them as navigation aids, not as certified translations or grammatical/etymological authority.
