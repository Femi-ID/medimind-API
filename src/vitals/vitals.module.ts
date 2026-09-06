import { Module } from '@nestjs/common';
import { VitalsController } from './vitals.controller';
import { VitalsService } from './vitals.service';
import { VitalsInsightsService } from './vitals-insight.service';

@Module({
  controllers: [VitalsController],
  providers: [VitalsService, VitalsInsightsService],
})
export class VitalsModule {}
