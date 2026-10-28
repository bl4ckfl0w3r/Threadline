import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const [command, id, value] = process.argv.slice(2);
if (!['dispatch', 'session', 'pr', 'correction', 'show'].includes(command) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id || '')) throw new Error('Usage: jules-task.mjs dispatch|session|pr|correction|show task-id [brief-file|session-id|PR-number]');
const directory = 'private/jules-tasks';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = `${directory}/${id}.json`;
const save = data => writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
if (command === 'dispatch') {
  if (existsSync(path)) throw new Error('Task already recorded. Inspect Jules before any retry.');
  if (!value) throw new Error('Reviewed brief file required.');
  const prompt = readFileSync(value, 'utf8');
  const revision = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  const record = { id, repository: 'bl4ckfl0w3r/Threadline', startingRevision: revision, briefFile: value, briefHash: createHash('sha256').update(prompt).digest('hex'), status: 'submission-unconfirmed', corrections: 0, createdAt: new Date().toISOString() };
  save(record);
  const result = spawnSync('jules', ['remote', 'new', '--repo', record.repository], { input: prompt, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
  writeFileSync(`${directory}/${id}.output.txt`, (result.stdout || '') + (result.stderr || ''), { mode: 0o600 });
  record.status = result.status === 0 ? 'submitted-needs-session-id' : 'submission-unconfirmed';
  save(record);
  console.log(result.stdout || result.stderr || 'Submission unconfirmed. Inspect sessions before retrying.');
  if (result.status !== 0) process.exitCode = 1;
} else {
  const record = JSON.parse(readFileSync(path, 'utf8'));
  if (command === 'session') {
    if (!/^[a-zA-Z0-9_-]+$/.test(value || '')) throw new Error('Valid session ID required.');
    record.sessionId = value;
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
