import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Gender, UserRole } from 'src/generated/prisma/enums';

export class CreateGoogleUserDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  passwordHash?: null;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsNumber()
  @IsOptional()
  age?: number;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  // @IsOptional()
  // @IsString()
  // avatarUrl?: string;

  @IsEnum(UserRole)
  @IsNotEmpty()
  role!: UserRole;

  // @IsBoolean()
  // @IsNotEmpty()
  // isSocialAuth!: boolean;
}