import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  breakpoints: true,
  dialect: "postgresql",
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
  out: "./drizzle",
  schema: "./src/schema/index.ts",
  strict: true,
  verbose: true,
  ...(databaseUrl === undefined
    ? {}
    : {
        dbCredentials: {
          url: databaseUrl,
        },
      }),
});
