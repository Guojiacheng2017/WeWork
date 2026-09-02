# WeWork Authentication Container Recognition Plan

> **Execution:** Use subagent-driven development with task and final scoped reviews.

**Goal:** Ensure every structured container whose identifier is rooted in `auth` or `authentication` enters the protected authentication schema, including `authPool` and future suffix variants.

**Global Constraints**

- No raw authentication material may pass through an auth/authentication-named container.
- Recognition must be semantic and suffix-independent, not an enumerated alias list.
- Ordinary words containing incidental character sequences (for example `author`, `authority`, `authenticationMode` scalar metadata outside container position) must not become false-positive containers.
- Preserve the typed authentication/connection metadata schemas, exact references, generic extensions outside protected contexts, traversal bounds, and all existing behavior.

### Task 1: Make protected authentication-container recognition suffix-independent

**Files:**
- Modify: `app-runtime/src/host/wework-configuration.js`
- Modify: `app-runtime/test/wework-configuration.test.js`

- [x] Add failing tests for `authPool`, `authenticationPool`, nested/array variants, and at least one unseen suffix.
- [x] Add green controls for unrelated `author*`/`authority*` containers and allowed protected metadata.
- [x] Implement semantic word-based container recognition rooted in the exact `auth` or `authentication` word.
- [x] Run focused and complete WeWork tests, server tests, build, and `git diff --check`.
