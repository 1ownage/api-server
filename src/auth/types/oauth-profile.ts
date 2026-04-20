import { AuthProvider } from '../../users/entities/user.entity';

export interface OAuthProfile {
  provider: AuthProvider;
  providerId: string;
  email: string;
  birthDate: Date | null;
}
