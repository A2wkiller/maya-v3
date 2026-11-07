/** Compile-time compatibility check only. No client is constructed and no query runs. */
import type {Db} from '../packages/db/src/client.js';
import type {linkedDmUsage} from '../apps/web/src/lib/linked-dm-usage';
import type {channelUsageView} from '../apps/web/src/lib/channel-usage-view';
import type {queueRunView} from '../apps/web/src/lib/queue-run-view';
type LinkedReader=Parameters<typeof linkedDmUsage>[0];
type ExternalReader=Parameters<typeof channelUsageView>[0];
type RunReader=Parameters<typeof queueRunView>[0];
export function nativeReaderTypes(db:Db):{linked:LinkedReader;external:ExternalReader;runs:RunReader}{return {linked:db,external:db,runs:db};}
