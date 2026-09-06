import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import type { InsightsResult } from 'src/consultations/schemas/insights.schema';

const INSIGHTS_SYSTEM_PROMPT = `You are MediMind's vitals analyst. You receive a patient's recent vital-sign readings and produce observations.

You MUST respond with ONLY a valid JSON object, no markdown fences, no commentary before or after. The JSON must have this exact shape:

{
  "insights": [
    {
      "parameter": "<systolic_bp|heart_rate|blood_glucose|weight>",
      "severity": "<normal|watch|alert>",
      "direction": "<up|down|flat>",
      "message": "<1-2 sentence observation citing actual numbers>"
    }
  ],
  "summary": "<one sentence synthesizing all parameters>"
}

Rules:
- Only include entries for parameters that have data. If there's no heart rate data, don't include a heart_rate entry.
- Never diagnose. Say "this may warrant attention" not "you have hypertension."
- Be specific: cite actual numbers ("your systolic BP averaged 142 mmHg, up from 128").
- Reason across parameters when relevant (e.g. rising BP with elevated heart rate).
- If everything looks normal, say so positively.
- Plain language for a patient, not a clinician.
- severity: normal = healthy range, watch = borderline or trending, alert = clinically concerning.
- direction: up/down/flat based on trend over the window.
- Respond with ONLY the JSON object. No other text.`;

@Injectable()
export class VitalsInsightsService {
  private readonly logger = new Logger(VitalsInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getInsights(userId: string, days = 7): Promise<InsightsResult> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const readings = await this.prisma.vital.findMany({
      where: { userId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });

    if (readings.length === 0) {
      return {
        insights: [],
        summary:
          'No vitals recorded in the last week. Log a reading to get personalized insights.',
      };
    }

    const dataBlock = this.buildDataBlock(readings);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { age: true, gender: true },
    });
    const demoLine = [
      user?.age ? `age ${user.age}` : null,
      user?.gender ? user.gender.toLowerCase() : null,
    ]
      .filter(Boolean)
      .join(', ');

    const userPrompt =
      (demoLine ? `Patient: ${demoLine}.\n\n` : '') +
      `Here are the patient's vital readings from the last ${days} days:\n\n${dataBlock}\n\n` +
      `Respond with ONLY the JSON object.`;

