# Daily Desk sync

**Sync with Codex** requests a private run of Patrick’s saved Evening Level CRE Sync instructions. The signed-in broker must match the owner configured for the existing sales activity credential. The Desk reports progress and aggregate counts. The last successful sync time refers to requests from the Desk.

The Windows worker reads the current automation prompt, model, reasoning setting and workspace from the local `evening-level-cre-sync/automation.toml` each time. It starts a separate local Codex run with automatic approval review. Outlook and recorder access use the signed-in Windows profile. An offline request waits until the worker can claim it.

After deploying the API and web app, run `scripts/codex/install-desk-sync-worker.ps1` in Patrick’s normal Windows session. The installer verifies Python 3.11+, copies the worker to the user’s Local AppData folder and registers **Level CRE Daily Desk Sync** in Task Scheduler. It checks once a minute while Patrick is signed in. The worker only contacts the fixed Level CRE API origin and accepts a request ID. Disable that scheduled task to stop pickups.

If a run stops reporting, the Desk offers a new run after five minutes. Check Codex for any work already completed before retrying. The recorder retains provider message identities across runs. The existing weekday automation keeps its schedule.
