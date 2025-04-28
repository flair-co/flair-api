import {IsString, Length} from 'class-validator';

export class SessionRevokeParamsDto {
  @IsString()
  @Length(32, 32)
  sessionId: string;
}
