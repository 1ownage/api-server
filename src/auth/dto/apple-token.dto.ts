import { IsString, MinLength } from 'class-validator';

export class AppleTokenDto {
  @IsString()
  @MinLength(20)
  idToken!: string;
}
