import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Res,
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
import { clearRefreshCookie, setRefreshCookie } from './auth-cookie';
import type { Response } from 'express';

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
  async login(
    @Request() req: UserRequest,
    @Body() dto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(
      req.user.id,
      req.user.email,
      req.user.role,
      {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      },
    );
    setRefreshCookie(res, refreshToken);
    console.log(`refreshToken- ${refreshToken}`);
    return { accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Request() req: UserRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.user.sessionId);
    clearRefreshCookie(res);
    // return {
    //   statusCode: 204,
    //   message: `Logged user- ${req.user.id} successfully`,
    // };
  }

  @Public()
  @UseGuards(RefreshAuthGuard)
  // @ApiBearerAuth('access-token')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Request() req: UserRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.rotateTokens(
      {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        sessionId: req.user.sessionId!,
      },
      { userAgent: req.get('user-agent'), ipAddress: req.ip },
    );
    setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/login')
  async googleLogin() {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallbackUrl(@Request() req: UserRequest, @Res() res: Response) {
    console.log('user request..', req.user.id);
    // const response = await this.authService.login(
    //   req.user.id,
    //   req.user.email,
    //   req.user.role,
    // );
    // return response;

    const { accessToken, refreshToken } = await this.authService.login(
      req.user.id,
      req.user.email,
      req.user.role,
      { userAgent: req.get('user-agent'), ipAddress: req.ip },
    );
    setRefreshCookie(res, refreshToken);

    const frontend =
      process.env.FRONTEND_URL ??
      process.env.CORS_ORIGIN?.split(',')[0]?.trim() ??
      '/';
    // Access token is NOT put in the URL; the frontend calls /auth/refresh
    // (cookie is sent) to obtain it. Keeps the token out of logs/history.
    return res.redirect(`${frontend}/auth/callback`);
  }
}
