import { IsDateString, IsString, MinLength } from 'class-validator';

export class CompleteProfileDto {
  @IsString()
  @MinLength(10)
  tempToken!: string;

  @IsDateString()
  birthDate!: string;
}
