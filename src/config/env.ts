import dotenv from 'dotenv';
import path from 'node:path';

// Load environment variables from .env if present
dotenv.config();

export interface AppConfig {
  geminiApiKey: string;
  plannerModel: string;
  devModel: string;
  testerModel: string;
  maxPodIterations: number;
  maxConcurrentPods: number;
  commandTimeoutMs: number;
  autoApprovePlan: boolean;
  port: number;
  host: string;
}

export function loadConfig(): AppConfig {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    plannerModel: process.env.GEMINI_PLANNER_MODEL || 'gemini-2.5-pro',
    devModel: process.env.GEMINI_DEV_MODEL || 'gemini-2.5-pro',
    testerModel: process.env.GEMINI_TESTER_MODEL || 'gemini-2.5-flash',
    maxPodIterations: parseInt(process.env.MAX_POD_ITERATIONS || '4', 10),
    maxConcurrentPods: parseInt(process.env.MAX_CONCURRENT_PODS || '4', 10),
    commandTimeoutMs: parseInt(process.env.COMMAND_TIMEOUT_MS || '60000', 10),
    autoApprovePlan: process.env.AUTO_APPROVE_PLAN === 'true' || process.env.AUTO_APPROVE_PLAN === '1',
    port: parseInt(process.env.PORT || '4200', 10),
    host: process.env.HOST || '127.0.0.1',
  };
}

export const config = loadConfig();
