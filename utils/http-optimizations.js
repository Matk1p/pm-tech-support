// HTTP optimizations for better connection handling
import https from 'https';
import http from 'http';

// Create HTTP agents with connection pooling
export const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
  freeSocketTimeout: 15000,
});

export const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
  freeSocketTimeout: 15000,
});

// Timeout wrapper for any async function
export function withTimeout(promise, timeoutMs = 25000, errorMessage = 'Operation timeout') {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

// Retry wrapper with exponential backoff
export async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Circuit breaker pattern
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.nextAttempt = Date.now();
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      } else {
        this.state = 'HALF_OPEN';
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

// Global circuit breakers for different services
export const larkCircuitBreaker = new CircuitBreaker(5, 30000);
export const openaiCircuitBreaker = new CircuitBreaker(3, 60000);

// Enhanced error handler
export function handleNetworkError(error, operation = 'Network operation') {
  const errorInfo = {
    operation,
    message: error.message,
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    hostname: error.hostname,
    timestamp: new Date().toISOString(),
  };

  console.error(`❌ ${operation} failed:`, errorInfo);

  // Categorize error types
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
    return {
      type: 'TIMEOUT',
      message: 'Request timed out. Please try again.',
      retryable: true,
    };
  } else if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
    return {
      type: 'CONNECTION',
      message: 'Connection error. Please try again in a moment.',
      retryable: true,
    };
  } else if (error.code === 'ENOTFOUND') {
    return {
      type: 'DNS',
      message: 'Service temporarily unavailable.',
      retryable: false,
    };
  } else {
    return {
      type: 'UNKNOWN',
      message: 'An unexpected error occurred.',
      retryable: true,
    };
  }
}

// Performance monitoring
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }

  startTimer(operation) {
    const startTime = Date.now();
    return {
      end: () => {
        const duration = Date.now() - startTime;
        this.recordMetric(operation, duration);
        return duration;
      }
    };
  }

  recordMetric(operation, duration) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const metrics = this.metrics.get(operation);
    metrics.push(duration);
    
    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  getAverageTime(operation) {
    const metrics = this.metrics.get(operation);
    if (!metrics || metrics.length === 0) return 0;
    
    return metrics.reduce((sum, time) => sum + time, 0) / metrics.length;
  }

  getMetrics() {
    const result = {};
    for (const [operation, times] of this.metrics.entries()) {
      if (times.length > 0) {
        result[operation] = {
          count: times.length,
          average: Math.round(this.getAverageTime(operation)),
          min: Math.min(...times),
          max: Math.max(...times),
        };
      }
    }
    return result;
  }
}

export const performanceMonitor = new PerformanceMonitor(); 