import { logger } from '../services/LoggerService';

export function logAsyncError(
  context: string,
  operation: string,
  error: unknown
): void {
  logger.error(context, operation, error);
}

export function logAsyncRejection(
  context: string,
  operation: string
): (error: unknown) => void {
  return (error: unknown) => logAsyncError(context, operation, error);
}
