export class PublicUserDto {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
}

export class AuthResponseDto {
  user: PublicUserDto;
  accessToken: string;
}
