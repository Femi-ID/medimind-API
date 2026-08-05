import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSessionDto {
  @ApiProperty({ example: 'BP concern — Tuesday' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;
}
