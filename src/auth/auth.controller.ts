import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { UserRequest } from 'src/users/type/request.interface';
import { LoginUserDto } from './dtos/login-user.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth-guard';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Request() req: UserRequest, @Body() loginUserDto: LoginUserDto) {
    return this.authService.login(req.user.id, req.user.email, req.user.role);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Request() req: UserRequest) {
    await this.authService.logout(req.user.id);
    return {
      statusCode: 204,
      message: `Logged user- ${req.user.id} successfully`,
    };
  }
}
