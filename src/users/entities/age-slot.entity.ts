import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

@Entity('age_slots')
@Unique(['age'])
@Check('age_range', '"age" BETWEEN 1 AND 100')
export class AgeSlot {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'int' })
  age!: number;

  @Column({ type: 'int', nullable: true })
  candidateId!: number | null;

  @OneToOne(() => User, (u) => u.ownedSlot, { nullable: true })
  @JoinColumn({ name: 'candidateId' })
  candidate?: User | null;

  @Column({ type: 'int', nullable: true })
  currentRepId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'currentRepId' })
  currentRep?: User | null;
}
