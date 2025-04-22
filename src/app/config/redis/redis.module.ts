import {Global, Module} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import Redis from 'ioredis';

import {REDIS} from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') as string;
        return new Redis(redisUrl);
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
