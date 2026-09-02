import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/users/users.service';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { JwtPayloadDto } from './dtos/jwt-payload.dto';
import refreshJwtConfig from './config/refresh-jwt.config';
import type { ConfigType } from '@nestjs/config';
import { CreateGoogleUserDto } from '../users/dtos/create-googleUser.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private readonly prismaService: PrismaService,
    private jwtService: JwtService,
    @Inject(refreshJwtConfig.KEY)
    private refreshTokenConfig: ConfigType<typeof refreshJwtConfig>,
  ) {}

  // Parses "15m" / "7d" / "3600s" → ms. Falls back if malformed.
  private parseDurationMs(v: string | undefined, fallbackMs: number): number {
    const m = /^(\d+)\s*([smhd])$/.exec((v ?? '').trim());
    if (!m) return fallbackMs;
    const mult = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2]]!;
    return Number(m[1]) * mult;
  }

  // Creates a session row and mints a token pair bound to it via `sessionId`.
  private async issueSession(
    user: { id: string; email: string; role: UserRole },
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const sessionId = randomUUID();
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    };
    const { accessToken, refreshToken } = await this.generateTokens(payload);

    const refreshMs = this.parseDurationMs(
      process.env.JWT_REFRESH_TOKEN_EXPIRY,
      7 * 864e5,
    );
    await this.prismaService.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: await argon2.hash(refreshToken),
        expiresAt: new Date(Date.now() + refreshMs),
        userAgent: meta?.userAgent,
        ipAddress: meta?.ipAddress,
      },
    });
    return { accessToken, refreshToken };
  }

  async login(
    id: string,
    email: string,
    userRole: UserRole,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    return this.issueSession({ id, email, role: userRole }, meta);
  }

  // Called by JwtStrategy on EVERY authenticated request — this is the enforcement point.
  async validateJwtUser(payload: JwtPayloadDto) {
    if (!payload.sessionId) throw new UnauthorizedException('Malformed token.');

    const session = await this.prismaService.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date())
      throw new UnauthorizedException(
        'Session is no longer active. Please sign in again.',
      );

    const user = session.user;
    if (!user || user.deletedAt)
      throw new UnauthorizedException('User account unavailable.');
    if (user.role !== payload.role || user.email !== payload.email)
      throw new UnauthorizedException("Token does not match the user's info.");

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionId: payload.sessionId,
    };
  }

  // Called by RefreshStrategy on /auth/refresh.
  async validateRefreshToken(payload: JwtPayloadDto, refreshToken: string) {
    if (!payload.sessionId)
      throw new UnauthorizedException('Malformed refresh token.');

    const session = await this.prismaService.session.findUnique({
      where: { id: payload.sessionId },
    });
    if (!session) throw new UnauthorizedException('Session not found.');

    const matches = await argon2
      .verify(session.refreshTokenHash, refreshToken)
      .catch(() => false);

    // Reuse detection: a valid token presented against an already-revoked session = replay/theft.
    if (session.revokedAt) {
      if (matches) {
        await this.prismaService.session.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException(
        'Refresh token already used. Please sign in again.',
      );
    }
    if (session.expiresAt < new Date())
      throw new UnauthorizedException('Refresh token expired.');
    if (!matches) throw new UnauthorizedException('Invalid refresh token.');

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    };
  }

  // Rotation: kill the presented session, hand back a brand-new one.
  async rotateTokens(
    user: { id: string; email: string; role: UserRole; sessionId: string },
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    await this.prismaService.session.update({
      where: { id: user.sessionId },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(user, meta);
  }

  async logout(sessionId?: string) {
    if (!sessionId) return;
    await this.prismaService.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // async login(id: string, email: string, userRole: UserRole) {
  //   const payload = { sub: id, email: email, role: userRole };
  //   const { accessToken, refreshToken } = await this.generateTokens(payload);

  //   this.logger.log({ accessToken: accessToken, refreshToken: refreshToken });
  //   return { accessToken: accessToken, refreshToken };
  // }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.getUserByEmail(email);
    if (!user || user.deletedAt != null)
      throw new NotFoundException('User not found..');

    // if the user created an account through google
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses Google sign-in. Please continue with Google.',
      );
    }

    const isPasswordValid = await this.verifyPassword(
      user.passwordHash,
      password,
    );
    if (!isPasswordValid)
      throw new UnauthorizedException('Incorrect user credentials...');

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  async generateTokens(payload: JwtPayloadDto) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, this.refreshTokenConfig),
    ]);
    // return await this.jwtService.signAsync(payload);
    return { accessToken, refreshToken };
  }

  async verifyPassword(
    hashedPassword: string | null,
    plainPassword: string,
  ): Promise<boolean> {
    try {
      if (!hashedPassword) return false;
      return await argon2.verify(hashedPassword, plainPassword);
    } catch (error) {
      this.logger.log(`Error verifying password with argon2`, error);
      throw new InternalServerErrorException('Could not verify password');
    }
  }

  // async validateJwtUser(payload: JwtPayloadDto) {
  //   const user = await this.usersService.getUserByEmail(payload.email);
  //   if (!user) throw new BadRequestException('Invalid user info provided.');

  //   if (user.deletedAt)
  //     return 'User account has been deleted, no authorization!';
  //   if (payload.role !== user.role || payload.email !== user.email)
  //     throw new UnauthorizedException(
  //       "Payload's information doesn't match the user's info",
  //     );
  //   const currentUser = {
  //     id: payload.sub,
  //     email: payload.email,
  //     role: payload.role,
  //   };
  //   return currentUser;
  // }

  // async logout(userId: string) {
  //   //     await this.usersService.hashAndStoreRefreshToken(userId, '');
  // }

  // async validateRefreshToken(payload: JwtPayloadDto, refreshToken: string) {
  //   try {
  //     // const user = await this.usersService.getUserById(payload.sub);
  //     const session = await this.prismaService.session.findFirst({
  //       where: {
  //         id: payload.sub,
  //         revokedAt: null,
  //         expiresAt: { gt: new Date() },
  //       },
  //       orderBy: { createdAt: 'desc' },
  //     });
  //     this.logger.log(`user session- ${JSON.stringify(session)}`);
  //     if (!session?.refreshTokenHash)
  //       throw new UnauthorizedException('No valid refresh token from the db!');

  //     const refreshTokenMatches = await argon2.verify(
  //       session.refreshTokenHash,
  //       refreshToken,
  //     );
  //     if (!refreshTokenMatches)
  //       throw new UnauthorizedException('Invalid refresh token match!');
  //     return { id: payload.sub, email: payload.email, role: payload.role };
  //   } catch (error) {
  //     this.logger.error(error);
  //     throw new UnauthorizedException({
  //       message: 'Unable to validate refresh token...',
  //     });
  //   }
  // }

  async generateNewTokens(payload: JwtPayloadDto) {
    const { accessToken, refreshToken } = await this.generateTokens(payload);
    // await this.usersService.hashAndStoreRefreshToken(payload.sub, refreshToken);

    this.logger.log({ accessToken: accessToken, refreshToken: refreshToken });
    return { accessToken: accessToken, refreshToken: refreshToken };
  }

  async validateOrCreateGoogleUser(googleUser: CreateGoogleUserDto) {
    // console.log('google user..', googleUser);
    const user = this.usersService.getUserByEmail(googleUser.email);
    if (user != null) return user; // user already exists in the db, no need to create user account
    const newUser = await this.usersService.createGoogleUser(googleUser);
    return newUser;
  }
}
