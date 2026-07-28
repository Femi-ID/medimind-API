import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateVitalsDto {
  @ApiProperty({ example: 120, description: 'Systolic BP in mmHg' })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(250)
  systolicBp?: number;

  @ApiProperty({ example: 80, description: 'Diastolic BP in mmHg' })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(150)
  diastolicBp?: number;

  @ApiProperty({ example: 72, description: 'Beats per minute' })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(220)
  heartRate?: number;

  @ApiProperty({ example: 5.5, description: 'Blood glucose in mmol/L' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(2)
  @Max(30)
  bloodGlucose?: number;

  @ApiProperty({ example: 70.5, description: 'Weight in kg' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(20)
  @Max(300)
  weight?: number;
}
