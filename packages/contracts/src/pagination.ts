import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const cursorPaginationInputSchema = z.strictObject({
  cursor: z.string().min(1).max(500).optional(),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const cursorPageInfoSchema = z.strictObject({
  hasNextPage: z.boolean(),
  nextCursor: z.string().min(1).max(500).nullable(),
});

export function createCursorPageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.strictObject({
    items: z.array(itemSchema),
    pageInfo: cursorPageInfoSchema,
  });
}

export type CursorPaginationInput = z.infer<typeof cursorPaginationInputSchema>;
export type CursorPageInfo = z.infer<typeof cursorPageInfoSchema>;
