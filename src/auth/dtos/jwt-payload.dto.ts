import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
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
}
