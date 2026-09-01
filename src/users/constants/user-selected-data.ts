// src/users/constants/user-select.ts
import { Prisma } from 'src/generated/prisma/client';

export const PUBLIC_SELECTED_USER_DATA = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  age: true,
  gender: true,
  phoneNumber: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  preferredLanguage: true,
  role: true,
  emailVerified: true,
  authProvider: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
