import { Role } from "@prisma/client";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { parseTermsRequest, requestTerms } from "@/lib/terms";

export const runtime = "nodejs";

// POST /api/v1/evidence/terms: propose terms (with source links) from a chat or a text PDF.
// Suggestion-only (CLAUDE.md rule 2): reads nothing from the vault and writes nothing to the
// vault, the audit log or any hash. A person confirms terms; only that confirmation, uploaded
// through POST /api/v1/evidence/upload, becomes evidence.
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
  const parsed = parseTermsRequest(json);
  if (!parsed.ok) return Response.json({ error: "BAD_REQUEST", message: parsed.message }, { status: 400 });

  const result = await requestTerms(parsed.value);
  return Response.json(result.body, { status: result.status });
}
