import {describe,it,expect,vi} from "vitest";
import {mayaRoute,mayaRouteFetch} from "./maya-route.js";
describe("current request route",()=>{
 it("preserves multiline local and negation",()=>{expect(mayaRoute("Use local\n\nWhat is2+2?")).toBe("local");expect(mayaRoute("don't use local")).toBe("fast");expect(mayaRoute("private please")).toBe("private");expect(mayaRoute("private local")).toBe("local");});
 it("quotes and code don't opt in",()=>{expect(mayaRoute('> local\nDo this fast')).toBe('fast');expect(mayaRoute('```\nlocal\n```\nwhat now')).toBe('fast');});
 it("sets stable route after tool followups without inspecting messages",async()=>{const mock=vi.fn().mockResolvedValue(new Response('{}'));const f=mayaRouteFetch('local',mock);await f('http://172.18.0.1:8792/v1/chat/completions',{body:'tool result'});expect(new Headers(mock.mock.calls[0]?.[1].headers).get('X-Maya-Route')).toBe('local');});
 it("local blocks external alternate-model endpoints",async()=>{const mock=vi.fn();await expect(mayaRouteFetch('local',mock)('https://example.test/chat')).rejects.toThrow('cannot use a cloud');expect(mock).not.toHaveBeenCalled();});
 it("fast nonrouter calls remain unchanged",async()=>{const mock=vi.fn().mockResolvedValue(new Response('{}'));await mayaRouteFetch('fast',mock)('https://example.test/chat');expect(mock).toHaveBeenCalledWith('https://example.test/chat',undefined);});
});
