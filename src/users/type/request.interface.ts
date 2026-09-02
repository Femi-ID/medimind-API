import { Request } from 'express';
import { UserRole } from 'src/generated/prisma/enums';

export interface UserRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
    sessionId?: string;
  };
}
