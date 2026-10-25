import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// auth.ts reads the secret when it is first imported.
process.env.AUTH_SESSION_SECRET = "test-secret-for-terms-route";
process.env.AI_SERVICE_URL = "http://ai.test";

type Route = typeof import("@/app/api/v1/evidence/terms/route");
let route: Route;
let token: (role: string) => string;

beforeAll(async () => {
  route = await import("@/app/api/v1/evidence/terms/route");
  const auth = await import("@/lib/auth");
  token = (role) => auth.issueSessionToken({ userId: "u1", role: role as never });
});

afterEach(() => vi.restoreAllMocks());

function post(body: unknown, role: string | null = "INVESTIGATING_OFFICER", raw = false): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (role) headers.Authorization = `Bearer ${token(role)}`;
  return new Request("http://localhost/api/v1/evidence/terms", { method: "POST", headers, body: raw ? (body as string) : JSON.stringify(body) });
}

const AI_OK = { playbook_id: "supply-order", model_mode: "fake", demo_mode: true, demo_badge: "Demo mode: recorded model output", messages: [], import_problems: [], report: { terms: [], flags: [], ignored_keys: [], output_problems: [], model_error: null } };

describe("POST /api/v1/evidence/terms", () => {
  it("needs a signed-in session", async () => {
    expect((await route.POST(post({ playbook_id: "p", chat_text: "x" }, null))).status).toBe(401);
  });

  it("is not for read-only roles", async () => {
    for (const role of ["COURT_OFFICIAL", "FORENSIC_LAB"]) {
      expect((await route.POST(post({ playbook_id: "p", chat_text: "x" }, role))).status, role).toBe(403);
    }
  });

  it("rejects a body that is not JSON or not the right shape", async () => {
    expect((await route.POST(post("{nope", "ADMIN", true))).status).toBe(400);
    expect((await route.POST(post({ playbook_id: "p" }))).status).toBe(400);
  });

  it("forwards the chat to the AI service and returns its terms", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(AI_OK), { status: 200 }));
    const res = await route.POST(post({ playbook_id: "supply-order", chat_text: "hello" }));
    expect(res.status).toBe(200);
    expect((await res.json()).demo_badge).toBe("Demo mode: recorded model output");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://ai.test/v1/terms");
  });

  it("tells the user a scanned PDF is not supported yet", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: { code: "scanned_pdf_not_supported", message: "not supported yet" } }), { status: 422 })
    );
    const res = await route.POST(post({ playbook_id: "supply-order", pdf_base64: "JVBERi0=" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "scanned_pdf_not_supported", message: "not supported yet" });
  });

  it("makes no call other than the one to the AI service (it never touches storage or the database)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(AI_OK), { status: 200 }));
    await route.POST(post({ playbook_id: "supply-order", chat_text: "hello" }));
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["http://ai.test/v1/terms"]);
  });
});

describe("GET /api/v1/evidence/playbooks", () => {
  let playbooks: typeof import("@/app/api/v1/evidence/playbooks/route");
  beforeAll(async () => {
    playbooks = await import("@/app/api/v1/evidence/playbooks/route");
  });
  const get = (role: string | null) =>
    new Request("http://localhost/api/v1/evidence/playbooks", { headers: role ? { Authorization: `Bearer ${token(role)}` } : {} });

  it("needs a signed-in session and the same roles as the terms route", async () => {
    expect((await playbooks.GET(get(null))).status).toBe(401);
    expect((await playbooks.GET(get("COURT_OFFICIAL"))).status).toBe(403);
  });

  it("returns the AI service's playbooks", async () => {
    const list = { playbooks: [{ id: "supply-order", title: "Supply or order", terms: [] }] };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(list), { status: 200 }));
    const res = await playbooks.GET(get("INVESTIGATING_OFFICER"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(list);
  });
});

describe("POST /api/v1/evidence/recap", () => {
  let recap: typeof import("@/app/api/v1/evidence/recap/route");
  beforeAll(async () => {
    recap = await import("@/app/api/v1/evidence/recap/route");
  });
  const body = { playbook_id: "supply-order", language: "en", terms: [{ key: "quantity", status: "stated", value: "200", quote: ["200 notebooks"], msg: [1], confirmed: true }] };
  const post = (b: unknown, role: string | null = "INVESTIGATING_OFFICER") =>
    new Request("http://localhost/api/v1/evidence/recap", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${token(role)}` } : {}) },
      body: JSON.stringify(b),
    });
  const AI = { language: "en", title: "t", text: "Hi", lines: [], open_points: [], suggestions: [], reply_line: "CONFIRM {code}", disclaimer: "d" };

  it("needs a session and a role that may upload", async () => {
    expect((await recap.POST(post(body, null))).status).toBe(401);
    expect((await recap.POST(post(body, "COURT_OFFICIAL"))).status).toBe(403);
  });

  it("rejects a malformed body", async () => {
    expect((await recap.POST(post({ playbook_id: "p" }))).status).toBe(400);
  });

  it("forwards to the AI service only, and returns its recap", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(AI), { status: 200 }));
    const res = await recap.POST(post(body));
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["http://ai.test/v1/recap"]);
  });
});
