import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/types/jwt-payload';
import { computeAge } from '../common/age';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() current: JwtPayload) {
    const user = await this.users.findById(current.sub);
    return {
      id: user.id,
      email: user.email,
      type: user.type,
      coinBalance: user.coinBalance,
      birthDate: user.birthDate,
      age: computeAge(new Date(user.birthDate)),
      provider: user.provider,
      createdAt: user.createdAt,
      ownedAge: user.ownedSlot?.age ?? null,
    };
  }
}
