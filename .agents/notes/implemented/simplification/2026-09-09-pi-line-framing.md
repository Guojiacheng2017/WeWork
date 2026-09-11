# Agent Note: Replace repeated Pi byte framing with Node readline
Status: implemented

## Problem
[pi-runtime](../../../../app-runtime/src/pi-runtime.js), [pi-command](../../../../app-runtime/src/pi-command.js), and [pi-model-discovery](../../../../app-runtime/src/host/pi-model-discovery.js) each append chunk.toString() to a string and manually search newline delimiters. All three have production consumers: execution, native commands and model catalog discovery. Besides duplication, decoding each byte chunk independently can corrupt a multibyte character split across chunks. Blank lines and CRLF are handled differently across the implementations.

## Proposal
Use node:readline createInterface with crlfDelay: Infinity for line framing in each path, or one small shared line subscription if it deletes more glue. Keep each path's JSON response validation, request correlation, timeout and teardown ownership. This is a builtin replacement, not a new dependency or a generic RPC framework.

## What we give up
Choose and document treatment of blank lines and an unterminated final line: readline emits the final line, unlike the existing newline-only loops. Runtime execution waits for agent completion, commands wait for one correlated response, and discovery waits for two responses; these settlement contracts must remain separate.

## Acceptance criteria
Delete all three manual byte buffers/newline loops. Test split UTF-8, CRLF, blank lines, malformed JSON and final unterminated input at the shared boundary; preserve existing command timeout, runtime cancellation and child-process close tests. Close the line reader during teardown without weakening wait-for-process-exit guarantees.

## Risks
Do not catch consumer callback exceptions as JSON parsing errors. Do not turn this focused reduction into one shared subprocess lifecycle: process ownership differs between these three callers.

## Verification
Implemented on 2026-09-09. Frontend tests, runtime tests and production build passed. Isolated Electron/Pi checks covered employee creation, first reply, restart/resume, context restart/history and cancellation before deletion. Browser fault injection verified draft preservation, dismissal, refresh retention and employee notice isolation. External adapters retain their existing path; no new real remote-adapter verification was performed.
