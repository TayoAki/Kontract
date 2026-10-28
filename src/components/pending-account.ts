"use client";

// What someone picked on the sign-up screen (role, trade, area, who invited
// them), kept until the new session is ready to save it.

const KEY = "kontract:pending-account";

export interface PendingAccount {
  role: "prime" | "sub";
  trade?: string;
  market?: string;
  company?: string;
  website?: string;
  phone?: string;
  invitedBy?: string;
}

export function setPendingAccount(p: PendingAccount): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode: the user can set it in Settings instead.
  }
}

export function takePendingAccount(): PendingAccount | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v ? (JSON.parse(v) as PendingAccount) : null;
  } catch {
    return null;
  }
}
