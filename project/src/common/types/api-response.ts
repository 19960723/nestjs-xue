import { ErrorCode } from './error-code.js';

/** 校验失败时返回给客户端的字段名和规则文案，不包含用户输入值。 */
export interface ValidationDetail {
  field: string;
  messages: string[];
}

/** 成功响应。code 固定为 OK，data 可以是对象、列表或 null。 */
export interface ApiSuccessResponse<T> {
  code: typeof ErrorCode.OK;
  message: string;
  data: T;
  requestId: string;
}

/** 失败响应。data 固定为 null；details 只在参数校验失败时出现。 */
export interface ApiErrorResponse {
  code: Exclude<ErrorCode, typeof ErrorCode.OK>;
  message: string;
  data: null;
  requestId: string;
  details?: ValidationDetail[];
}

/** 调用方已经包过信封时返回 true，拦截器据此避免再包一层。 */
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
