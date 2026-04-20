import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { DataSource, Repository } from 'typeorm';
import { computeAge } from '../common/age';
import { AgeSlot } from '../users/entities/age-slot.entity';
import {
  AuthProvider,
  User,
  UserType,
} from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload';
import { OAuthProfile } from './types/oauth-profile';
import { TempPayload } from './types/temp-payload';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type SocialLoginResult =
  | { kind: 'authenticated'; tokens: AuthTokens; userId: number }
  | { kind: 'needsBirthDate'; tempToken: string; email: string };

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Local ────────────────────────────────────────────────────────────
  async register(dto: RegisterDto): Promise<AuthTokens & { userId: number }> {
    const repo = this.dataSource.getRepository(User);
    const existing = await repo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS') ?? 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const birthDate = this.parseBirthDate(dto.birthDate);
    const user = repo.create({
      email: dto.email,
      passwordHash,
      type: UserType.FAN,
      coinBalance: 0,
      birthDate,
      provider: AuthProvider.LOCAL,
      providerId: null,
    });
    const saved = await repo.save(user);
    const tokens = await this.issueTokens(this.payloadFor(saved));
    return { userId: saved.id, ...tokens };
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: dto.email })
      .getOne();

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(this.payloadFor(user));
  }

  // ── Refresh ──────────────────────────────────────────────────────────
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User no longer exists');

    const accessToken = await this.signAccessToken(this.payloadFor(user));
    return { accessToken };
  }

  // ── Google idToken (mobile / SPA SDK path) ──────────────────────────
  private _googleClient?: OAuth2Client;
  private get googleClient(): OAuth2Client {
    return (this._googleClient ??= new OAuth2Client());
  }

  async verifyGoogleIdToken(idToken: string): Promise<SocialLoginResult> {
    const audiences = [
      this.config.get<string>('GOOGLE_IOS_CLIENT_ID'),
      this.config.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
      this.config.get<string>('GOOGLE_WEB_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_ID'),
    ].filter((v): v is string => !!v && v.length > 0);

    if (audiences.length === 0) {
      throw new UnauthorizedException(
        'Google client IDs are not configured on the server',
      );
    }

    let ticket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: audiences,
      });
    } catch {
      throw new UnauthorizedException('Invalid Google idToken');
    }
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      throw new UnauthorizedException('Google idToken missing required fields');
    }

    return this.handleSocialLogin({
      provider: AuthProvider.GOOGLE,
      providerId: payload.sub,
      email: payload.email,
      birthDate: null, // Google doesn't include birthday in idToken payload
    });
  }

  // ── Apple idToken (mobile native flow) ──────────────────────────────
  private _appleJwks?: jwksClient.JwksClient;
  private get appleJwks(): jwksClient.JwksClient {
    return (this._appleJwks ??= jwksClient({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
    }));
  }

  async verifyAppleIdToken(idToken: string): Promise<SocialLoginResult> {
    const audiences = [
      this.config.get<string>('APPLE_AUDIENCE'),
      this.config.get<string>('APPLE_CLIENT_ID'),
    ].filter((v): v is string => !!v && v.length > 0);
    if (audiences.length === 0) {
      throw new UnauthorizedException(
        'Apple audience is not configured on the server',
      );
    }

    const getKey: jwt.GetPublicKeyOrSecret = (header, cb) => {
      if (!header.kid) {
        cb(new Error('Apple idToken missing kid'));
        return;
      }
      this.appleJwks
        .getSigningKey(header.kid)
        .then((key) => cb(null, key.getPublicKey()))
        .catch((err: Error) => cb(err));
    };

    let payload: jwt.JwtPayload;
    try {
      payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
        jwt.verify(
          idToken,
          getKey,
          {
            audience: audiences as [string, ...string[]],
            issuer: 'https://appleid.apple.com',
            algorithms: ['RS256'],
          },
          (
            err: jwt.VerifyErrors | null,
            decoded: jwt.JwtPayload | string | undefined,
          ) => {
            if (err) reject(err);
            else if (!decoded || typeof decoded === 'string')
              reject(new Error('Invalid payload'));
            else resolve(decoded);
          },
        );
      });
    } catch {
      throw new UnauthorizedException('Invalid Apple idToken');
    }

    const sub = payload.sub;
    const email = (payload as jwt.JwtPayload & { email?: string }).email;
    if (!sub || !email) {
      throw new UnauthorizedException(
        'Apple idToken missing sub or email — make sure scope includes email',
      );
    }

    return this.handleSocialLogin({
      provider: AuthProvider.APPLE,
      providerId: sub,
      email,
      birthDate: null,
    });
  }

  // ── Social ───────────────────────────────────────────────────────────
  async handleSocialLogin(oauth: OAuthProfile): Promise<SocialLoginResult> {
    const repo = this.dataSource.getRepository(User);

    const existing = await repo.findOne({
      where: { provider: oauth.provider, providerId: oauth.providerId },
    });
    if (existing) {
      const tokens = await this.issueTokens(this.payloadFor(existing));
      return { kind: 'authenticated', tokens, userId: existing.id };
    }

    const emailClash = await repo.findOne({ where: { email: oauth.email } });
    if (emailClash) {
      throw new ConflictException(
        'Email already linked to a different account',
      );
    }

    if (oauth.birthDate) {
      const user = repo.create({
        email: oauth.email,
        passwordHash: null,
        type: UserType.FAN,
        coinBalance: 0,
        birthDate: oauth.birthDate,
        provider: oauth.provider,
        providerId: oauth.providerId,
      });
      const saved = await repo.save(user);
      const tokens = await this.issueTokens(this.payloadFor(saved));
      return { kind: 'authenticated', tokens, userId: saved.id };
    }

    const tempToken = await this.signTempToken({
      kind: 'temp',
      provider: oauth.provider,
      providerId: oauth.providerId,
      email: oauth.email,
    });
    return { kind: 'needsBirthDate', tempToken, email: oauth.email };
  }

  async completeProfile(
    tempToken: string,
    birthDateInput: string,
  ): Promise<AuthTokens & { userId: number }> {
    let payload: TempPayload;
    try {
      payload = await this.jwt.verifyAsync<TempPayload>(tempToken, {
        secret: this.config.getOrThrow<string>('JWT_TEMP_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired temp token');
    }
    if (payload.kind !== 'temp') {
      throw new UnauthorizedException('Wrong token kind');
    }

    const repo = this.dataSource.getRepository(User);
    const duplicateProvider = await repo.findOne({
      where: { provider: payload.provider, providerId: payload.providerId },
    });
    if (duplicateProvider) {
      throw new ConflictException('Social account already registered');
    }
    const duplicateEmail = await repo.findOne({
      where: { email: payload.email },
    });
    if (duplicateEmail) {
      throw new ConflictException(
        'Email already linked to a different account',
      );
    }

    const birthDate = this.parseBirthDate(birthDateInput);
    const user = repo.create({
      email: payload.email,
      passwordHash: null,
      type: UserType.FAN,
      coinBalance: 0,
      birthDate,
      provider: payload.provider,
      providerId: payload.providerId,
    });
    const saved = await repo.save(user);
    const tokens = await this.issueTokens(this.payloadFor(saved));
    return { userId: saved.id, ...tokens };
  }

  // ── Candidate registration ───────────────────────────────────────────
  async candidateRegister(
    userId: number,
  ): Promise<AuthTokens & { userId: number; age: number }> {
    return this.dataSource.transaction(async (manager) => {
      const userRepo: Repository<User> = manager.getRepository(User);
      const slotRepo: Repository<AgeSlot> = manager.getRepository(AgeSlot);

      const user = await userRepo.findOne({ where: { id: userId } });
      if (!user) throw new UnauthorizedException('User no longer exists');
      if (user.type === UserType.CANDIDATE) {
        throw new ConflictException('Already registered as candidate');
      }

      const age = computeAge(new Date(user.birthDate));
      if (age < 1 || age > 100) {
        throw new BadRequestException(
          `Computed age ${age} is outside the 1-100 range`,
        );
      }

      let slot = await slotRepo.findOne({ where: { age } });
      if (!slot) {
        slot = slotRepo.create({
          age,
          candidateId: user.id,
          currentRepId: null,
        });
        await slotRepo.save(slot);
      } else if (slot.candidateId !== null) {
        throw new ConflictException(
          `Age ${age} is already claimed by another candidate`,
        );
      } else {
        slot.candidateId = user.id;
        await slotRepo.save(slot);
      }

      user.type = UserType.CANDIDATE;
      await userRepo.save(user);

      const tokens = await this.issueTokens(this.payloadFor(user));
      return { userId: user.id, age, ...tokens };
    });
  }

  // ── Token helpers ────────────────────────────────────────────────────
  private payloadFor(user: User): JwtPayload {
    return { sub: user.id, type: user.type, email: user.email };
  }

  private async issueTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(payload);
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '7d',
    });
    return { accessToken, refreshToken };
  }

  private signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });
  }

  private signTempToken(payload: TempPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_TEMP_SECRET'),
      expiresIn: this.config.get<string>('JWT_TEMP_TTL') ?? '15m',
    });
  }

  private parseBirthDate(input: string): Date {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid birthDate');
    }
    const now = new Date();
    if (d > now) {
      throw new BadRequestException('birthDate cannot be in the future');
    }
    return d;
  }
}
