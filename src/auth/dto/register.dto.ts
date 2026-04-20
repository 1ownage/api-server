import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserType } from '../../users/entities/user.entity';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @IsEnum(UserType)
  type!: UserType;

  // Candidate must supply an age slot to claim; fan must not.
  @ValidateIf((o: RegisterDto) => o.type === UserType.CANDIDATE)
  @IsInt()
  @Min(1)
  @Max(100)
  age?: number;

  @ValidateIf((o: RegisterDto) => o.type === UserType.FAN)
  @IsOptional()
  _unused?: never;
}
