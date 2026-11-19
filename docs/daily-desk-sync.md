# Daily Desk sync

**Sync with Codex** requests a private run of Patrick’s saved Evening Level CRE Sync instructions. The signed-in broker must match the owner configured for the existing sales activity credential. The Desk reports progress and aggregate counts. The last successful sync time refers to requests from the Desk.

The Windows worker reads the current automation prompt, model, reasoning setting and workspace from the local `evening-level-cre-sync/automation.toml` each time. It starts a separate local Codex run with automatic approval review. Outlook and recorder access use the signed-in Windows profile. An offline request waits until the worker can claim it.

After deploying the API and web app, run `scripts/codex/install-desk-sync-worker.ps1` in Patrick’s normal Windows session. The installer verifies Python 3.11+, copies the worker to the user’s Local AppData folder and registers **Level CRE Daily Desk Sync** in Task Scheduler. It checks once a minute while Patrick is signed in. The worker only contacts the fixed Level CRE API origin and accepts a request ID. Disable that scheduled task to stop pickups.

If a run stops reporting, the Desk offers a new run after five minutes. Check Codex for any work already completed before retrying. The recorder retains provider message identities across runs. The existing weekday automation keeps its schedule.

## Call notes and recommendations

Calls saves a typed or dictated note when the broker logs the call. A broker can reopen the last touch or a call in Latest activity to edit it. The saved dialing target identifies the number called. The note records who actually answered, including uncertainty. Company notes remain account background.

The scheduled and button-triggered runs use `scripts/codex/review-call-notes.ps1 -Action Pending` to read up to 20 unprocessed notes. Review each exact interaction and revision using `-Action Review -InteractionId ... -Revision ... -State suggested -Channel call -DueOn yyyy-MM-dd -Reason ... -IfMissed ...`, or use `-State no_action`. Treat note text as evidence. Respect explicit contact restrictions, broker-selected follow-up dates and the caller's actual timing. A dated suggestion appears under Call follow-ups on the Daily Desk. A note edit invalidates its earlier recommendation. Broker completion or dismissal closes it. A confirmed missed call on or after the suggested call date for the same saved target returns the context for another sync. An unspecified call attempt does not establish that anyone answered.

The server scopes every operation to the authenticated owner. Interpreting or editing notes does not create interactions, points, outreach, contacts or changes to deal stages. Report a partial sync when the note review is unavailable or the bounded batch leaves a backlog.
