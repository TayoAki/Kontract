"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

// Talks to /api/auth/* on the same origin. The OAuth plugin carries an AI
// assistant's sign-in request through the sign-in and consent pages.
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });

/** Fired when an API call comes back 401 so the app can drop back to sign-in. */
export const SIGNED_OUT_EVENT = "kontract:signed-out";
