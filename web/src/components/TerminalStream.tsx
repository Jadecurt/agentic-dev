import React, { useRef, useEffect, useState } from 'react';
import { Terminal, ArrowDownCircle, Trash2 } from 'lucide-react';

interface TerminalStreamProps {
  events: any[];
}

export const TerminalStream: React.FC<TerminalStreamProps> = ({ events }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  const renderEvent = (evt: any, idx: number) => {
    const time = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : '';

    switch (evt.type) {
      case 'RUN_STARTED':
        return (
          <div key={idx} className="text-cyan-400 font-bold">
            [{time}] 🚀 Run started: "{evt.userPrompt}" (Repo: {evt.repoPath})
          </div>
        );
      case 'INDEX_COMPLETED':
        return (
          <div key={idx} className="text-emerald-400">
            [{time}] 📦 Indexed {evt.topology?.services?.length || 0} services, {evt.topology?.packages?.length || 0} packages.
          </div>
        );
      case 'PLAN_GENERATED':
        return (
          <div key={idx} className="text-amber-400">
            [{time}] 📐 Plan generated: {evt.plan?.affectedServices?.length} affected services identified.
          </div>
        );
      case 'POD_INITIALIZED':
        return (
          <div key={idx} className="text-indigo-400">
            [{time}] 🌐 [{evt.serviceId}] Worktree provisioned for Wave {evt.executionWave}.
          </div>
        );
      case 'POD_STATUS_CHANGED':
        return (
          <div key={idx} className="text-blue-300">
            [{time}] 🔄 [{evt.serviceId}] Status ➔ <strong className="text-white">{evt.status}</strong> (Iter {evt.iteration}) {evt.message ? `- ${evt.message}` : ''}
          </div>
        );
      case 'TOOL_CALLED':
        return (
          <div key={idx} className="text-slate-400 pl-4 font-mono text-[11px]">
            [{time}] ⚡ [{evt.serviceId || 'system'}:{evt.agentRole}] {evt.toolCall?.name}({JSON.stringify(evt.toolCall?.args).slice(0, 75)}...)
          </div>
        );
      case 'TOOL_RESULT':
        return (
          <div key={idx} className="text-slate-500 pl-6 font-mono text-[11px] truncate">
            └─ result: {evt.toolResult?.output?.slice(0, 80)}...
          </div>
        );
      case 'HANDOFF_PRODUCED':
        return (
          <div key={idx} className="text-emerald-300 pl-2">
            [{time}] 📝 [{evt.serviceId}] Developer Handoff (Iter {evt.iteration}): {evt.handoff?.summary}
          </div>
        );
      case 'TEST_VERDICT': {
        const v = evt.verdict;
        const color = v?.status === 'PASSED' ? 'text-emerald-400' : 'text-red-400';
        return (
          <div key={idx} className={`${color} font-semibold pl-2`}>
            [{time}] 🧪 [{evt.serviceId}] Verdict: {v?.status} ({v?.passedCount}/{v?.testCount} passed) — {v?.summary}
          </div>
        );
      }
      case 'INTEGRATION_MERGED':
        return (
          <div key={idx} className="text-purple-400 font-bold">
            [{time}] 🔀 Merged service branches into unified integration branch: {evt.integrationBranch}
          </div>
        );
      case 'RUN_COMPLETED':
        return (
          <div key={idx} className={evt.success ? 'text-emerald-400 font-bold text-sm' : 'text-red-400 font-bold text-sm'}>
            [{time}] {evt.success ? '🎉 Completed successfully:' : '❌ Execution finished with errors:'} {evt.summary}
          </div>
        );
      case 'RUN_ERROR':
        return (
          <div key={idx} className="text-red-500 font-bold">
            [{time}] ⚠️ ERROR: {evt.error}
          </div>
        );
      default:
        return (
          <div key={idx} className="text-slate-400">
            [{time}] {evt.type}
          </div>
        );
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[400px]">
      <div className="bg-slate-900/90 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 text-slate-300 font-mono font-medium">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Live Execution Console</span>
          <span className="text-slate-500">({events.length} events)</span>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] ${
              autoScroll ? 'bg-indigo-950 text-indigo-400 border border-indigo-800' : 'bg-slate-800 text-slate-400'
            }`}
          >
            <ArrowDownCircle className="w-3 h-3" />
            <span>Auto-scroll</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1.5 bg-slate-950 select-text">
        {events.length === 0 ? (
          <div className="text-slate-600 italic">No events emitted yet. Waiting for orchestrator activity...</div>
        ) : (
          events.map((e, idx) => renderEvent(e, idx))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
