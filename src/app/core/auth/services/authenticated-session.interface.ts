import {SessionData} from 'express-session';

import {User} from '@modules/user/user.entity';

export interface AuthenticatedSession extends SessionData {
  passport?: {
    user?: User['id'];
  };
  metadata?: {
    ip: string;
    userAgent: string;
    createdAt: string;
    lastAccessed: string;
  };
}
