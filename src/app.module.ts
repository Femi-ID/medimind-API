import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth-guard';
import { VitalsModule } from './vitals/vitals.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlers } from './common/constants/custom-throttlers.constant';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      expandVariables: true,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: CustomThrottlers.DEFAULT,
            ttl: parseInt(config.getOrThrow('THROTTLE_TTL'), 10),
            limit: parseInt(config.getOrThrow('DEFAULT_THROTTLE_LIMIT'), 10),
          },
          {
            name: CustomThrottlers.STRICT,
            ttl: parseInt(config.getOrThrow('THROTTLE_TTL'), 10),
            limit: parseInt(config.getOrThrow('STRICT_THROTTLE_LIMIT'), 10),
          },
          {
            name: CustomThrottlers.MODERATE,
            ttl: parseInt(config.getOrThrow('THROTTLE_TTL'), 10),
            limit: parseInt(config.getOrThrow('MODERATE_THROTTLE_LIMIT'), 10),
          },
        ],
        // storage: new ThrottlerStorageRedisService(
        //   new Redis(buildRedisOptions(config)),
        // ),
      }),
    }),
    VitalsModule,
    ConsultationsModule,
    HospitalsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
