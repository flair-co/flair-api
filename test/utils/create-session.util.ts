import {sign} from 'cookie-signature';
import {randomBytes} from 'crypto';
import ms from 'ms';
import {Server} from 'net';
import request from 'supertest';

import {ConfigurationService} from '@core/config/config.service';
import {REDIS} from '@core/redis/redis.constants';
import {AuthenticatedSession} from '@modules/auth/services/authenticated-session.interface';
import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {getApp} from '../setup/e2e.setup';

/**
 * Creates an authenticated agent by generating and storing a valid session for a given user.
 * This helper is used to bypass an OAuth login flow by attaching a valid session cookie.
 */
export async function createSession(httpServer: Server, email: User['email']) {
  const app = getApp();
  const agent = request.agent(httpServer);

  const redis = app.get(REDIS);
  const userService = app.get(UserService);
  const configService = app.get(ConfigurationService);
  const sessionSecret = configService.get('SESSION_SECRET');
  const sessionPrefix = configService.get('SESSION_REDIS_KEY');

  const user = await userService.findByEmail(email);

  const rawSessionId = randomBytes(24).toString('hex');
  const signedSessionId = sign(rawSessionId, sessionSecret);
  const sessionKey = `${sessionPrefix}:${rawSessionId}`;

  const sessionExpiration = configService.get('SESSION_EXPIRATION');
  const expirationMs = ms(sessionExpiration);

  const expires = new Date(Date.now() + expirationMs);
  const now = new Date();

  const session: AuthenticatedSession = {
    cookie: {
      originalMaxAge: expirationMs,
      expires,
      secure: false,
      httpOnly: true,
      path: '/',
      sameSite: 'strict',
    },
    passport: {
      user: user!.id,
    },
    metadata: {
      ip: '127.0.0.1',
      userAgent: 'supertest',
      deviceType: 'desktop',
      clientDescription: 'Test Client',
      clientLocation: 'Localhost',
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    },
  };

  const expirationSeconds = Math.floor(expirationMs / 1000);
  await redis.set(sessionKey, JSON.stringify(session), 'EX', expirationSeconds);

  agent.set('Cookie', `session=s:${signedSessionId}`);
  return agent;
}
