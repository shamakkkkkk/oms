import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let jwtService: JwtService;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed.jwt.token') },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('register', () => {
    it('hashes the password and creates the user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'user-1', ...data }),
      );

      const result = await service.register({
        email: 'new@oms.local',
        password: 'StrongPass123!',
        name: 'New User',
      } as any);

      expect(prisma.user.create).toHaveBeenCalled();
      const createdData = prisma.user.create.mock.calls[0][0].data;
      expect(createdData.passwordHash).not.toEqual('StrongPass123!');
      expect(await bcrypt.compare('StrongPass123!', createdData.passwordHash)).toBe(true);
      expect(createdData.role).toEqual(Role.STAFF);
      expect(result.accessToken).toEqual('signed.jwt.token');
      expect(result.user.email).toEqual('new@oms.local');
    });

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({ email: 'taken@oms.local', password: 'x', name: 'X' } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns an access token for valid credentials', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@oms.local',
        passwordHash,
        name: 'Admin',
        role: Role.ADMIN,
      });

      const result = await service.login({
        email: 'admin@oms.local',
        password: 'correct-password',
      } as any);

      expect(result.accessToken).toEqual('signed.jwt.token');
      expect(result.user.role).toEqual(Role.ADMIN);
    });

    it('throws UnauthorizedException for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@oms.local', password: 'x' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for an incorrect password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@oms.local',
        passwordHash,
        name: 'Admin',
        role: Role.ADMIN,
      });

      await expect(
        service.login({ email: 'admin@oms.local', password: 'wrong-password' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
