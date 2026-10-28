import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { DATA_DIR, dataPath } from "./data-dir";
import { getDb } from "./db";
import { importLegacyData } from "./store";

// Accounts: email + password via Better Auth, stored in the same SQLite file
// as each user's records. Sessions are cookies; every app API route calls
// requireUser() and scopes its queries to that user's id.

/** BETTER_AUTH_SECRET, or a random one generated once and kept in the data directory. */
function authSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const file = dataPath("auth-secret");
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    mkdirSync(DATA_DIR, { recursive: true });
    try {
      writeFileSync(file, randomBytes(32).toString("base64url"), { mode: 0o600, flag: "wx" });
    } catch (err) {
      // Another process created it first; use theirs.
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    return readFileSync(file, "utf8").trim();
  }
}

function authOptions() {
  return {
    database: getDb(),
    secret: authSecret(),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    databaseHooks: {
      user: {
        create: {
          // The first account created takes over data saved before accounts existed.
          after: async (user) => {
            if (await importLegacyData(user.id)) console.log(`Imported existing bids and profile into ${user.email}`);
          },
        },
      },
    },
    plugins: [nextCookies()],
  } satisfies BetterAuthOptions;
}

const g = globalThis as unknown as {
  __kontractAuthOptions?: ReturnType<typeof authOptions>;
  __kontractAuth?: ReturnType<typeof createAuth>;
  __kontractAuthReady?: Promise<void>;
};

const createAuth = () => betterAuth((g.__kontractAuthOptions ??= authOptions()));

/** Created on first use, so `next build` never opens the database or writes a secret. */
export function getAuth() {
  return (g.__kontractAuth ??= createAuth());
}

/**
 * Create or update Better Auth's tables once per server process. Runs before
 * the auth instance exists, which otherwise logs a schema mismatch on a new database.
 */
export function ensureAuthReady(): Promise<void> {
  g.__kontractAuthReady ??= getMigrations((g.__kontractAuthOptions ??= authOptions()))
    .then(({ runMigrations }) => runMigrations())
    .catch((err) => {
      g.__kontractAuthReady = undefined;
      throw err;
    });
  return g.__kontractAuthReady;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export class UnauthorizedError extends Error {}

export async function requireUser(req: Request): Promise<SessionUser> {
  await ensureAuthReady();
  const session = await getAuth().api.getSession({ headers: req.headers });
  if (!session) throw new UnauthorizedError("Sign in to continue.");
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}
