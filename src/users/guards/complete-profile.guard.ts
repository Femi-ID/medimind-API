// src/users/guards/profile-complete.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ProfileCompleteGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = context.switchToHttp().getRequest().user?.id;
    if (!userId) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        phoneNumber: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
      },
    });
    if (
      !user?.phoneNumber ||
      !user?.emergencyContactName ||
      !user?.emergencyContactPhone
    ) {
      throw new ForbiddenException({
        code: 'PROFILE_INCOMPLETE', // frontend switches on this
        message:
          'Please add a phone number to your profile before starting a consultation.',
      });
    }
    return true;
  }
}
