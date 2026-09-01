import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PromptBuilderService } from './prompt-builder.service';
import { LlmService } from './llm.service';
import { ChatRole, ChatSeverity } from 'src/generated/prisma/enums';
import { FALLBACK_RESPONSE } from './constants/prompts';
import { AssessmentResult } from './schemas/assessment.schema';
import {
  DISCLAIMER,
  EMERGENCY_ADVISORY,
  VALIDATOR_FALLBACK,
} from './constants/safety';
import { EmergencyGuardService } from './emergency-guard.service';
import { OutputValidatorService } from './output-validator.service';
import { HospitalsService } from 'src/hospitals/hospitals.service';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);
  private readonly severityToEnum: Record<
    AssessmentResult['severity'],
    ChatSeverity
  > = {
    low: ChatSeverity.LOW,
    moderate: ChatSeverity.MODERATE,
    high: ChatSeverity.HIGH,
  };

  constructor(
    private readonly prismaService: PrismaService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly llmService: LlmService,
    private readonly emergencyGuardService: EmergencyGuardService,
    private readonly outputValidatorService: OutputValidatorService,
    private readonly hospitalsService: HospitalsService,
  ) {}

  async createSession(userId: string, title?: string) {
    return await this.prismaService.chatSession.create({
      data: { userId, title: title?.trim() || 'New consultation' },
    });
  }

  async listSessions(userId: string, limit = 20, offset = 0) {
    const [sessions, total] = await Promise.all([
      this.prismaService.chatSession.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, createdAt: true, role: true },
          },
        },
      }),
      this.prismaService.chatSession.count({ where: { userId } }),
    ]);

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        lastMessage: s.messages[0] ?? null,
      })),
      total,
    };
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.prismaService.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException();
    return session;
  }

  async updateSession(userId: string, sessionId: string, title: string) {
    await this.assertSessionOwnership(userId, sessionId);
    return await this.prismaService.chatSession.update({
      where: { id: sessionId },
      data: { title: title.trim() },
    });
  }

  async deleteSession(userId: string, sessionId: string) {
    await this.assertSessionOwnership(userId, sessionId);
    await this.prismaService.chatSession.delete({ where: { id: sessionId } });
  }

  // Messages
  async sendMessage(
    userId: string,
    sessionId: string,
    content: string,
    coordinates?: { lat: number; lng: number },
  ) {
    await this.assertSessionOwnership(userId, sessionId);

    // Persist user message first- never lose it even if the LLM call fails.
    const userMessage = await this.prismaService.chatMessage.create({
      data: { sessionId, role: ChatRole.USER, content: content.trim() },
    });

    // Emergency intercept - this is determined from the user's message, no LLM
    const emergency = this.emergencyGuardService.evaluate(content);
    if (emergency.isEmergency) {
      const assistantMessage = await this.prismaService.chatMessage.create({
        data: {
          sessionId,
          role: ChatRole.ASSISTANT,
          content: EMERGENCY_ADVISORY,
          severity: ChatSeverity.HIGH,
          isEmergency: true,
          referralSuggested: true,
        },
      });

      await this.touchAndTitle(sessionId, userMessage.content);
      const hospitals = coordinates
        ? await this.hospitalsService.nearby(
            coordinates.lat,
            coordinates.lng,
            'high',
          )
        : [];

      return {
        userMessage,
        assistantMessage,
        severity: ChatSeverity.HIGH,
        referralSuggested: true,
        isEmergency: true,
        usedFallback: false,
        triage: 'EMERGENCY' as const,
        hospitals: hospitals ?? [],
        disclaimer: DISCLAIMER,
      };
    }

    // if !emergency Build the LLM prompt and call the structured LLM
    const messages = await this.promptBuilderService.buildMessages(
      userId,
      sessionId,
      userMessage.content,
      emergency.heightenedTerms,
    );

    let assessmentResult: AssessmentResult;
    let usedFallback = false;
    try {
      assessmentResult = await this.llmService.invokeStructured(messages);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        assessmentResult = {
          assessment: FALLBACK_RESPONSE,
          severity: 'low',
          referralSuggested: false,
        };
        usedFallback = true;
        this.logger.warn(
          `LLM unavailable for session=${sessionId}, using fallback response`,
        );
      } else {
        throw err;
      }
    }

    // Post-LLM output validation.
    let finalContent = assessmentResult.assessment;
    const validation = this.outputValidatorService.validate(finalContent);
    if (!validation.ok) {
      this.logger.warn(
        `Output validator intercepted response for session=${sessionId}: ` +
          `${validation.reasons.join('; ')}. Original: ${finalContent.slice(0, 300)}`,
      );
      finalContent = VALIDATOR_FALLBACK;
    }
    // Severity floor, never record below MODERATE.
    let severity = this.severityToEnum[assessmentResult.severity];
    if (emergency.heightenedTerms.length > 0 && severity === ChatSeverity.LOW) {
      severity = ChatSeverity.MODERATE;
    }
    const referralSuggested =
      assessmentResult.referralSuggested || severity === ChatSeverity.HIGH;

    // Persist assistant message
    const assistantMessage = await this.prismaService.chatMessage.create({
      data: {
        sessionId,
        role: ChatRole.ASSISTANT,
        content: finalContent,
        severity,
        isEmergency: false,
        referralSuggested,
      },
    });

    await this.touchAndTitle(sessionId, userMessage.content);

    // Pre-fetch hospitals only when high severity AND we have coordinates.
    const hospitals =
      coordinates && severity === ChatSeverity.HIGH
        ? await this.hospitalsService.nearby(
            coordinates.lat,
            coordinates.lng,
            'high',
          )
        : undefined;

    return {
      userMessage,
      assistantMessage,
      severity,
      referralSuggested,
      isEmergency: false,
      usedFallback,
      triage: this.toTriage(false, severity),
      hospitals: hospitals ?? [],
      disclaimer: DISCLAIMER,
    };
  }

  // Helpers

  // Touch updatedAt so listSessions orders correctly, then auto-title if first exchange.
  private async touchAndTitle(sessionId: string, firstUserMessage: string) {
    await this.prismaService.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    await this.maybeGenerateSessionTitle(sessionId, firstUserMessage);
  }

  private async assertSessionOwnership(userId: string, sessionId: string) {
    const session = await this.prismaService.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException();
  }

  private async maybeGenerateSessionTitle(
    sessionId: string,
    firstUserMessage: string,
  ) {
    const session = await this.prismaService.chatSession.findUnique({
      where: { id: sessionId },
      select: { title: true, _count: { select: { messages: true } } },
    });
    if (!session || session.title !== 'New consultation') return;
    if (session._count.messages !== 2) return; // exactly 1 user + 1 assistant

    // NOTE/TODO: or use an ai to generate a title based on the context of the first message
    const title =
      firstUserMessage.slice(0, 40).trim() +
      (firstUserMessage.length > 40 ? '…' : '');
    await this.prismaService.chatSession.update({
      where: { id: sessionId },
      data: { title },
    });
  }

  private toTriage(
    isEmergency: boolean,
    severity: ChatSeverity,
  ): 'EMERGENCY' | 'URGENT' | 'MODERATE' | 'SELF_CARE' {
    if (isEmergency) return 'EMERGENCY';
    if (severity === ChatSeverity.HIGH) return 'URGENT';
    if (severity === ChatSeverity.MODERATE) return 'MODERATE';
    return 'SELF_CARE';
  }
}
