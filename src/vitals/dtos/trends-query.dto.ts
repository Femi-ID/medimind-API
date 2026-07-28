import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VitalParameter } from '../enums/vital-parameter.enum';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TrendsQueryDto {
  @ApiProperty({ enum: VitalParameter })
  @IsEnum(VitalParameter)
  parameter!: VitalParameter;

  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 7;
}
