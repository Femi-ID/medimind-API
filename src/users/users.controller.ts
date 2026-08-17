import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
// import { Prisma } from 'src/generated/prisma/client';
import type { UserRequest } from './type/request.interface';
import { CreateUserDto } from './dtos/create-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth-guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CustomThrottlers } from 'src/common/constants/custom-throttlers.constant';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle({
  [CustomThrottlers.DEFAULT]: true, // this bypasses the global DEFAULT throttler
  [CustomThrottlers.STRICT]: true, // wakes up the STRICT throttler with the same setting set in app.module.ts
  // allows MODERATE throttler to run with default settings.
})
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Post('create')
  //   async createUser(@Body() createUserDto: Prisma.UserCreateInput) {
  async createUser(@Body() createUserDto: CreateUserDto) {
    return await this.usersService.createUser(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('profile')
  async getProfile(@Request() req: UserRequest) {
    this.logger.log(`From req.user: ${JSON.stringify(req.user)}`);
    return await this.usersService.getUserProfile(req.user.id);
  }

  // TODO: NO SERVICE FUNCTIONS FOR THIS YET!
  @SkipThrottle({
    [CustomThrottlers.DEFAULT]: true,
    [CustomThrottlers.MODERATE]: true,
  })
  @Post('me/change-password')
  changePassword(/* ... */) {}

  @SkipThrottle({
    [CustomThrottlers.DEFAULT]: true,
    [CustomThrottlers.MODERATE]: true,
  })
  @Delete('me')
  deleteAccount(/* ... */) {}
}
