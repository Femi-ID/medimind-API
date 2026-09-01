import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangeUserPasswordDto {
  @ApiProperty({ example: 'oldPassword' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: '+newPassword' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword!: string;
}
