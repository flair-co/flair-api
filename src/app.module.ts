import {ConfigurationModule} from '@config/config.module';
import {ConfigurationService} from '@config/config.service';
import {ThrottlerStorageRedisService} from '@nest-lab/throttler-storage-redis';
import {MailerModule} from '@nestjs-modules/mailer';
import {HandlebarsAdapter} from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import {
  ClassSerializerInterceptor,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ThrottlerGuard, ThrottlerModule} from '@nestjs/throttler';
import {TypeOrmModule} from '@nestjs/typeorm';
import RedisStore from 'connect-redis';
import session from 'express-session';
import Redis from 'ioredis';
import ms from 'ms';
import passport from 'passport';
import {join} from 'path';
import {RedisModule} from 'src/app/redis/redis.module';

import {AuthModule} from '@core/auth/auth.module';
import {SessionMiddleware} from '@core/auth/services/session.middleware';
import {FileParserModule} from '@core/file-parser/file-parser.module';
import {TransactionCategorizerModule} from '@core/transaction-categorizer/transaction-categorizer.module';
import {BankStatementModule} from '@modules/bank-statement/bank-statement.module';
import {TransactionModule} from '@modules/transaction/transaction.module';
import {UserModule} from '@modules/user/user.module';

import {REDIS} from './app/redis/redis.constants';

@Module({
  imports: [
    ConfigurationModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigurationService],
      useFactory: (config: ConfigurationService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get('DB_PORT'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        synchronize: config.get('DB_SYNCHRONIZE'),
        autoLoadEntities: true,
      }),
    }),
    MailerModule.forRootAsync({
      inject: [ConfigurationService],
      useFactory: (config: ConfigurationService) => ({
        transport: {
          host: config.get('EMAIL_HOST'),
          port: config.get('EMAIL_PORT'),
        },
        defaults: {from: '"Flair" <no-reply@flair.com>'},
        preview: config.get('NODE_ENV') === 'development',
        template: {
          dir: join(__dirname, 'app', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {strict: true},
        },
      }),
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigurationService, REDIS],
      useFactory: (config: ConfigurationService, redisClient: Redis) => {
        return {
          throttlers: [
            {
              ttl: ms(config.get('THROTTLE_TTL')),
              limit: config.get('THROTTLE_LIMIT'),
            },
          ],
          storage: new ThrottlerStorageRedisService(redisClient),
        };
      },
    }),
    AuthModule,
    FileParserModule,
    TransactionModule,
    TransactionCategorizerModule,
    UserModule,
    BankStatementModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  constructor(
    @Inject(REDIS) private readonly redisClient: Redis,
    private readonly config: ConfigurationService,
  ) {}

  async configure(consumer: MiddlewareConsumer) {
    const isProduction = this.config.get('NODE_ENV') === 'production';

    consumer
      .apply(
        session({
          store: new RedisStore({client: this.redisClient}),
          name: 'session',
          secret: this.config.get('SESSION_SECRET'),
          resave: false,
          saveUninitialized: false,
          cookie: {
            secure: isProduction,
            httpOnly: true,
            sameSite: 'strict',
            maxAge: ms(this.config.get('SESSION_EXPIRATION')),
            ...(isProduction ? {domain: this.config.get('WEB_BASE_URL')} : {}),
          },
        }),
        passport.initialize(),
        passport.session(),
        SessionMiddleware,
      )
      .forRoutes('*');
  }
}
