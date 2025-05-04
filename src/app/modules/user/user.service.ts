import {ConflictException, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {Repository} from 'typeorm';

import {Account} from './account.entity';

@Injectable()
export class UserService {
	constructor(
		@InjectRepository(Account)
		private readonly userRepository: Repository<Account>,
	) {}

	async findById(id: Account['id']) {
		const user = await this.userRepository.findOneBy({id});

		if (!user) {
			throw new NotFoundException(`User not found.`);
		}
		return user;
	}

	async findByEmail(email: Account['email']) {
		return await this.userRepository.findOneBy({email});
	}

	async validateEmailIsUnique(email: Account['email']) {
		const emailExists = await this.userRepository.existsBy({email});

		if (emailExists) {
			throw new ConflictException(`This email is already in use.`);
		}
	}

	async verifyPassword(hash: Account['password'], password: Account['password']) {
		const isPasswordValid = await argon2.verify(hash, password);
		if (!isPasswordValid) {
			throw new UnauthorizedException();
		}
	}

	async save(fullName: Account['fullName'], email: Account['email'], password: Account['password']) {
		return this.userRepository.save({fullName, email, password});
	}

	async update(id: Account['id'], updates: Partial<Account>) {
		await this.userRepository.update({id}, updates);
		return this.findById(id);
	}
}
