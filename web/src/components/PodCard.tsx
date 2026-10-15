import React from 'react';
import { PodData } from '../hooks/useRunSocket.js';
import { Bot, FlaskConical, CheckCircle, XCircle, Loader2, GitCommit } from 'lucide-react';

interface PodCardProps {
  pod: PodData;
}

export const PodCard: React.FC<PodCardProps> = ({ pod }) => {
  const getStatusBadge = () => {
    switch (pod.status) {
      case 'PASSED':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>PASSED</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-red-950 text-red-400 border border-red-800">
            <XCircle className="w-3.5 h-3.5" />
            <span>FAILED</span>
          </span>
        );
      case 'DEVELOPING':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-950 text-blue-400 border border-blue-800 animate-pulse">
            <Bot className="w-3.5 h-3.5" />
            <span>DEVELOPING</span>
          </span>
        );
      case 'TESTING':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-950 text-amber-400 border border-amber-800 animate-pulse">
            <FlaskConical className="w-3.5 h-3.5" />
            <span>TESTING</span>
          </span>
        );
      case 'FIXING':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-950 text-purple-400 border border-purple-800 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>FIXING</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-400">
            {pod.status}
          </span>
        );
    }
  };

  const latestVerdict = pod.verdicts?.[pod.verdicts.length - 1];
  const latestHandoff = pod.handoffs?.[pod.handoffs.length - 1];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-white">{pod.serviceId}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
              Wave {pod.wave}
            </span>
          </div>
          {getStatusBadge()}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span>Iteration: <strong className="text-white">{pod.iteration}</strong></span>
          {pod.message && <span className="truncate max-w-[200px] text-slate-400 text-[11px]">{pod.message}</span>}
        </div>

        {/* Live tool call activity */}
        {pod.lastToolCall && pod.status !== 'PASSED' && pod.status !== 'FAILED' && (
          <div className="mt-3 bg-slate-950 p-2.5 rounded border border-slate-800/80 text-xs">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping mr-1"></span>
              <span>Active Tool Call</span>
            </div>
            <div className="font-mono text-cyan-400 truncate">
              {pod.lastToolCall.name}({JSON.stringify(pod.lastToolCall.args).slice(0, 50)}...)
            </div>
          </div>
        )}

        {/* Latest test verdict summary */}
        {latestVerdict && (
          <div className="mt-3 bg-slate-950 p-3 rounded border border-slate-800/80 text-xs space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-400">Latest Test Verdict:</span>
              <span className={latestVerdict.status === 'PASSED' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                {latestVerdict.status} ({latestVerdict.passedCount}/{latestVerdict.testCount} tests)
              </span>
            </div>
            <p className="text-slate-300 text-[11px] line-clamp-2">{latestVerdict.summary}</p>
          </div>
        )}

        {/* Latest handoff summary */}
        {latestHandoff && (
          <div className="mt-2 text-[11px] text-slate-400">
            <span className="text-slate-500">Last commit:</span> {latestHandoff.summary}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center space-x-1">
          <GitCommit className="w-3 h-3" />
          <span>Branch: agent-run/.../{pod.serviceId}</span>
        </span>
        <span>Handoffs: {pod.handoffs.length}</span>
      </div>
    </div>
  );
};
