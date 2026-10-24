import { useEffect, useState } from 'react';
import type { Task, TaskUsage } from '@/types';
import { api, connectWS } from '@/lib/api';

export function TaskRoutingUsage({ task }: { task: Task }) {
  const [usage, setUsage] = useState<TaskUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    setUsage([]);
    setLoading(true);
    setError('');
    const refresh = async () => {
      const requestRevision = ++revision;
      try {
        const rows = await api.getTaskUsage(task.id);
        if (!cancelled && requestRevision === revision) {
          setUsage(rows);
          setError('');
        }
      } catch (err) {
        if (!cancelled && requestRevision === revision) setError((err as Error).message);
      } finally {
        if (!cancelled && requestRevision === revision) setLoading(false);
      }
    };
    void refresh();
    const disconnect = connectWS((msg) => {
      if ((msg.type === 'agent_complete' && msg.payload.taskId === task.id)
        || (msg.type === 'task_updated' && msg.payload.id === task.id)) void refresh();
    }, () => { void refresh(); });
    // Usage may be persisted after the completion broadcast; poll active runs.
    const timer = task.agentStatus === 'planning' || task.agentStatus === 'executing'
      ? setInterval(() => { void refresh(); }, 5000) : undefined;
    return () => { cancelled = true; clearInterval(timer); disconnect(); };
  }, [task.id, task.agentStatus, task.effectiveTier, task.routingReason]);

  return (
    <details className="shrink-0 border-b border-border text-xs" open>
      <summary className="cursor-pointer px-4 py-2 font-medium">Routing &amp; usage{task.effectiveTier != null ? ` · T${task.effectiveTier}` : ''}</summary>
      <div className="max-h-[25dvh] overflow-auto px-4 pb-3 space-y-2">
        <p className="text-muted-foreground" dir="auto">{task.routingReason || 'Routing reason unknown'}</p>
        {task.routingReason?.startsWith('escalated') && <p className="text-amber-600 dark:text-amber-400">Escalated to a higher tier after the previous response failed acceptance checks.</p>}
        {loading && <p role="status" className="text-muted-foreground">Loading usage…</p>}
        {error && <p role="alert" className="text-red-500">Could not load usage: {error}</p>}
        {!loading && !error && usage.length === 0 && <p className="text-muted-foreground">No usage recorded yet.</p>}
        {usage.length > 0 && (
          <table className="w-full whitespace-nowrap text-xs">
            <caption className="sr-only">Per-attempt token usage and cost</caption>
            <thead className="text-muted-foreground"><tr>{['Attempt', 'Provider', 'Model', 'Tokens in', 'Tokens out', 'Cost (USD)', 'Outcome'].map((label) => <th key={label} scope="col" className="border-b border-border px-2 py-1.5 text-start font-medium">{label}</th>)}</tr></thead>
            <tbody>{[...usage].sort((a, b) => a.attempt - b.attempt).map((row) => (
              <tr key={row.id}>
                <td className="px-2 py-1.5">{row.attempt}</td>
                <td className="px-2 py-1.5">{row.provider}</td>
                <td className="px-2 py-1.5">{row.model ?? 'unknown'}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.inputTokens == null ? 'unknown' : row.inputTokens.toLocaleString()}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.outputTokens == null ? 'unknown' : row.outputTokens.toLocaleString()}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.costUsd == null ? 'unknown' : `$${row.costUsd.toFixed(6)}`}</td>
                <td className="px-2 py-1.5" dir="auto">{row.outcome ?? 'unknown'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </details>
  );
}
