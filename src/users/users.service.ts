import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthProvider, Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon2 from 'argon2';
import { CreateUserDto } from './dtos/create-user.dto';
import { CreateGoogleUserDto } from 'src/users/dtos/create-googleUser.dto';
import { UpdateUserProfileDto } from './dtos/update-user-profile.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(private readonly prismaService: PrismaService) {}

  async getUserById(id: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: id },
    });
    this.logger.log(`user- ${JSON.stringify(user)}`);
    if (!user) throw new NotFoundException('User not found..');
    return user;
  }

  async getUserByEmail(email: string) {
    const user = await this.prismaService.user.findUnique({
      where: { email: email },
    });
    // if (!user) throw new NotFoundException('User not found..');
    // if (user.deletedAt < new Date().getTime) return
    return user; // this returns a user object or null
  }

  async hashUserPassword(password: string) {
    try {
      return await argon2.hash(password);
    } catch (err) {
      console.error(err);
      throw new InternalServerErrorException(
        'argon2 error- Failed to hash password',
      );
    }
  }

  //   async createUser(createUserDto: Prisma.UserCreateInput) {
  async createUser(createUserDto: CreateUserDto) {
    try {
      const { password, ...remainingUserDto } = createUserDto;
      const userExists = await this.getUserByEmail(createUserDto.email);
      if (userExists)
        throw new BadRequestException(
          'An account with this email already exists..',
        );

      const argon2hashedPassword = await this.hashUserPassword(password);
      return await this.prismaService.user.create({
        data: {
          ...remainingUserDto,
          passwordHash: argon2hashedPassword,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientValidationError) {
        throw new BadRequestException('Invalid user data provided');
      }

      console.error(error);
      throw new InternalServerErrorException('Unable to create user account');
    }
  }

  async getUserProfile(id: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        age: true,
        gender: true,
        preferredLanguage: true,
        role: true,
        // phoneNumber: true,
        // emergencyContact: true,
        emailVerified: true,
        authProvider: true,
        createdAt: true,
        updatedAt: true,
      },
      //   include: {
      //     vitals: {
      //       select: {
      //         id: true,
      //         diastolicBp: true,
      //         systolicBp: true,
      //       },
      //     },
      //   },
    });
    if (!user) throw new NotFoundException('User not found..');
    return user;
  }

  async getUserByGoogleId(googleId: string) {
    return await this.prismaService.user.findUnique({ where: { googleId } });
  }

  async createGoogleUser(createGoogleUserDto: CreateGoogleUserDto) {
    try {
      const user = await this.getUserByGoogleId(createGoogleUserDto.googleId);
      if (user) return user;

      const newUser = await this.prismaService.user.create({
        data: {
          emailVerified: true,
          authProvider: AuthProvider.GOOGLE,
          ...createGoogleUserDto,
        },
      });

      this.logger.log('new user created via google..', newUser);
      return newUser;
    } catch (error) {
      this.logger.error(error);
      throw new UnauthorizedException({
        message: 'Unable to create new user...',
      });
    }
  }

  async updateProfile(userId: string, userProfileDto: UpdateUserProfileDto) {
    const user = await this.prismaService.user.update({
      where: { id: userId },
      data: userProfileDto,
    });
    const { passwordHash, ...userDetails } = user;
    return userDetails;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User account does not exist');

    // OAuth-only users have no password to change.
    if (user.authProvider === AuthProvider.GOOGLE && !user.passwordHash) {
      throw new BadRequestException(
        'This account signs in with Google. Password change is not available.',
      );
    }

    const valid = await argon2.verify(user.passwordHash!, currentPassword);
    if (!valid) throw new ForbiddenException('Current password is incorrect');

    await this.prismaService.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword) },
    });

    // Revoke all other refresh sessions so old devices are logged out.
    await this.prismaService.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async softDelete(userId: string, password: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User account does not exist');

    // Confirm identity before destroying access (skip for OAuth-only users).
    if (
      user.passwordHash &&
      !(await argon2.verify(user.passwordHash, password))
    ) {
      throw new ForbiddenException('Password is incorrect.');
    }

    await this.prismaService.$transaction([
      this.prismaService.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      }),
      this.prismaService.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async exportData(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: {
        vitals: true,
        chatSessions: { include: { messages: true } },
        referrals: true,
      },
      omit: {
        passwordHash: true,
        passwordResetToken: true,
        passwordResetExpiresAt: true,
        emailVerificationToken: true,
        emailVerificationExpiresAt: true,
        googleId: true,
        authProvider: true,
      },
    });
    if (!user) throw new NotFoundException();
    const { ...userDetails } = user;
    return { exportedAt: new Date().toISOString(), userDetails };
  }
}
