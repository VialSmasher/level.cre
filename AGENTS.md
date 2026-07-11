# Level CRE Sales Activity Rules

- Treat `/app/desk` as Patrick's primary business-development control center.
- For prospecting and brokerage follow-up work, use the `outlook-sales-followup` skill when it is available.
- Never record an attempted email or draft as sent. Record activity only after the delivery tool confirms `sent`.
- Approved sales sends should BCC `8feefe98cef5cf7437bbdb5d2e20e761@inbound.postmarkapp.com` unless Patrick explicitly opts out.
- After a confirmed send, run `outlook-sales-followup/scripts/record_levelcre_sales_activity.ps1` with contact, company, email, subject, timestamp, disposition, and a short note. Do not send the full message body to the activity bridge.
- If the recorder reports `queued_local`, continue the sales workflow and do not resend the email. Flush the durable outbox at the end of the batch.
- Do not create fake prospects or map pins from email-only evidence. Uncertain matches belong in the Daily Desk review queue.
- Preserve the API's idempotency key by using the provider message ID when available. Otherwise pass the confirmed send timestamp so retries reuse the same activity identity.
