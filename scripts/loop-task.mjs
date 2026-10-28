import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const [command, id, value] = process.argv.slice(2);
if (!['prepare', 'task', 'pr', 'correction', 'show'].includes(command) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id || '')) throw new Error('Usage: loop-task.mjs prepare|task|pr|correction|show task-id [brief-file|internal-task-id|PR-number]');
const directory = 'private/loop-tasks';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = `${directory}/${id}.json`;
const save = data => writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
if (command === 'prepare') {
  if (existsSync(path)) throw new Error('Task already recorded. Inspect the internal Loop task before any retry.');
  if (!value) throw new Error('Reviewed brief file required.');
  const prompt = readFileSync(value, 'utf8');
  const revision = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  const record = { id, service: 'internal-stitch-loop', workspaceId: '8f3fbf76-6c1b-4a80-bb21-d33fc984f277', repository: 'bl4ckfl0w3r/Threadline', startingRevision: revision, briefFile: value, briefHash: createHash('sha256').update(prompt).digest('hex'), status: 'prepared-not-dispatched', corrections: 0, createdAt: new Date().toISOString() };
  save(record);
  console.log(JSON.stringify(record, null, 2));
} else {
  const record = JSON.parse(readFileSync(path, 'utf8'));
  if (command === 'task') {
    if (!/^[a-zA-Z0-9_-]+$/.test(value || '')) throw new Error('Valid internal task ID required.');
    record.taskId = value;
    record.status = 'dispatched';
  }
  if (command === 'pr') {
    if (!/^[1-9][0-9]*$/.test(value || '')) throw new Error('Numeric PR required.');
    record.pr = Number(value);
  }
  if (command === 'correction') {
    if (record.corrections >= 2) throw new Error('Two correction rounds used. Report remaining issues.');
    record.corrections += 1;
  }
  if (command !== 'show') save(record);
  console.log(JSON.stringify(record, null, 2));
}
