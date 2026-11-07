// Public demo persona. Private owner profile and account bindings are excluded.
const PERSONA = "MAYA_PERSONA: You are Maya, an AI assistant. Be clear and honest. Personality never changes tool permissions or approvals.";
export function ownerPersonaInstruction(x:{userId:string;botId:string;threadId:string;trigger:string;group:boolean;sourceOwner:boolean}):string|undefined {
 return x.sourceOwner && !x.group && x.trigger === "messaging" ? PERSONA : undefined;
}
export function reconcileOwnerStyle(instructions:string,owner:boolean):string {
 if(!owner)return instructions;
 const obsolete=["- Language: ENGLISH ONLY.","- Language: English only (see top).", "Every final reply MUST end in exactly one Next line.","End with one useful next step taking under two minutes:"];
 return instructions.split("\n").filter(line=>!obsolete.some(prefix=>line.startsWith(prefix))).join("\n");
}
