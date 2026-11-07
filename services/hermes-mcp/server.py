import re
import asyncio, os, time, uuid, json
from mcp.server.fastmcp import FastMCP

TOKEN = os.environ["HERMES_MCP_TOKEN"]
mcp = FastMCP("hermes-bridge", host="0.0.0.0", port=8788,
              streamable_http_path=f"/mcp/{TOKEN}")
JOBS = {}
SEM = asyncio.Semaphore(2)
HERMES = "/home/maya/.local/bin/hermes"

async def run_job(jid, task, provider, model):
    env = dict(os.environ, HOME="/home/maya", OPENAI_API_KEY=os.environ.get("OPENAI_API_KEY","local"),
               PATH="/home/maya/.local/bin:/usr/local/bin:/usr/bin:/bin")
    out_path = f"/tmp/hermes_job_{jid}.log"
    os.makedirs(f"/tmp/hermes_cwd_{jid}", exist_ok=True)
    with open(out_path, "w") as f:
        proc = await asyncio.create_subprocess_exec(
            HERMES, "-z", task, "--yolo", "--provider", provider, "-m", model,
            stdout=f, stderr=asyncio.subprocess.STDOUT,
            cwd=pdir_for(jid), env=env)
    JOBS[jid]["proc"] = proc
    try:
        async with SEM:
            await asyncio.wait_for(proc.wait(), timeout=1800)
    except asyncio.TimeoutError:
        proc.kill(); JOBS[jid]["status"] = "timeout"
    JOBS[jid]["status"] = "done" if proc.returncode == 0 else JOBS[jid].get("status") if JOBS[jid]["status"]=="timeout" else f"exit_{proc.returncode}"
    JOBS[jid]["finished"] = time.time()

PDIRS = {}
def pdir_for(jid): return PDIRS.get(jid, f"/tmp/hermes_cwd_{jid}")
def read_out(jid, limit=6000):
    try:
        with open(f"/tmp/hermes_job_{jid}.log") as f:
            return f.read()[-limit:]
    except OSError:
        return ""

@mcp.tool()
async def hermes_run(task: str, context: str = "", kind: str = "general", project: str = "", wait_seconds: int = 50, private: bool = False) -> str:
    """Hand a task to the Hermes worker agent on this machine. Hermes is a full
    autonomous coding/research agent with shell access. Use for long, multi-step
    or background work: coding, file manipulation, builds, research with many
    steps, scheduled/batch jobs. Returns Hermes' final report, or a job id if
    still running (then poll hermes_result)."""
    jid = uuid.uuid4().hex[:8]
    TPL = {"research": "Kind: research. Search, read sources, cite URLs, separate facts from guesses. Deliverable: report.md.",
           "repo": "Kind: repo work. Work only inside the project folder. Make small changes, run tests, never push, never delete user files. Deliverable: summary.md with what changed and how to undo.",
           "digest": "Kind: digest. Read-only. Deliverable: short digest.md (max 25 lines).",
           "general": "Kind: general."}
    proj = re.sub(r"[^a-zA-Z0-9_-]", "", project) or jid
    pdir = "/home/maya/maya-hermes/projects/" + proj
    os.makedirs(pdir, exist_ok=True)
    mem = pdir + "/CONTEXT.md"
    prior = open(mem).read()[-3000:] if os.path.exists(mem) else ""
    task = ("GOAL AND RULES (from Maya for Maya owner): " + TPL.get(kind, TPL["general"]) + "\nNever send messages or emails, never spend money, never install software, never touch secrets. Work in " + pdir + ". Write deliverables there and finish with a 5-line summary.\n\nCONTEXT FROM MAYA:\n" + (context or "(none)") + "\n\nEARLIER NOTES FOR THIS PROJECT:\n" + (prior or "(none)") + "\n\nTASK:\n" + task)
    try:
        open(mem, "a").write("\n- job %s %s: %s\n" % (jid, time.strftime("%F %T"), task.split("TASK:\n")[-1][:300]))
    except OSError: pass
    cfg = json.load(open("/home/maya/hermes-mcp/model.json"))["private" if private else "default"]
    provider, model = cfg["provider"], cfg["model"]
    PDIRS[jid] = pdir
    JOBS[jid] = {"task": task, "status": "running", "started": time.time()}
    asyncio.create_task(run_job(jid, task, provider, model))
    for _ in range(max(1, min(wait_seconds, 110))):
        await asyncio.sleep(1)
        if JOBS[jid]["status"] != "running":
            break
    if JOBS[jid]["status"] == "running":
        return json.dumps({"status": "running", "job_id": jid,
            "note": "Hermes is still working. Call hermes_result with this job_id in a minute or two."})
    return json.dumps({"status": JOBS[jid]["status"], "job_id": jid, "output": read_out(jid)})

@mcp.tool()
async def hermes_result(job_id: str) -> str:
    """Check the status/output of a Hermes job started with hermes_run."""
    j = JOBS.get(job_id)
    if not j:
        return json.dumps({"status": "unknown_job", "job_id": job_id})
    return json.dumps({"status": j["status"], "job_id": job_id,
                       "elapsed_s": int(time.time() - j["started"]),
                       "output": read_out(job_id)})

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
