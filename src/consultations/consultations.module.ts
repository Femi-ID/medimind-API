import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { PromptBuilderService } from './prompt-builder.service';
import { LlmService } from './llm.service';
import { EmergencyGuardService } from './emergency-guard.service';
import { OutputValidatorService } from './output-validator.service';
import { HospitalsModule } from 'src/hospitals/hospitals.module';

@Module({
  controllers: [ConsultationsController],
  providers: [
    ConsultationsService,
    PromptBuilderService,
    LlmService,
    EmergencyGuardService,
    OutputValidatorService,
  ],
  imports: [ConfigModule, AuthModule, HospitalsModule],
})
export class ConsultationsModule {}
