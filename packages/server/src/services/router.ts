import os from 'os';
import path from 'path';
import type { AgentType, RoutingTier } from '../types.js';

// Repos whose code is always confidential, whatever the task's sensitivity says.
// Set CONFIDENTIAL_REPO_ROOTS (comma-separated, ~ allowed); empty by default.
function confidentialRoots(): string[] {
  const raw = process.env.CONFIDENTIAL_REPO_ROOTS ?? '';
  return raw.split(',').map((p) => p.trim()).filter(Boolean)
    .map((p) => path.resolve(p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p));
}

export function isConfidentialRepo(repoPath?: string): boolean {
  if (!repoPath) return false;
  const target = path.resolve(repoPath);
  return confidentialRoots().some((root) => target === root || target.startsWith(root + path.sep));
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}

export type DispatchTarget =
  | { kind: 'agent'; agentType: AgentType }
  | { kind: 'free'; provider: string };

export function isFreeTarget(target: DispatchTarget): target is Extract<DispatchTarget, { kind: 'free' }> {
  return target.kind === 'free';
}

export function checkPolicy(task: { sensitivity?: unknown; repoPath?: string }, target: DispatchTarget): void {
  if (isFreeTarget(target) && task.sensitivity !== 'public') {
    throw new PolicyError('free targets require public sensitivity');
  }
  if (isFreeTarget(target) && isConfidentialRepo(task.repoPath)) {
    throw new PolicyError('free targets are not allowed for confidential repos');
  }
}

export interface RoutingInput {
  title: string;
  description: string;
  sensitivity?: unknown;
  requestedTier?: RoutingTier;
  repoPath?: string;
  agentType?: AgentType;
}

export interface RoutingDecision {
  tier: RoutingTier;
  target: DispatchTarget;
  reason: string;
}

export function routeTask(input: RoutingInput): RoutingDecision {
  let decision: RoutingDecision;
  const agent = (tier: 2 | 3, reason: string): RoutingDecision => ({
    tier, target: { kind: 'agent', agentType: tier === 2 ? 'codex' : 'claude' }, reason,
  });
  const free = (reason: string): RoutingDecision => ({ tier: 1, target: { kind: 'free', provider: 'groq' }, reason });

  if (input.agentType !== undefined) {
    decision = {
      tier: input.agentType === 'codex' ? 2 : 3,
      target: { kind: 'agent', agentType: input.agentType }, reason: 'explicit agent',
    };
  } else if (input.requestedTier !== undefined) {
    switch (input.requestedTier) {
      case 0: throw new PolicyError('tier 0 is not routable yet');
      case 1:
        if (input.repoPath) throw new PolicyError('tier 1 requires a text-only task without repoPath');
        decision = free('requested tier 1');
        break;
      case 2: decision = agent(2, 'requested tier 2'); break;
      case 3: decision = agent(3, 'requested tier 3'); break;
      default: throw new PolicyError('invalid requested tier');
    }
  } else {
    const text = `${input.title} ${input.description}`.toLowerCase();
    if (/\b(backend|security|auth|schema|rls|architecture|debug)\b|امنیت|دیتابیس/.test(text)) {
      decision = agent(3, 'backend, security, or architecture');
    } else if (/\b(ui|frontend|css|component|layout|rtl|design)\b|صفحه|ظاهر|طراحی/.test(text)) {
      decision = agent(2, 'UI or frontend');
    } else if (/\b(rename|refactor|boilerplate|migrate|add tests)\b|تست بنویس/.test(text)) {
      decision = agent(2, 'bulk mechanical work');
    } else if (/\b(summarize|translate|classify|draft)\b|خلاصه|ترجمه/.test(text)
      && input.sensitivity === 'public' && !input.repoPath) {
      decision = free('public text-only task');
    } else {
      decision = agent(3, 'safe default');
    }
  }

  checkPolicy(input, decision.target);
  return decision;
}
