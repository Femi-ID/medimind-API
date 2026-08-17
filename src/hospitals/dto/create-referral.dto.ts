import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateReferralDto {
  @IsUUID()
  sessionId?: string;

  @IsUUID()
  placeId!: string;

  @IsString()
  name!: string;

  @ApiProperty({ example: 6.5244 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 3.3792 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  distance?: number;

  @ApiProperty({ enum: ['low', 'moderate', 'high'] })
  @IsIn(['low', 'moderate', 'high'])
  severity!: 'low' | 'moderate' | 'high';
}
