import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

import type { NotificationDeliveryJob, OutboxDispatchJob } from "@devrelay/contracts";
import { incidentWebhookPayloadV1Schema } from "@devrelay/contracts";
import type { DatabaseClient } from "@devrelay/database";
import { requestPinnedEndpoint, resolveEndpointDestination } from "@devrelay/monitoring";
import type { JobQueue } from "@devrelay/queue";
import { retryDelay } from "@devrelay/queue";
import nodemailer from "nodemailer";

import { runtimeMetrics, structuredLog, withTrace } from "./observability.js";

export type NotificationRuntimeOptions = {
  appOrigin: string;
  emailFrom: string;
  encryptionKey: string | undefined;
  resendApiKey: string | undefined;
  smtpHost: string;
  smtpPort: number;
  workerId: string;
};

export function encryptWebhookSecret(secret: string, keyMaterial: string): string {
  const key = createHash("sha256").update(keyMaterial).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptWebhookSecret(value: string, keyMaterial: string): string {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted secret");
  const key = createHash("sha256").update(keyMaterial).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function signWebhook(body: string, timestamp: string, secret: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function renderIncidentEmail(payload: Record<string, unknown>) {
  const lifecycle = String(payload.lifecycle ?? "investigating");
  const title = String(payload.title ?? "Service incident");
  const body = String(payload.body ?? "A new status update is available.");
  const statusUrl = String(payload.statusUrl ?? "");
  const label =
    lifecycle === "resolved"
      ? "Resolved"
      : lifecycle === "investigating"
        ? "New incident"
        : "Incident update";
  const subject = `[${label}] ${title}`;
  const text = `${label}: ${title}\n\n${body}\n\nView the latest status: ${statusUrl}`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a"><main style="max-width:560px;margin:auto;padding:32px 20px"><p style="color:#2563eb;font-weight:700">${escapeHtml(label)}</p><h1 style="font-size:24px">${escapeHtml(title)}</h1><p style="line-height:1.6">${escapeHtml(body)}</p><p><a href="${escapeHtml(statusUrl)}">View the latest status</a></p></main></body></html>`;
  return { html, subject, text };
}

export function renderVerificationEmail(payload: Record<string, unknown>) {
  const title = String(payload.statusPageTitle ?? "DevRelay status updates");
  const verifyUrl = String(payload.verifyUrl ?? "");
  const text = `Confirm your subscription to ${title}: ${verifyUrl}\n\nIf you did not request this, ignore this email.`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a"><main style="max-width:560px;margin:auto;padding:32px 20px"><h1 style="font-size:24px">Confirm your subscription</h1><p>Confirm that you want updates from ${escapeHtml(title)}.</p><p><a href="${escapeHtml(verifyUrl)}">Confirm subscription</a></p><p>If you did not request this, ignore this email.</p></main></body></html>`;
  return { html, subject: `Confirm your subscription to ${title}`, text };
}

export function renderMaintenanceEmail(payload: Record<string, unknown>) {
  const title = String(payload.title ?? "Scheduled maintenance");
  const body = String(payload.body ?? "Planned maintenance has been scheduled.");
  const statusUrl = String(payload.statusUrl ?? "");
  const subject = `[Scheduled maintenance] ${title}`;
  const text = `Scheduled maintenance: ${title}\n\n${body}\n\nView the latest status: ${statusUrl}`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a"><main style="max-width:560px;margin:auto;padding:32px 20px"><p style="color:#6d28d9;font-weight:700">Scheduled maintenance</p><h1 style="font-size:24px">${escapeHtml(title)}</h1><p style="line-height:1.6">${escapeHtml(body)}</p><p><a href="${escapeHtml(statusUrl)}">View the latest status</a></p></main></body></html>`;
  return { html, subject, text };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type FanoutEvent = {
  aggregate_id: string;
  event_type: string;
  id: string;
  organization_id: string;
  payload: Record<string, unknown>;
};

export class NotificationFanoutProcessor {
  constructor(
    private readonly database: DatabaseClient,
    private readonly appOrigin = "http://localhost:3000",
  ) {}

  async execute(job: OutboxDispatchJob): Promise<{ created: number }> {
    const result = await this.database.pool.query<FanoutEvent>(
      "SELECT id, organization_id, aggregate_id, event_type, payload FROM outbox_events WHERE id = $1 AND organization_id = $2",
      [job.payload.outboxEventId, job.organizationId],
    );
    const event = result.rows[0];
    if (!event || event.event_type !== "incident.public_update_published") return { created: 0 };
    const updateId =
      typeof event.payload.publicUpdateId === "string" ? event.payload.publicUpdateId : null;
    if (!updateId) return { created: 0 };
    return this.database.pool.connect().then(async (client) => {
      try {
        await client.query("BEGIN");
        const source = await client.query<{
          body: string;
          lifecycle: string;
          published_at: Date;
          severity: string;
          slug: string;
          started_at: Date;
          status_page_slug: string;
          status_page_title: string;
          title: string;
        }>(
          `SELECT u.body, i.lifecycle, u.published_at, i.severity, i.slug, i.started_at,
          i.public_title AS title, p.slug AS status_page_slug, p.title AS status_page_title
          FROM incident_public_updates u JOIN incidents i ON i.id = u.incident_id AND i.organization_id = u.organization_id
          JOIN status_pages p ON p.organization_id = u.organization_id AND p.deleted_at IS NULL
          WHERE u.id = $1 AND u.organization_id = $2 AND u.published_at IS NOT NULL`,
          [updateId, event.organization_id],
        );
        const item = source.rows[0];
        if (!item) {
          await client.query("ROLLBACK");
          return { created: 0 };
        }
        const services = await client.query<{ id: string; name: string; state: string }>(
          `SELECT s.id, s.name, s.current_state AS state FROM incident_services x JOIN services s ON s.id=x.service_id AND s.organization_id=x.organization_id
           WHERE x.incident_id=$1 AND x.organization_id=$2 ORDER BY s.name`,
          [event.aggregate_id, event.organization_id],
        );
        const basePayload = {
          body: item.body,
          incidentId: event.aggregate_id,
          lifecycle: item.lifecycle,
          publishedAt: item.published_at.toISOString(),
          severity: item.severity,
          statusUrl: `${this.appOrigin}/status/${item.status_page_slug}/incidents/${item.slug}`,
          title: item.title,
        };
        let created = 0;
        const subscribers = await client.query<{ email: string; id: string }>(
          `SELECT DISTINCT s.id, s.email FROM subscribers s
          JOIN subscriber_preferences p ON p.organization_id=s.organization_id AND p.subscriber_id=s.id
          WHERE s.organization_id=$1 AND s.state='active' AND p.incident_notifications=true
          AND (p.service_id IS NULL OR p.service_id = ANY($2::uuid[]))`,
          [event.organization_id, services.rows.map((service) => service.id)],
        );
        for (const subscriber of subscribers.rows) {
          const inserted = await client.query(
            `INSERT INTO notification_deliveries
            (organization_id,kind,channel,incident_public_update_id,subscriber_id,idempotency_key,safe_payload,next_attempt_at)
            VALUES ($1,'incident_update','email',$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING`,
            [
              event.organization_id,
              updateId,
              subscriber.id,
              `incident:${updateId}:subscriber:${subscriber.id}:email`,
              { ...basePayload, email: subscriber.email },
            ],
          );
          created += inserted.rowCount ?? 0;
        }
        const destinations = await client.query<{ id: string }>(
          "SELECT id FROM webhook_destinations WHERE organization_id=$1 AND state='active' AND deleted_at IS NULL",
          [event.organization_id],
        );
        const eventType =
          item.lifecycle === "resolved"
            ? "incident.resolved"
            : item.lifecycle === "investigating"
              ? "incident.created"
              : "incident.updated";
        const webhookPayload = incidentWebhookPayloadV1Schema.parse({
          affectedServices: services.rows,
          eventId: event.id,
          eventType,
          incident: {
            id: event.aggregate_id,
            lifecycle: item.lifecycle,
            publicTitle: item.title,
            severity: item.severity,
            startedAt: item.started_at.toISOString(),
          },
          occurredAt: item.published_at.toISOString(),
          organizationId: event.organization_id,
          publicUpdate: { body: item.body, publishedAt: item.published_at.toISOString() },
          version: 1,
        });
        for (const destination of destinations.rows) {
          const inserted = await client.query(
            `INSERT INTO notification_deliveries
            (organization_id,kind,channel,incident_public_update_id,webhook_destination_id,idempotency_key,safe_payload,next_attempt_at)
            VALUES ($1,'incident_update','webhook',$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING`,
            [
              event.organization_id,
              updateId,
              destination.id,
              `incident:${updateId}:webhook:${destination.id}`,
              webhookPayload,
            ],
          );
          created += inserted.rowCount ?? 0;
        }
        await client.query("COMMIT");
        return { created };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }
}

export class NotificationDeliveryDispatcher {
  constructor(
    private readonly database: DatabaseClient,
    private readonly queue: JobQueue,
  ) {}

  async dispatchDue(batchSize = 50, now = new Date()): Promise<number> {
    const due = await this.database.pool.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM notification_deliveries WHERE
       ((status IN ('pending','retry_scheduled') AND COALESCE(next_attempt_at,now()) <= $1)
       OR (status='sending' AND lease_expires_at < $1)) ORDER BY COALESCE(next_attempt_at,created_at),id LIMIT $2`,
      [now, Math.max(1, Math.min(batchSize, 100))],
    );
    for (const delivery of due.rows) {
      const job: NotificationDeliveryJob = {
        correlationId: `delivery:${delivery.id}`,
        createdAt: now.toISOString(),
        id: `delivery:${delivery.id}`,
        name: "notification.deliver",
        organizationId: delivery.organization_id,
        payload: { deliveryId: delivery.id },
        version: 1,
      };
      await this.queue.enqueue(job, {
        idempotencyKey: `${delivery.id}:${Math.floor(now.getTime() / 60_000)}`,
      });
    }
    return due.rowCount ?? 0;
  }
}

type Delivery = {
  channel: "email" | "webhook";
  id: string;
  idempotency_key: string;
  safe_payload: Record<string, unknown>;
  subscriber_id: string | null;
  webhook_destination_id: string | null;
};

export class NotificationDeliveryProcessor {
  private readonly smtp;
  constructor(
    private readonly database: DatabaseClient,
    private readonly options: NotificationRuntimeOptions,
  ) {
    this.smtp = nodemailer.createTransport({
      host: options.smtpHost,
      port: options.smtpPort,
      secure: false,
    });
  }

  async execute(job: NotificationDeliveryJob): Promise<{ status: string }> {
    return withTrace(
      "notification.deliver",
      {
        correlationId: job.correlationId,
        deliveryId: job.payload.deliveryId,
        jobId: job.id,
        jobName: job.name,
        organizationId: job.organizationId,
      },
      () => this.executeDelivery(job),
    );
  }

  private async executeDelivery(job: NotificationDeliveryJob): Promise<{ status: string }> {
    const startedAt = Date.now();
    const lease = new Date(Date.now() + 60_000);
    const claimed = await this.database.pool.query<Delivery>(
      `UPDATE notification_deliveries SET status='sending',lease_owner=$3,lease_expires_at=$4,updated_at=now()
      WHERE id=$1 AND organization_id=$2 AND (status IN ('pending','retry_scheduled') OR (status='sending' AND lease_expires_at<now()))
      RETURNING id,channel,idempotency_key,safe_payload,subscriber_id,webhook_destination_id`,
      [job.payload.deliveryId, job.organizationId, this.options.workerId, lease],
    );
    const delivery = claimed.rows[0];
    if (!delivery) {
      runtimeMetrics.record("notification.duplicate");
      structuredLog("info", "notification.delivery.duplicate", {
        correlationId: job.correlationId,
        deliveryId: job.payload.deliveryId,
        organizationId: job.organizationId,
        status: "duplicate",
      });
      return { status: "duplicate" };
    }
    const attempts = await this.database.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM delivery_attempts WHERE organization_id=$1 AND delivery_id=$2",
      [job.organizationId, delivery.id],
    );
    const attemptNumber = (attempts.rows[0]?.count ?? 0) + 1;
    const attempt = await this.database.pool.query<{ id: string }>(
      `INSERT INTO delivery_attempts
      (organization_id,delivery_id,attempt_number,status,started_at) VALUES ($1,$2,$3,'started',now()) RETURNING id`,
      [job.organizationId, delivery.id, attemptNumber],
    );
    try {
      const response =
        delivery.channel === "email"
          ? await this.sendEmail(delivery)
          : await this.sendWebhook(job.organizationId, delivery);
      await this.database.pool.query(
        `UPDATE delivery_attempts SET status='succeeded',provider_message_id=$1,response_status_code=$2,finished_at=now() WHERE id=$3`,
        [response.id, response.status, attempt.rows[0]!.id],
      );
      await this.database.pool.query(
        `UPDATE notification_deliveries SET status='succeeded',completed_at=now(),lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=now() WHERE id=$1`,
        [delivery.id],
      );
      runtimeMetrics.record("notification.delivery.succeeded", 1, {
        channel: delivery.channel,
      });
      runtimeMetrics.record("notification.delivery.duration", Date.now() - startedAt, {
        channel: delivery.channel,
        status: "succeeded",
      });
      structuredLog("info", "notification.delivery.succeeded", {
        attempt: attemptNumber,
        channel: delivery.channel,
        correlationId: job.correlationId,
        deliveryId: delivery.id,
        durationMilliseconds: Date.now() - startedAt,
        organizationId: job.organizationId,
        status: "succeeded",
      });
      return { status: "succeeded" };
    } catch (error) {
      const detail = classifyDeliveryError(error);
      const final = !detail.retryable || attemptNumber >= 5;
      const retryAt = final ? null : new Date(Date.now() + retryDelay(attemptNumber));
      await this.database.pool.query(
        `UPDATE delivery_attempts SET status=$1,response_status_code=$2,safe_error_code=$3,safe_error_summary=$4,finished_at=now(),next_retry_at=$5 WHERE id=$6`,
        [
          final ? "permanent_failure" : "retryable_failure",
          detail.status,
          detail.code,
          detail.summary,
          retryAt,
          attempt.rows[0]!.id,
        ],
      );
      await this.database.pool.query(
        `UPDATE notification_deliveries SET status=$1,completed_at=$2,next_attempt_at=$3,lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$4`,
        [
          final ? "permanently_failed" : "retry_scheduled",
          final ? new Date() : null,
          retryAt,
          delivery.id,
        ],
      );
      if (final && !detail.retryable && delivery.channel === "email" && delivery.subscriber_id) {
        await this.database.pool.query(
          "UPDATE subscribers SET state='suppressed',suppressed_at=now(),updated_at=now() WHERE id=$1 AND organization_id=$2 AND state='active'",
          [delivery.subscriber_id, job.organizationId],
        );
      }
      runtimeMetrics.record("notification.delivery.failed", 1, {
        channel: delivery.channel,
        status: final ? "permanent" : "retry",
      });
      runtimeMetrics.record("notification.delivery.duration", Date.now() - startedAt, {
        channel: delivery.channel,
        status: final ? "permanent" : "retry",
      });
      structuredLog(final ? "error" : "warn", "notification.delivery.failed", {
        attempt: attemptNumber,
        channel: delivery.channel,
        correlationId: job.correlationId,
        deliveryId: delivery.id,
        durationMilliseconds: Date.now() - startedAt,
        organizationId: job.organizationId,
        reason: detail.code,
        status: final ? "permanently_failed" : "retry_scheduled",
      });
      return { status: final ? "permanently_failed" : "retry_scheduled" };
    }
  }

  private async sendEmail(delivery: Delivery): Promise<{ id: string; status: number }> {
    const to = String(delivery.safe_payload.email ?? "");
    const payload = delivery.safe_payload.verifyUrlCiphertext
      ? {
          ...delivery.safe_payload,
          verifyUrl: decryptWebhookSecret(
            String(delivery.safe_payload.verifyUrlCiphertext),
            this.options.encryptionKey ?? "devrelay-local-notification-encryption-key",
          ),
        }
      : delivery.safe_payload;
    const rendered = payload.verifyUrl
      ? renderVerificationEmail(payload)
      : payload.notificationType === "maintenance"
        ? renderMaintenanceEmail(payload)
        : renderIncidentEmail(payload);
    if (this.options.resendApiKey) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": delivery.idempotency_key,
        },
        body: JSON.stringify({
          from: this.options.emailFrom,
          html: rendered.html,
          subject: rendered.subject,
          text: rendered.text,
          to: [to],
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string };
      if (!response.ok)
        throw new ProviderError(
          response.status >= 500 || response.status === 429,
          `email_http_${response.status}`,
          response.status,
        );
      return { id: data.id ?? "resend", status: response.status };
    }
    const result = await this.smtp.sendMail({
      from: this.options.emailFrom,
      html: rendered.html,
      messageId: `<${delivery.idempotency_key.replaceAll(":", ".")}@devrelay.local>`,
      subject: rendered.subject,
      text: rendered.text,
      to,
    });
    return { id: result.messageId, status: 250 };
  }

  private async sendWebhook(
    organizationId: string,
    delivery: Delivery,
  ): Promise<{ id: string; status: number }> {
    if (!delivery.webhook_destination_id || !this.options.encryptionKey)
      throw new ProviderError(false, "webhook_configuration_missing");
    const destination = await this.database.pool.query<{
      endpoint_url: string;
      signing_secret_ciphertext: string;
    }>(
      "SELECT endpoint_url,signing_secret_ciphertext FROM webhook_destinations WHERE id=$1 AND organization_id=$2 AND state='active' AND deleted_at IS NULL",
      [delivery.webhook_destination_id, organizationId],
    );
    const target = destination.rows[0];
    if (!target) throw new ProviderError(false, "webhook_destination_inactive");
    const resolvedDestination = await resolveEndpointDestination(target.endpoint_url);
    const body = JSON.stringify(delivery.safe_payload);
    const timestamp = Date.now().toString();
    const response = await requestPinnedEndpoint({
      body,
      destination: resolvedDestination,
      headers: {
        "Content-Type": "application/json",
        "DevRelay-Delivery-Id": delivery.id,
        "DevRelay-Signature": signWebhook(
          body,
          timestamp,
          decryptWebhookSecret(target.signing_secret_ciphertext, this.options.encryptionKey),
        ),
        "DevRelay-Timestamp": timestamp,
        "DevRelay-Version": "1",
      },
      maxResponseBytes: 65_536,
      method: "POST",
      timeoutMilliseconds: 10_000,
    });
    if (response.responseTooLarge)
      throw new ProviderError(false, "webhook_response_too_large", response.status);
    if (response.status < 200 || response.status >= 300)
      throw new ProviderError(
        response.status >= 500 || response.status === 408 || response.status === 429,
        `webhook_http_${response.status}`,
        response.status,
      );
    return { id: delivery.id, status: response.status };
  }
}

class ProviderError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
  }
}
function classifyDeliveryError(error: unknown) {
  if (error instanceof ProviderError)
    return {
      code: error.code,
      retryable: error.retryable,
      status: error.status ?? null,
      summary: error.code,
    };
  const code =
    error instanceof Error && error.name === "TimeoutError"
      ? "delivery_timeout"
      : "delivery_transport_error";
  return { code, retryable: true, status: null, summary: code };
}
