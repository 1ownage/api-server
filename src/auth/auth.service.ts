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
import { DataSource, Repository } from 'typeorm';
import { AgeSlot } from '../users/entities/age-slot.entity';
import { User, UserType } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens & { userId: number }> {
    if (dto.type === UserType.CANDIDATE && dto.age == null) {
      throw new BadRequestException('Candidate registration requires age');
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS') ?? 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    return this.dataSource.transaction(async (manager) => {
      const userRepo: Repository<User> = manager.getRepository(User);
      const slotRepo: Repository<AgeSlot> = manager.getRepository(AgeSlot);

      const existing = await userRepo.findOne({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('Email already registered');
      }

      const user = userRepo.create({
        email: dto.email,
        passwordHash,
        type: dto.type,
        coinBalance: 0,
      });
      const saved = await userRepo.save(user);

      if (dto.type === UserType.CANDIDATE) {
        await this.claimSlot(slotRepo, dto.age as number, saved.id);
      }

      const tokens = await this.issueTokens({
        sub: saved.id,
        type: saved.type,
        email: saved.email,
      });
      return { userId: saved.id, ...tokens };
    });
  }

  private async claimSlot(
    slotRepo: Repository<AgeSlot>,
    age: number,
    candidateId: number,
  ): Promise<void> {
    let slot = await slotRepo.findOne({ where: { age } });
    if (!slot) {
      slot = slotRepo.create({ age, candidateId, currentRepId: null });
      await slotRepo.save(slot);
      return;
    }
    if (slot.candidateId !== null) {
      throw new ConflictException(`Age ${age} is already claimed`);
    }
    slot.candidateId = candidateId;
    await slotRepo.save(slot);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: dto.email })
      .getOne();

    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens({
      sub: user.id,
      type: user.type,
      email: user.email,
    });
  }

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

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, type: user.type, email: user.email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    return { accessToken };
  }

  private async issueTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '7d',
    });
    return { accessToken, refreshToken };
  }
}
