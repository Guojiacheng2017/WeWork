# Agent Note: Send minimal intents for Host-managed runs
Status: implemented

## Problem
[LocalRunScheduler](../../../../src/runtime/localRunScheduler.ts) has two production start paths that read snapshots and profiles, resolve workspace paths, and serialize employee, work and session data. The managed route in [host-main](../../../../app-runtime/src/host-main.js) dispatches to [WeWorkService.prepare](../../../../app-runtime/src/host/wework-service.js), which rereads the authoritative store and reconstructs the profile, employee, work and session. The renderer's resolved workspace is not the authority for this path. These are real production consumers; the problem is duplicated preparation, not unused functionality.

## Proposal
For managed runs send only run identity, employee identity, work identity and prompt intent. Keep Host validation and workspace resolution. Keep the existing full-spec preparation for external runs. Remove managed-path profile fetching, workspace construction and serialization, and update scheduler tests to check the small intent and Host tests to check authoritative resolution.

## What we give up
Managed preflight errors will originate from the Host instead of duplicate renderer checks. Do not remove renderer run-to-employee tracking, admission protection, recovery, steering or cancellation: these have production Store callers and protect different transitions. Do not delete external or remote execution.

## Acceptance criteria
Managed chat and assigned work run without renderer profile/workspace lookup; external runs still pass their complete validated spec. Test missing employee/profile, start races, restart recovery, steering and cancellation. Update the execution-path documentation to name the Host as managed preparation owner.

## Risks
Preserve work identity validation and task-versus-chat distinction. The legacy and Session profile selection rules currently differ between renderer and Host; document and test the authoritative rule instead of silently changing it during extraction.

## Verification
Implemented on 2026-09-09. Frontend tests, runtime tests and production build passed. Isolated Electron/Pi checks covered employee creation, first reply, restart/resume, context restart/history and cancellation before deletion. Browser fault injection verified draft preservation, dismissal, refresh retention and employee notice isolation. External adapters retain their existing path; no new real remote-adapter verification was performed.
