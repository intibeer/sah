import { status, type Run } from '../../../packages/core/src/index.js';
import type { Event } from './state.js';

/** Catalog text is untrusted: never let it send control sequences to a terminal. */
export function terminalText(value: unknown): string {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function resolveId(ids: string[], input: string, kind: string): string {
  if (ids.includes(input)) return input;
  const matches = input.length >= 8 ? ids.filter(id => id.startsWith(input)) : [];
  if (matches.length !== 1) throw new Error(`Unknown or ambiguous ${kind} ID. Use at least 8 unique characters from review.`);
  return matches[0]!;
}
function short(id: string, ids: string[]): string {
  for (let length = 12; length < id.length; length++) {
    if (ids.filter(other => other.startsWith(id.slice(0, length))).length === 1) return id.slice(0, length);
  }
  return id;
}
type Ink = 'brand' | 'muted' | 'good' | 'warn' | 'bad' | 'blue';
const inks: Record<Ink, number> = { brand: 215, muted: 245, good: 150, warn: 221, bad: 210, blue: 117 };
const labels: Record<Run['status'], string> = {
  awaiting_approval: 'needs a human', ready: 'ready to apply', executing: 'applying', verifying: 'verification pending',
  completed: 'verified & complete', partially_completed: 'more to review', blocked_auth: 'connection needed', failed: 'needs attention', cancelled: 'cancelled', superseded: 'older revision',
};
function cellWidth(char: string): number {
  if (/\p{Mark}/u.test(char)) return 0;
  const code = char.codePointAt(0)!;
  return /\p{Extended_Pictographic}/u.test(char) || code >= 0x1100 && (code <= 0x115f || code >= 0x2e80 && code <= 0xa4cf || code >= 0xac00 && code <= 0xd7a3 || code >= 0xf900 && code <= 0xfaff || code >= 0xfe10 && code <= 0xfe6f || code >= 0xff01 && code <= 0xff60) ? 2 : 1;
}

export class TerminalView {
  private readonly width: number;
  constructor(private readonly color: boolean, private readonly ascii: boolean, columns = 80) {
    this.width = Math.max(12, Math.min(96, columns));
  }
  private ink(value: string, ink: Ink): string { return this.color ? `\x1b[38;5;${inks[ink]}m${value}\x1b[0m` : value; }
  private line(value: string, ink?: Ink): string {
    // Wrap before applying ANSI. Preserve full before/after values, including spaces.
    const result: string[] = [];
    let line = ''; let width = 0;
    for (const char of terminalText(value)) {
      const size = cellWidth(char);
      if (width + size > this.width) {
        const boundary = line.lastIndexOf(' ');
        if (boundary > 2) {
          result.push(line.slice(0, boundary + 1));
          line = '  ' + line.slice(boundary + 1);
          width = [...line].reduce((sum, part) => sum + cellWidth(part), 0);
        } else { result.push(line); line = '  '; width = 2; }
      }
      line += char; width += size;
    }
    result.push(line);
    return result.map(part => ink ? this.ink(part, ink) : part).join('\n');
  }
  header(title: string, detail = 'local mock / no model calls'): string {
    return ['\n' + this.line(`  ${this.ascii ? '<>' : '◈'} SAH  /  commerce, carefully.`, 'brand'), this.line(`  ${title}`),
      this.line(`  ${detail}`, 'muted'), this.ink((this.ascii ? '-' : '─').repeat(this.width), 'muted')].join('\n');
  }
  message(title: string, hint = ''): string {
    return [this.header(title), hint ? this.line(`  ${this.ascii ? '>' : '↳'} ${hint}`, 'blue') : '', ''].filter(Boolean).join('\n');
  }
  summary(run: Run, title = 'Catalog scan'): string {
    const state = status(run);
    const pieces = [this.header(title, `${run.storeId} / revision ${run.revision} / mock catalog`),
      this.line(`  [ ${labels[state.state]} ]`, state.state === 'completed' ? 'good' : 'warn'), '',
      this.line(`  ${run.scanned} products scanned  /  ${run.findings.length} findings  /  ${run.proposals.length} proposals`),
      this.line(`  ${state.applied} applied  /  ${state.verified} verified  /  0 model tokens`, 'muted'),
      this.line(`  Run ${run.id}`, 'muted'), '', this.line(`  Next: ${state.nextAction}`, 'blue')];
    if (state.unresolvedFindings) pieces.push(this.line(`  ${state.unresolvedFindings} findings need judgment; no facts invented.`, 'muted'));
    pieces.push('', this.line('  Small fixes. A proper paper trail.', 'brand'), '');
    return pieces.join('\n');
  }
  review(run: Run): string {
    const ids = run.proposals.map(p => p.id);
    const pieces = [this.summary(run, 'The review desk')];
    if (!run.proposals.length) pieces.push(this.line('  No edit proposals in this revision.', 'muted'));
    for (const [index, p] of run.proposals.entries()) {
      const attempt = run.attempts.find(a => a.proposalId === p.id);
      const decision = attempt?.status ?? run.decisions[p.id]?.choice ?? 'pending';
      pieces.push(this.line(`  ${this.ascii ? '#' : '◇'} ${index + 1}  ${p.field}  [${decision}]`, 'brand'),
        this.line(`  ${p.productId}`, 'muted'), this.line(`  ID ${short(p.id, ids)}`, 'blue'),
        this.line(`  - ${JSON.stringify(p.before)}`, 'bad'), this.line(`  + ${JSON.stringify(p.after)}`, 'good'),
        this.line(`  Evidence: ${p.evidence.explanation}`, 'muted'), '');
    }
    const manual = run.findings.filter(f => f.rule !== 'outer-whitespace');
    if (manual.length) {
      pieces.push(this.line(`  ${this.ascii ? '!' : '○'} Needs your judgment`, 'warn'));
      for (const f of manual.slice(0, 12)) pieces.push(this.line(`  ${f.rule} / ${f.productId} / ${f.path}`), this.line(`    Observed ${JSON.stringify(f.observed)}. ${f.explanation}`, 'muted'));
      if (manual.length > 12) pieces.push(this.line(`  + ${manual.length - 12} more; --json shows all evidence.`, 'muted'));
      pieces.push('');
    }
    const pending = run.proposals.find(p => !run.decisions[p.id] && !run.attempts.some(a => a.proposalId === p.id));
    if (pending && !['cancelled', 'superseded'].includes(run.status)) {
      pieces.push(this.line('  To approve one proposal:', 'blue'), this.line(`  npm run demo -- approve --proposal ${short(pending.id, ids)} --actor YOUR_NAME`),
        this.line('  Then apply, then verify. You are at the wheel.', 'muted'));
    }
    return pieces.join('\n') + '\n';
  }
  history(events: Event[], limit: number): string {
    const visible = events.filter(event => !event.action.startsWith('tool.') && !event.action.startsWith('command.') && !event.action.startsWith('finding.') && !event.action.startsWith('proposal.created'));
    const pieces = [this.header('The paper trail'), this.line(`  Latest ${Math.min(limit, visible.length)} of ${visible.length} milestones`, 'muted'), ''];
    for (const event of visible.slice(-limit)) {
      const detail = event.details.field ?? event.details.reason ?? event.details.proposalId ?? event.details.runId ?? '';
      pieces.push(this.line(`  ${event.at.slice(11, 19)}  ${this.ascii ? '*' : '·'} ${event.action}`, /denied|failed/.test(event.action) ? 'bad' : /verified|completed/.test(event.action) ? 'good' : 'brand'));
      if (detail) pieces.push(this.line(`    ${String(detail)}`, 'muted'));
    }
    if (!visible.length) pieces.push(this.line('  A fresh page. Run your first scan.', 'muted'));
    return pieces.join('\n') + '\n';
  }
}
