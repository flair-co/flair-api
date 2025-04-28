import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {AuthMethod} from './auth-method.entity';
import {AuthMethodService} from './auth-method.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuthMethod])],
  providers: [AuthMethodService],
  exports: [AuthMethodService],
})
export class AuthMethodModule {}
