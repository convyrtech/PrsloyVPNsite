export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL_LENGTH = 254;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value) && value.length <= MAX_EMAIL_LENGTH;
}
