import { AuthProvider } from '../../users/entities/user.entity';

export interface TempPayload {
  kind: 'temp';
  provider: AuthProvider;
  providerId: string;
  email: string;
}
