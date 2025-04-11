export class SessionDto {
  id: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  lastAccessed: string;
  isCurrent: boolean;
}
