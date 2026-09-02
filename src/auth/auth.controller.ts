import {
  Body,
  Controller,
  Get,
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
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';
import { CustomThrottlers } from 'src/common/constants/custom-throttlers.constant';

@SkipThrottle({
  [CustomThrottlers.DEFAULT]: true, // sets DEFAULT off
  [CustomThrottlers.MODERATE]: true, // skips MODERATE off
  // allows STRICT throttler to run with default settings.
})
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Request() req: UserRequest, @Body() dto: LoginUserDto) {
    return await this.authService.login(
      req.user.id,
      req.user.email,
      req.user.role,
      {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      },
    );
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
    return await this.authService.rotateTokens(
      {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        sessionId: req.user.sessionId!,
      },
      { userAgent: req.get('user-agent'), ipAddress: req.ip },
    );
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/login')
  async googleLogin() {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallbackUrl(@Request() req: UserRequest) {
    console.log('user request..', req.user.id);
    const response = await this.authService.login(
      req.user.id,
      req.user.email,
      req.user.role,
    );
    return response;
  }
}
