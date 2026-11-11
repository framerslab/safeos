/**
 * Zod Validation Middleware
 *
 * Express middleware for validating request bodies with Zod schemas.
 *
 * @module api/middleware/validate
 */

import { ZodSchema, ZodError } from 'zod';
import { Request, Response, NextFunction } from 'express';

/**
 * Validation target - which part of the request to validate
 */
type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Creates validation middleware for a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @param target - Which part of request to validate (default: 'body')
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.post('/streams', validate(CreateStreamSchema), handler);
 * router.get('/streams', validate(ListStreamsSchema, 'query'), handler);
 * ```
 */
export function validate<T extends ZodSchema>(
  schema: T,
  target: ValidationTarget = 'body'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[target];
    const result = schema.safeParse(data);

    if (!result.success) {
      const formatted = formatZodError(result.error);
      return res.status(400).json({
        error: 'Validation failed',
        issues: formatted,
      });
    }

    // Replace with validated/transformed data
    req[target] = result.data;
    next();
  };
}

/**
 * Formats Zod errors into a more readable structure
 */
function formatZodError(error: ZodError): Array<{
  path: string;
  message: string;
  code: string;
}> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'root',
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validate multiple targets at once
 *
 * @example
 * ```typescript
 * router.patch('/streams/:id',
 *   validateMultiple({
 *     params: IdParamsSchema,
 *     body: UpdateStreamSchema,
 *   }),
 *   handler
 * );
 * ```
 */
export function validateMultiple(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Array<{ target: string; issues: any[] }> = [];

    for (const [target, schema] of Object.entries(schemas)) {
      if (!schema) continue;

      const data = req[target as ValidationTarget];
      const result = schema.safeParse(data);

      if (!result.success) {
        errors.push({
          target,
          issues: formatZodError(result.error),
        });
      } else {
        req[target as ValidationTarget] = result.data;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        errors,
      });
    }

    next();
  };
}

export default validate;
