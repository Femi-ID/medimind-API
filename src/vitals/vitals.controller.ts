import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { VitalsService } from './vitals.service';
import type { UserRequest } from 'src/users/type/request.interface';
import { CreateVitalsDto } from './dtos/create-vitals.dto';
import { QueryVitalsDto } from './dtos/query-vitals.dto';
import { TrendsQueryDto } from './dtos/trends-query.dto';
import { UpdateVitalsDto } from './dtos/update-vitals.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CustomThrottlers } from 'src/common/constants/custom-throttlers.constant';
import { VitalsInsightsService } from './vitals-insight.service';

@SkipThrottle({
  [CustomThrottlers.STRICT]: true, // this bypasses the global DEFAULT throttler
  [CustomThrottlers.MODERATE]: true, // wakes up the STRICT throttler with the same setting set in app.module.ts
  // allows DEFAULT throttler to run with default settings.
})
@ApiBearerAuth('access-token')
@Controller('vitals')
export class VitalsController {
  constructor(
    private readonly vitalsService: VitalsService,
    private readonly vitalsInsightsService: VitalsInsightsService,
  ) {}

  // @ApiBearerAuth('access-token')
  @Post()
  async create(
    @Request() req: UserRequest,
    @Body() createVitalsDto: CreateVitalsDto,
  ) {
    return await this.vitalsService.createVitals(req.user.id, createVitalsDto);
  }

  // @ApiBearerAuth('access-token')
  @Get()
  async getAll(@Request() req: UserRequest, @Query() query: QueryVitalsDto) {
    return await this.vitalsService.getAllVitals(req.user.id, query);
  }

  @Get('count')
  async count(@Request() req: UserRequest) {
    return await this.vitalsService.count(req.user.id);
  }

  // @ApiBearerAuth('access-token')
  @Get('latest')
  async getLatest(@Request() req: UserRequest) {
    return await this.vitalsService.getLatest(req.user.id);
  }

  // @ApiBearerAuth('access-token')
  @Get('trends')
  async getTrends(@Request() req: UserRequest, @Query() query: TrendsQueryDto) {
    return await this.vitalsService.getTrends(req.user.id, query);
  }

  @Get('insights')
  async getInsights(@Request() req: UserRequest) {
    return await this.vitalsInsightsService.getInsights(req.user.id, 7);
  }

  // @ApiBearerAuth('access-token')
  @Patch(':vitalId')
  async update(
    @Request() req: UserRequest,
    @Param('vitalId') vitalId: string,
    @Body() updateVitalsDto: UpdateVitalsDto,
  ) {
    return await this.vitalsService.updateVitals(
      req.user.id,
      vitalId,
      updateVitalsDto,
    );
  }

  // @ApiBearerAuth('access-token')
  @Delete(':vitalId')
  async delete(@Request() req: UserRequest, @Param('vitalId') vitalId: string) {
    return await this.vitalsService.deleteVitals(req.user.id, vitalId);
  }
}
