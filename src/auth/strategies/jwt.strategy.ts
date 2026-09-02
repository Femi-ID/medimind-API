import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwtConfig from '../config/jwt.config';
import { AuthService } from '../auth.service';
import { JwtPayloadDto } from '../dtos/jwt-payload.dto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    @Inject(jwtConfig.KEY)
    private jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConfiguration.secret!,
    });
  }

  async validate(payload: JwtPayloadDto) {
    const result = await this.authService.validateJwtUser({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    });
    return result;
    // passport already verifies the JWT signature and decodes the payload
    // i can also search for the userId in a list of revoked tokens
    // note: the response from here will be added to the request.user object
  }
}
