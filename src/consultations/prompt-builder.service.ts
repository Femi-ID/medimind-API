import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CLINICAL_RANGES, SYSTEM_PROMPT } from './constants/prompts';
import { ChatRole } from 'src/generated/prisma/enums';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

const HISTORY_EXCHANGE_LIMIT = 5; // 5 PAIRS MEANS 10 MESSAGES MAX

@Injectable()
export class PromptBuilderService {
  constructor(private readonly prismaService: PrismaService) {}

  async buildMessages(
    userId: string,
    sessionId: string,
    userMessage: string,
    heightenedTerms: string[] = [],
  ): Promise<BaseMessage[]> {
    const [vitalsContext, history] = await Promise.all([
      this.buildVitalsContext(userId),
      this.buildConversationHistory(sessionId),
    ]);

    let systemContent = `${SYSTEM_PROMPT}\n\n${vitalsContext}`;
    if (heightenedTerms.length > 0) {
      systemContent +=
        `\n\nNOTE: The user's message contains higher-severity indicators ` +
        `(${heightenedTerms.join(', ')}). Assess urgency carefully and lean ` +
        `toward recommending professional care sooner.`;
    }

    return [
      new SystemMessage(systemContent),
      ...history,
      new HumanMessage(userMessage),
    ];
  }

  private async buildVitalsContext(userId: string): Promise<string> {
    const latest = await this.getLatestVitalsPerParameter(userId);

    if (Object.keys(latest).length === 0) {
      return `VITALS CONTEXT: No vitals recorded yet for this user.`;
    }

    const lines: string[] = [`VITALS CONTEXT (retrieved from user's records):`];
    for (const [param, entry] of Object.entries(latest)) {
      if (!entry) continue;
      const range = CLINICAL_RANGES[param as keyof typeof CLINICAL_RANGES];
      const rangeStr =
        'min' in range ? ` [normal: ${range.min}–${range.max}]` : '';
      const ago = this.formatRelativeTime(entry.recordedAt);
      lines.push(
        `- ${range.label}: ${entry.value} ${range.unit} (recorded ${ago})${rangeStr}`,
      );
    }
    return lines.join('\n');
  }

  private async buildConversationHistory(
    sessionId: string,
  ): Promise<BaseMessage[]> {
    const rows = await this.prismaService.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_EXCHANGE_LIMIT * 2,
    });

    return rows
      .reverse()
      .map((m) =>
        m.role === ChatRole.USER
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      );
  }

  private async getLatestVitalsPerParameter(userId: string) {
    const results: Record<
      string,
      { value: number; recordedAt: Date } | undefined
    > = {};
    const params = [
      'systolicBp',
      'diastolicBp',
      'heartRate',
      'weight',
      'bloodGlucose',
    ] as const;

    await Promise.all(
      params.map(async (param) => {
        const row = await this.prismaService.vital.findFirst({
          where: { userId, [param]: { not: null } },
          orderBy: { recordedAt: 'desc' },
          select: { [param]: true, recordedAt: true },
        });
        const value = row?.[param];
        if (row && value != null) {
          results[param] = {
            value: value,
            // value: value as number,
            recordedAt: row.recordedAt,
          };
        }
      }),
    );
    return results;
  }

  private formatRelativeTime(date: Date): string {
    const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? '' : 's'} ago`;
  }
}
