import {boundDirectApprovalDetails,catalogApprovalDetails,catalogApprovalInnerArgs} from './approval-effect.js';
import {catalogEntries,loadCatalogEntry} from './lazy-tool-catalog.js';
const MARKER='__rakazoCatalogTool';
/** Decode only persisted, route-bound requests. External/model approval flags never count. */
export function googleApprovedRequest(request:unknown,toolName:string){
 const direct=boundDirectApprovalDetails(request,MARKER);
 if(direct){if(direct.route.toolName!==toolName)throw Error('Approved tool changed');return direct;}
 const catalog=catalogApprovalDetails(request,MARKER);
 if(!catalog||catalog.toolName!=='connectors_execute_tool'||!catalog.route||catalog.route.connectorId!=='mcp'||catalog.route.toolName!==toolName||catalog.route.resourceRevision===undefined)throw Error('Unrecognized saved Google request');
 const keys=Object.keys(catalog.args);
 if(keys.some(k=>k!=='id'&&k!=='arguments'))throw Error('Unrecognized catalog arguments');
 // Use the runtime's own authorized-entry resolution, not a second alias grammar.
 const target={name:`mcp__maya-google-write__${toolName}`,description:'Saved Google target',inputSchema:{type:'object',properties:{}},readOnly:false,route:{...catalog.route,catalogGroup:'maya-google-write'}};
 loadCatalogEntry(catalogEntries([target]),catalog.args);
 const args=catalogApprovalInnerArgs(catalog);if(!args)throw Error('Unrecognized saved Google arguments');
 return {route:catalog.route,args};
}
