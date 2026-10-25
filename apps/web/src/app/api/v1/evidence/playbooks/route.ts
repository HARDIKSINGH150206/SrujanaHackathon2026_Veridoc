import { Role } from "@prisma/client";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { requestPlaybooks } from "@/lib/terms";

export const runtime = "nodejs";

// GET /api/v1/evidence/playbooks: the kinds of agreement the AI service knows (playbooks/*.json).
// Read-only listing; same roles as POST /api/v1/evidence/terms.
export async function GET(req: Request): Promise<Response> {
  try {
    requireRole(req, [Role.POLICE_OFFICER, Role.INVESTIGATING_OFFICER, Role.ADMIN]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }
  const result = await requestPlaybooks();
  return Response.json(result.body, { status: result.status });
}
