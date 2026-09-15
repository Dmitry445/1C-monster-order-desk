import {
  declineFullName as declineFullNameWithPetrovich,
  detectNameGender
} from '../../shared/nameDeclension';
import { formatRussianPhone, normalizeRussianPhone } from '../../shared/phoneFormat';

export type Gender = 'м' | 'ж' | '?';

export function detectGender(middleName: string): Gender {
  return detectNameGender(middleName);
}

export function declineFullName(
  lastName: string,
  firstName: string,
  middleName: string,
  gender?: Gender
): string {
  return declineFullNameWithPetrovich(lastName, firstName, middleName, gender, 'dative');
}

export function declineFullNameGenitive(
  lastName: string,
  firstName: string,
  middleName: string,
  gender?: Gender
): string {
  return declineFullNameWithPetrovich(lastName, firstName, middleName, gender, 'genitive');
}

export function formatPhone(phone: string): string {
  return formatRussianPhone(phone);
}

export function normalizePhone(phone: string): string {
  return normalizeRussianPhone(phone);
}
