declare module 'passport-apple' {
  import { Strategy as PassportStrategy } from 'passport-strategy';

  export interface AppleStrategyOptions {
    clientID: string;
    teamID: string;
    keyID: string;
    privateKeyString?: string;
    privateKeyLocation?: string;
    callbackURL: string;
    scope?: string[];
    passReqToCallback?: boolean;
  }

  export interface AppleIdToken {
    iss?: string;
    aud?: string;
    exp?: number;
    iat?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    is_private_email?: boolean | string;
    [key: string]: unknown;
  }

  export type AppleVerifyCallback = (
    error: Error | null,
    user?: unknown,
    info?: unknown,
  ) => void;

  export class Strategy extends PassportStrategy {
    constructor(
      options: AppleStrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        idToken: AppleIdToken,
        profile: unknown,
        done: AppleVerifyCallback,
      ) => void,
    );
    name: string;
  }
}
