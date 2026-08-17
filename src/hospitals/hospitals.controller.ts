import { Body, Controller, Get, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HospitalsService } from './hospitals.service';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import type { UserRequest } from 'src/users/type/request.interface';
import { CreateReferralDto } from './dto/create-referral.dto';

@ApiTags('hospitals')
@ApiBearerAuth('access-token')
@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Get('nearby')
  @ApiOperation({
    summary:
      'List nearby hospitals, filtered by severity and ranked by distance',
  })
  nearby(@Query() q: NearbyQueryDto) {
    return this.hospitalsService.nearby(
      q.latitude,
      q.longitude,
      q.severity,
      q.radius,
    );
  }

  @Post('referrals')
  @ApiOperation({ summary: 'Record that a user was referred to a facility' })
  async recordReferral(
    @Request() req: UserRequest,
    @Body() dto: CreateReferralDto,
  ) {
    return await this.hospitalsService.recordReferral(req.user.id, dto);
  }

  @Get('referrals')
  @ApiOperation({ summary: "List the current user's referral history" })
  async listReferrals(@Request() req: UserRequest) {
    return await this.hospitalsService.listReferrals(req.user.id);
  }
}
