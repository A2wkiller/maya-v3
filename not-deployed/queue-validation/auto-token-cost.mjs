import { AUTOMATIC_PROMPT_UNDERSTANDING } from '../packages/adapters/src/automatic-prompt-understanding.ts';
import { estimateContextTokens } from '../packages/adapters/src/context-selection.ts';
console.log(JSON.stringify({bytes:Buffer.byteLength(AUTOMATIC_PROMPT_UNDERSTANDING),appEstimatedInputTokens:estimateContextTokens(AUTOMATIC_PROMPT_UNDERSTANDING),extraModelRequests:0,realModelLatencyMeasured:false}));
