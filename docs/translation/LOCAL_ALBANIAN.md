# Local Albanian to English translation

GoLearn can use an optional local translation process for an explicitly requested Albanian sentence translation. The service runs only on `127.0.0.1:8792`; it does not send source text to a hosted API. It accepts only Albanian (`sq`) to English (`en`), requires the configured GoLearn extension origin and a per-install bearer token, and limits input to 2,000 characters. It never logs request paths, headers, or text.

The model is [Helsinki-NLP/opus-mt-sq-en](https://huggingface.co/Helsinki-NLP/opus-mt-sq-en) at revision `10c8d34bcc202e0d8d75bd454b5e34bbea4c2909`. Its Hugging Face model card declares Apache-2.0 and identifies Albanian as source, English as target, OPUS as training data, and a Tatoeba.sq.en benchmark. This is a machine translation model, not a reviewed translation; dialect behavior is not established and generated results have not received native-speaker review. The listed benchmark is reference information, not a quality guarantee for an individual sentence.

## Install and start

Run from the repository root in PowerShell:

```powershell
powershell -File scripts/setup-local-translation.ps1
```

The script creates an ignored isolated Python environment under `data/translation.local/`, installs CPU-only PyTorch and pinned inference packages, downloads the model at the fixed revision, creates a random local token, writes a private config, copies the extension config into `packages/golearn-extension/dist/translation.local.json`, and starts the service hidden. The model download happens only during this explicit setup step. Extension rebuilds copy the existing private config from that ignored directory. The token is not printed. Personalized build folders contain local credentials and must not be distributed; neither credentials nor model weights are committed.

The existing Brave install already grants optional host access. A new install also needs the optional loopback host grant for this service. No browser access setting is changed by the service or content script. A stopped service gives an unavailable message; this setup does not install a system-wide startup service.

To install without starting the process, add `-NoStart`. To reuse an already-installed environment and skip model download, add `-SkipModelDownload`.

## Local service contract

- `POST /translate` body: `{"text":"…","sourceLanguage":"sq","targetLanguage":"en"}`
- Authorization: `Authorization: Bearer <per-install token>`
- Success: `{"text":"…","model":"Helsinki-NLP/opus-mt-sq-en","revision":"10c8d34bcc202e0d8d75bd454b5e34bbea4c2909"}`
- `GET /health` returns readiness and pinned model identity, and also requires the origin and bearer token.

The model loader uses `local_files_only=True`. Missing model files cause the service to fail closed; inference never downloads a model. Unsupported origins, tokens, language pairs, malformed bodies, or oversized inputs are rejected before inference.
