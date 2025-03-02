import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {User} from '@modules/user/user.entity';

import {TransactionQueryDto} from './api/transaction.query.dto';
import {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE} from './api/transaction.query.pagination.dto';
import {SortField, SortOrder} from './api/transaction.query.sort.dto';
import {Transaction} from './transaction.entity';

type TransactionSaveOptions = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async findById(id: Transaction['id']) {
    const transaction = await this.transactionRepository.findOneBy({id});

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found.`);
    }
    return transaction;
  }

  async findAllByUserId(userId: User['id'], queryParams: TransactionQueryDto) {
    const pagination = queryParams.pagination || {
      pageIndex: DEFAULT_PAGE_INDEX,
      pageSize: DEFAULT_PAGE_SIZE,
    };
    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .innerJoin('transaction.account', 'account')
      .innerJoin('account.user', 'user')
      .where('user.id = :userId', {userId})
      .skip(pagination.pageIndex * pagination.pageSize)
      .take(pagination.pageSize);

    const sort = queryParams.sort || {by: SortField.STARTED_AT, order: SortOrder.DESC};
    query.orderBy(`transaction.${sort.by}`, sort.order);

    const filter = queryParams.filter || {};
    if (filter.categories && filter.categories.length > 0) {
      query.andWhere('transaction.category IN (:...categories)', {categories: filter.categories});
    }
    if (filter.startedAt) {
      const from = new Date(filter.startedAt.from);
      const to = new Date(filter.startedAt.to ?? from);
      query.andWhere('transaction.startedAt BETWEEN :from AND :to', {from, to});
    }

    const [transactions, total] = await query.getManyAndCount();
    return {transactions, total};
  }

  async saveAll(transactions: TransactionSaveOptions[]): Promise<Transaction[]> {
    if (transactions.length === 0) {
      return Promise.resolve([]);
    }
    return this.transactionRepository.save(transactions);
  }

  async deleteByIds(ids: Transaction['id'][]) {
    return this.transactionRepository.delete(ids);
  }
}
