import {Injectable, UnauthorizedException} from '@nestjs/common';
import {PassportSerializer} from '@nestjs/passport';

import {Account} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

type SerializeDoneCallback = (err: Error | null, id: Account['id']) => void;
type DeserializeDoneCallback = (err: Error | null, user: Account | null) => void;

@Injectable()
export class SessionSerializer extends PassportSerializer {
	constructor(private readonly userService: UserService) {
		super();
	}

	serializeUser(user: Account, done: SerializeDoneCallback) {
		done(null, user.id);
	}

	async deserializeUser(id: Account['id'], done: DeserializeDoneCallback) {
		try {
			const user = await this.userService.findById(id);
			done(null, user);
		} catch (error) {
			done(new UnauthorizedException(), null);
		}
	}
}
