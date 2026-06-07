import type { Request, Response, NextFunction } from "express";

// ─── Audit Log Entry ──────────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: string;
  method: string;
  path: string;
  userId?: number;
  userEmail?: string;
  ip: string;
  statusCode: number;
  durationMs: number;
  resourceType?: string;
  resourceId?: string;
}

// In-memory circular buffer — replace with DB writes in production
const AUDIT_BUFFER_SIZE = 1000;
const auditBuffer: AuditEntry[] = [];

function extractResourceType(path: string): string | undefined {
  if (path.includes("/patients")) return "patient";
  if (path.includes("/cases")) return "case";
  if (path.includes("/scans")) return "scan";
  if (path.includes("/analysis")) return "analysis";
  if (path.includes("/auth")) return "auth";
  if (path.includes("/ai-copilot")) return "ai";
  return undefined;
}

function extractResourceId(path: string): string | undefined {
  const match = path.match(/\/(\d+)/);
  return match ? match[1] : undefined;
}

// Audit middleware — runs on every request
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only log mutating operations + sensitive reads
  const shouldLog = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ||
    (req.method === "GET" && (req.path.includes("/scans/") && req.path.includes("/file")));

  if (!shouldLog) { next(); return; }

  const startMs = Date.now();

  res.on("finish", () => {
    const user = (req as Request & { user?: { id: number; email: string } }).user;
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      userId: user?.id,
      userEmail: user?.email,
      ip: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown",
      statusCode: res.statusCode,
      durationMs: Date.now() - startMs,
      resourceType: extractResourceType(req.path),
      resourceId: extractResourceId(req.path),
    };

    auditBuffer.push(entry);
    if (auditBuffer.length > AUDIT_BUFFER_SIZE) auditBuffer.shift();
  });

  next();
}

// Export recent audit entries (for API endpoint)
export function getRecentAuditEntries(limit = 50): AuditEntry[] {
  return auditBuffer.slice(-limit).reverse();
}

// TODO for production: Replace in-memory buffer with Drizzle ORM writes:
// await db.insert(auditLogsTable).values(entry);
// This requires adding the auditLogsTable to the DB schema.
