import React from 'react';
import { Layers, FileCode, CheckCircle2, AlertCircle } from 'lucide-react';

interface PlanOverviewProps {
  plan: any;
}

export const PlanOverview: React.FC<PlanOverviewProps> = ({ plan }) => {
  if (!plan) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
        <Layers className="w-6 h-6 text-indigo-400" />
        <div>
          <h2 className="text-xl font-bold text-white">Architectural Execution Plan</h2>
          <p className="text-sm text-slate-400">{plan.goalSummary}</p>
        </div>
      </div>

      {plan.architecturalNotes && (
        <div className="bg-slate-950/60 rounded-lg p-4 border border-slate-800/80">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Architectural Strategy</h3>
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{plan.architecturalNotes}</p>
        </div>
      )}

      {plan.sharedContracts && plan.sharedContracts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-indigo-300 flex items-center space-x-2 mb-3">
            <FileCode className="w-4 h-4 text-indigo-400" />
            <span>Shared API & Type Contracts ({plan.sharedContracts.length})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plan.sharedContracts.map((c: any, idx: number) => (
              <div key={idx} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-indigo-400 font-mono">{c.contractName}</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                    {c.producerService} ➔ {c.consumerServices?.join(', ')}
                  </span>
                </div>
                <p className="text-slate-400">{c.description}</p>
                {c.schemaDefinition && (
                  <pre className="bg-slate-900 p-2 rounded text-[11px] font-mono text-emerald-400 overflow-x-auto border border-slate-800">
                    {c.schemaDefinition}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.affectedServices && plan.affectedServices.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-cyan-300 mb-3">
            Affected Services & Wave Plan ({plan.affectedServices.length})
          </h3>
          <div className="space-y-3">
            {plan.affectedServices.map((s: any, idx: number) => (
              <div key={idx} className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 text-xs font-bold rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                      Wave {s.executionWave ?? 0}
                    </span>
                    <span className="font-bold text-white">{s.serviceId}</span>
                    <span className="text-xs text-slate-500 font-mono">({s.servicePath})</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300">{s.impactReason}</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/60">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Developer Tasks</span>
                    <ul className="list-disc list-inside space-y-1 text-slate-300">
                      {s.developerTasks?.map((t: string, i: number) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/60">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Tester Scenarios</span>
                    <ul className="list-disc list-inside space-y-1 text-slate-300">
                      {s.testerScenarios?.map((sc: string, i: number) => (
                        <li key={i}>{sc}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/60">
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide block mb-1">Acceptance Criteria</span>
                    <ul className="list-disc list-inside space-y-1 text-slate-300">
                      {s.acceptanceCriteria?.map((ac: string, i: number) => (
                        <li key={i} className="flex items-start space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5 mr-1" />
                          <span>{ac}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
