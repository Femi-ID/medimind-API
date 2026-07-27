import {
  Body,
  Controller,
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
}
