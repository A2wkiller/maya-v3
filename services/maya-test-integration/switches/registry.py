"""Feature-switch registry + wishlist harness (T18, TEST-ONLY, DRAFT-ONLY).

Revised from the authorised snapshot drafts/switches-input/flags.py.
Standard library only. No network, no accounts, no live-bot wiring.
Fictional inputs only.

Design (from T15 acceptance FS-01..FS-16; all limits PROPOSED, for
Instinct to confirm, not measured):
- Exactly three modes: "off", "test-bot", "owner". No "on for everyone".
- One switch per feature; killing one never changes another.
- A run is one request / tool chain. The config version is pinned at
  run start and the run keeps its pinned pack content for its whole
  lifetime: an ordinary reload (e.g. mode change) affects only runs
  started after it, so a run never mixes versions.
- Explicit kill blocks the NEXT gated step of an in-flight run, but
  never undoes an effect already delivered.
- Missing / malformed / unknown-key config fails closed: every gated
  feature behaves as off. Ungated behaviour is unaffected. The failure
  is logged without secrets (raw config is never logged).
- Unknown feature keys invalidate the whole config (fail-closed
  variant of FS-07: no feature enables, never treated as on).
- Guests never see owner flag state: guest-facing error text is a
  fixed generic string that names no feature and no mode.
- Proposed limits: tool-health stale after 15 minutes; transient
  READ retry 3 attempts total, fake-clock backoff 1s then 2s.
  Uncertain writes are never retried. Model selection has NO
  fallback: an unavailable selected model is a visible failure.
"""

import copy
import hashlib
import json
import pathlib
import weakref

# Explicit allowlist. Anything else in a config is an unknown key and
# invalidates the whole config (fail closed). Fictional FS names are
# included so FS-01..FS-04/FS-09 map literally; "feat-never-existed"
# and any other key remain unknown.
FEATURES = {
    "stable_model", "tool_health", "bounded_retry", "dry_run",
    "connector_smoke", "rag",
    "wishlist-summary", "feat-a", "feat-b", "feat-send",
}
MODES = ("off", "test-bot", "owner")
STALE_AFTER_MINUTES = 15  # PROPOSED, for Instinct to confirm
RETRY_ATTEMPTS_TOTAL = 3  # PROPOSED, for Instinct to confirm
RETRY_BACKOFF_SECONDS = (1, 2)  # PROPOSED, for Instinct to confirm
GUEST_ERROR = "This is unavailable."  # Names no feature and no mode.


class Rejected(ValueError):
    """Gated feature unavailable / request rejected (fail closed)."""


class UncertainWrite(Exception):
    """A write whose outcome is unknown (response lost). Never retry."""


class Registry:
    """Reads a JSON config file; every read re-validates it."""

    def __init__(self, path, test_bot_id, owner_id):
        self.path = pathlib.Path(path)
        self.test_bot = test_bot_id
        self.owner = owner_id
        self._pins = weakref.WeakKeyDictionary()
        self.error_log = []  # Generic messages only, never raw config.

    def read(self):
        try:
            raw = self.path.read_bytes()
            if len(raw) > 65536:
                raise Rejected("config too large")
            d = json.loads(raw)
            if (set(d) != {"version", "features"}
                    or not isinstance(d["version"], str) or not d["version"]
                    or not isinstance(d["features"], dict)):
                raise Rejected("schema")
            for k, v in d["features"].items():
                if (k not in FEATURES or not isinstance(v, dict)
                        or set(v) != {"mode", "pack", "sha256", "killed"}
                        or v["mode"] not in MODES
                        or type(v["killed"]) is not bool
                        or not isinstance(v["pack"], str)
                        or not isinstance(v["sha256"], str)
                        or len(v["sha256"]) != 64):
                    raise Rejected("feature schema")
            return d
        except Exception:
            # Fail closed, without secrets: never log raw config bytes.
            self.error_log.append("config invalid; all gated features off")
            raise Rejected("invalid registry, all features off") from None

    def _pack_content(self, entry):
        packs_dir = (self.path.parent / "packs").resolve()
        p = self.path.parent / "packs" / entry["pack"]
        if p.parent.resolve() != packs_dir or not p.is_file() or p.is_symlink():
            raise Rejected("invalid pack")
        raw = p.read_bytes()
        if len(raw) > 262144:
            raise Rejected("pack too large")
        if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise Rejected("pack mismatch")
        try:
            content=json.loads(raw)
            if not isinstance(content,dict):raise ValueError()
            return content
        except Exception:raise Rejected("invalid pack JSON") from None

    def pin(self, feature, bot, guest=False):
        """Start a run: returns a pinned Run, or raises Rejected."""
        d = self.read()
        v = d["features"].get(feature)
        if guest or not v or v["killed"] or v["mode"] == "off":
            raise Rejected("feature off for audience")
        allowed_bot = self.test_bot if v["mode"] == "test-bot" else self.owner
        if bot != allowed_bot:
            raise Rejected("feature off for audience")
        content = self._pack_content(v)
        run=Run(self, feature, d["version"], copy.deepcopy(content), bot)
        self._pins[run]=(feature,d["version"],copy.deepcopy(content),bot)
        return run

    def check_step(self, run):
        """Gate the next step of an in-flight run.

        Ordinary reload (mode/version change) does NOT block: the run
        keeps its pinned content. Explicit kill DOES block the next
        gated step. Missing/invalid current config blocks it too.
        Delivered effects are never retracted by this method.
        """
        pinned=self._pins.get(run)
        if not pinned or run.registry is not self or (run.feature,run.version,run.bot)!=(pinned[0],pinned[1],pinned[3]):
            raise Rejected("invalid run capability")
        d = self.read()  # Raises Rejected on missing/malformed config.
        v = d["features"].get(run.feature)
        if not v or v["killed"]:
            raise Rejected("feature unavailable")
        return copy.deepcopy(pinned[2])


