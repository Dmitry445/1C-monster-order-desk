import { declineFullName, type NameGender } from '../../shared/nameDeclension';

export function declineFullNameClient(
  lastName: string,
  firstName: string,
  middleName: string,
  gender?: NameGender
): string {
  return declineFullName(lastName, firstName, middleName, gender, 'dative');
}
