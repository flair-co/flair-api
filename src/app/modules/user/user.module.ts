import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {UserController} from './api/user.controller';
import {Account} from './user.entity';
import {UserService} from './user.service';

@Module({
	imports: [TypeOrmModule.forFeature([Account])],
	providers: [UserService],
	controllers: [UserController],
	exports: [UserService],
})
export class UserModule {}
