import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_ACCESS_TOKEN_SECRET,
  signOptions: {
    expiresIn: process.env
      .JWT_ACCESS_TOKEN_EXPIRY as unknown as `${number}${'s' | 'm' | 'h' | 'd'}`,
  },
}));
