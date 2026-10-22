⚠️ One correctness finding.

- `main.js:34` — **Medium.** When `localStorage.getItem()` throws but a valid ad-free cookie remains readable, the surrounding `catch` skips the cookie check. The loader waits until game completion, so the buyer sees the ad area until it loads. Reproduced with a throwing storage mock; the shared helper handles this case correctly. **Fix:** catch the localStorage read separately, then check the cookie regardless.

---
**Safe to close:** nothing running, nothing waiting on you.

[codex-review] quota after: 5-hour 90% -> 92%, weekly 30% -> 30%; 5-hour window resets 2026-10-23T03:34:09.000Z -> 2026-10-23T03:34:09.000Z
