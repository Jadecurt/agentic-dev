import { useState, useEffect, useCallback, useRef } from 'react';

export interface PodData {
  serviceId: string;
  status: 'IDLE' | 'STARTING' | 'DEVELOPING' | 'TESTING' | 'FIXING' | 'PASSED' | 'FAILED';
  iteration: number;
  wave: number;
  message?: string;
  handoffs: any[];
  verdicts: any[];
  lastToolCall?: any;
  lastMessage?: string;
}

export function useRunSocket() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [plan, setPlan] = useState<any | null>(null);
  const [pods, setPods] = useState<Map<string, PodData>>(new Map());
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/events`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setEvents((prev) => [...prev.slice(-400), data]);

        if (data.type === 'RUN_STARTED') {
          setCurrentRunId(data.runId);
          setUserPrompt(data.userPrompt);
          setIsCompleted(false);
          setIsSuccess(false);
          setSummary(null);
          setPlan(null);
          setPods(new Map());
        }

        if (data.type === 'PLAN_GENERATED') {
          setPlan(data.plan);
        }

        if (data.type === 'POD_INITIALIZED') {
          setPods((prev) => {
            const next = new Map(prev);
            next.set(data.serviceId, {
              serviceId: data.serviceId,
              status: 'STARTING',
              iteration: 1,
              wave: data.executionWave,
              handoffs: [],
              verdicts: [],
            });
            return next;
          });
        }

        if (data.type === 'POD_STATUS_CHANGED') {
          setPods((prev) => {
            const next = new Map(prev);
            const current = next.get(data.serviceId) || {
              serviceId: data.serviceId,
              status: data.status,
              iteration: data.iteration,
              wave: 1,
              handoffs: [],
              verdicts: [],
            };
            next.set(data.serviceId, {
              ...current,
              status: data.status,
              iteration: data.iteration,
              message: data.message,
            });
            return next;
          });
        }

        if (data.type === 'TOOL_CALLED' && data.serviceId) {
          setPods((prev) => {
            const next = new Map(prev);
            const current = next.get(data.serviceId);
            if (current) {
              next.set(data.serviceId, {
                ...current,
                lastToolCall: data.toolCall,
              });
            }
            return next;
          });
        }

        if (data.type === 'AGENT_MESSAGE' && data.serviceId) {
          setPods((prev) => {
            const next = new Map(prev);
            const current = next.get(data.serviceId);
            if (current) {
              next.set(data.serviceId, {
                ...current,
                lastMessage: data.content,
              });
            }
            return next;
          });
        }

        if (data.type === 'HANDOFF_PRODUCED') {
          setPods((prev) => {
            const next = new Map(prev);
            const current = next.get(data.serviceId);
            if (current) {
              next.set(data.serviceId, {
                ...current,
                handoffs: [...current.handoffs, data.handoff],
              });
            }
            return next;
          });
        }

        if (data.type === 'TEST_VERDICT') {
          setPods((prev) => {
            const next = new Map(prev);
            const current = next.get(data.serviceId);
            if (current) {
              next.set(data.serviceId, {
                ...current,
                verdicts: [...current.verdicts, data.verdict],
              });
            }
            return next;
          });
        }

        if (data.type === 'RUN_COMPLETED') {
          setIsCompleted(true);
          setIsSuccess(data.success);
          setSummary(data.summary);
        }
      } catch (err) {
        console.error('Failed to parse websocket message', err);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  const startRun = useCallback(async (promptText: string, repo?: string, autoApprove: boolean = true) => {
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPrompt: promptText,
        repoPath: repo,
        autoApprove,
      }),
    });
    return res.json();
  }, []);

  const approvePlan = useCallback(async (runId: string, approved: boolean = true) => {
    const res = await fetch(`/api/runs/${runId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    });
    setPendingApproval(false);
    return res.json();
  }, []);

  return {
    connected,
    events,
    currentRunId,
    userPrompt,
    plan,
    pods: Array.from(pods.values()),
    isCompleted,
    isSuccess,
    summary,
    pendingApproval,
    startRun,
    approvePlan,
  };
}
