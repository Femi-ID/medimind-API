import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatRole } from 'src/generated/prisma/enums';

@Injectable()
export class MessageRateLimitGuard implements CanActivate {
  private readonly limit = 20;
  private readonly windowMs = 60 * 60 * 1000;

  constructor(private readonly prismaService: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    const since = new Date(Date.now() - this.windowMs);
    const count = await this.prismaService.chatMessage.count({
      where: {
        role: ChatRole.USER,
        createdAt: { gte: since },
        session: { userId }, // relation filter — message's session belongs to this user
      },
    });

    if (count >= this.limit) {
      throw new HttpException(
        'You have reached the limit of 20 messages per hour. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
