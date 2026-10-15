import { GoogleGenAI, createPartFromFunctionResponse } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { config } from '../config/env.js';

export interface GenerateTextOptions {
  model?: string;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
}

export interface GenerateStructuredOptions<T> {
  model?: string;
  prompt: string;
  systemInstruction?: string;
  schema: z.ZodType<T>;
  schemaName?: string;
  temperature?: number;
}

export interface ChatTurnOptions {
  model?: string;
  contents: any[];
  systemInstruction?: string;
  tools?: any[];
  temperature?: number;
}

export class GeminiClient {
  private ai: GoogleGenAI | null = null;
  private apiKey: string;
  private isSimulated: boolean;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.geminiApiKey;
    this.isSimulated = !this.apiKey || process.env.SIMULATE_LLM === 'true';

    if (!this.isSimulated) {
      try {
        this.ai = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (err) {
        console.warn('Failed to initialize GoogleGenAI client, falling back to simulated mode:', err);
        this.isSimulated = true;
      }
    }
  }

  public get isOffline(): boolean {
    return this.isSimulated;
  }

  /**
   * General text generation
   */
  async generateText(options: GenerateTextOptions): Promise<string> {
    if (this.isSimulated || !this.ai) {
      return this.simulateText(options);
    }

    const model = options.model || config.plannerModel;
    const response = await this.ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
      config: {
        systemInstruction: options.systemInstruction,
        temperature: options.temperature ?? 0.2,
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || '';
  }

  /**
   * Structured output generation using Zod schema
   */
  async generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
    if (this.isSimulated || !this.ai) {
      return this.simulateStructured<T>(options);
    }

    const model = options.model || config.plannerModel;
    const jsonSchema = zodToJsonSchema(options.schema, options.schemaName || 'OutputSchema');

    // Remove $schema key which Gemini API might reject in responseSchema
    const { $schema, ...cleanSchema } = jsonSchema as any;

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
        config: {
          systemInstruction: options.systemInstruction,
          temperature: options.temperature ?? 0.1,
          responseMimeType: 'application/json',
          responseSchema: cleanSchema,
        },
      });

      const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return this.parseAndValidateJson(rawText, options.schema);
    } catch (err: any) {
      // If responseSchema failed (e.g. unsupported schema feature), try prompt-based JSON fallback
      console.warn('Structured call with responseSchema failed, retrying with raw prompt fallback:', err?.message || err);
      const fallbackPrompt = `${options.prompt}\n\nIMPORTANT: Return ONLY valid JSON matching this schema: ${JSON.stringify(cleanSchema)}`;
      const fallbackResponse = await this.ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
        config: {
          systemInstruction: options.systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });
      const text = fallbackResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return this.parseAndValidateJson(text, options.schema);
    }
  }

  /**
   * Multi-turn chat generation with function declarations
   */
  async generateTurn(options: ChatTurnOptions): Promise<{
    text?: string;
    functionCalls?: Array<{ id?: string; name: string; args: any }>;
  }> {
    if (this.isSimulated || !this.ai) {
      return this.simulateTurn(options);
    }

    const model = options.model || config.devModel;
    const response = await this.ai.models.generateContent({
      model,
      contents: options.contents,
      config: {
        systemInstruction: options.systemInstruction,
        tools: options.tools ? [{ functionDeclarations: options.tools }] : undefined,
        temperature: options.temperature ?? 0.2,
      },
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const functionCalls: Array<{ id?: string; name: string; args: any }> = [];
    let textOutput = '';

    for (const part of parts) {
      if ((part as any).functionCall) {
        const fc = (part as any).functionCall;
        functionCalls.push({
          id: fc.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: fc.name,
          args: fc.args || {},
        });
      }
      if (part.text) {
        textOutput += part.text;
      }
    }

    return {
      text: textOutput || undefined,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
    };
  }

  private parseAndValidateJson<T>(rawText: string, schema: z.ZodType<T>): T {
    let clean = rawText.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    const parsed = JSON.parse(clean);
    return schema.parse(parsed);
  }

  // --- Offline Simulation Fallbacks for testing & development without API key ---

  private simulateText(options: GenerateTextOptions): string {
    return `[Simulated Gemini Response] Processed prompt: ${options.prompt.substring(0, 80)}...`;
  }

  private simulateStructured<T>(options: GenerateStructuredOptions<T>): T {
    // If generating ExecutionPlan
    if (options.schemaName === 'ExecutionPlan' || options.prompt.includes('ExecutionPlan') || options.prompt.includes('affectedServices')) {
      const plan = {
        goalSummary: 'Implement multi-service changes to support requested features with contract compliance.',
        architecturalNotes: 'Services communicate via standardized interfaces defined in shared contracts.',
        sharedContracts: [
          {
            contractName: 'IAuthTokenPayload',
            description: 'Standard token verification response across services',
            schemaDefinition: 'export interface IAuthTokenPayload { userId: string; roles: string[]; expiresAt: number; }',
            producerService: 'auth-service',
            consumerServices: ['billing-service', 'gateway-service'],
          },
        ],
        affectedServices: [
          {
            serviceId: 'auth-service',
            servicePath: 'services/auth-service',
            impactReason: 'Requires endpoint updates to adhere to the shared contract',
            executionWave: 0,
            developerTasks: [
              'Update token generation logic in auth service',
              'Verify TypeScript compilation',
            ],
            testerScenarios: [
              'Verify JWT includes roles and expiration',
              'Ensure tests pass',
            ],
            acceptanceCriteria: [
              'All tests in auth-service pass',
              'Exports comply with IAuthTokenPayload',
            ],
          },
          {
            serviceId: 'gateway-service',
            servicePath: 'services/gateway-service',
            impactReason: 'Requires token inspection middleware updates',
            executionWave: 1,
            developerTasks: [
              'Update gateway auth middleware to validate roles',
              'Verify build and typecheck',
            ],
            testerScenarios: [
              'Test gateway rejection of expired tokens',
              'Test forwarding with validated userId',
            ],
            acceptanceCriteria: [
              'Gateway tests pass',
            ],
          },
        ],
      };
      return options.schema.parse(plan) as T;
    }

    // If generating TestVerdict
    if (options.schemaName === 'TestVerdict' || options.prompt.includes('TestVerdict')) {
      const verdict = {
        status: 'PASSED',
        testCount: 4,
        passedCount: 4,
        failedCount: 0,
        failures: [],
        summary: 'All unit and integration tests executed cleanly and verified acceptance criteria.',
        recommendations: [],
      };
      return options.schema.parse(verdict) as T;
    }

    throw new Error(`Offline simulation not configured for schema: ${options.schemaName || 'unknown'}`);
  }

  private simulateTurn(options: ChatTurnOptions): { text?: string; functionCalls?: any[] } {
    // Check if tools includes submit_implementation or submit_test_verdict
    const toolNames = options.tools?.map((t: any) => t.name) || [];
    const userMessages = options.contents.filter((c: any) => c.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1];
    const lastText = typeof lastUserMsg?.parts?.[0]?.text === 'string' ? lastUserMsg.parts[0].text : '';

    if (toolNames.includes('submit_implementation')) {
      return {
        functionCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'submit_implementation',
            args: {
              summary: 'Successfully updated service implementation to meet acceptance criteria.',
              filesChanged: ['src/index.ts'],
              contractComplianceNotes: 'Complies with shared contracts.',
              notesForTester: 'Please verify updated unit tests.',
            },
          },
        ],
      };
    }

    if (toolNames.includes('submit_test_verdict')) {
      return {
        functionCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'submit_test_verdict',
            args: {
              status: 'PASSED',
              testCount: 3,
              passedCount: 3,
              failedCount: 0,
              failures: [],
              summary: 'All tests passed successfully in simulated run.',
              recommendations: [],
            },
          },
        ],
      };
    }

    return {
      text: 'Simulated LLM execution completed.',
    };
  }
}
