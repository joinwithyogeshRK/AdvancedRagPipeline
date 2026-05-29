// Gates routes to a small admin allowlist. The civil-code library is shared
// across all users, so its WRITE side (ingestion) must be admin-only.
//
// Admins are configured via the ADMIN_CLERK_USER_IDS env var: a comma-
// separated list of Clerk user IDs (e.g. "user_abc123,user_xyz789").
//
// Run requireClerkSession BEFORE this — we read req.clerkUserId from the
// earlier middleware.

import type { Request, Response, NextFunction } from "express";

const parseAdmins = (): Set<string> => {
  const raw = process.env.ADMIN_CLERK_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
};

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const admins = parseAdmins();
  if (admins.size === 0) {
    return res.status(503).json({
      error:
        "Admin allowlist is not configured. Set ADMIN_CLERK_USER_IDS in the backend environment.",
    });
  }
  const clerkUserId = req.clerkUserId;
  if (!clerkUserId || !admins.has(clerkUserId)) {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}
