import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AgeSlot } from './age-slot.entity';

export enum UserType {
  FAN = 'fan',
  CANDIDATE = 'candidate',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserType })
  type!: UserType;

  @Column({ type: 'int', default: 0 })
  coinBalance!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToOne(() => AgeSlot, (slot) => slot.candidate)
  ownedSlot?: AgeSlot | null;
}
