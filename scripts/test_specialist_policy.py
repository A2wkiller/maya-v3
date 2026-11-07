#!/usr/bin/env python3
"""Fictional policy smoke checks. No accounts, network, model or real action."""
from pathlib import Path
import importlib.util
p=Path(__file__).resolve().parents[1]/"services/maya-test-integration/specialists/policy_harness.py"
spec=importlib.util.spec_from_file_location("policy_harness",p)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
passed=0
for role,tools in m.ROLES.items():
    for tool in tools:
        assert m.dispatch(role,tool,"owner",("fixture:one",),("fixture:one",))=="allowed"
        passed+=1
for args in [("unknown","read_draft","owner"),("researcher","write_draft","owner"),("researcher","read_fictional_source","guest"),("guest_handler","write_draft","guest")]:
    try:m.dispatch(*args)
    except m.Denied:passed+=1
    else:raise AssertionError("expected deny")
try:m.dispatch("researcher","read_fictional_source","owner",("fixture:one",),("fixture:other",))
except m.Denied:passed+=1
else:raise AssertionError("ungrounded source accepted")
assert not m.validate_return({"role":"researcher"},())[0];passed+=1
print(f"{passed} fictional specialist policy checks passed. Not production E2E.")
