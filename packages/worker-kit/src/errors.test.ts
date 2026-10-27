import { describe, expect, it } from 'vitest';
import {
   AppError,
   ConflictError,
   NotFoundError,
   UnauthorizedError,
   ValidationError,
   isAppError,
} from './errors';

describe('AppError', () => {
   it('carries status, code, message and details', () => {
      const error = new AppError(418, 'teapot', 'Short and stout', { pot: true });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(418);
      expect(error.code).toBe('teapot');
      expect(error.message).toBe('Short and stout');
      expect(error.details).toEqual({ pot: true });
   });
});

describe('subclasses', () => {
   it('NotFoundError defaults to 404 not_found', () => {
      const error = new NotFoundError();

      expect(error.status).toBe(404);
      expect(error.code).toBe('not_found');
      expect(error.message).toBe('Not found');
   });

   it('NotFoundError accepts a message', () => {
      expect(new NotFoundError('No campaign').message).toBe('No campaign');
   });

   it('ValidationError is a 400 validation_error with details', () => {
      const error = new ValidationError('Bad input', { field: 'email' });

      expect(error.status).toBe(400);
      expect(error.code).toBe('validation_error');
      expect(error.message).toBe('Bad input');
      expect(error.details).toEqual({ field: 'email' });
   });

   it('ConflictError is a 409 conflict', () => {
      const error = new ConflictError('Already exists');

      expect(error.status).toBe(409);
      expect(error.code).toBe('conflict');
   });

   it('UnauthorizedError defaults to 401 unauthorized', () => {
      const error = new UnauthorizedError();

      expect(error.status).toBe(401);
      expect(error.code).toBe('unauthorized');
      expect(error.message).toBe('Unauthorized');
   });
});

describe('isAppError', () => {
   it('recognises AppError and subclasses', () => {
      expect(isAppError(new AppError(500, 'internal_error', 'Oops'))).toBe(true);
      expect(isAppError(new NotFoundError())).toBe(true);
   });

   it('rejects other values', () => {
      expect(isAppError(new Error('plain'))).toBe(false);
      expect(isAppError('not found')).toBe(false);
      expect(isAppError(null)).toBe(false);
      expect(isAppError({ status: 404, code: 'not_found' })).toBe(false);
   });
});
