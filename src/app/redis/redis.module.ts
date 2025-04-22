import {ConfigurationService} from '@config/config.service';
import {Global, Module} from '@nestjs/common';
import Redis from 'ioredis';

import {REDIS} from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigurationService],
      useFactory: (config: ConfigurationService) => {
        const redisUrl = config.get('REDIS_URL');
        return new Redis(redisUrl);
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