    try {
      return await this.invokeWithFallback(userPrompt);
    } catch (err) {
      this.logger.warn(
        `All insight models failed: ${(err as Error).message}; using rule-based fallback.`,
      );
      return this.fallbackInsights(readings);
    }
  }

  /**
   * gpt-oss models on Groq default to reasoning_effort "medium" — they
   * spend invisible reasoning tokens BEFORE the final answer. With too
   * small a max_tokens budget, reasoning alone exhausts it and the model
   * never reaches the JSON output at all (empty/truncated content, which
   * Groq's JSON-mode validator then hard-rejects with a 400). Fix: shrink
   * reasoning effort, hide it from the content field, and give a much
   * larger token budget so there's room left for the actual JSON.
   */
  private async invokeWithFallback(
    userPrompt: string,
  ): Promise<InsightsResult> {
    const apiKey = this.config.getOrThrow<string>('GROQ_API_KEY');

    const models = [
      this.config.get<string>('GROQ_MODEL_PRIMARY', 'openai/gpt-oss-120b'),
      this.config.get<string>('GROQ_MODEL_FALLBACK', 'openai/gpt-oss-20b'),
    ];

    for (const model of models) {
      for (const delay of [0, 2000]) {
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        try {
          const res = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                temperature: 0.15,
                max_tokens: 2000, // room for reasoning + the actual JSON
                reasoning_effort: 'low', // minimize reasoning-token usage
                reasoning_format: 'hidden', // keep reasoning out of `content`
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: INSIGHTS_SYSTEM_PROMPT },
                  { role: 'user', content: userPrompt },
                ],
              }),
            },
          );

          if (!res.ok) {
            const status = res.status;
            const body = await res.text();
            if (status === 429 || status === 503) {
              this.logger.warn(`Insights ${model} got ${status}, retrying...`);
              continue;
            }
            this.logger.warn(
              `Insights ${model} failed: ${status} ${body.slice(0, 300)}`,
            );
            break;
          }

          const json = await res.json();
          const choice = json.choices?.[0];
          const text: string = choice?.message?.content ?? '';
          if (choice?.finish_reason === 'length') {
            this.logger.warn(
              `Insights ${model}: response truncated (finish_reason=length).`,
            );
          }

          const parsed = this.parseResponse(text);
          if (parsed) return parsed;
          this.logger.warn(
            `Insights ${model}: unparseable (len=${text.length}), retrying.`,
          );
        } catch (err) {
          this.logger.warn(
            `Insights ${model} error: ${(err as Error).message}`,
          );
          break;
        }
      }
    }

    throw new Error('Both models exhausted');
  }

  private parseResponse(text: string): InsightsResult | null {
    try {
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
      const obj = JSON.parse(cleaned);

      if (!Array.isArray(obj.insights) || typeof obj.summary !== 'string') {
        return null;
      }

      const VALID_SEV = new Set(['normal', 'watch', 'alert']);
      const VALID_DIR = new Set(['up', 'down', 'flat', 'mixed']);

      const insights = obj.insights
        .filter(
          (e: any) =>
            typeof e.parameter === 'string' && typeof e.message === 'string',
        )
        .map((e: any) => ({
          parameter: e.parameter,
          severity: VALID_SEV.has(e.severity) ? e.severity : 'normal',
          direction: VALID_DIR.has(e.direction) ? e.direction : 'flat',
          message: e.message,
        }));

      return { insights, summary: obj.summary };
    } catch {
      return null;
    }
  }

  private buildDataBlock(readings: Array<Record<string, unknown>>): string {
    const lines: string[] = [];
    for (const r of readings) {
      const ts = (r.recordedAt as Date).toISOString().slice(0, 16);
      const parts: string[] = [];
      if (r.systolicBp != null)
        parts.push(`BP ${r.systolicBp}/${r.diastolicBp} mmHg`);
      if (r.heartRate != null) parts.push(`HR ${r.heartRate} bpm`);
      if (r.bloodGlucose != null)
        parts.push(`Glucose ${r.bloodGlucose} mmol/L`);
      if (r.weight != null) parts.push(`Weight ${r.weight} kg`);
      if (parts.length > 0) lines.push(`${ts}: ${parts.join(', ')}`);
    }
    return lines.join('\n');
  }

  private fallbackInsights(
    readings: Array<Record<string, unknown>>,
  ): InsightsResult {
    const insights: InsightsResult['insights'] = [];
    const params: Array<{
      key: string;
      field: string;
      label: string;
      unit: string;
    }> = [
      {
        key: 'systolic_bp',
        field: 'systolicBp',
        label: 'Systolic BP',
        unit: 'mmHg',
      },
      {
        key: 'heart_rate',
        field: 'heartRate',
        label: 'Heart rate',
        unit: 'bpm',
      },
      {
        key: 'blood_glucose',
        field: 'bloodGlucose',
        label: 'Blood glucose',
        unit: 'mmol/L',
      },
      { key: 'weight', field: 'weight', label: 'Weight', unit: 'kg' },
    ];

    for (const p of params) {
      const vals = readings
        .map((r) => r[p.field] as number | null)
        .filter((v): v is number => v != null);
      if (vals.length < 2) continue;

      const first = vals[0];
      const last = vals[vals.length - 1];
      const delta = last - first;
      const threshold = Math.max(Math.abs(first) * 0.04, 2);
      const direction =
        Math.abs(delta) < threshold ? 'flat' : delta > 0 ? 'up' : 'down';

      insights.push({
        parameter: p.key,
        severity: direction === 'flat' ? 'normal' : 'watch',
        direction: direction as 'up' | 'down' | 'flat',
        message:
          direction === 'flat'
            ? `Your ${p.label.toLowerCase()} has been steady around ${Math.round(last)} ${p.unit}.`
            : `Your ${p.label.toLowerCase()} moved from ${Math.round(first)} to ${Math.round(last)} ${p.unit} over this period.`,
      });
    }

    return {
      insights,
      summary:
        insights.length === 0
          ? 'Not enough data points yet to identify trends.'
          : 'Based on a simplified rule-based analysis of your recent readings.',
    };
  }
}
