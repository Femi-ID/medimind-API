import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LlmService } from 'src/consultations/llm.service';
import {
  VITAL_PARAMETER_FIELD_MAP,
  VitalField,
  VitalParameter,
} from './enums/vital-parameter.enum';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  InsightsResult,
  insightSchema,
} from 'src/consultations/schemas/insights.schema';
import { ChatGroq } from '@langchain/groq';
import { ConfigService } from '@nestjs/config';

const INSIGHTS_SYSTEM_PROMPT = `You are MediMind's vitals analyst. You receive a patient's recent vital-sign readings (7-day window) and produce structured JSON insights.

Rules:
- Never diagnose. Say "this may warrant attention" rather than "you have hypertension."
- Be specific: cite actual numbers ("your systolic BP averaged 142 mmHg, up from 128 a week ago").
- Reason across parameters together when relevant (e.g. BP + heart rate).
- If everything looks normal, say so clearly and positively.
- The audience is the patient, not a clinician — use plain language.
- Keep each insight to 1–2 sentences. Keep the summary to 1 sentence.`;

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

    // Build a compact text table the LLM can reason over.
    const dataBlock = this.buildDataBlock(readings, days);

    // Also fetch the user's demographics for context.
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
      `Produce your structured insights.`;

    try {
      const apiKey = this.config.getOrThrow<string>('GROQ_API_KEY');
      const model = new ChatGroq({
        apiKey,
        temperature: 0.15,
        maxTokens: 600,
        model: this.config.get<string>(
          'GROQ_MODEL_PRIMARY',
          'openai/gpt-oss-120b',
        ),
      });

      const structured = model.withStructuredOutput(insightSchema, {
        name: 'vitals_insights',
      });

      return await structured.invoke([
        new SystemMessage(INSIGHTS_SYSTEM_PROMPT),
        new HumanMessage(userPrompt),
      ]);
    } catch (err) {
      this.logger.warn(`Insights LLM call failed: ${(err as Error).message}`);
      // Graceful degradation: return a safe fallback so the dashboard never breaks.
      return this.fallbackInsights(readings, days);
    }
  }

  private buildDataBlock(
    readings: Array<Record<string, unknown>>,
    days: number,
  ): string {
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
    days: number,
  ): InsightsResult {
    // Simple first-vs-last comparison per parameter, matching the client-side heuristic.
    const insights: InsightsResult['insights'] = [];
    const params: Array<{
      key: VitalParameter;
      field: VitalField;
      label: string;
      unit: string;
    }> = [
      {
        key: VitalParameter.SYSTOLIC_BP,
        field: 'systolicBp',
        label: 'Systolic BP',
        unit: 'mmHg',
      },
      {
        key: VitalParameter.HEART_RATE,
        field: 'heartRate',
        label: 'Heart rate',
        unit: 'bpm',
      },
      {
        key: VitalParameter.BLOOD_GLUCOSE,
        field: 'bloodGlucose',
        label: 'Blood glucose',
        unit: 'mmol/L',
      },
      {
        key: VitalParameter.WEIGHT,
        field: 'weight',
        label: 'Weight',
        unit: 'kg',
      },
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
        direction,
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
          : 'This is a simplified analysis. The full AI assessment is temporarily unavailable.',
    };
  }
}
