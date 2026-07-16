import { BadRequestException } from "@nestjs/common";

type SafeParser<T> = {
  safeParse(
    value: unknown,
  ): { data: T; success: true } | { error: { issues: readonly unknown[] }; success: false };
};

export function parseRequestBody<T>(schema: SafeParser<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new BadRequestException({
    code: "validation_failed",
    details: result.error.issues,
    message: "Request validation failed",
  });
}
