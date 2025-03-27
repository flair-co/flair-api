import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

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

  async validateEmailIsUnique(email: User['email']) {
    const emailExists = await this.userRepository.existsBy({email});

    if (emailExists) {
      throw new ConflictException(`This email is already in use.`);
    }
  }

  async save(name: User['name'], email: User['email'], password: User['password']) {
    return this.userRepository.save({name, email, password});
  }

  async update(id: User['id'], updates: Partial<User>) {
    await this.userRepository.update({id}, updates);
    return this.findById(id);
  }
}
