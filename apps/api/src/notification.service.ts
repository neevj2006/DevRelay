import { createHash, randomBytes, randomUUID } from "node:crypto";

import { parseApiEnvironment } from "@devrelay/config";
import type {
  CreateSubscriptionInput,
  CreateWebhookDestinationInput,
  UpdateSubscriberPreferencesWithTokenInput,
} from "@devrelay/contracts";
import { encryptWebhookSecret } from "@devrelay/execution";
import { EndpointPolicyError, validateEndpointDestination } from "@devrelay/monitoring";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Webhook } from "svix";

import { DatabaseService } from "./database.service.js";
import { OrganizationService } from "./organization.service.js";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}
function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(3, Math.min(local.length - 1, 6)))}@${domain}`;
}

@Injectable()
export class NotificationService {
  private readonly environment = parseApiEnvironment(process.env);
  private readonly encryptionKey =
    this.environment.NOTIFICATION_ENCRYPTION_KEY ?? "devrelay-local-notification-encryption-key";

  constructor(
    private readonly database: DatabaseService,
    private readonly organizations: OrganizationService,
  ) {}

  async subscribe(slug: string, input: CreateSubscriptionInput, sourceAddress: string) {
    if (input.website) return { accepted: true };
    await this.rateLimit(`subscribe:${slug}:${hash(sourceAddress).slice(0, 20)}`, 10, 60 * 60_000);
    await this.rateLimit(
      `subscribe-email:${slug}:${hash(input.email).slice(0, 20)}`,
      4,
      24 * 60 * 60_000,
    );
    const page = await this.database.client.pool.query<{
      id: string;
      organization_id: string;
      title: string;
    }>(
      "SELECT id,organization_id,title FROM status_pages WHERE lower(slug)=lower($1) AND deleted_at IS NULL",
      [slug],
    );
    const statusPage = page.rows[0];
    if (!statusPage) throw new NotFoundException("Status page not found");
    await this.database.client.pool.connect().then(async (client) => {
      try {
        await client.query("BEGIN");
        const existing = await client.query<{ id: string; state: string }>(
          "SELECT id,state FROM subscribers WHERE organization_id=$1 AND status_page_id=$2 AND normalized_email=$3 FOR UPDATE",
          [statusPage.organization_id, statusPage.id, input.email],
        );
        let subscriberId = existing.rows[0]?.id;
        if (existing.rows[0]?.state === "active") {
          await client.query("COMMIT");
          return;
        }
        if (!subscriberId) {
          subscriberId = randomUUID();
          await client.query(
            `INSERT INTO subscribers
            (id,organization_id,status_page_id,email,normalized_email,state,consented_at,consent_source)
            VALUES ($1,$2,$3,$4,$4,'pending_verification',now(),'public_status_page_form')`,
            [subscriberId, statusPage.organization_id, statusPage.id, input.email],
          );
        } else {
          await client.query(
            `UPDATE subscribers SET email=$1,state='pending_verification',consented_at=now(),consent_source='public_status_page_form',
            verified_at=NULL,unsubscribed_at=NULL,suppressed_at=NULL,updated_at=now() WHERE id=$2`,
            [input.email, subscriberId],
          );
        }
        await client.query(
          "DELETE FROM subscriber_preferences WHERE organization_id=$1 AND subscriber_id=$2",
          [statusPage.organization_id, subscriberId],
        );
        const scopes: Array<string | null> = input.serviceIds.length ? input.serviceIds : [null];
        for (const serviceId of scopes) {
          if (serviceId) {
            const allowed = await client.query(
              "SELECT 1 FROM status_page_services WHERE organization_id=$1 AND status_page_id=$2 AND service_id=$3",
              [statusPage.organization_id, statusPage.id, serviceId],
            );
            if (!allowed.rowCount)
              throw new ConflictException("A selected service is not published on this page");
          }
          await client.query(
            `INSERT INTO subscriber_preferences
            (organization_id,subscriber_id,service_id,incident_notifications,maintenance_notifications)
            VALUES ($1,$2,$3,$4,$5)`,
            [
              statusPage.organization_id,
              subscriberId,
              serviceId,
              input.incidentNotifications,
              input.maintenanceNotifications,
            ],
          );
        }
        await client.query(
          "UPDATE subscriber_verification_tokens SET revoked_at=now() WHERE organization_id=$1 AND subscriber_id=$2 AND purpose='verify' AND used_at IS NULL AND revoked_at IS NULL",
          [statusPage.organization_id, subscriberId],
        );
        const token = opaqueToken();
        await client.query(
          `INSERT INTO subscriber_verification_tokens
          (organization_id,subscriber_id,purpose,token_hash,expires_at) VALUES ($1,$2,'verify',$3,now()+interval '30 minutes')`,
          [statusPage.organization_id, subscriberId, hash(token)],
        );
        const safePayload = {
          email: input.email,
          statusPageTitle: statusPage.title,
          verifyUrlCiphertext: encryptWebhookSecret(
            `${this.environment.APP_ORIGIN}/subscriptions/verify#token=${token}`,
            this.encryptionKey,
          ),
        };
        await client.query(
          `INSERT INTO notification_deliveries
          (organization_id,kind,channel,subscriber_id,idempotency_key,safe_payload,next_attempt_at)
          VALUES ($1,'subscription_verification','email',$2,$3,$4,now()) ON CONFLICT DO NOTHING`,
          [
            statusPage.organization_id,
            subscriberId,
            `verify:${subscriberId}:${hash(token).slice(0, 16)}`,
            safePayload,
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
    return { accepted: true };
  }

  async verify(token: string) {
    return this.database.client.pool.connect().then(async (client) => {
      try {
        await client.query("BEGIN");
        const result = await client.query<{ organization_id: string; subscriber_id: string }>(
          `SELECT organization_id,subscriber_id FROM subscriber_verification_tokens
          WHERE token_hash=$1 AND purpose='verify' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`,
          [hash(token)],
        );
        const record = result.rows[0];
        if (!record) throw new NotFoundException("Verification link is invalid or expired");
        await client.query(
          "UPDATE subscriber_verification_tokens SET used_at=now() WHERE token_hash=$1",
          [hash(token)],
        );
        await client.query(
          "UPDATE subscribers SET state='active',verified_at=now(),unsubscribed_at=NULL,suppressed_at=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2",
          [record.subscriber_id, record.organization_id],
        );
        const preferencesToken = opaqueToken();
        const unsubscribeToken = opaqueToken();
        await client.query(
          "UPDATE subscriber_verification_tokens SET revoked_at=now() WHERE subscriber_id=$1 AND organization_id=$2 AND purpose IN ('preferences','unsubscribe') AND used_at IS NULL AND revoked_at IS NULL",
          [record.subscriber_id, record.organization_id],
        );
        await client.query(
          `INSERT INTO subscriber_verification_tokens (organization_id,subscriber_id,purpose,token_hash,expires_at)
          VALUES ($1,$2,'preferences',$3,now()+interval '30 days'),($1,$2,'unsubscribe',$4,now()+interval '30 days')`,
          [
            record.organization_id,
            record.subscriber_id,
            hash(preferencesToken),
            hash(unsubscribeToken),
          ],
        );
        await client.query("COMMIT");
        return { preferencesToken, unsubscribeToken, verified: true };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async unsubscribe(token: string) {
    const result = await this.database.client.pool.query<{
      organization_id: string;
      subscriber_id: string;
    }>(
      `UPDATE subscriber_verification_tokens SET used_at=now()
      WHERE token_hash=$1 AND purpose='unsubscribe' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now()
      RETURNING organization_id,subscriber_id`,
      [hash(token)],
    );
    const record = result.rows[0];
    if (!record) throw new NotFoundException("Unsubscribe link is invalid or expired");
    await this.database.client.pool.query(
      "UPDATE subscribers SET state='unsubscribed',unsubscribed_at=now(),verified_at=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2",
      [record.subscriber_id, record.organization_id],
    );
    await this.database.client.pool.query(
      "UPDATE subscriber_verification_tokens SET revoked_at=now() WHERE subscriber_id=$1 AND organization_id=$2 AND used_at IS NULL AND revoked_at IS NULL",
      [record.subscriber_id, record.organization_id],
    );
    return { unsubscribed: true };
  }

  async updatePreferences(input: UpdateSubscriberPreferencesWithTokenInput) {
    const record = await this.database.client.pool.query<{
      organization_id: string;
      subscriber_id: string;
      status_page_id: string;
    }>(
      `SELECT t.organization_id,t.subscriber_id,s.status_page_id FROM subscriber_verification_tokens t
      JOIN subscribers s ON s.id=t.subscriber_id AND s.organization_id=t.organization_id
      WHERE t.token_hash=$1 AND t.purpose='preferences' AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>now() AND s.state='active'`,
      [hash(input.token)],
    );
    const subscriber = record.rows[0];
    if (!subscriber) throw new NotFoundException("Preferences link is invalid or expired");
    await this.database.client.pool.connect().then(async (client) => {
      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM subscriber_preferences WHERE organization_id=$1 AND subscriber_id=$2",
          [subscriber.organization_id, subscriber.subscriber_id],
        );
        const scopes: Array<string | null> = input.serviceIds.length ? input.serviceIds : [null];
        for (const serviceId of scopes) {
          if (serviceId) {
            const allowed = await client.query(
              "SELECT 1 FROM status_page_services WHERE organization_id=$1 AND status_page_id=$2 AND service_id=$3",
              [subscriber.organization_id, subscriber.status_page_id, serviceId],
            );
            if (!allowed.rowCount)
              throw new ConflictException("A selected service is not published on this page");
          }
          await client.query(
            `INSERT INTO subscriber_preferences (organization_id,subscriber_id,service_id,incident_notifications,maintenance_notifications)
            VALUES ($1,$2,$3,$4,$5)`,
            [
              subscriber.organization_id,
              subscriber.subscriber_id,
              serviceId,
              input.incidentNotifications,
              input.maintenanceNotifications,
            ],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
    return { updated: true };
  }

  async getPreferences(token: string) {
    const result = await this.database.client.pool.query<{
      incident_notifications: boolean;
      maintenance_notifications: boolean;
      organization_id: string;
      status_page_id: string;
      subscriber_id: string;
    }>(
      `SELECT t.organization_id,t.subscriber_id,s.status_page_id,
      bool_or(p.incident_notifications) AS incident_notifications,bool_or(p.maintenance_notifications) AS maintenance_notifications
      FROM subscriber_verification_tokens t JOIN subscribers s ON s.id=t.subscriber_id AND s.organization_id=t.organization_id
      JOIN subscriber_preferences p ON p.subscriber_id=s.id AND p.organization_id=s.organization_id
      WHERE t.token_hash=$1 AND t.purpose='preferences' AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>now() AND s.state='active'
      GROUP BY t.organization_id,t.subscriber_id,s.status_page_id`,
      [hash(token)],
    );
    const record = result.rows[0];
    if (!record) throw new NotFoundException("Preferences link is invalid or expired");
    const [services, selected] = await Promise.all([
      this.database.client.pool.query<{ id: string; name: string }>(
        `SELECT s.id,s.name FROM status_page_services p JOIN services s ON s.id=p.service_id AND s.organization_id=p.organization_id
        WHERE p.organization_id=$1 AND p.status_page_id=$2 AND s.deleted_at IS NULL AND s.is_public=true ORDER BY p.display_order,s.name`,
        [record.organization_id, record.status_page_id],
      ),
      this.database.client.pool.query<{ service_id: string | null }>(
        "SELECT service_id FROM subscriber_preferences WHERE organization_id=$1 AND subscriber_id=$2",
        [record.organization_id, record.subscriber_id],
      ),
    ]);
    const all = selected.rows.some((row) => row.service_id === null);
    return {
      incidentNotifications: record.incident_notifications,
      maintenanceNotifications: record.maintenance_notifications,
      serviceIds: all
        ? []
        : selected.rows.flatMap((row) => (row.service_id ? [row.service_id] : [])),
      services: services.rows,
    };
  }

  async createWebhook(
    userId: string,
    organizationSlug: string,
    input: CreateWebhookDestinationInput,
  ) {
    const context = await this.organizations.requireRole(userId, organizationSlug, [
      "owner",
      "admin",
    ]);
    await this.rateLimit(`webhook-create:${context.organizationId}`, 20, 86_400_000);
    const existing = await this.database.client.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM webhook_destinations WHERE organization_id=$1 AND state='active' AND deleted_at IS NULL",
      [context.organizationId],
    );
    if ((existing.rows[0]?.count ?? 0) >= 10) {
      throw new ConflictException("The active webhook destination limit has been reached");
    }
    try {
      await validateEndpointDestination(input.endpointUrl);
    } catch (error) {
      if (error instanceof EndpointPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    if (!this.environment.NOTIFICATION_ENCRYPTION_KEY)
      throw new ConflictException("Webhook encryption is not configured");
    const secret = `dvr_${opaqueToken()}`;
    const id = randomUUID();
    await this.database.client.pool.query(
      `INSERT INTO webhook_destinations
      (id,organization_id,name,endpoint_url,signing_secret_ciphertext,signing_secret_prefix)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        id,
        context.organizationId,
        input.name,
        input.endpointUrl,
        encryptWebhookSecret(secret, this.environment.NOTIFICATION_ENCRYPTION_KEY),
        secret.slice(0, 12),
      ],
    );
    await this.audit(context.organizationId, userId, "webhook.created", "webhook_destination", id, {
      endpointHost: new URL(input.endpointUrl).host,
      name: input.name,
    });
    return { endpointUrl: input.endpointUrl, id, name: input.name, secret };
  }

  async dashboard(userId: string, organizationSlug: string) {
    const context = await this.organizations.requireRole(userId, organizationSlug, [
      "owner",
      "admin",
      "member",
    ]);
    const [subscribers, webhooks, deliveries] = await Promise.all([
      this.database.client.pool.query<{
        consent_source: string;
        email: string;
        id: string;
        state: string;
        verified_at: Date | null;
      }>(
        "SELECT id,email,state,verified_at,consent_source FROM subscribers WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100",
        [context.organizationId],
      ),
      this.database.client.pool.query(
        'SELECT id,name,endpoint_url AS "endpointUrl",state,signing_secret_prefix AS "secretPrefix",created_at AS "createdAt" FROM webhook_destinations WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC',
        [context.organizationId],
      ),
      this.database.client.pool.query(
        `SELECT d.id,d.channel,d.kind,d.status,d.next_attempt_at AS "nextAttemptAt",d.created_at AS "createdAt",count(a.id)::int AS attempts,
        (array_agg(a.safe_error_summary ORDER BY a.attempt_number DESC) FILTER (WHERE a.safe_error_summary IS NOT NULL))[1] AS "lastError"
        FROM notification_deliveries d LEFT JOIN delivery_attempts a ON a.organization_id=d.organization_id AND a.delivery_id=d.id
        WHERE d.organization_id=$1 GROUP BY d.id ORDER BY d.created_at DESC LIMIT 100`,
        [context.organizationId],
      ),
    ]);
    return {
      deliveries: deliveries.rows,
      subscribers: subscribers.rows.map((row) => ({ ...row, email: maskEmail(row.email) })),
      webhooks: webhooks.rows,
    };
  }

  async redeliver(userId: string, organizationSlug: string, deliveryId: string) {
    const context = await this.organizations.requireRole(userId, organizationSlug, [
      "owner",
      "admin",
    ]);
    const original = await this.database.client.pool.query<{ id: string }>(
      `UPDATE notification_deliveries SET status='retry_scheduled',next_attempt_at=now(),completed_at=NULL,
       lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id`,
      [deliveryId, context.organizationId],
    );
    if (!original.rows[0]) throw new NotFoundException("Delivery not found");
    await this.audit(
      context.organizationId,
      userId,
      "notification.redelivered",
      "notification_delivery",
      deliveryId,
      {},
    );
    return { id: deliveryId, status: "retry_scheduled" };
  }

  async providerEvent(
    rawBody: string,
    headers: {
      id: string | undefined;
      signature: string | undefined;
      timestamp: string | undefined;
    },
  ) {
    if (
      !this.environment.RESEND_WEBHOOK_SECRET ||
      !headers.id ||
      !headers.signature ||
      !headers.timestamp
    )
      throw new ForbiddenException("Provider webhook verification is not configured");
    let event: { data?: { email_id?: string }; type?: string };
    try {
      event = new Webhook(this.environment.RESEND_WEBHOOK_SECRET).verify(rawBody, {
        "svix-id": headers.id,
        "svix-signature": headers.signature,
        "svix-timestamp": headers.timestamp,
      }) as { data?: { email_id?: string }; type?: string };
    } catch {
      throw new ForbiddenException("Invalid provider webhook signature");
    }
    const client = await this.database.client.pool.connect();
    try {
      await client.query("BEGIN");
      const replay = await client.query(
        `INSERT INTO auth_rate_limits (key,count,last_request) VALUES ($1,1,$2)
         ON CONFLICT (key) DO NOTHING RETURNING key`,
        [`resend-event:${headers.id}`, Date.now()],
      );
      if (!replay.rowCount) {
        await client.query("COMMIT");
        return { accepted: true, duplicate: true };
      }
      const providerId = event.data?.email_id;
      if (
        providerId &&
        (event.type === "email.bounced" ||
          event.type === "email.complained" ||
          event.type === "email.suppressed")
      ) {
        await client.query(
          `UPDATE subscribers s SET state='suppressed',suppressed_at=now(),updated_at=now()
          FROM notification_deliveries d JOIN delivery_attempts a ON a.delivery_id=d.id AND a.organization_id=d.organization_id
          WHERE a.provider_message_id=$1 AND d.subscriber_id=s.id AND d.organization_id=s.organization_id`,
          [providerId],
        );
      }
      await client.query("COMMIT");
      return { accepted: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async rateLimit(key: string, maximum: number, windowMs: number) {
    const now = Date.now();
    const result = await this.database.client.pool.query<{ count: number }>(
      `INSERT INTO auth_rate_limits (key,count,last_request) VALUES ($1,1,$2)
      ON CONFLICT (key) DO UPDATE SET count=CASE WHEN auth_rate_limits.last_request<$3 THEN 1 ELSE auth_rate_limits.count+1 END,last_request=$2 RETURNING count`,
      [key, now, now - windowMs],
    );
    if ((result.rows[0]?.count ?? 0) > maximum)
      throw new HttpException("Please wait before trying again", 429);
  }

  private async audit(
    organizationId: string,
    userId: string,
    action: string,
    targetType: string,
    targetId: string,
    payload: Record<string, unknown>,
  ) {
    const id = randomUUID();
    await this.database.client.pool.query(
      `INSERT INTO audit_events
      (id,organization_id,actor_type,actor_user_id,action,target_type,target_id,source,correlation_id,idempotency_key,safe_payload,occurred_at)
      VALUES ($1::uuid,$2,'user',$3,$4,$5,$6,'api',$1::text,$7,$8,now())`,
      [id, organizationId, userId, action, targetType, targetId, `${action}:${id}`, payload],
    );
  }
}
