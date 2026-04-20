import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserType } from '../../users/entities/user.entity';
import { JwtPayload } from '../types/jwt-payload';

@Injectable()
export class CandidateGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    if (!user || user.type !== UserType.CANDIDATE) {
      throw new ForbiddenException('Candidate access only');
    }
    return true;
  }
}
