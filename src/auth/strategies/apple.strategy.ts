import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  AppleIdToken,
  AppleVerifyCallback,
  Strategy,
} from 'passport-apple';
import { AuthProvider } from '../../users/entities/user.entity';
import { OAuthProfile } from '../types/oauth-profile';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(config: ConfigService) {
    super(
      {
        clientID: config.get<string>('APPLE_CLIENT_ID') || 'not-configured',
        teamID: config.get<string>('APPLE_TEAM_ID') || 'not-configured',
        keyID: config.get<string>('APPLE_KEY_ID') || 'not-configured',
        privateKeyString:
          config.get<string>('APPLE_PRIVATE_KEY') || 'not-configured',
        callbackURL:
          config.get<string>('APPLE_CALLBACK_URL') ||
          'http://localhost:3000/auth/apple/callback',
        scope: ['email', 'name'],
      },
      (
        _accessToken: string,
        _refreshToken: string,
        idToken: AppleIdToken,
        _profile: unknown,
        done: AppleVerifyCallback,
      ) => {
        const email = idToken?.email;
        const sub = idToken?.sub;
        if (!email || !sub) {
          done(new Error('Apple profile missing email/sub'));
          return;
        }
        const result: OAuthProfile = {
          provider: AuthProvider.APPLE,
          providerId: sub,
          email,
          birthDate: null, // Apple never provides birthday
        };
        done(null, result);
      },
    );
  }
}
