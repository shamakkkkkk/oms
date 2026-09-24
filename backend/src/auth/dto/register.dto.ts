import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'staff@oms.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Alex Staff' })
  @IsString()
  name: string;

  @ApiProperty({ enum: Role, required: false, default: Role.STAFF })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
