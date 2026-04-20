import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async findById(id: number): Promise<User> {
    const user = await this.repo.findOne({
      where: { id },
      relations: { ownedSlot: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
