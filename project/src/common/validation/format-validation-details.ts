import type { ValidationError } from 'class-validator';
import type { ValidationDetail } from '../types/api-response.js';

/** 只输出字段名和规则文案，不回显用户输入值。 */
export function formatValidationDetails(
  errors: ValidationError[],
  parent?: string,
): ValidationDetail[] {
  const details: ValidationDetail[] = [];

  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const messages = error.constraints ? Object.values(error.constraints) : [];

    if (messages.length > 0) {
      details.push({ field, messages });
    }

    if (error.children && error.children.length > 0) {
      details.push(...formatValidationDetails(error.children, field));
    }
  }

  return details;
}
