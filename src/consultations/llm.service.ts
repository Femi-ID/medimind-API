import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { BaseMessage } from '@langchain/core/messages';
import { ConfigService } from '@nestjs/config';

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

  async invoke(messages: BaseMessage[]): Promise<string> {
    try {
      return await this.invokeWithRetry(this.primary, messages, 'primary');
    } catch (primaryErr) {
      this.logger.warn(
        `Primary model failed: ${(primaryErr as Error).message}. Falling back to lighter model.`,
      );
      try {
        return await this.invokeWithRetry(this.fallback, messages, 'fallback');
      } catch (fallbackErr) {
        this.logger.error(
          `Both models failed: ${(fallbackErr as Error).message}`,
        );
        throw new ServiceUnavailableException('LLM_UNAVAILABLE');
      }
    }
  }

  private async invokeWithRetry(
    model: ChatGroq,
    messages: BaseMessage[],
    label: string,
  ): Promise<string> {
    const delaysMs = [0, 2000, 5000];
    let lastErr: unknown;
    for (const delay of delaysMs) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      try {
        const response = await model.invoke(messages);
        // return response.content.toString().trim();
        return JSON.stringify(response.content).trim();
      } catch (err) {
        lastErr = err;
        if (!this.isRetryable(err)) throw err;
        this.logger.warn(`${label} call retryable failure, retrying`);
      }
    }
    throw lastErr;
  }

  private isRetryable(err: unknown): boolean {
    const anyErr = err as {
      response?: { status?: number };
      status?: number;
      code?: string;
    };
    const status = anyErr?.response?.status ?? anyErr?.status;
    if (status === 429 || status === 503) return true;
    if (anyErr?.code === 'ECONNRESET' || anyErr?.code === 'ETIMEDOUT')
      return true;
    return false;
  }
}
