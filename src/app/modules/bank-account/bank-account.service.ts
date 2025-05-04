import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Account} from '@modules/user/account.entity';
import {UserService} from '@modules/user/user.service';

import {BankAccountCreateDto} from './api/bank-account-create.dto';
import {BankAccount} from './bank-account.entity';

@Injectable()
export class BankAccountService {
	constructor(
		@InjectRepository(BankAccount)
		private readonly bankAccountRepository: Repository<BankAccount>,
		private readonly userService: UserService,
	) {}

	async save(dto: BankAccountCreateDto, userId: Account['id']): Promise<BankAccount> {
		const user = await this.userService.findById(userId);
		return this.bankAccountRepository.save({...dto, user});
	}

	async findAllByUserId(userId: Account['id']) {
		return this.bankAccountRepository.findBy({account: {id: userId}});
	}

	async findById(id: BankAccount['id'], userId: Account['id']) {
		const bankAccount = await this.bankAccountRepository.findOneBy({id, account: {id: userId}});

		if (!bankAccount) {
			throw new NotFoundException(`Bank account not found.`);
		}
		return bankAccount;
	}
}
