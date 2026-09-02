# WeWork Authentication Header Secret Hardening Plan

> **Execution:** Use subagent-driven development with an independent task reviewer and final scoped reviewer.

**Goal:** Close the remaining raw-authentication-header bypass in extensible layered WeWork configuration without reintroducing false positives for benign authentication/connection metadata.

**Global Constraints**

- Syncable `.wework/config.json` layers must never accept raw credentials or authentication material.
- Preserve benign extensible metadata such as auth `mode`/`audience` and connection `host`/`port`/`tls`.
- Preserve the existing support for hierarchical `credentialRef` and safe `apiKeyEnv` references.
- Validation remains bounded, recursive, deterministic, and identical for file, built-in, Session, and task layers.
- Do not change unrelated workspace, migration, Runtime, or UI behavior.

### Task 1: Reject context-dependent authentication header carriers

**Files:**
- Modify: `app-runtime/src/host/wework-configuration.js`
- Modify: `app-runtime/test/wework-configuration.test.js`

- [ ] Add failing regressions for nested `authentication.header`, `auth.authHeader`, `authentication.authenticationHeader`, and `connection.authHeader` raw values.
- [ ] Add acceptance regressions for benign auth metadata and connection host/port/tls values.
- [ ] Implement context-aware secret-carrier validation for authentication namespaces without broad suffix rules that reject benign extension fields elsewhere.
- [ ] Run focused Runtime tests, the complete WeWork test suite, production build, server suite, and `git diff --check`.
- [ ] Commit the fix and record exact verification evidence.
