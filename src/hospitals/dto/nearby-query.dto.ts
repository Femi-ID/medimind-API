import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class NearbyQueryDto {
  @ApiProperty({ example: 6.5244 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 3.3792 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiProperty({ enum: ['low', 'moderate', 'high'] })
  @IsIn(['low', 'moderate', 'high'])
  severity!: 'low' | 'moderate' | 'high';

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  radius?: number;
}
