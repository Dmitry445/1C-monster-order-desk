import rules from './vendor/petrovich/rules.json';

export type NameGender = 'м' | 'ж' | '?';
type PetrovichGender = 'male' | 'female' | 'androgynous';
type NameType = 'firstname' | 'middlename' | 'lastname';
type CaseName =
  'nominative' | 'genitive' | 'dative' | 'accusative' | 'instrumental' | 'prepositional';
type RuleTag = 'first_word';

type Rule = {
  gender: PetrovichGender;
  test: string[];
  mods: string[];
  tags?: RuleTag[];
};

type RuleSet = {
  exceptions?: Rule[];
  suffixes: Rule[];
};

type PetrovichRules = Record<NameType, RuleSet>;

const petrovichRules = rules as PetrovichRules;

export function detectNameGender(middleName: string): NameGender {
  const normalized = middleName.trim().toLocaleLowerCase('ru-RU');

  if (normalized.endsWith('ич')) {
    return 'м';
  }
  if (normalized.endsWith('оглы') || normalized.endsWith('улы')) {
    return 'м';
  }
  if (normalized.endsWith('на')) {
    return 'ж';
  }
  if (normalized.endsWith('кызы')) {
    return 'ж';
  }

  return '?';
}

function detectGenderFromRules(firstName: string, lastName: string): NameGender {
  const ambiguousFirstNames = new Set(['саша', 'женя', 'валя', 'лера', 'шура']);
  const normalizedFirstName = firstName.trim().toLocaleLowerCase('ru-RU');
  if (ambiguousFirstNames.has(normalizedFirstName)) {
    return '?';
  }

  const maleName = declineNamePart(firstName, 'male', 'firstname', 'dative');
  const femaleName = declineNamePart(firstName, 'female', 'firstname', 'dative');
  if (maleName !== firstName.trim() && femaleName === firstName.trim()) {
    return 'м';
  }
  if (femaleName !== firstName.trim() && maleName === firstName.trim()) {
    return 'ж';
  }

  for (const [name, nameType] of [[lastName, 'lastname' as const]] as const) {
    const normalized = name.trim().toLocaleLowerCase('ru-RU');
    if (normalized === '') continue;

    const matches = (['м', 'ж'] as const).map(gender => ({
      gender,
      specificity: getGenderRuleSpecificity(normalized, nameType, toPetrovichGender(gender))
    }));
    const best = matches.reduce((current, candidate) =>
      candidate.specificity > current.specificity ? candidate : current
    );
    const other = matches.find(candidate => candidate.gender !== best.gender);
    if (best.specificity > 0 && best.specificity > (other?.specificity ?? 0)) {
      return best.gender;
    }
  }

  return '?';
}

function getGenderRuleSpecificity(
  name: string,
  nameType: NameType,
  gender: PetrovichGender
): number {
  const ruleSet = petrovichRules[nameType];
  const rules = [...(ruleSet.exceptions ?? []), ...ruleSet.suffixes];
  return Math.max(
    0,
    ...rules
      .filter(rule => rule.gender === gender)
      .flatMap(rule => rule.test)
      .filter(sample => name.endsWith(sample))
      .map(sample => sample.length)
  );
}

export function declineFullName(
  lastName: string,
  firstName: string,
  middleName: string,
  gender?: NameGender,
  caseName: CaseName = 'dative'
): string {
  const detectedGender =
    gender === undefined || gender === '?'
      ? detectNameGender(middleName) !== '?'
        ? detectNameGender(middleName)
        : detectGenderFromRules(firstName, lastName)
      : gender;
  const petrovichGender = toPetrovichGender(detectedGender);
  const parts = [
    declineNamePart(lastName, petrovichGender, 'lastname', caseName),
    declineNamePart(firstName, petrovichGender, 'firstname', caseName),
    declineNamePart(middleName, petrovichGender, 'middlename', caseName)
  ];

  return parts.filter(part => part !== '').join(' ');
}

function toPetrovichGender(gender: NameGender): PetrovichGender {
  if (gender === 'м') {
    return 'male';
  }
  if (gender === 'ж') {
    return 'female';
  }
  return 'androgynous';
}

function declineNamePart(
  name: string,
  gender: PetrovichGender,
  nameType: NameType,
  caseName: CaseName
): string {
  const normalized = name.trim();

  if (normalized === '') {
    return '';
  }

  return normalized
    .split('-')
    .map((part, index, parts) => {
      const rule = findRule(
        gender,
        part,
        petrovichRules[nameType],
        index === 0 && parts.length > 1
      );
      return rule === undefined ? part : applyRule(part, rule, caseName);
    })
    .join('-');
}

function findRule(
  gender: PetrovichGender,
  name: string,
  ruleSet: RuleSet,
  firstWord: boolean
): Rule | undefined {
  const tags: RuleTag[] = firstWord ? ['first_word'] : [];
  const lowerName = name.toLocaleLowerCase('ru-RU');
  const exception = findRuleInList(gender, lowerName, ruleSet.exceptions ?? [], true, tags);

  return exception ?? findRuleInList(gender, lowerName, ruleSet.suffixes, false, tags);
}

function findRuleInList(
  gender: PetrovichGender,
  name: string,
  rulesToCheck: Rule[],
  wholeWord: boolean,
  tags: RuleTag[]
): Rule | undefined {
  return rulesToCheck.find(rule => {
    if (rule.gender !== 'androgynous' && rule.gender !== gender) {
      return false;
    }
    if (rule.tags !== undefined && !rule.tags.some(tag => tags.includes(tag))) {
      return false;
    }

    return rule.test.some(sample => (wholeWord ? name === sample : name.endsWith(sample)));
  });
}

function applyRule(name: string, rule: Rule, caseName: CaseName): string {
  if (caseName === 'nominative') {
    return name;
  }

  const caseIndex = {
    genitive: 0,
    dative: 1,
    accusative: 2,
    instrumental: 3,
    prepositional: 4
  }[caseName];

  if (caseIndex === undefined) {
    return name;
  }

  const modification = rule.mods[caseIndex];
  if (modification === undefined) {
    return name;
  }

  let result = name;
  for (const character of modification) {
    if (character === '.') {
      continue;
    }
    if (character === '-') {
      result = result.slice(0, -1);
      continue;
    }
    result += character;
  }

  return result;
}
