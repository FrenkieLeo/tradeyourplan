import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function authorizeIngestRequest(request: NextRequest): boolean {
  const expected = process.env.INGEST_API_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function getSyncOwnerId(): string {
  const ownerId = process.env.SYNC_OWNER_ID;
  if (!ownerId) throw new Error("SYNC_OWNER_ID is missing");
  return ownerId;
}
