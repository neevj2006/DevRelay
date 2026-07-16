import { createDatabaseClient, type Database, type DatabaseClient } from "@devrelay/database";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: DatabaseClient;

  constructor(databaseUrl: string) {
    this.client = createDatabaseClient(databaseUrl);
  }

  get database(): Database {
    return this.client.database;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
