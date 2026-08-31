import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { SkipThrottle } from '@nestjs/throttler';
import { CustomThrottlers } from 'src/common/constants/custom-throttlers.constant';
import { OutputValidatorService } from './output-validator.service';
import { Public } from 'src/auth/decorators/public.decorators';

@SkipThrottle({
  [CustomThrottlers.DEFAULT]: true, // this bypasses the global DEFAULT throttler
  [CustomThrottlers.STRICT]: true, // wakes up the STRICT throttler with the same setting set in app.module.ts
  // allows MODERATE throttler to run with default settings.
})
@ApiBearerAuth('access-token')
@Controller('consultations')
export class ConsultationsController {
  constructor(
    private readonly consultationsService: ConsultationsService,
    private readonly outputValidatorService: OutputValidatorService,
  ) {}

  @ApiOperation({ summary: 'Start a new consultation session' })
  // @ApiBearerAuth('access-token')
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
  // @ApiBearerAuth('access-token')
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
  // @ApiBearerAuth('access-token')
  @Get('sessions/:id')
  async getSession(
    @Request() req: UserRequest,
    @Param('id') sessionId: string,
  ) {
    return await this.consultationsService.getSession(req.user.id, sessionId);
  }

  @ApiOperation({ summary: 'Rename a session' })
  // @ApiBearerAuth('access-token')
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
  // @ApiBearerAuth('access-token')
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
  // @ApiBearerAuth('access-token')
  @Post('messages')
  async sendMessage(
    @Request() req: UserRequest,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    let sessionId = sendMessageDto.sessionId;
    let isNewSession = false;

    // if it's the first chat message, create a new chatSession
    if (!sessionId) {
      const session = await this.consultationsService.createSession(
        req.user.id,
      );
      sessionId = session.id;
      isNewSession = true;
    }

    const coords =
      sendMessageDto.lat != null && sendMessageDto.lng != null
        ? { lat: sendMessageDto.lat, lng: sendMessageDto.lng }
        : undefined;
    const result = await this.consultationsService.sendMessage(
      req.user.id,
      sessionId,
      sendMessageDto.content,
      coords,
    );

    return { sessionId, isNewSession, ...result };
  }

  @Public()
  @Post('_debug/validate-output')
  debugValidate(@Body() b: { text: string }) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.outputValidatorService.validate(b.text);
  }
}
