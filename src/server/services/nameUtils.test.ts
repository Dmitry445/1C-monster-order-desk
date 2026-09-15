import assert from 'node:assert/strict';
import test from 'node:test';
import {
  declineFullName,
  declineFullNameGenitive,
  detectGender,
  formatPhone,
  normalizePhone
} from './nameUtils';

test('detectGender detects male and female by patronymic', () => {
  assert.equal(detectGender('Аркадьевич'), 'м');
  assert.equal(detectGender('Львовна'), 'ж');
  assert.equal(detectGender('Ильинична'), 'ж');
  assert.equal(detectGender('Игоревич'), 'м');
  assert.equal(detectGender('Мухамедоглы'), 'м');
  assert.equal(detectGender('Нуржановулы'), 'м');
  assert.equal(detectGender('Айткызы'), 'ж');
});

test('declineFullName declines typical names in dative case', () => {
  assert.equal(declineFullName('Воронцов', 'Пётр', 'Аркадьевич'), 'Воронцову Петру Аркадьевичу');
  assert.equal(declineFullName('Синицына', 'Ольга', 'Львовна'), 'Синицыной Ольге Львовне');
  assert.equal(declineFullName('Коваленко', 'Тарас', 'Игоревич'), 'Коваленко Тарасу Игоревичу');
  assert.equal(declineFullName('Седых', 'Вера', 'Павловна'), 'Седых Вере Павловне');
});

test('declineFullNameGenitive returns genitive form for JSON preview', () => {
  assert.equal(
    declineFullNameGenitive('Воронцов', 'Пётр', 'Аркадьевич'),
    'Воронцова Петра Аркадьевича'
  );
});

test('formatPhone formats to standard +7 format', () => {
  assert.equal(formatPhone('8 (999) 123-45-67'), '+7 (999) 123-45-67');
  assert.equal(formatPhone('+7 999 123 45 67'), '+7 (999) 123-45-67');
  assert.equal(formatPhone('9991234567'), '+7 (999) 123-45-67');
});

test('normalizePhone returns compact API representation', () => {
  assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567');
});

test('declineFullName handles male surnames ending with -ов', () => {
  assert.equal(declineFullName('Иванов', 'Иван', 'Иванович'), 'Иванову Ивану Ивановичу');
  assert.equal(declineFullName('Петров', 'Пётр', 'Петрович'), 'Петрову Петру Петровичу');
});

test('declineFullName handles male surnames ending with -ев', () => {
  assert.equal(declineFullName('Соловьев', 'Сергей', 'Михайлович'), 'Соловьеву Сергею Михайловичу');
  assert.equal(
    declineFullName('Медведев', 'Дмитрий', 'Анатольевич'),
    'Медведеву Дмитрию Анатольевичу'
  );
});

test('declineFullName handles male surnames ending with -ин', () => {
  assert.equal(declineFullName('Ильин', 'Александр', 'Сергеевич'), 'Ильину Александру Сергеевичу');
  assert.equal(
    declineFullName('Пушкин', 'Александр', 'Сергеевич'),
    'Пушкину Александру Сергеевичу'
  );
});

test('declineFullName handles male surnames ending with -ский', () => {
  assert.equal(
    declineFullName('Достоевский', 'Фёдор', 'Михайлович'),
    'Достоевскому Фёдору Михайловичу'
  );
  assert.equal(declineFullName('Чайковский', 'Пётр', 'Ильич'), 'Чайковскому Петру Ильичу');
});

test('declineFullName does not decline surnames ending with -енко', () => {
  assert.equal(declineFullName('Шевченко', 'Тарас', 'Григорьевич'), 'Шевченко Тарасу Григорьевичу');
  assert.equal(declineFullName('Гриценко', 'Иван', 'Петрович'), 'Гриценко Ивану Петровичу');
});

test('declineFullName handles female surnames ending with -ова', () => {
  assert.equal(declineFullName('Иванова', 'Мария', 'Петровна'), 'Ивановой Марии Петровне');
  assert.equal(declineFullName('Петрова', 'Анна', 'Ивановна'), 'Петровой Анне Ивановне');
});

test('declineFullName handles female surnames ending with -ева', () => {
  assert.equal(declineFullName('Соловьева', 'Елена', 'Михайловна'), 'Соловьевой Елене Михайловне');
});

test('declineFullName handles female surnames ending with -ина', () => {
  assert.equal(declineFullName('Ильина', 'Ольга', 'Сергеевна'), 'Ильиной Ольге Сергеевне');
});

test('declineFullName handles female surnames ending with -ская', () => {
  assert.equal(
    declineFullName('Достоевская', 'Мария', 'Дмитриевна'),
    'Достоевской Марии Дмитриевне'
  );
});

