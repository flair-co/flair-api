import {Exclude} from 'class-transformer';
import {Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, Unique} from 'typeorm';

import {User} from '@modules/user/user.entity';

import {AuthMethodType} from './constants/auth-method.enum';

@Entity()
// Ensure a user can only have one method of a specific type (e.g., only one Google link)
@Unique(['userId', 'type'])
// Ensure provider IDs are unique across all users for a given provider type
@Index(['type', 'providerId'], {unique: true, where: '"providerId" IS NOT NULL'})
export class AuthMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.authenticationMethods, {onDelete: 'CASCADE'})
  @Exclude()
  user: User;

  @Column()
  userId: string;

  @Column({type: 'enum', enum: AuthMethodType})
  type: AuthMethodType;

  @Column({type: 'varchar', length: 255, nullable: true})
  @Exclude()
  password: string | null;

  @Column({type: 'varchar', length: 255, nullable: true})
  @Exclude()
  providerId: string | null;
}
