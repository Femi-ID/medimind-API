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
import { Public } from './decorators/public.decorators';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Request() req: UserRequest, @Body() loginUserDto: LoginUserDto) {
    return this.authService.login(req.user.id, req.user.email, req.user.role);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Request() req: UserRequest) {
    await this.authService.logout(req.user.id);
    return {
      statusCode: 204,
      message: `Logged user- ${req.user.id} successfully`,
    };
  }

  @Public()
  @UseGuards(RefreshAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('refresh')
  async refreshToken(@Request() req: UserRequest) {
    return await this.authService.generateNewTokens({
        sub: req.user.id,
        email: req.user.email,
        role: req.user.role
    })
  }
}
