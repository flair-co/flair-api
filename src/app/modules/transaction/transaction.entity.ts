import {Exclude, Expose, Type} from 'class-transformer';
import {IsDate, IsEnum, IsNotEmpty, IsNumber, IsString, Length, Max, Min} from 'class-validator';
import {Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn} from 'typeorm';

import {BankAccount} from '@modules/bank-account/bank-account.entity';
import {BankStatement} from '@modules/bank-statement/bank-statement.entity';
import {Category} from '@modules/transaction/transaction-categorizer/constants/category.enum';

@Entity('transactions')
export class Transaction {
	@PrimaryGeneratedColumn('uuid')
	@Expose()
	id: string;

	@Column({type: 'timestamp'})
	@IsNotEmpty()
	@IsDate()
	@Expose()
	startedAt: Date;

	@Column({type: 'timestamp'})
	@IsNotEmpty()
	@IsDate()
	@Expose()
	completedAt: Date;

	@Column({type: 'varchar', length: 500})
	@IsNotEmpty()
	@IsString()
	@Length(1, 500)
	@Expose()
	description: string;

	@Column({type: 'decimal', precision: 12, scale: 2})
	@IsNotEmpty()
	@IsNumber({maxDecimalPlaces: 2})
	@Min(-999999999999.99)
	@Max(999999999999.99)
	@Expose()
	amount: number;

	@Column({type: 'varchar', length: 3})
	@Expose()
	currency: string;

	@CreateDateColumn({type: 'timestamp'})
	@Expose()
	createdAt: Date;

	@UpdateDateColumn({type: 'timestamp'})
	@Expose()
	updatedAt: Date;

	@Column({type: 'enum', enum: Category})
	@IsEnum(Category)
	@Expose()
	category: Category;

	@ManyToOne(() => BankAccount, (bankAccount) => bankAccount.transactions)
	@Type(() => BankAccount)
	bankAccount: BankAccount;

	@ManyToOne(() => BankStatement, (bankStatement) => bankStatement.transactions, {nullable: true})
	@Exclude()
	@Type(() => BankStatement)
	bankStatement?: BankStatement | null;
}
