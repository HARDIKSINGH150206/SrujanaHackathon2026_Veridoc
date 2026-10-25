import { Role } from "@prisma/client";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { parseRecapRequest, requestRecap } from "@/lib/recap";

export const runtime = "nodejs";

// POST /api/v1/evidence/recap: a fixed-template recap and suggested messages from the terms a person
// confirmed (docs/RECAP_DESIGN.md). Text only: reads nothing from and writes nothing to the vault, the
// audit log or any hash. The recap becomes evidence only when the browser uploads it through
// POST /api/v1/evidence/upload.
export async function POST(req: Request): Promise<Response> {
  try {
    requireRole(req, [Role.POLICE_OFFICER, Role.INVESTIGATING_OFFICER, Role.ADMIN]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "BAD_REQUEST", message: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = parseRecapRequest(json);
  if (!parsed.ok) return Response.json({ error: "BAD_REQUEST", message: parsed.message }, { status: 400 });
  const result = await requestRecap(parsed.value);
  return Response.json(result.body, { status: result.status });
}
