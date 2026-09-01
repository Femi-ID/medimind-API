import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorators';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
  ) {}

  // @Get()
  // getHello(): string {
  //   return this.appService.getHello();
  // }

  @Public()
  @SkipThrottle() // health pings must never 429, to prevent false-unhealthy restart
  @Get('health')
  async health() {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        db: 'database up',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'degraded',
        db: 'database down',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
