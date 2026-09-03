import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import refreshJwtConfig from '../config/refresh-jwt.config';
import type { ConfigType } from '@nestjs/config';
import { JwtPayloadDto } from '../dtos/jwt-payload.dto';
import { Request } from 'express';
import { REFRESH_COOKIE } from '../auth-cookie';

const cookieExtractor = (req: Request): string | null => {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[REFRESH_COOKIE] ?? null;
};

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh-jwt') {
  private readonly logger = new Logger(RefreshStrategy.name);
  constructor(
    private authService: AuthService,
    @Inject(refreshJwtConfig.KEY)
    private refreshJwtConfiguration: ConfigType<typeof refreshJwtConfig>,
  ) {
    super({
      // jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      secretOrKey: refreshJwtConfiguration.secret!,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayloadDto) {
    this.logger.log('payload.sub', payload.sub);
    const refreshToken = cookieExtractor(req);
    console.log(`refresh token- ${refreshToken}`);
    if (!refreshToken)
      throw new UnauthorizedException('Missing refresh token.');

    return await this.authService.validateRefreshToken(payload, refreshToken);
    // returned data is appended to the request.user object
  }
}
