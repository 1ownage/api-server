import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { computeAge } from '../../common/age';
import { AgeSlot } from './age-slot.entity';

export enum UserType {
  FAN = 'fan',
  CANDIDATE = 'candidate',
}

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  APPLE = 'apple',
}

@Entity('users')
@Unique('uq_provider_account', ['provider', 'providerId'])
export class User {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ type: 'enum', enum: UserType, default: UserType.FAN })
  type!: UserType;

  @Column({ type: 'int', default: 0 })
  coinBalance!: number;

  @Column({ type: 'date' })
  birthDate!: Date;

  @Column({ type: 'enum', enum: AuthProvider })
  provider!: AuthProvider;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToOne(() => AgeSlot, (slot) => slot.candidate)
  ownedSlot?: AgeSlot | null;

  get age(): number {
    return computeAge(new Date(this.birthDate));
  }
}
