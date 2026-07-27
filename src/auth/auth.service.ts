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
import { CreateGoogleUserDto } from '../users/dtos/create-googleUser.dto';

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
    hashedPassword: string| null,
    plainPassword: string,
  ): Promise<boolean> {
    try {
      if (!hashedPassword) return false;
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

  async validateRefreshToken(payload: JwtPayloadDto, refreshToken: string) {
    try {
        // const user = await this.usersService.getUserById(payload.sub);
        const session = await this.prismaService.session.findFirst({
            where: { 
                id: payload.sub, 
                revokedAt: null, 
                expiresAt: { gt: new Date() },
            }, 
            orderBy: { createdAt: 'desc'}
        });
        this.logger.log(`user session- ${session}`)
            if (!session?.refreshTokenHash) throw new UnauthorizedException('No valid refresh token from the db!')

            const refreshTokenMatches = await argon2.verify(session.refreshTokenHash, refreshToken)
            if(!refreshTokenMatches) throw new UnauthorizedException('Invalid refresh token match!')
                return { id: payload.sub, email: payload.email, role: payload.role }
    } catch(error) {
      this.logger.error(error);
      throw new UnauthorizedException({
        message: 'Unable to validate refresh token...',
      });
    }
  }

  async generateNewTokens(payload: JwtPayloadDto) {
    const { accessToken, refreshToken } = await this.generateNewTokens(payload);
    // await this.usersService.hashAndStoreRefreshToken(payload.sub, refreshToken); 

    this.logger.log({ accessToken: accessToken, refreshToken: refreshToken });
    return { accessToken: accessToken, refreshToken: refreshToken }
  }

  async validateGoogleUser(googleUser: CreateGoogleUserDto) {
    console.log('google user..', googleUser)
    const user = this.usersService.getUserByEmail(googleUser.email);
    if (user) return user // user already exists in the db, no need to create user account
    const newUser =  await this.usersService.signUpSocialAccount(googleUser);
    return newUser;
  }
}
