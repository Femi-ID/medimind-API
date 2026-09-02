import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from 'src/generated/prisma/enums';

export class JwtPayloadDto {
  @IsNotEmpty()
  @IsString()
  sub!: string;

  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsEnum(UserRole, { message: 'Must be an option from enum- Role' })
  role!: UserRole;

  @IsOptional()
  @IsString()
  sessionId?: string; // session id — present on all issued tokens
}
