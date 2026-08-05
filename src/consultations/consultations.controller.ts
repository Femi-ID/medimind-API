import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import type { UserRequest } from 'src/users/type/request.interface';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @ApiOperation({ summary: 'Start a new consultation session' })
  @ApiBearerAuth('access-token')
  @Post('sessions')
  async createSession(
    @Request() req: UserRequest,
    @Body() createSessionDto: CreateSessionDto,
  ) {
    return await this.consultationsService.createSession(
      req.user.id,
      createSessionDto.title,
    );
  }

  @ApiOperation({ summary: 'List consultation sessions for the current user' })
  @ApiBearerAuth('access-token')
  @Get('sessions')
  async listSessions(
    @Request() req: UserRequest,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return await this.consultationsService.listSessions(
      req.user.id,
      limit,
      offset,
    );
  }

  @ApiOperation({ summary: 'Fetch a session with its full message history' })
  @ApiBearerAuth('access-token')
  @Get('sessions/:id')
  async getSession(
    @Request() req: UserRequest,
    @Param('id') sessionId: string,
  ) {
    return await this.consultationsService.getSession(req.user.id, sessionId);
  }

  @ApiOperation({ summary: 'Rename a session' })
  @ApiBearerAuth('access-token')
  @Patch('sessions/:id')
  async updateSession(
    @Request() req: UserRequest,
    @Param('id') sessionId: string,
    @Body() updateSessionDto: UpdateSessionDto,
  ) {
    return await this.consultationsService.updateSession(
      req.user.id,
      sessionId,
      updateSessionDto.title,
    );
  }

  @ApiOperation({ summary: 'Delete a session and all its messages' })
  @ApiBearerAuth('access-token')
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(
    @Request() req: UserRequest,
    @Param('id') sessionId: string,
  ) {
    return await this.consultationsService.deleteSession(
      req.user.id,
      sessionId,
    );
  }

  @ApiOperation({
    summary: 'Send a symptom message and receive an AI-guided response',
    description:
      "Persists the user message, injects the user's latest vitals and recent conversation history into the prompt, calls the LLM, and returns the assistant reply.",
  })
  @ApiBearerAuth('access-token')
  @Post('send-message')
  async sendMessage(
    @Request() req: UserRequest,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    // if it's the first chat message, create a new chatSession
    let sessionId = sendMessageDto.sessionId;
    let isNewSession = false;

    if (!sessionId) {
      const session = await this.consultationsService.createSession(
        req.user.id,
      );
      sessionId = session.id;
      isNewSession = true;
    }
    const result = await this.consultationsService.sendMessage(
      req.user.id,
      sessionId,
      sendMessageDto.content,
    );

    return { sessionId, isNewSession, ...result };
  }
}
