# Gemini connection diagnostics

NEOFORM uses the pinned Gemini model through Google's documented direct API.
Both standard and authorization-key formats remain accepted as literal header
values; no key-prefix conversion or provider/model fallback is introduced.

Google can reject a credential or Google project independently of NEOFORM. The
server now translates bounded upstream error signals into static, actionable
codes for rejected/unsupported/blocked keys, application restrictions, disabled
API access, denied project access, exhausted quota and model/provider failures.
Provider error bodies, credentials and project identifiers are never returned.
Object and array error envelopes are supported, with a 16 KB error-body limit.
Non-transient authentication errors are not retried automatically.

**Test connection** retains its metadata-only meaning and backward-compatible
empty request. A successful metadata read does not establish inference access.
**Test reply** submits one fixed, tiny JSON diagnostic to the same pinned model,
with no training/profile/program context, conversation, tools or stored provider
interaction. Success requires the expected reply, matching model and valid
no-tool usage proof. It uses the existing generation lease, cancellation/key
rotation fences and shared daily attempt allowance; failures count as attempts.
The optional `mode` field on `/api/ai/test` accepts only `metadata` or `reply`.

The connection UI distinguishes status loading, checking and saving. Credential
errors in coach chat reveal the connection controls instead of leaving the
recovery action hidden. Existing credentials are never loaded into an input or
included in backups. No new database migration, training policy, saved preference
or credential-sharing boundary is introduced.

References: [Google API keys](https://ai.google.dev/gemini-api/docs/api-key),
[Google troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting),
[Interactions API](https://ai.google.dev/api/interactions-api).
