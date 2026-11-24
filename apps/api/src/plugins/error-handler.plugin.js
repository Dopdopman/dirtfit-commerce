import fp from 'fastify-plugin';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, ERROR_CODES, buildProblemDetails } from '@dirtfit/shared';

/**
 * Extract structured field-level validation issues from Fastify/Zod validation errors.
 * @param {unknown} error
 * @returns {Array<object>}
 */
function extractValidationErrors(error) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      code: issue.code,
      message: issue.message,
    }));
  }

  if (Array.isArray(error?.validation)) {
    return error.validation.map((v) => ({
      field:
        v.instancePath?.replace(/^\//, '').replace(/\//g, '.') ||
        v.params?.issue?.path?.join('.') ||
        'body',
      code: v.keyword || 'VALIDATION_ERROR',
      message: v.message || 'Invalid value',
    }));
  }

  return [];
}

/**
 * Map runtime errors into RFC 7807 Problem Details metadata.
 * @param {unknown} error
 * @param {boolean} isProduction
 * @returns {{ status: number, code: string, title: string, detail: string, errors?: Array<object> }}
 */
function mapErrorToProblem(error, isProduction) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      code: error.code,
      title: error.title,
      detail: error.detail,
      errors: error.errors,
    };
  }

  if (error?.statusCode === 429 || error?.code === ERROR_CODES.RATE_LIMITED) {
    return {
      status: 429,
      code: ERROR_CODES.RATE_LIMITED,
      title: 'Too Many Requests',
      detail: error.message || 'Rate limit exceeded. Please try again later.',
    };
  }

  if (
    error instanceof ZodError ||
    error?.code === 'FST_ERR_VALIDATION' ||
    Array.isArray(error?.validation)
  ) {
    return {
      status: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      title: 'Request validation failed',
      detail: 'One or more request fields failed validation.',
      errors: extractValidationErrors(error),
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return {
        status: 409,
        code: ERROR_CODES.CONFLICT,
        title: 'Resource conflict',
        detail: 'A record with the same unique identifier already exists.',
      };
    }
    if (error.code === 'P2025') {
      return {
        status: 404,
        code: ERROR_CODES.NOT_FOUND,
        title: 'Resource not found',
        detail: 'The requested record does not exist.',
      };
    }
    if (error.code === 'P2003') {
      return {
        status: 409,
        code: ERROR_CODES.CONFLICT,
        title: 'Foreign key constraint conflict',
        detail: 'Operation references a missing or restricted related record.',
      };
    }
  }

  if (
    typeof error?.code === 'string' &&
    (error.code.startsWith('FST_JWT_') || error.statusCode === 401)
  ) {
    const expired = error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED';
    return {
      status: 401,
      code: expired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.UNAUTHORIZED,
      title: 'Authentication required',
      detail: expired ? 'Access token has expired.' : 'Invalid or missing authentication token.',
    };
  }

  const statusCode =
    typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500;

  if (statusCode < 500) {
    return {
      status: statusCode,
      code: ERROR_CODES.VALIDATION_ERROR,
      title: error?.name || 'Bad Request',
      detail: error?.message || 'The request could not be processed.',
    };
  }

  return {
    status: 500,
    code: ERROR_CODES.INTERNAL_ERROR,
    title: 'Internal Server Error',
    detail: isProduction
      ? 'An unexpected error occurred. Please contact support with the requestId.'
      : error?.message || 'Unexpected internal server error.',
  };
}

export default fp(
  async function errorHandlerPlugin(app, opts) {
    const isProduction = opts.env?.NODE_ENV === 'production';

    app.setNotFoundHandler((request, reply) => {
      const problem = buildProblemDetails({
        status: 404,
        code: ERROR_CODES.NOT_FOUND,
        title: 'Route not found',
        detail: `No route matches ${request.method} ${request.url}.`,
        instance: request.url,
        requestId: String(request.id),
      });

      return reply.code(404).type('application/problem+json; charset=utf-8').send(problem);
    });

    app.setErrorHandler((error, request, reply) => {
      const mapped = mapErrorToProblem(error, isProduction);

      if (mapped.status >= 500) {
        request.log.error({ err: error, requestId: request.id }, 'Unhandled server error');
      } else {
        request.log.warn(
          { status: mapped.status, code: mapped.code, requestId: request.id },
          mapped.detail
        );
      }

      const problem = buildProblemDetails({
        status: mapped.status,
        code: mapped.code,
        title: mapped.title,
        detail: mapped.detail,
        instance: request.url,
        requestId: String(request.id),
        errors: mapped.errors,
      });

      return reply
        .code(mapped.status)
        .type('application/problem+json; charset=utf-8')
        .send(problem);
    });
  },
  { name: 'error-handler-plugin' }
);
