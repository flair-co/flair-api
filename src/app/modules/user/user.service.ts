import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {Repository} from 'typeorm';

import {SignUpDto} from '@core/auth/api/signup.dto';

import {User} from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findById(id: User['id']): Promise<User> {
    const user = await this.userRepository.findOneBy({id});

    if (!user) {
      throw new NotFoundException(`User not found.`);
    }
    return user;
  }

  async findByEmail(email: User['email']): Promise<User> {
    const user = await this.userRepository.findOneBy({email});

    if (!user) {
      throw new NotFoundException(`User not found.`);
    }
    return user;
  }

  async save({name, email, password}: SignUpDto): Promise<User> {
    const emailExists = await this.userRepository.existsBy({email});

    if (emailExists) {
      throw new ConflictException(`A user with this email already exists.`);
    }
    const hash = await argon2.hash(password);

    return this.userRepository.save({name, email, password: hash});
  }

  // TODO: Update ts when implementing PATCH for users
  async verifyEmail(id: User['id']) {
    return this.userRepository.update({id}, {isEmailVerified: true});
  }
}
