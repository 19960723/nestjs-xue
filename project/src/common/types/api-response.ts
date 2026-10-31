import { ErrorCode } from './error-code.js';

export interface ValidationDetail {
  field: string;
  messages: string[];
}

export interface ApiSuccessResponse<T> {
  code: typeof ErrorCode.OK;
  message: string;
  data: T;
  requestId: string;
}

export interface ApiErrorResponse {
  code: Exclude<ErrorCode, typeof ErrorCode.OK>;
  message: string;
  data: null;
  requestId: string;
  details?: ValidationDetail[];
}

export function isApiSuccessEnvelope(
  value: unknown,
): value is ApiSuccessResponse<unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    body.code === ErrorCode.OK &&
    typeof body.message === 'string' &&
    'data' in body &&
    typeof body.requestId === 'string'
  );
}
