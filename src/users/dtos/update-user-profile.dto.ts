import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Gender, PreferredLanguage } from 'src/generated/prisma/enums';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsNumber()
  age?: number;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsOptional()
  @IsEnum(PreferredLanguage)
  preferredLanguage?: PreferredLanguage;

  // phoneNumber?: string;
  // emergencyContact?: string;
}
