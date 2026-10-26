import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fc from 'fast-check';
import { validate } from 'class-validator';
import { User, UserRole } from './schemas/user.schema.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

/**
 * **Feature: pharmacy-pos-system, Property 64: Password length enforcement**
 *
 * For any password creation or update, passwords not meeting minimum length (6 characters)
 * should be rejected, while user-friendly passwords (letters, numbers, symbols) are accepted.
 */
describe('User Password Property Tests', () => {
  beforeEach(async () => {
    await Test.createTestingModule({
      providers: [
        {
          provide: getModelToken(User.name),
          useValue: Model,
        },
      ],
    }).compile();
  });

  describe('Property 64: Password length enforcement', () => {
    // Generator for invalid passwords (too short, < 6 chars)
    const shortPasswordArb = fc.string({ minLength: 0, maxLength: 5 });

    // Generator for valid passwords (at least 6 characters of various types)
    const validPasswordArb = fc.string({ minLength: 6, maxLength: 30 });

    it('should reject passwords that are too short (< 6 characters)', async () => {
      await fc.assert(
        fc.asyncProperty(shortPasswordArb, async (password) => {
          const dto = new CreateUserDto();
          dto.username = 'testuser';
          dto.password = password;
          dto.email = 'test@example.com';
          dto.firstName = 'Test';
          dto.lastName = 'User';
          dto.role = 'cashier' as UserRole;

          const errors = await validate(dto);
          const passwordErrors = errors.filter(
            (e) => e.property === 'password',
          );

          // Should have validation errors for password
          expect(passwordErrors.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    it('should accept valid passwords meeting minimum length (>= 6 characters)', async () => {
      await fc.assert(
        fc.asyncProperty(validPasswordArb, async (password) => {
          const dto = new CreateUserDto();
          dto.username = 'testuser';
          dto.password = password;
          dto.email = 'test@example.com';
          dto.firstName = 'Test';
          dto.lastName = 'User';
          dto.role = 'cashier' as UserRole;

          const errors = await validate(dto);
          const passwordErrors = errors.filter(
            (e) => e.property === 'password',
          );

          // Should have no validation errors for password
          expect(passwordErrors.length).toBe(0);
        }),
        { numRuns: 100 },
      );
    });

    it('should accept CreateUserDto when email is omitted during onboarding', async () => {
      const dto = new CreateUserDto();
      dto.username = 'marketer01';
      dto.password = 'pass123';
      dto.firstName = 'Amadu';
      dto.lastName = 'Kamara';
      dto.role = 'marketer' as UserRole;

      const errors = await validate(dto);
      const emailErrors = errors.filter((e) => e.property === 'email');
      expect(emailErrors.length).toBe(0);
      expect(errors.length).toBe(0);
    });

    it('should enforce password length on UpdateUserDto as well', async () => {
      await fc.assert(
        fc.asyncProperty(shortPasswordArb, async (password) => {
          const dto = new UpdateUserDto();
          dto.password = password;

          const errors = await validate(dto);
          const passwordErrors = errors.filter(
            (e) => e.property === 'password',
          );

          // Should have validation errors for password
          expect(passwordErrors.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });
  });
});
