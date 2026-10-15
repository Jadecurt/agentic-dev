import { EventEmitter } from 'node:events';
import { OrchestratorEvent } from '../types/events.schema.js';

export type EventListener = (event: OrchestratorEvent) => void;

export class EventBus {
  private emitter = new EventEmitter();
  private history: OrchestratorEvent[] = [];

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(event: OrchestratorEvent): void {
    this.history.push(event);
    this.emitter.emit('orchestrator-event', event);
    this.emitter.emit(event.type, event);
  }

  subscribe(listener: EventListener): () => void {
    this.emitter.on('orchestrator-event', listener);
    return () => {
      this.emitter.off('orchestrator-event', listener);
    };
  }

  subscribeToType(type: OrchestratorEvent['type'], listener: EventListener): () => void {
    this.emitter.on(type, listener);
    return () => {
      this.emitter.off(type, listener);
    };
  }

  getEventsForRun(runId: string): OrchestratorEvent[] {
    return this.history.filter((e) => e.runId === runId);
  }

  getAllEvents(): OrchestratorEvent[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
  }
}

export const globalEventBus = new EventBus();