class Run:
    """One request / tool chain, pinned to one config version."""

    def __init__(self, registry, feature, version, content, bot):
        self.registry = registry
        self.feature = feature
        self.version = version
        self.content = content
        self.bot = bot
        self.delivered = []  # Effects already delivered; never retracted.

    def step(self):
        return self.registry.check_step(self)

    def deliver(self, effect):
        self.delivered.append(effect)
        return effect


def guest_error():
    """Guest-facing error text: names no feature and no mode."""
    return GUEST_ERROR


def ungated():
    """Ungated behaviour: works even when gated config is malformed."""
    return "ungated-ok"


# --- Wishlist: explicit model selection, no fallback (FS-10) ----------

def stable_route(model, available):
    if model not in available:
        raise Rejected("selected model %s unavailable; no fallback" % model)
    return model


# --- Wishlist: read-only tool-health report, read-time freshness -----

def health_report(observations, now):
    """Compute freshness at READ time from stored synthetic observations.

    observations: {tool_id: last_check_epoch_seconds or None}.
    Never mutates its input (verified by tests). Statuses:
      fresh   -- checked within STALE_AFTER_MINUTES (proposed: 15)
      stale   -- older than that
      unknown -- never checked (None)
      invalid -- future timestamp (last_check > now)
    Returns a new dict; callers must not treat it as live availability.
    """
    snapshot = copy.deepcopy(observations)
    out = {}
    for tool, last in snapshot.items():
        if last is None:
            out[tool] = {"status": "unknown", "last_check": None,
                         "age_minutes": None}
        elif last > now:
            out[tool] = {"status": "invalid", "last_check": last,
                         "age_minutes": None,
                         "reason": "future timestamp"}
        else:
            age = (now - last) / 60.0
            status = "fresh" if age <= STALE_AFTER_MINUTES else "stale"
            out[tool] = {"status": status, "last_check": last,
                         "age_minutes": age}
    return out


# --- Wishlist: bounded READ retry; never retry uncertain writes ------

def retry_read(fn, read_only, sleep):
    """Bounded transient READ retry: exactly 3 attempts total (proposed),
    fake-clock backoff 1s then 2s (proposed). Only TimeoutError /
    ConnectionError are retried; other errors propagate at once.
    Writes / unknown execution are rejected, never retried."""
    if read_only is not True:
        raise Rejected("write/unknown execution cannot retry")
    last = None
    for n in range(RETRY_ATTEMPTS_TOTAL):
        try:
            return fn()
        except (TimeoutError, ConnectionError) as exc:
            last = exc
            if n + 1 < RETRY_ATTEMPTS_TOTAL:
                sleep(RETRY_BACKOFF_SECONDS[n])
    raise last


def attempt_write_once(fn):
    """Attempt a write exactly once. On UncertainWrite, propagate the
    uncertainty and report it; the caller must wait for owner direction
    and must never auto-retry."""
    try:
        return fn()
    except UncertainWrite:
        raise Rejected("uncertain write outcome; awaiting owner direction")


# --- Wishlist: destructive dry-run (FS-14) ------------------------------

DRY_RUN_ACTIONS = ("delete_file", "delete_note", "send_message", "purchase")


def dry_run(action, targets):
    """Preview only. Names every exact fictional target, executes
    nothing, approves nothing. targets must be a non-empty list of
    exact target identifiers (e.g. ["NOTE-001"])."""
    if action not in DRY_RUN_ACTIONS:
        raise Rejected("unknown effect")
    if not isinstance(targets, list) or not targets or not all(
            isinstance(t, str) and t for t in targets):
        raise Rejected("dry-run requires exact non-empty targets")
    return {"status": "preview_only", "action": action,
            "targets": list(targets), "executed": False, "approved": False,
            "note": "Preview is not approval and grants no execution rights."}


# --- Wishlist: connector smoke test, synthetic only (FS-15) ------------

def smoke_test(connector, payload):
    """Synthetic plumbing check only. Requires a payload explicitly
    marked synthetic; touches no real account, message, or stored data.
    Output is labelled synthetic proof, never real availability."""
    if not isinstance(payload, dict) or payload.get("synthetic") is not True:
        raise Rejected("smoke tests accept synthetic payloads only")
    return {"connector": connector, "synthetic_proof_only": True,
            "label": "synthetic proof only - not real availability",
            "payload_echo": {"synthetic_id": payload.get("synthetic_id"),
                             "text": payload.get("text")},
            "passed_on_synthetic_payload": True}
