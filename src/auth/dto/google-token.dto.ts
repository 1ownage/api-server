import { IsString, MinLength } from 'class-validator';

export class GoogleTokenDto {
  @IsString()
  @MinLength(20)
  idToken!: string;
}
