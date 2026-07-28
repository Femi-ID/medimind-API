import { ApiPropertyOptional } from '@nestjs/swagger';
import { VitalParameter } from '../enums/vital-parameter.enum';
import { IsDate, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryVitalsDto {
  @ApiPropertyOptional({ description: 'ISO date-time (inclusive lower bound)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date-time (inclusive upper bound)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @ApiPropertyOptional({ enum: VitalParameter })
  @IsOptional()
  @IsEnum(VitalParameter)
  parameter?: VitalParameter;
}
