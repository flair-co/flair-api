import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository, SelectQueryBuilder} from 'typeorm';

import {User} from '@modules/user/user.entity';

import {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE} from './api/transaction-query-pagination.dto';
import {TransactionQueryDto} from './api/transaction-query.dto';
import {TransactionUpdateDto} from './api/transaction-update.dto';
import {Transaction} from './transaction.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async findById(userId: User['id'], id: Transaction['id']) {
    const transaction = await this.transactionRepository.findOne({
      where: {id, bankAccount: {user: {id: userId}}},
      relations: ['bankAccount'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction not found.`);
    }
    return transaction;
  }

  async findAllByUserId(
    userId: User['id'],
    {filter = {}, sort, pagination = this.getDefaultPaginationOptions()}: TransactionQueryDto,
  ) {
    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .innerJoin('transaction.bankAccount', 'bankAccount')
      .innerJoin('bankAccount.user', 'user')
      .where('user.id = :userId', {userId})
      .skip(pagination.pageIndex * pagination.pageSize)
      .take(pagination.pageSize);

    if (sort) {
      query.orderBy(`transaction.${sort.by}`, sort.order);
    }

    this.addFiltersToQuery(query, filter);

    const [transactions, total] = await query.getManyAndCount();
    return {transactions, total};
  }

  async saveAll(transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[]) {
    if (transactions.length === 0) {
      return Promise.resolve([]);
    }
    return this.transactionRepository.save(transactions);
  }

  async deleteByIds(ids: Transaction['id'][]) {
    return this.transactionRepository.delete(ids);
  }

  async update(userId: User['id'], id: Transaction['id'], dto: TransactionUpdateDto) {
    const transaction = await this.findById(userId, id);

    const updates: Partial<Transaction> = {};
    if (dto.category) {
      updates.category = dto.category;
    }

    await this.transactionRepository.update({id: transaction.id}, updates);
    return this.transactionRepository.findBy({id: transaction.id});
  }

  private addFiltersToQuery(
    query: SelectQueryBuilder<Transaction>,
    filters: TransactionQueryDto['filter'] = {},
  ) {
    const {startedAt, banks = [], categories = []} = filters;
    const filtersMapWithColumnName = {
      bankAccount: banks,
      category: categories,
    };

    if (startedAt) {
      const {from, to: until = from} = startedAt;
      query.andWhere('transaction.startedAt BETWEEN :fromDate AND :untilDate', {
        fromDate: new Date(from),
        untilDate: new Date(until),
      });
    }

    for (const [columnName, filterValue] of Object.entries(filtersMapWithColumnName)) {
      if (filterValue && filterValue.length > 0) {
        query.andWhere(`transaction.${columnName} IN (:...${columnName})`, {
          [columnName]: filterValue,
        });
      }
    }
  }

  private getDefaultPaginationOptions() {
    return {pageIndex: DEFAULT_PAGE_INDEX, pageSize: DEFAULT_PAGE_SIZE};
  }
}
