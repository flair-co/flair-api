import {Injectable, NestMiddleware} from '@nestjs/common';
import {NextFunction, Request, Response} from 'express';
import {SessionData} from 'express-session';

interface SessionMetadata extends SessionData {
  metadata?: {
    ip?: string;
    userAgent?: string;
    createdAt: string;
    lastAccessed: string;
  };
}

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const session = req.session as SessionMetadata;
    const now = new Date();
    const nowISOString = now.toISOString();

    if (!session.metadata) {
      session.metadata = {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        createdAt: nowISOString,
        lastAccessed: nowISOString,
      };
    } else {
      const lastAccessed = new Date(session.metadata.lastAccessed);

      const isDifferentDay =
        now.getFullYear() !== lastAccessed.getFullYear() ||
        now.getMonth() !== lastAccessed.getMonth() ||
        now.getDate() !== lastAccessed.getDate();

      if (isDifferentDay) {
        session.metadata.lastAccessed = nowISOString;
      }
    }
    next();
  }
}
