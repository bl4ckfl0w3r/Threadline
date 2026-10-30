import type {CaseFile} from '../lib/contracts.ts';

export const MODEL_CONTEXT_MAX_BYTES=64_000;

// Full provider payloads remain in receipts and are not sent to the model.
export function serializeModelContext(file:CaseFile):string {
  const context={...file,
    queries:file.queries.slice(-12).map(query=>({...query,rawRows:undefined})),
    leads:file.leads.slice(0,100),activityLog:file.activityLog.slice(-24)};
  const serialized=JSON.stringify(context);
  if(new TextEncoder().encode(serialized).byteLength>MODEL_CONTEXT_MAX_BYTES)
    throw new RangeError('This case is too large for one agent step. Use manual research or a smaller case. No model request was made.');
  return serialized;
}
