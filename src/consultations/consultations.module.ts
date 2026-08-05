import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { PromptBuilderService } from './prompt-builder.service';
import { LlmService } from './llm.service';

@Module({
  controllers: [ConsultationsController],
  providers: [ConsultationsService, PromptBuilderService, LlmService],
  imports: [ConfigModule, AuthModule],
})
export class ConsultationsModule {}
