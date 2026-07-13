# Level CRE Sales Activity Rules

- Treat `/app/desk` as Patrick's primary business-development control center.
- For prospecting and brokerage follow-up work, use the `outlook-sales-followup` skill when it is available.
- Never record an attempted email or draft as sent. Record activity only after the delivery tool confirms `sent`.
- After a Codex-assisted send is confirmed, record it directly with `scripts/codex/record-levelcre-sales-activity.ps1`. This direct recorder is the primary ingestion path and does not require a Postmark BCC.
- Use `8feefe98cef5cf7437bbdb5d2e20e761@inbound.postmarkapp.com` as a fallback capture path for messages Patrick sends outside Codex, or when Patrick explicitly asks for BCC capture. Do not rely on BCC as the only proof of a Codex-assisted send.
- Pass contact, company, email, subject, timestamp, disposition, and a short note to the recorder. The installed `outlook-sales-followup` skill contains the same recorder for tasks outside this repository. Do not send the full message body to the activity bridge.
- If the recorder reports `queued_local`, continue the sales workflow and do not resend the email. Flush the durable outbox at the end of the batch.
- Do not create fake prospects or map pins from email-only evidence. Uncertain matches belong in the Daily Desk review queue.
- Preserve the API's idempotency key by using the provider message ID when available. Otherwise pass the confirmed send timestamp so retries reuse the same activity identity.
- Canonical activity must retain source, evidence status, confidence, and the provider identity. Inferences stay reviewable and must not enter the map or Do Now queue as confirmed facts.
- Never mark an opportunity won or lost from inferred evidence. Terminal stages require Patrick-confirmed evidence.
- Use `scripts/codex/scan-patrick-market-memory.ps1` only as a read-only discovery tool. Its output is a candidate report, not approval to import or create opportunities.
