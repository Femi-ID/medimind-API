import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { BaseMessage } from '@langchain/core/messages';
import { ConfigService } from '@nestjs/config';
import {
  AssessmentResult,
  assessmentSchema,
} from './schemas/assessment.schema';
import { Runnable } from '@langchain/core/runnables';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly primary: ChatGroq;
  private readonly fallback: ChatGroq;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('GROQ_API_KEY');
    const common = { apiKey, temperature: 0.3, maxTokens: 800 };

    this.primary = new ChatGroq({
      ...common,
      model: this.config.get<string>(
        'GROQ_MODEL_PRIMARY',
        'llama-3.3-70b-versatile',
      ),
    });
    this.fallback = new ChatGroq({
      ...common,
      model: this.config.get<string>(
        'GROQ_MODEL_FALLBACK',
        'llama-3.1-8b-instant',
      ),
    });
  }

  async invokeStructured(messages: BaseMessage[]): Promise<AssessmentResult> {
    const primaryStructured = this.primary.withStructuredOutput(
      assessmentSchema,
      { name: 'health_assessment' },
    );
    const fallbackStructured = this.fallback.withStructuredOutput(
      assessmentSchema,
      { name: 'health_assessment' },
    );

    try {
      return await this.runWithRetry(primaryStructured, messages, 'primary');
    } catch (primaryErr) {
      this.logger.warn(
        `Primary model failed: ${(primaryErr as Error).message}. Falling back to lighter model.`,
      );
      try {
        return await this.runWithRetry(
          fallbackStructured,
          messages,
          'fallback',
        );
      } catch (fallbackErr) {
        this.logger.error(
          `Both models failed: ${(fallbackErr as Error).message}`,
        );
        throw new ServiceUnavailableException('LLM_UNAVAILABLE');
      }
    }
  }

  private async runWithRetry<T>(
    runnable: Runnable<BaseMessage[], T>,
    messages: BaseMessage[],
    label: string,
  ): Promise<T> {
    const delaysMs = [0, 2000, 5000];
    let lastErr: unknown;
    for (const delay of delaysMs) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      try {
        return await runnable.invoke(messages);
        // return response.content.toString().trim();
        // return JSON.stringify(response.content).trim();
      } catch (err) {
        lastErr = err;
        if (!this.isRetryable(err)) throw err;
        this.logger.warn(`${label} retryable failure, retrying after backoff`);
      }
    }
    throw lastErr;
  }

  private isRetryable(err: unknown): boolean {
    const e = err as {
      response?: { status?: number };
      status?: number;
      code?: string;
    };
    const status = e?.response?.status ?? e?.status;
    if (status === 429 || status === 503) return true;
    return e?.code === 'ECONNRESET' || e?.code === 'ETIMEDOUT';
  }

  // private isRetryable(err: unknown): boolean {
  //   const anyErr = err as {
  //     response?: { status?: number };
  //     status?: number;
  //     code?: string;
  //   };
  //   const status = anyErr?.response?.status ?? anyErr?.status;
  //   if (status === 429 || status === 503) return true;
  //   if (anyErr?.code === 'ECONNRESET' || anyErr?.code === 'ETIMEDOUT')
  //     return true;
  //   return false;
  // }
}
