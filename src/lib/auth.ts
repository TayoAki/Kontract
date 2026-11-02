import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { DATA_DIR, dataPath } from "./data-dir";
import { getDb } from "./db";
import { importLegacyData } from "./store";

// Accounts: email + password via Better Auth, stored in the same SQLite file
// as each user's records. Sessions are cookies; every app API route calls
// requireUser() and scopes its queries to that user's id.
//
// The same accounts sign in AI assistants to the MCP server (/api/mcp): Better
// Auth acts as the OAuth 2.1 server, Claude registers itself (DCR) or presents
// its published identity (CIMD), the user signs in and approves on
// /oauth/consent, and the token is bound to the MCP URL.

/** The MCP server's public URL, when the site knows its own address (BETTER_AUTH_URL). */
export function mcpResource(): string | null {
  const base = process.env.BETTER_AUTH_URL?.replace(/\/+$/, "");
  return base ? `${base}/api/mcp` : null;
}

function mcpPlugins() {
  const resource = mcpResource();
  if (!resource) return [];
  return [
    jwt(),
    mcp({
      resource,
      loginPage: "/",
      consentPage: "/oauth/consent",
      // MCP clients register themselves; Claude's connectors use this or CIMD below.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
  ];
}

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
    plugins: [...mcpPlugins(), nextCookies()],
    // Behind a proxy, rate limits need the header it puts the client's IP in
    // (x-real-ip on Railway). Only set it where the proxy overwrites that header.
    advanced: process.env.TRUSTED_IP_HEADER ? { ipAddress: { ipAddressHeaders: [process.env.TRUSTED_IP_HEADER.toLowerCase()] } } : undefined,
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
