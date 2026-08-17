# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Report them
privately through the repository's **Security → Report a vulnerability**
advisories feature (or the maintainer's contact listed on the repository
homepage).

When reporting, include:

- The affected endpoint and version.
- A minimal reproduction (request, file, or payload).
- The impact you believe the issue has.

You will receive an acknowledgement within 5 business days and a timeline for
a fix. Public disclosure happens only after a fix is released.

## Scope

- All code under `app/` and the runtime dependencies listed in `pyproject.toml`.
- Anything that can be reached through the public HTTP surface: `/`,
  `/transcribe`, `/ask-audio`, `/chat`.

## What this project does and does not protect against

The API itself enforces:

- A configurable upload size limit (`MAX_UPLOAD_SIZE_MB`, default 25 MB) with
  a `413` response, so disk/memory exhaustion via uploads is bounded.
- Strict input validation on `/chat` (role whitelist, string content, message
  count cap) and extension checks on audio uploads.
- Temporary files that are deleted after every request.

It does **not** include authentication, authorization, or rate limiting — it
is an API you run behind your own infrastructure. Put it behind an API gateway
or reverse proxy that provides TLS, authentication, and rate limiting before
exposing it to untrusted clients.

## Supported versions

Only the latest release is supported. Fixes are backported on request for
critical vulnerabilities.
