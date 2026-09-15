export const EAN13_PATTERN = /^\d{13}$/;

export function isValidEan13(value: string): boolean {
  if (!EAN13_PATTERN.test(value)) {
    return false;
  }

  const digits = Array.from(value, Number);
  const checksum = digits
    .slice(0, 12)
    .reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3), 0);

  return (10 - (checksum % 10)) % 10 === digits[12];
}