test('declineFullName handles male first names ending with -й', () => {
  assert.equal(declineFullName('Петров', 'Дмитрий', 'Иванович'), 'Петрову Дмитрию Ивановичу');
  assert.equal(declineFullName('Иванов', 'Сергей', 'Петрович'), 'Иванову Сергею Петровичу');
  assert.equal(declineFullName('Сидоров', 'Андрей', 'Михайлович'), 'Сидорову Андрею Михайловичу');
});

test('declineFullName handles male first names ending with consonant', () => {
  assert.equal(declineFullName('Смирнов', 'Павел', 'Николаевич'), 'Смирнову Павлу Николаевичу');
  assert.equal(declineFullName('Иванов', 'Игорь', 'Петрович'), 'Иванову Игорю Петровичу');
});

test('declineFullName declines male first names ending with -а and -я', () => {
  assert.equal(declineFullName('Петров', 'Никита', 'Сергеевич'), 'Петрову Никите Сергеевичу');
  assert.equal(declineFullName('Иванов', 'Илья', 'Петрович'), 'Иванову Илье Петровичу');
});

test('declineFullName applies Petrovich exceptions and compound surname rules', () => {
  assert.equal(
    declineFullName('Салтыков-Щедрин', 'Пётр', 'Ильич'),
    'Салтыкову-Щедрину Петру Ильичу'
  );
  assert.equal(declineFullName('Дюма', 'Павел', 'Иванович'), 'Дюма Павлу Ивановичу');
});

test('declineFullName omits empty name parts without extra spaces', () => {
  assert.equal(declineFullName('Иванов', 'Иван', '', 'м'), 'Иванову Ивану');
});

test('declineFullName detects gender by first name without patronymic', () => {
  assert.equal(declineFullName('Иванов', 'Иван', ''), 'Иванову Ивану');
  assert.equal(declineFullName('Иванова', 'Анна', ''), 'Ивановой Анне');
});

test('declineFullName handles assignment names without patronymic', () => {
  const cases = [
    ['Воронцов', 'Пётр', 'Воронцову Петру'],
    ['Синицына', 'Ольга', 'Синицыной Ольге'],
    ['Коваленко', 'Тарас', 'Коваленко Тарасу'],
    ['Седых', 'Вера', 'Седых Вере']
  ] as const;

  for (const [lastName, firstName, expected] of cases) {
    assert.equal(declineFullName(lastName, firstName, ''), expected);
  }
});

test('declineFullName keeps ambiguous names neutral without patronymic', () => {
  assert.equal(declineFullName('Андрейчук', 'Саша', ''), 'Андрейчук Саше');
});

test('declineFullName handles female first names ending with -а', () => {
  assert.equal(declineFullName('Иванова', 'Анна', 'Петровна'), 'Ивановой Анне Петровне');
  assert.equal(declineFullName('Петрова', 'Ольга', 'Ивановна'), 'Петровой Ольге Ивановне');
});

test('declineFullName handles female first names ending with -я', () => {
  assert.equal(declineFullName('Соколова', 'Юлия', 'Михайловна'), 'Соколовой Юлии Михайловне');
  assert.equal(declineFullName('Иванова', 'Наталья', 'Сергеевна'), 'Ивановой Наталье Сергеевне');
});

test('detectGender handles edge cases', () => {
  assert.equal(detectGender(''), '?');
  assert.equal(detectGender('InvalidPatronymic'), '?');
});

test('formatPhone handles various input formats', () => {
  assert.equal(formatPhone('+7(999)123-45-67'), '+7 (999) 123-45-67');
  assert.equal(formatPhone('8-999-123-45-67'), '+7 (999) 123-45-67');
  assert.equal(formatPhone('+7 999 1234567'), '+7 (999) 123-45-67');
});

test('formatPhone handles already normalized phone', () => {
  assert.equal(formatPhone('+79991234567'), '+7 (999) 123-45-67');
});

test('integration: gender detection and full name declension', () => {
  const gender1 = detectGender('Аркадьевич');
  assert.equal(gender1, 'м');
  const declined1 = declineFullName('Воронцов', 'Пётр', 'Аркадьевич');
  assert.equal(declined1, 'Воронцову Петру Аркадьевичу');

  const gender2 = detectGender('Львовна');
  assert.equal(gender2, 'ж');
  const declined2 = declineFullName('Синицына', 'Ольга', 'Львовна');
  assert.equal(declined2, 'Синицыной Ольге Львовне');
});

test('integration: phone normalization pipeline', () => {
  const phone1 = formatPhone('8 (999) 123-45-67');
  assert.equal(phone1, '+7 (999) 123-45-67');

  const phone2 = formatPhone('+7 999 123 45 67');
  assert.equal(phone2, '+7 (999) 123-45-67');

  assert.equal(phone1, phone2);
});
