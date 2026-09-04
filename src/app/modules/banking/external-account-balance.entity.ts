import {Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from 'typeorm';

import {BankSyncRun} from './bank-sync-run.entity';
import {ExternalAccount} from './external-account.entity';

@Entity('external_account_balances')
@Index('idx_external_account_balances_account_observed_at', ['externalAccountId', 'observedAt'])
@Index('idx_external_account_balances_sync_run_account', ['bankSyncRunId', 'externalAccountId'])
export class ExternalAccountBalance {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({type: 'uuid'})
	externalAccountId: string;

	@ManyToOne(() => ExternalAccount, {onDelete: 'CASCADE', nullable: false})
	@JoinColumn({name: 'externalAccountId'})
	externalAccount: ExternalAccount;

	@Column({type: 'uuid'})
	bankSyncRunId: string;

	@ManyToOne(() => BankSyncRun, {onDelete: 'CASCADE', nullable: false})
	@JoinColumn({name: 'bankSyncRunId'})
	bankSyncRun: BankSyncRun;

	@Column({type: 'varchar', length: 255, nullable: true})
	name: string | null;

	@Column({type: 'varchar', length: 32})
	balanceType: string;

	@Column({type: 'numeric', precision: 20, scale: 8})
	amount: string;

	@Column({type: 'varchar', length: 3})
	currency: string;

	@Column({type: 'timestamptz', nullable: true})
	lastChangeDateTime: Date | null;

	@Column({type: 'date', nullable: true})
	referenceDate: string | null;

	@Column({type: 'varchar', length: 255, nullable: true})
	lastCommittedTransaction: string | null;

	@CreateDateColumn({type: 'timestamptz'})
	observedAt: Date;
}
