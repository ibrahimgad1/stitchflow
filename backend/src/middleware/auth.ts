import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { loadEnv } from "../config/env.js";
import { getDatabase } from "../database/connection.js";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};

type JwtPayload = {
  sub: string;
};

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ statusCode: 401, message: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, loadEnv().jwtSecret) as JwtPayload;
    const db = getDatabase();
    const user = db
      .prepare(`
        SELECT users.id, users.username, users.display_name AS displayName, roles.name AS role
        FROM users
        JOIN roles ON roles.id = users.role_id
        WHERE users.id = ? AND users.is_active = 1
      `)
      .get(payload.sub) as AuthUser | undefined;

    if (!user) {
      res.status(401).json({ statusCode: 401, message: "Invalid session" });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ statusCode: 401, message: "Invalid session" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ statusCode: 401, message: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ statusCode: 403, message: "Forbidden" });
      return;
    }

    next();
  };
}

