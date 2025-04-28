import {Exclude, Expose, Type} from 'class-transformer';
import {Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn} from 'typeorm';

import {AuthMethod} from '@modules/auth-method/auth-method.entity';
import {BankAccount} from '@modules/bank-account/bank-account.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  @Expose()
  id: string;

  @Column({type: 'varchar', length: 255})
  @Expose()
  name: string;

  @Index()
  @Column({type: 'varchar', length: 255, unique: true})
  @Expose()
  email: string;

  @Column({type: 'boolean', default: false})
  @Expose()
  isEmailVerified: boolean;

  @CreateDateColumn({type: 'timestamp'})
  @Expose()
  createdAt: Date;

  @OneToMany(() => BankAccount, (bankAccount) => bankAccount.user)
  @Expose()
  @Type(() => BankAccount)
  bankAccounts: BankAccount[];

  @OneToMany(() => AuthMethod, (authMethod) => authMethod.user, {cascade: true})
  @Exclude()
  authenticationMethods: AuthMethod[];
}
