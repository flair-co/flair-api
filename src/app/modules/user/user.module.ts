import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {Account} from './account.entity';
import {UserController} from './api/user.controller';
import {UserService} from './user.service';

@Module({
	imports: [TypeOrmModule.forFeature([Account])],
	providers: [UserService],
	controllers: [UserController],
	exports: [UserService],
})
export class UserModule {}
