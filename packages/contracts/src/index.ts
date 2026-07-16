export interface VersionedJob<TPayload> {
  correlationId: string;
  createdAt: string;
  id: string;
  name: string;
  payload: TPayload;
  version: number;
}
