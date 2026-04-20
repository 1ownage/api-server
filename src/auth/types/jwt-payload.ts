import { UserType } from '../../users/entities/user.entity';

export interface JwtPayload {
  sub: number;
  type: UserType;
  email: string;
}
