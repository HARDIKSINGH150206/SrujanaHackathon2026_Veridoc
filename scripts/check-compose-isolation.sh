#!/usr/bin/env bash
# Checks that docker-compose.yml is isolated from the old DigiVault containers
# (digivault-postgres, digivault-minio on :5434, :9000, :9001): its own project
# name, container names, host ports and volumes.
#   scripts/check-compose-isolation.sh          static check of the resolved config
#   scripts/check-compose-isolation.sh --live   also start the stack beside any running
#                                               digivault-* containers and check both
# It never stops, removes or restarts a container it did not start.
set -u
cd "$(dirname "$0")/.."
fail=0
ok()  { echo "PASS $*"; }
bad() { echo "FAIL $*"; fail=1; }

cfg=$(docker compose config --format json 2>&1) || { echo "FAIL docker compose config: $cfg"; exit 1; }

python3 - "$cfg" <<'PY' || fail=1
import json, sys
c = json.loads(sys.argv[1])
ok = True
def check(name, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name + (" " + extra if extra and not cond else ""))
    ok = ok and cond
check("project name is veridoc", c.get("name") == "veridoc", f"(got {c.get('name')!r})")
names = {s: v.get("container_name") for s, v in c["services"].items()}
check("container names start with veridoc-", all((n or "").startswith("veridoc-") for n in names.values()), str(names))
old = {"5434", "9000", "9001"}
pub = {str(p.get("published")) for v in c["services"].values() for p in v.get("ports", [])}
check("host ports avoid the old 5434, 9000, 9001", not (pub & old), f"(published {sorted(pub)})")
check("every service publishes a host port", all(v.get("ports") for v in c["services"].values()))
vols = list(c.get("volumes", {}).values())
check("volume names start with veridoc_", all(str(v.get("name", "")).startswith("veridoc_") for v in vols), str(vols))
sys.exit(0 if ok else 1)
PY

if [ "${1:-}" = "--live" ]; then
  before=$(docker ps --filter "name=^/digivault-" --format '{{.ID}} {{.Names}} {{.Status}}' | sed 's/ Up .*/ Up/' | sort)
  echo "old containers before: ${before:-none}"
  if docker compose up -d --wait; then ok "docker compose up -d --wait succeeded beside the old containers"; else bad "docker compose up failed"; fi
  for svc in postgres minio; do
    state=$(docker inspect -f '{{.State.Status}}' "veridoc-$svc" 2>/dev/null || echo missing)
    [ "$state" = running ] && ok "veridoc-$svc is running" || bad "veridoc-$svc is $state"
  done
  pgport=$(docker compose port postgres 5432 | sed 's/.*://'); mport=$(docker compose port minio 9000 | sed 's/.*://')
  docker exec veridoc-postgres pg_isready -U "${VERIDOC_DB_USER:-veridoc}" >/dev/null 2>&1 && ok "postgres answers (host port $pgport)" || bad "postgres does not answer"
  curl -fsS "http://127.0.0.1:$mport/minio/health/live" >/dev/null 2>&1 && ok "minio answers (host port $mport)" || bad "minio does not answer"
  after=$(docker ps --filter "name=^/digivault-" --format '{{.ID}} {{.Names}} {{.Status}}' | sed 's/ Up .*/ Up/' | sort)
  [ "$before" = "$after" ] && ok "old digivault-* containers untouched (same IDs, still up)" || bad "old containers changed: before=[$before] after=[$after]"
fi
exit $fail
