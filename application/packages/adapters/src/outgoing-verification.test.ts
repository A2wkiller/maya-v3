import {it,expect,vi,afterEach} from 'vitest';
import {prepareOutgoingBlocks,stripEmptyNext,casualReply} from './outgoing-verification.js';
afterEach(()=>vi.unstubAllEnvs());
const run={id:'r',botId:'fixture-resource-id'};
function deps(effects:any[]=[]){return {prisma:{externalEffect:{findMany:vi.fn(async()=>effects)}}} as any;}
it('exact real Telegram final reply is replaced when native screenshot/attachment effects match',async()=>{
 const d=deps([{kind:'mcp__maya-obscura__browser_screenshot',status:'completed',result:{source:'native-bound-screenshot',path:'a.png'}},{kind:'attach_file',status:'completed',request:{path:'a.png'},result:{ok:true}}]);
 const b=await prepareOutgoingBlocks(d,run,'bot',[{kind:'text',text:"Here's the screenshot of the PUBG official YouTube channel -2.19M subscribers. Next (0 min): nothing"}]);
 expect(b).toEqual([{kind:'text',text:'Screenshot attached from the current native browser page. Channel affiliation has not been independently verified.'}]);
});
it('failed native screenshot cannot claim success',async()=>expect(await prepareOutgoingBlocks(deps([{kind:'browser_screenshot',status:'completed',result:{error:'blank'}}]),run,'bot',[{kind:'text',text:'Done. Official.'}])).toEqual([{kind:'text',text:'I could not produce a verified screenshot of the requested page. No completed screenshot is attached.'}]));
it('exact casual follow-up drops empty Next with zero evidence lookups',async()=>{
 const d=deps();expect(await prepareOutgoingBlocks(d,run,'bot',[{kind:'text',text:'Glad it loaded properly this time 👍\n\nNext (0 min): nothing'}])).toEqual([{kind:'text',text:'Glad it loaded properly this time 👍'}]);expect(d.prisma.externalEffect.findMany).not.toHaveBeenCalled();
});
it.each(['Hi','hello bro','Thanks!','Okay','haan yaar'])('small talk stays fast: %s',text=>expect(casualReply(text)).toBe(true));
it.each(['Hi. The flight leaves at7','Done','official channel','Price is $20','Tomorrow is Monday'])('factual appendage is not casual: %s',text=>expect(casualReply(text)).toBe(false));
it('approval cards, non-owner and system error text unchanged with no read',async()=>{
 const d=deps();const b:any=[{kind:'ask',text:'Allow?',status:'pending',actions:[]}];expect(await prepareOutgoingBlocks(d,run,'bot',b)).toBe(b);const error:any=[{kind:'text',text:'Error: failed'}];expect(await prepareOutgoingBlocks(d,run,'system',error)).toBe(error);expect(await prepareOutgoingBlocks(d,{...run,botId:'other'},'bot',error)).toBe(error);expect(d.prisma.externalEffect.findMany).not.toHaveBeenCalled();
});

it('useful task footer preserved, empty zero footer removed',()=>{expect(stripEmptyNext('Result\nNext (2 min): test')).toContain('Next');expect(stripEmptyNext('Thanks\nNext (0 min): nothing')).toBe('Thanks')});
