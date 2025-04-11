import {REDIS} from '@config/redis/redis.constants';
import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Request} from 'express';
import {RedisClientType} from 'redis';

import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {SessionDto} from '../api/session.dto';
import {AuthenticatedSession} from './authenticated-session.interface';

@Injectable()
export class SessionService {
  private readonly REDIS_KEY: string;

  constructor(
    @Inject(REDIS) private readonly redisClient: RedisClientType,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    this.REDIS_KEY = this.configService.get('SESSION_REDIS_KEY') as string;
  }

  /**
   * Initializes the metadata (IP, UserAgent, timestamps) on an authenticated session.
   * Mutates the passed request object directly.
   */
  initializeSessionMetadata(request: Request) {
    if (!request.session) {
      return;
    }
    const session: AuthenticatedSession = request.session;

    if (session.passport?.user && !session.metadata) {
      const nowISOString = new Date().toISOString();
      session.metadata = {
        ip: request.ip ?? 'unknown',
        userAgent: request.headers['user-agent'] ?? 'unknown',
        createdAt: nowISOString,
        lastAccessed: nowISOString,
      };
    }
  }

  /**
   * Updates the `lastAccessed` timestamp in the session metadata
   * if the access occurs on a new calendar day.
   * Mutates the passed session object directly.
   */
  updateDailyLastAccessed(session: AuthenticatedSession) {
    if (!session.passport?.user || !session.metadata) {
      return;
    }
    const now = new Date();
    const lastAccessed = new Date(session.metadata.lastAccessed);

    const isDifferentCalendarDay =
      now.getFullYear() !== lastAccessed.getFullYear() ||
      now.getMonth() !== lastAccessed.getMonth() ||
      now.getDate() !== lastAccessed.getDate();

    if (isDifferentCalendarDay) {
      session.metadata.lastAccessed = now.toISOString();
    }
  }

  /**
   * Gets metadata of all active sessions for a user.
   * Uses the Redis SCAN command to iterate through session keys efficiently in batches.
   *
   * NOTE: This implementation does not scale well.
   */
  async getSessions(userId: User['id'], currentSessionId: string) {
    const userSessions: SessionDto[] = [];
    const scanBatchSize = 250;
    let cursor: number = 0;
    const prefix = `${this.REDIS_KEY}:`;

    while (true) {
      const reply = await this.redisClient.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: scanBatchSize,
      });

      cursor = reply.cursor;
      const keys = reply.keys;

      if (keys.length > 0) {
        const sessionDataStrings = await this.redisClient.mGet(keys);

        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const sessionDataString = sessionDataStrings[i];
          if (!sessionDataString) continue;

          const sessionData: AuthenticatedSession = JSON.parse(sessionDataString);

          if (sessionData?.passport?.user !== userId) continue;
          const sessionId = key.substring(prefix.length);

          userSessions.push({
            id: sessionId,
            ip: sessionData.metadata?.ip,
            userAgent: sessionData.metadata?.userAgent,
            createdAt: sessionData.metadata?.createdAt ?? new Date(0).toISOString(),
            lastAccessed: sessionData.metadata?.lastAccessed ?? new Date(0).toISOString(),
            isCurrent: sessionId === currentSessionId,
          });
        }
      }

      if (cursor === 0) break;
    }

    // Sort: Current session first, then by lastAccessed descending.
    userSessions.sort((a, b) => {
      const isCurrentSortOrder = Number(b.isCurrent) - Number(a.isCurrent);
      if (isCurrentSortOrder !== 0) {
        return isCurrentSortOrder;
      }
      return new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime();
    });

    return userSessions;
  }

  /**
   * Revokes a user's active session.
   */
  async revokeSession(
    currentUser: User,
    password: User['password'],
    currentSessionId: string,
    sessionIdToRevoke: string,
  ) {
    if (sessionIdToRevoke === currentSessionId) {
      throw new BadRequestException('Cannot revoke the current session. Log out instead.');
    }

    const sessionKey = `${this.REDIS_KEY}:${sessionIdToRevoke}`;
    const sessionDataString = await this.redisClient.get(sessionKey);
    if (!sessionDataString) {
      throw new NotFoundException(`Session not found or expired.`);
    }

    const sessionData: AuthenticatedSession = JSON.parse(sessionDataString);
    if (sessionData?.passport?.user !== currentUser.id) {
      throw new NotFoundException(`Session not found or expired.`);
    }

    await this.userService.verifyPassword(currentUser.password, password);

    await this.redisClient.del(sessionKey);
    return {message: 'Session revoked.'};
  }
}
