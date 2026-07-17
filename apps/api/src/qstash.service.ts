import { createHash } from "node:crypto";

import { parseApiEnvironment } from "@devrelay/config";
import { type QueueJob } from "@devrelay/contracts";
import {
  AvailabilityAggregationScheduler,
  AvailabilityAggregator,
  MaintenanceReconciler,
  MonitorCheckExecutor,
  MonitoringFreshnessDetector,
  MonitorScheduler,
  NotificationDeliveryDispatcher,
  NotificationDeliveryProcessor,
  NotificationFanoutProcessor,
  OutboxDispatcher,
  PolicyEngine,
  RetentionCleaner,
} from "@devrelay/execution";
import { QStashJobQueue } from "@devrelay/queue";
import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Receiver } from "@upstash/qstash";

import { DatabaseService } from "./database.service.js";

@Injectable()
export class QStashService {
  private readonly environment = parseApiEnvironment(process.env);
  private readonly receiver =
    this.environment.QSTASH_CURRENT_SIGNING_KEY && this.environment.QSTASH_NEXT_SIGNING_KEY
      ? new Receiver({
          currentSigningKey: this.environment.QSTASH_CURRENT_SIGNING_KEY,
          nextSigningKey: this.environment.QSTASH_NEXT_SIGNING_KEY,
        })
      : null;
  private readonly queue =
    this.environment.QUEUE_ADAPTER === "qstash" && this.environment.QSTASH_TOKEN
      ? new QStashJobQueue({
          deliveryUrl: `${this.environment.QSTASH_DELIVERY_BASE_URL}/internal/qstash/jobs`,
          failureCallbackUrl: `${this.environment.QSTASH_DELIVERY_BASE_URL}/internal/qstash/failure`,
          paused: this.environment.QSTASH_HOSTED_SCHEDULER_PAUSED === "true",
          token: this.environment.QSTASH_TOKEN,
        })
      : null;

  constructor(private readonly database: DatabaseService) {}

  async verifyAndClaim(body: string, signature: string | undefined, path: string) {
    if (!this.receiver || !signature) throw new UnauthorizedException("QStash signature required");
    try {
      const url = new URL(path, this.environment.QSTASH_DELIVERY_BASE_URL).href;
      await this.receiver.verify({ body, signature, url });
    } catch {
      throw new UnauthorizedException("Invalid QStash signature");
    }
    const key = `qstash-replay:${createHash("sha256")
      .update(path)
      .update("\0")
      .update(signature)
      .update("\0")
      .update(body)
      .digest("hex")}`;
    const claim = await this.database.client.pool.query(
      `INSERT INTO auth_rate_limits (key,count,last_request) VALUES ($1,1,$2)
       ON CONFLICT (key) DO NOTHING RETURNING key`,
      [key, Date.now()],
    );
    return { duplicate: !claim.rowCount, key };
  }

  async releaseClaim(key: string): Promise<void> {
    await this.database.client.pool.query("DELETE FROM auth_rate_limits WHERE key=$1", [key]);
  }

  async dispatchDue(): Promise<{ claimed: number; paused: boolean }> {
    const queue = this.requireQueue();
    await new MonitoringFreshnessDetector(this.database.client, queue).inspect();
    const scheduled = await new MonitorScheduler(this.database.client, queue, {
      batchSize: this.environment.QSTASH_DISPATCH_BATCH_SIZE,
      dailyMessageLimit: this.environment.QSTASH_DAILY_MESSAGE_LIMIT,
      deploymentMode: "hosted",
      paused: this.environment.QSTASH_HOSTED_SCHEDULER_PAUSED === "true",
    }).dispatchDue();
    await new OutboxDispatcher(this.database.client, queue, "qstash-hosted").dispatch();
    await new NotificationDeliveryDispatcher(this.database.client, queue).dispatchDue();
    await new MaintenanceReconciler(this.database.client).reconcile();
    await new AvailabilityAggregationScheduler(this.database.client, queue).dispatch();
    await new RetentionCleaner(this.database.client, {
      checkResultDays: this.environment.CHECK_RESULT_RETENTION_DAYS,
      deliveryAttemptDays: this.environment.DELIVERY_ATTEMPT_RETENTION_DAYS,
      tokenDays: this.environment.TOKEN_RETENTION_DAYS,
    }).run();
    return scheduled;
  }

  async executeJob(value: unknown) {
    const queue = this.requireQueue();
    const job = value as QueueJob;
    if (job.name === "policy.evaluate") {
      return new PolicyEngine(this.database.client).evaluate(value);
    }
    if (job.name === "outbox.dispatch") {
      return new NotificationFanoutProcessor(
        this.database.client,
        this.environment.APP_ORIGIN,
      ).execute(job);
    }
    if (job.name === "notification.deliver") {
      return new NotificationDeliveryProcessor(this.database.client, {
        appOrigin: this.environment.APP_ORIGIN,
        emailFrom: this.environment.EMAIL_FROM,
        encryptionKey: this.environment.NOTIFICATION_ENCRYPTION_KEY,
        resendApiKey: this.environment.RESEND_API_KEY,
        smtpHost: this.environment.SMTP_HOST,
        smtpPort: this.environment.SMTP_PORT,
        workerId: "qstash-hosted",
      }).execute(job);
    }
    if (job.name === "availability.aggregate")
      return new AvailabilityAggregator(this.database.client).execute(job);
    if (job.name !== "monitor.check") {
      throw new ServiceUnavailableException("Hosted handler is not active yet");
    }
    return new MonitorCheckExecutor(this.database.client, queue, "qstash-hosted", "hosted").execute(
      value,
    );
  }

  health() {
    return {
      adapter: this.environment.QUEUE_ADAPTER,
      batchSize: this.environment.QSTASH_DISPATCH_BATCH_SIZE,
      configured: this.queue !== null && this.receiver !== null,
      dailyMessageLimit: this.environment.QSTASH_DAILY_MESSAGE_LIMIT,
      paused: this.environment.QSTASH_HOSTED_SCHEDULER_PAUSED === "true",
    };
  }

  private requireQueue(): QStashJobQueue {
    if (!this.queue) throw new ServiceUnavailableException("QStash is not configured");
    return this.queue;
  }
}
