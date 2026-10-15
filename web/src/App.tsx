import React, { useState } from 'react';
import { useRunSocket } from './hooks/useRunSocket.js';
import { PlanOverview } from './components/PlanOverview.js';
import { PodCard } from './components/PodCard.js';
import { TerminalStream } from './components/TerminalStream.js';
import { Play, Sparkles, CheckCircle2, ShieldCheck, Cpu, GitBranch, RefreshCw } from 'lucide-react';

export function App() {
  const {
    connected,
    events,
    currentRunId,
    userPrompt: activePrompt,
    plan,
    pods,
    isCompleted,
    isSuccess,
    summary,
    pendingApproval,
    startRun,
    approvePlan,
  } = useRunSocket();

  const [promptInput, setPromptInput] = useState(
    'Add an endpoint to auth-service for refreshing access tokens with an expiry timestamp, and update the gateway-service authentication middleware to validate token freshness.'
  );
  const [repoPathInput, setRepoPathInput] = useState('');
  const [autoApprove, setAutoApprove] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || loading) return;
    setLoading(true);
    try {
      await startRun(promptInput, repoPathInput || undefined, autoApprove);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-white text-base tracking-tight">Agentic Dev Orchestrator</h1>
              <p className="text-[11px] text-slate-400">Autonomous Multi-Service Developer & Tester Pods</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-slate-300">{connected ? 'Live WebSocket' : 'Disconnected'}</span>
            </div>

            <div className="hidden md:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-xs text-indigo-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Powered by Gemini</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 space-y-8 w-full">
        {/* Run Launcher Form */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span>Launch Feature / Bugfix Task</span>
            </h2>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoApprove}
                  onChange={(e) => setAutoApprove(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0"
                />
                <span>Auto-approve plan</span>
              </label>
            </div>
          </div>

          <form onSubmit={handleStart} className="space-y-4">
            <div>
              <textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Describe your multi-service feature, cross-service contract change, or bugfix..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner font-sans"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <input
                type="text"
                value={repoPathInput}
                onChange={(e) => setRepoPathInput(e.target.value)}
                placeholder="Target Repo Path (Leave blank to use current project workspace)"
                className="w-full md:w-2/3 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />

              <button
                type="submit"
                disabled={loading || !promptInput.trim()}
                className="w-full md:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition cursor-pointer"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                <span>Start Autonomous Orchestration</span>
              </button>
            </div>
          </form>
        </div>

        {/* Pending Plan Approval Alert */}
        {pendingApproval && currentRunId && (
          <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-4 flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="font-bold text-amber-300 text-sm">Human Approval Required</h3>
              <p className="text-xs text-amber-200/80">Please inspect the architectural plan below before proceeding with Git worktree provisioning.</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => approvePlan(currentRunId, false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium"
              >
                Reject
              </button>
              <button
                onClick={() => approvePlan(currentRunId, true)}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-medium flex items-center space-x-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve & Execute</span>
              </button>
            </div>
          </div>
        )}

        {/* Run Status Banner */}
        {currentRunId && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-indigo-400 font-semibold">Run: {currentRunId}</span>
              {activePrompt && <span className="text-slate-400 truncate max-w-lg">"{activePrompt}"</span>}
            </div>

            {isCompleted && (
              <div className="flex items-center space-x-2">
                <span className={`px-2.5 py-1 rounded-full font-bold ${isSuccess ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>
                  {isSuccess ? 'COMPLETED' : 'FAILED'}
                </span>
                {summary && <span className="text-slate-300">{summary}</span>}
              </div>
            )}
          </div>
        )}

        {/* Gemini Plan Overview */}
        {plan && <PlanOverview plan={plan} />}

        {/* Service Pods Parallel Swimlanes */}
        {pods.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <GitBranch className="w-5 h-5 text-cyan-400" />
                <span>Parallel Service Pods ({pods.length})</span>
              </h2>
              <span className="text-xs text-slate-400">Isolated Worktree Execution</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pods.map((pod) => (
                <PodCard key={pod.serviceId} pod={pod} />
              ))}
            </div>
          </div>
        )}

        {/* Live Terminal Stream */}
        <TerminalStream events={events} />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-600">
        Agentic Dev Orchestrator &bull; Powered by Google Gemini &bull; Git Worktrees Sandbox
      </footer>
    </div>
  );
}
