export function getRussianPhoneNationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const trimmed = phone.trim();

  if (trimmed.startsWith('+7') || trimmed.startsWith('8')) {
    return digits.slice(1, 11);
  }

  if (digits.length > 10 && digits.startsWith('7')) {
    return digits.slice(1, 11);
  }

  return digits.slice(0, 10);
}

export function formatRussianPhone(phone: string): string {
  const digits = getRussianPhoneNationalDigits(phone);
  if (digits === '') return '';

  let result = '+7';
  if (digits.length > 0) result += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ')';
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;

  return result;
}

/**
 * Нормализует российский номер для обмена по API: +7 и десять цифр без пробелов.
 */
export function normalizeRussianPhone(phone: string): string {
  const digits = getRussianPhoneNationalDigits(phone);
  return digits.length === 10 ? `+7${digits}` : '';
}
