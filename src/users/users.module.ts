import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ExportService } from './export.service';

@Module({
  providers: [UsersService, ExportService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
