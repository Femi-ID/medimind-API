import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
// import { Prisma } from 'src/generated/prisma/client';
import type { UserRequest } from './type/request.interface';
import { CreateUserDto } from './dtos/create-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth-guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomThrottlers } from 'src/common/constants/custom-throttlers.constant';
import { SkipThrottle } from '@nestjs/throttler';
import { UpdateUserProfileDto } from './dtos/update-user-profile.dto';
import type { Response } from 'express';
import { ChangeUserPasswordDto } from './dtos/change-password.dto';
import { DeleteAccountDto } from './dtos/delete-account.dto';

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

  // TODO: NO SERVICE FUNCTIONS FOR THESE YET!
  @SkipThrottle({
    [CustomThrottlers.DEFAULT]: true,
    [CustomThrottlers.MODERATE]: true,
  })
  @ApiBearerAuth('access-token')
  @Post('me/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Request() req: UserRequest,
    @Body() changeUserPasswordDto: ChangeUserPasswordDto,
  ) {
    return await this.usersService.changePassword(
      req.user.id,
      changeUserPasswordDto,
    );
  }

  @SkipThrottle({
    [CustomThrottlers.DEFAULT]: true,
    [CustomThrottlers.MODERATE]: true,
  })
  @ApiBearerAuth('access-token')
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @Request() req: UserRequest,
    @Body() deleteAccountDto: DeleteAccountDto,
  ) {
    return await this.usersService.softDelete(req.user.id, deleteAccountDto);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  async updateUserProfile(
    @Request() req: UserRequest,
    @Body() updateUserProfileDto: UpdateUserProfileDto,
  ) {
    return await this.usersService.updateProfile(
      req.user.id,
      updateUserProfileDto,
    );
  }

  @Get('me/export')
  @ApiOperation({ summary: 'Download all of your data as JSON' })
  @ApiBearerAuth('access-token')
  async export(
    @Request() req: UserRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.usersService.exportData(req.user.id);
    const date = new Date().toISOString().slice(0, 10);
    // const safeId = req.user.id.replace(/[^a-zA-Z0-9-]/g, '');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="medimind-export-${req.user.id}-${date}.json"`,
    );
    return data;
  }
}
