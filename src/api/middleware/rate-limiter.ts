/**
 * Rate Limiting Middleware
 *
 * Express middleware for API rate limiting with Redis-backed storage.
 *
 * @module api/middleware/rate-limiter
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

// =============================================================================
// Types
// =============================================================================

interface RateLimitConfig {
  windowMs: number;       // Time window in milliseconds
  maxRequests: number;    // Max requests per window
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  statusCode?: number;
  headers?: boolean;
  skip?: (req: Request) => boolean;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// =============================================================================
// In-Memory Store (fallback when Redis unavailable)
// =============================================================================

class InMemoryStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(windowMs: number) {
    // Clean up expired entries periodically
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.resetTime <= now) {
          this.store.delete(key);
        }
      }
    }, Math.min(windowMs, 60000)); // Cleanup every minute or window, whichever is shorter
  }

  async increment(key: string, windowMs: number): Promise<RateLimitEntry> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetTime <= now) {
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(key, newEntry);
      return newEntry;
    }

    entry.count++;
    return entry;
  }

  /**
   * Take back one request counted in the window that ends at `resetTime`.
   * Does nothing once that window has ended, so a request never lowers the
   * next window's count.
   */
  decrement(key: string, resetTime: number): void {
    const entry = this.store.get(key);
    if (entry && entry.resetTime === resetTime && entry.count > 0) {
      entry.count--;
    }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// =============================================================================
// Rate Limiter Factory
// =============================================================================

/**
 * Create a rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig): RequestHandler {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req: Request) => {
      // Default: use IP address
      return req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    },
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    headers = true,
    skip,
  } = config;

  const store = new InMemoryStore(windowMs);

  const middleware: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Skip if configured
    if (skip && skip(req)) {
      next();
      return;
    }

    const key = keyGenerator(req);

    try {
      const entry = await store.increment(key, windowMs);
      const remaining = Math.max(0, maxRequests - entry.count);
      const resetTime = Math.ceil(entry.resetTime / 1000);

      // Set rate limit headers
      if (headers) {
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetTime);
      }

      // Check if rate limited
      if (entry.count > maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000);

        if (headers) {
          res.setHeader('Retry-After', retryAfter);
        }

        res.status(statusCode).json({
          error: 'Rate limit exceeded',
          message,
          retryAfter,
          limit: maxRequests,
          windowMs,
        });
        return;
      }

      // Every request is counted when it arrives, so requests in flight at
      // the same time cannot pass the limit together. A request of a kind the
      // limiter skips is taken back off the count once its answer is sent.
      if (skipSuccessfulRequests || skipFailedRequests) {
        const windowEnd = entry.resetTime;
        res.on('finish', () => {
          const isSuccess = res.statusCode < 400;

          if ((skipSuccessfulRequests && isSuccess) || (skipFailedRequests && !isSuccess)) {
            store.decrement(key, windowEnd);
          }
        });
      }

      next();
    } catch (error) {
      console.error('[RateLimiter] Error:', error);
      // Fail open - allow request if rate limiting fails
      next();
    }
  };

  return middleware;
}

// =============================================================================
// Pre-configured Rate Limiters
// =============================================================================

/**
 * Standard API rate limiter
 * 100 requests per minute
 */
export const standardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: 'Too many requests from this IP, please try again after a minute.',
});

/**
 * Auth rate limiter (stricter for login/signup)
 * 5 requests per minute
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: 'Too many authentication attempts, please try again after a minute.',
  skipSuccessfulRequests: true, // Only count failed attempts
});

/**
 * Strict rate limiter for sensitive operations
 * 10 requests per 15 minutes
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: 'Rate limit exceeded for this operation. Please try again later.',
});

/**
 * Analysis rate limiter
 * 30 frame analyses per minute per stream
 */
export const analysisLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: (req) => {
    const streamId = req.body?.streamId || req.params?.streamId || 'unknown';
    const ip = req.ip || 'unknown';
    return `analysis:${ip}:${streamId}`;
  },
  message: 'Analysis rate limit exceeded. Reduce frame submission rate.',
});

/**
 * Webhook rate limiter
 * 100 webhook events per minute per endpoint
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: (req) => {
    const webhookId = req.params?.webhookId || 'unknown';
    return `webhook:${webhookId}`;
  },
  message: 'Webhook rate limit exceeded.',
});

/**
 * Export rate limiter
 * 5 exports per hour
 */
export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  message: 'Export rate limit exceeded. Please try again in an hour.',
});

// =============================================================================
// Helper: Apply rate limiting to specific routes
// =============================================================================

export interface RateLimitRule {
  path: string | RegExp;
  method?: string | string[];
  limiter: RequestHandler;
}

/**
 * Create middleware that applies different rate limits to different routes
 */
export function conditionalRateLimiter(rules: RateLimitRule[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const rule of rules) {
      // Check path match
      const pathMatch = typeof rule.path === 'string'
        ? req.path === rule.path || req.path.startsWith(rule.path)
        : rule.path.test(req.path);

      if (!pathMatch) continue;

      // Check method match if specified
      if (rule.method) {
        const methods = Array.isArray(rule.method) ? rule.method : [rule.method];
        if (!methods.includes(req.method.toUpperCase())) continue;
      }

      // Apply the matching limiter
      return rule.limiter(req, res, next);
    }

    // No matching rule, continue without rate limiting
    next();
  };
}

export default rateLimit;





























