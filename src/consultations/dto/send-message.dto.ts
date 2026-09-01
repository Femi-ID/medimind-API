import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    example:
      'I have had a headache for two days and my BP was 145/95 this morning.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ example: 'en', enum: ['en', 'pcm', 'yo', 'ig', 'ha'] })
  @IsOptional()
  @IsIn(['en', 'pcm', 'yo', 'ig', 'ha'])
  language?: string; // accepted for contract stability; multilingual is post-MVP

  @ApiPropertyOptional({ example: 6.5244 })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 3.3792 })
  @IsOptional()
  @IsLongitude()
  lng?: number;
}
