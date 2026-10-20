# Azure Speech setup for GoListen

This guide prepares the server-side Azure Speech proxy. The browser never receives the subscription key. The setup helper defaults to a plan only and does not contact Azure until `-Apply` is supplied. GoListen accepts the free F0 tier only; if F0 is unavailable in the approved region, stop and choose another approved region or stop provisioning.

Azure’s official voice catalog lists the standard voices used by GoListen, including `sq-AL`, `de-DE`, `es-HN`/`es-MX`, `hi-IN`, and `th-TH`: [Language and voice support](https://learn.microsoft.com/azure/ai-services/speech-service/language-support). Azure’s CLI account commands are documented at [Create and manage Speech resources](https://learn.microsoft.com/azure/ai-services/speech-service/overview#azure-speech-resource).

The reviewable ARM template at `infra/azure-speech-f0.json` declares only a `SpeechServices` account with the free `F0` SKU. It does not contain credentials or a subscription id. Use it only after creating or selecting the explicitly approved resource group:

```powershell
az deployment group create `
  --subscription '<subscription-id>' `
  --resource-group 'go-v0-speech' `
  --template-file .\infra\azure-speech-f0.json `
  --parameters speechAccountName='go-v0-speech-<unique-suffix>' location='eastus'
```

This deployment command is a cloud mutation. The repository does not run it automatically.

## Before provisioning

Create your Azure account at [Microsoft Azure free account](https://azure.microsoft.com/free/) and finish Microsoft's identity and subscription setup yourself. Then confirm the target subscription. The helper accepts F0 only and rejects an existing paid resource. It does not install Azure CLI, authenticate, create a subscription, or switch to a paid tier.

Check the local CLI session with `az account show` and sign in with `az login` if needed. The helper requires all resource identifiers explicitly so it cannot accidentally use another subscription or region.

## Review the default plan

From the repository root, replace the example values with the intended subscription and resource names:

```powershell
pwsh -File .\scripts\setup-azure-speech.ps1 `
  -SubscriptionId '<subscription-id>' `
  -ResourceGroupName 'go-v0-speech' `
  -ResourceName 'go-v0-speech-<unique-suffix>' `
  -Location 'eastus'
```

Plan mode does not call Azure, create files, or generate credentials. Review the printed subscription, resource group, resource name, region, SKU, and env destination.

## Apply after explicit resource approval

Run the same command with `-Apply` only after confirming the subscription, region, resource name, and F0 availability:

```powershell
pwsh -File .\scripts\setup-azure-speech.ps1 `
  -SubscriptionId '<subscription-id>' `
  -ResourceGroupName 'go-v0-speech' `
  -ResourceName 'go-v0-speech-<unique-suffix>' `
  -Location 'eastus' `
  -Apply
```

The helper creates or reuses only an F0 `SpeechServices` account in the named resource group. It refuses an existing paid resource. It retrieves `key1` without printing it and updates only `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `.env.local`, preserving unrelated entries. If no key is returned, it leaves the env file unchanged. `.env.local` is ignored by Git; do not paste the key into source, a browser setting, a ticket, or a review packet.

For the standalone local proxy, pass the verified extension id when applying:

```powershell
... -ExtensionId 'ckjmiefophlhjlobnidnclkiimbjalfo' -Apply
```

This adds the nonsecret `GO_SPEECH_ALLOWED_EXTENSION_ORIGINS=chrome-extension://ckjmiefophlhjlobnidnclkiimbjalfo` setting to `.env.local`. The GoPractice local config may then set `speechProxyBase` to `http://127.0.0.1:8791/api/speech`; this is local routing configuration, not a credential. Do not enable remote speech consent by script.

For an extension client, also configure a separately generated local bearer token as
`GO_SPEECH_AUTH_TOKEN` and store the same token in the trusted local extension settings. The token authenticates
the extension-to-proxy hop; it is never accepted as an Azure key and is never sent to Azure. Authenticated synthesis
requests must identify the operation as practice with `sourcePermission: "allowed"` and a `kind` of `word`, `phrase`,
or `sentence`. The proxy rejects requests that omit these fields, so source/rights claims cannot silently authorize a
different processing purpose. Do not put the token or Azure key in the extension bundle.

The optional `GO_SPEECH_MAX_BODY_BYTES`, `GO_SPEECH_MAX_TEXT_CHARS`, `GO_SPEECH_RATE_LIMIT_PER_MINUTE`, and
`GO_SPEECH_UPSTREAM_TIMEOUT_MS` settings tighten or raise the documented defaults within server-side safety caps.
`GO_SPEECH_DAILY_CHARACTER_LIMIT` bounds charged synthesis characters in an in-memory daily bucket (the bucket
resets when the speech server restarts). Plain text is accepted; raw SSML is rejected. Audio responses are capped at
4 MB, and a disconnected client aborts the upstream request.

Start the speech-only server with `npm run speech:serve`. It binds to `127.0.0.1:8791`, serves no app/source files, and accepts cross-origin calls only from extension origins you explicitly allowed. The old root application's listening switch does not need to be enabled. A `configured: true` status means credentials are present; a successful voice-list request and actual WAV playback are still needed to verify delivery. Native-speaker review is needed for pronunciation quality. Generated Azure speech remains synthetic practice and never qualifies as listening evidence.

## Portal handoff when Azure CLI is unavailable

In the Azure portal, select the approved subscription, create or select the named resource group, and create an **Azure AI Speech** resource with kind **SpeechServices**, the approved region, and SKU **F0**. After deployment, open **Keys and Endpoint**, copy one key into the server’s local `.env.local` as `AZURE_SPEECH_KEY`, and set `AZURE_SPEECH_REGION` to the resource region. Keep the key off screenshots and shared documents. The proxy reads these two names server-side only.

If the portal shows only a paid SKU or F0 is unavailable, stop. There is no automatic S0 fallback. Do not substitute a different region or resource without updating the planned values and reviewer record.

## Current repository blocker

The current workspace has no `AZURE_SPEECH_KEY`, no `AZURE_SPEECH_REGION`, no Azure CLI profile, and no verified live Azure call. The GoListen tests use mocked upstream responses. This setup guide and helper are ready for an owner with an existing Azure subscription; they do not provision or authenticate by themselves.
