# Fixed read-only status MCP. No arbitrary commands or arguments.
import asyncio,json
from mcp.server.fastmcp import FastMCP
mcp=FastMCP("maya-health",host="172.18.0.1",port=8791,streamable_http_path="/mcp")
@mcp.tool()
async def server_status() -> str:
    """Read fresh VM CPU/RAM/disk/uptime/service/model-route status. No secrets or writes. Call directly when asked system stats or configuration."""
    proc=await asyncio.create_subprocess_exec("/usr/bin/python3","/home/maya/maya-ops/system_status.py",stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
    try: output,_=await asyncio.wait_for(proc.communicate(),8)
    except asyncio.TimeoutError:
        proc.kill();await proc.wait();return json.dumps({"status":"unavailable","reason":"collector timeout"})
    if proc.returncode or len(output)>12000:return json.dumps({"status":"unavailable","reason":"collector failed"})
    return output.decode()
@mcp.tool()
async def capability_status() -> str:
    """Read-only readiness of search/page reader/JS/Gmail/Calendar/web/Telegram/memory/route. No sends, refresh, searches, inference or restarts. Return scope and failures/unknowns, never call readiness end-to-end proof."""
    proc=await asyncio.create_subprocess_exec("/usr/bin/python3","-B","/home/maya/maya-health/capabilities.py",cwd="/home/maya/maya-search-lab",stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
    try: output,_=await asyncio.wait_for(proc.communicate(),18)
    except asyncio.TimeoutError:
        proc.kill();await proc.wait();return json.dumps({"status":"unavailable","say":"System self-check is not working: collector timeout."})
    if proc.returncode or len(output)>18000:return json.dumps({"status":"unavailable","say":"System self-check is not working: collector failed."})
    return output.decode()
mcp.run(transport="streamable-http")
