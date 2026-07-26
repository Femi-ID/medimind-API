import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // once u import the service in any other module u don't need to re-import in other modules
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
