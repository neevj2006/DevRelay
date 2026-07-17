# Outgoing webhook verification

DevRelay sends public incident events as canonical JSON using payload version `1`. Each request has:

- `DevRelay-Delivery-Id`: the UUID of the durable logical delivery.
- `DevRelay-Timestamp`: Unix time in milliseconds.
- `DevRelay-Version`: `1`.
- `DevRelay-Signature`: `v1=` followed by a lowercase HMAC-SHA256 digest.

The signed bytes are `${timestamp}.${rawRequestBody}`. Verify the signature against the exact raw body before parsing JSON, use a timing-safe comparison, reject timestamps older than five minutes, and deduplicate on the delivery ID.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyDevRelayWebhook(
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const timestamp = headers["devrelay-timestamp"];
  const received = headers["devrelay-signature"];
  if (!timestamp || !received || Math.abs(Date.now() - Number(timestamp)) > 300_000) return false;
  const expected = `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  return (
    received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  );
}
```

DevRelay retries timeouts, HTTP 408, 429, and 5xx responses with bounded exponential backoff. Other 4xx responses are permanent failures. Destination URLs are resolved and screened against private, loopback, link-local, and metadata addresses both when saved and before delivery; redirects are not followed.
