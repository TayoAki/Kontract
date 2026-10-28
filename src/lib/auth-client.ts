"use client";

import { createAuthClient } from "better-auth/react";

// Talks to /api/auth/* on the same origin.
export const authClient = createAuthClient();

/** Fired when an API call comes back 401 so the app can drop back to sign-in. */
export const SIGNED_OUT_EVENT = "kontract:signed-out";
