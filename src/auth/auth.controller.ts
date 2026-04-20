import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AppleTokenDto } from './dto/apple-token.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { GoogleTokenDto } from './dto/google-token.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { AppleAuthGuard } from './guards/apple-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtPayload } from './types/jwt-payload';
import { OAuthProfile } from './types/oauth-profile';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ── Local ────────────────────────────────────────────────────────────
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  // ── Google OAuth ─────────────────────────────────────────────────────
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  google(): void {
    // Passport redirects to Google — body never reached.
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  googleCallback(@Req() req: Request) {
    return this.auth.handleSocialLogin(req.user as OAuthProfile);
  }

  @Public()
  @Post('google/token')
  @HttpCode(200)
  googleToken(@Body() dto: GoogleTokenDto) {
    return this.auth.verifyGoogleIdToken(dto.idToken);
  }

  // ── Apple OAuth ──────────────────────────────────────────────────────
  @Public()
  @UseGuards(AppleAuthGuard)
  @Get('apple')
  apple(): void {
    // Passport redirects to Apple.
  }

  @Public()
  @UseGuards(AppleAuthGuard)
  @Get('apple/callback')
  appleCallback(@Req() req: Request) {
    return this.auth.handleSocialLogin(req.user as OAuthProfile);
  }

  @Public()
  @Post('apple/token')
  @HttpCode(200)
  appleToken(@Body() dto: AppleTokenDto) {
    return this.auth.verifyAppleIdToken(dto.idToken);
  }

  // ── Finish social signup ─────────────────────────────────────────────
  @Public()
  @Post('complete-profile')
  @HttpCode(200)
  completeProfile(@Body() dto: CompleteProfileDto) {
    return this.auth.completeProfile(dto.tempToken, dto.birthDate);
  }

  // ── Promote fan → candidate ──────────────────────────────────────────
  @Post('candidate/register')
  @HttpCode(200)
  candidateRegister(@CurrentUser() current: JwtPayload) {
    return this.auth.candidateRegister(current.sub);
  }
}
