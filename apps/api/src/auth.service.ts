import { type ApiEnvironment, parseApiEnvironment } from "@devrelay/config";
import { Injectable } from "@nestjs/common";

import { createDevRelayAuth, type DevRelayAuth } from "./auth.js";
import { DatabaseService } from "./database.service.js";

@Injectable()
export class AuthService {
  readonly auth: DevRelayAuth;
  readonly environment: ApiEnvironment;

  constructor(databaseService: DatabaseService) {
    this.environment = parseApiEnvironment(process.env);
    this.auth = createDevRelayAuth(databaseService.database, this.environment);
  }
}
