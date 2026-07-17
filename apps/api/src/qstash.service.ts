import { parseApiEnvironment } from "@devrelay/config";
import { type QueueJob } from "@devrelay/contracts";
import {
  MonitorCheckExecutor,
  MonitoringFreshnessDetector,
  MonitorScheduler,
  PolicyEngine,
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

  async verify(body: string, signature: string | undefined, path: string): Promise<void> {
    if (!this.receiver || !signature) throw new UnauthorizedException("QStash signature required");
    try {
      const url = new URL(path, this.environment.QSTASH_DELIVERY_BASE_URL).href;
      await this.receiver.verify({ body, signature, url });
    } catch {
      throw new UnauthorizedException("Invalid QStash signature");
    }
  }

  async dispatchDue(): Promise<{ claimed: number; paused: boolean }> {
    const queue = this.requireQueue();
    await new MonitoringFreshnessDetector(this.database.client, queue).inspect();
    return new MonitorScheduler(this.database.client, queue, {
      batchSize: this.environment.QSTASH_DISPATCH_BATCH_SIZE,
      dailyMessageLimit: this.environment.QSTASH_DAILY_MESSAGE_LIMIT,
      deploymentMode: "hosted",
      paused: this.environment.QSTASH_HOSTED_SCHEDULER_PAUSED === "true",
    }).dispatchDue();
  }

  async executeJob(value: unknown) {
    const queue = this.requireQueue();
    const job = value as QueueJob;
    if (job.name === "policy.evaluate") {
      return new PolicyEngine(this.database.client).evaluate(value);
    }
    if (job.name !== "monitor.check") {
      throw new ServiceUnavailableException(
        `Hosted handler for ${String(job.name)} is not active yet`,
      );
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
