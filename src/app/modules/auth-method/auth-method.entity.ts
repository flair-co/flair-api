import {Exclude, Expose} from 'class-transformer';
import {Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, Unique} from 'typeorm';

import {User} from '@modules/user/user.entity';

import {AuthMethodType} from './constants/auth-method.enum';

@Entity()
@Unique(['userId', 'type'])
@Index(['type', 'providerId'], {unique: true, where: '"providerId" IS NOT NULL'})
export class AuthMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.authMethods, {onDelete: 'CASCADE'})
  @Exclude()
  user: User;

  @Column()
  @Exclude()
  userId: string;

  @Column({type: 'enum', enum: AuthMethodType})
  @Expose()
  type: AuthMethodType;

  @Column({type: 'varchar', length: 255, nullable: true})
  @Exclude()
  password: string | null;

  @Column({type: 'varchar', length: 255, nullable: true})
  @Expose()
  providerId: string | null;
}
