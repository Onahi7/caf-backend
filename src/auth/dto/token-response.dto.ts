export class TokenResponseDto {
  user!: {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    branchId?: string;
  };
  accessToken!: string;
  refreshToken!: string;
  expiresIn!: number;
  refreshExpiresIn!: number;
}
