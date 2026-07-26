import {
    BadRequestException,
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

  async login(id: string, email: string, userRole: UserRole) {
    const payload = { sub: id, email: email, role: userRole };
    const { accessToken, refreshToken } = await this.generateTokens(payload);

    this.logger.log({ accessToken: accessToken, refreshToken: refreshToken });
    return { accessToken: accessToken, refreshToken };
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.getUserByEmail(email);
    if (!user) throw new NotFoundException('User not found..');

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
    hashedPassword: string,
    plainPassword: string,
  ): Promise<boolean> {
    try {
      return await argon2.verify(hashedPassword, plainPassword);
    } catch (error) {
      this.logger.log(`Error verifying password`, error);
      throw new InternalServerErrorException('Could not verify password');
    }
  }

  async validateJwtUser(payload: JwtPayloadDto) {
    const user = await this.usersService.getUserByEmail(payload.email);
    if (!user) throw new BadRequestException('Invalid user info provided.');

    if (payload.role !== user.role || payload.email !== user.email)
      throw new UnauthorizedException(
        "Payload's information doesn't match the user's info",
      );
    const currentUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return currentUser;
  }

  async logout(userId: string) {
    //     await this.usersService.hashAndStoreRefreshToken(userId, '');
  }
}
