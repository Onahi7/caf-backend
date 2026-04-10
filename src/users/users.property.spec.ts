import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fc from 'fast-check';
import { validate } from 'class-validator';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * **Feature: pharmacy-pos-system, Property 64: Password complexity enforcement**
 *
 * For any password creation or update, passwords not meeting complexity requirements
 * (minimum length, character types) should be rejected.
 *
 * **Validates: Requirements 15.5**
 */
describe('User Password Property Tests', () => {
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getModelToken(User.name),
          useValue: Model,
        },
      ],
    }).compile();
  });

  describe('Property 64: Password complexity enforcement', () => {
    // Generator for invalid passwords (too short)
    const shortPasswordArb = fc.string({ minLength: 0, maxLength: 7 });

    // Generator for passwords missing uppercase (only lowercase, digits, special)
    const noUppercaseArb = fc
      .tuple(
        fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'), {
          minLength: 2,
          maxLength: 5,
        }),
        fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5'), {
          minLength: 2,
          maxLength: 5,
        }),
        fc.array(fc.constantFrom('@', '$', '!', '%'), {
          minLength: 1,
          maxLength: 3,
        }),
      )
      .map(([lower, digit, special]) =>
        [...lower, ...digit, ...special].join(''),
      );

    // Generator for passwords missing lowercase (only uppercase, digits, special)
    const noLowercaseArb = fc
      .tuple(
        fc.array(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F'), {
          minLength: 2,
          maxLength: 5,
        }),
        fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5'), {
          minLength: 2,
          maxLength: 5,
        }),
        fc.array(fc.constantFrom('@', '$', '!', '%'), {
          minLength: 1,
          maxLength: 3,
        }),
      )
      .map(([upper, digit, special]) =>
        [...upper, ...digit, ...special].join(''),
      );

    // Generator for passwords missing digit (only uppercase, lowercase, special)
    const noDigitArb = fc
      .tuple(
        fc.array(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F'), {
          minLength: 2,
          maxLength: 5,
        }),
        fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'), {
          minLength: 2,
          maxLength: 5,
        }),
        fc.array(fc.constantFrom('@', '$', '!', '%'), {
          minLength: 1,
          maxLength: 3,
        }),
      )
      .map(([upper, lower, special]) =>
        [...upper, ...lower, ...special].join(''),
      );

    // Generator for passwords missing special character (only uppercase, lowercase, digits)
    const noSpecialCharArb = fc
      .tuple(
        fc.array(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F'), {
          minLength: 2,
          maxLength: 5,
        }),
        fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'), {
          minLength: 2,
          maxLength: 5,
        }),
        fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5'), {
          minLength: 2,
          maxLength: 5,
        }),
      )
      .map(([upper, lower, digit]) => [...upper, ...lower, ...digit].join(''));

    // Generator for valid passwords
    const validPasswordArb = fc
      .tuple(
        fc.array(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.array(
          fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
          { minLength: 1, maxLength: 5 },
        ),
        fc.array(fc.constantFrom('@', '$', '!', '%', '*', '?', '&'), {
          minLength: 1,
          maxLength: 5,
        }),
      )
      .map(([upper, lower, digit, special]) => {
        // Shuffle the characters to create a valid password
        const chars = [...upper, ...lower, ...digit, ...special];
        for (let i = chars.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        return chars.join('');
      });

    it('should reject passwords that are too short (< 8 characters)', async () => {
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

    it('should reject passwords missing uppercase letters', async () => {
      await fc.assert(
        fc.asyncProperty(noUppercaseArb, async (password) => {
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

    it('should reject passwords missing lowercase letters', async () => {
      await fc.assert(
        fc.asyncProperty(noLowercaseArb, async (password) => {
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

    it('should reject passwords missing digits', async () => {
      await fc.assert(
        fc.asyncProperty(noDigitArb, async (password) => {
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

    it('should reject passwords missing special characters', async () => {
      await fc.assert(
        fc.asyncProperty(noSpecialCharArb, async (password) => {
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

    it('should accept passwords meeting all complexity requirements', async () => {
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

    it('should enforce password complexity on UpdateUserDto as well', async () => {
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
