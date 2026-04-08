/**
 * A simple retry utility with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    onRetry?: (error: any, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 500,
    maxDelay = 5000,
    factor = 2,
    onRetry,
  } = options;

  let attempt = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries) {
        throw error;
      }

      if (onRetry) {
        onRetry(error, attempt);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * factor, maxDelay);
    }
  }
}
