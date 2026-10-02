/**
 * Pure, framework-free field registry for the Random Data Generator, built
 * on `@faker-js/faker`. Deliberately hand-maintained rather than a runtime
 * reflection pass over the `faker` object — many faker methods need
 * required arguments a generic reflection pass couldn't safely supply, and
 * a curated list groups the surface into something a picker UI can use.
 * English locale only for v1 (`faker` defaults to `en`); other locales are
 * a straightforward follow-up if needed.
 */
import { faker } from '@faker-js/faker';

export interface RandomDataField {
  readonly key: string;
  readonly label: string;
  readonly group: string;
  readonly generate: (refDate?: Date) => string;
}

export const RANDOM_DATA_FIELDS: readonly RandomDataField[] = [
  // Person & contact
  { key: 'fullName', label: 'Full Name', group: 'Person & Contact', generate: () => faker.person.fullName() },
  { key: 'firstName', label: 'First Name', group: 'Person & Contact', generate: () => faker.person.firstName() },
  { key: 'lastName', label: 'Last Name', group: 'Person & Contact', generate: () => faker.person.lastName() },
  { key: 'gender', label: 'Gender', group: 'Person & Contact', generate: () => faker.person.gender() },
  { key: 'jobTitle', label: 'Job Title', group: 'Person & Contact', generate: () => faker.person.jobTitle() },
  { key: 'bio', label: 'Bio', group: 'Person & Contact', generate: () => faker.person.bio() },
  { key: 'email', label: 'Email', group: 'Person & Contact', generate: () => faker.internet.email() },
  { key: 'username', label: 'Username', group: 'Person & Contact', generate: () => faker.internet.username() },
  { key: 'phoneNumber', label: 'Phone Number', group: 'Person & Contact', generate: () => faker.phone.number() },

  // Internet & tech
  { key: 'url', label: 'URL', group: 'Internet & Tech', generate: () => faker.internet.url() },
  { key: 'domainName', label: 'Domain Name', group: 'Internet & Tech', generate: () => faker.internet.domainName() },
  { key: 'ipv4', label: 'IPv4 Address', group: 'Internet & Tech', generate: () => faker.internet.ipv4() },
  { key: 'ipv6', label: 'IPv6 Address', group: 'Internet & Tech', generate: () => faker.internet.ipv6() },
  { key: 'macAddress', label: 'MAC Address', group: 'Internet & Tech', generate: () => faker.internet.mac() },
  { key: 'userAgent', label: 'User Agent', group: 'Internet & Tech', generate: () => faker.internet.userAgent() },
  { key: 'password', label: 'Password', group: 'Internet & Tech', generate: () => faker.internet.password() },
  {
    key: 'httpStatusCode',
    label: 'HTTP Status Code',
    group: 'Internet & Tech',
    generate: () => faker.internet.httpStatusCode().toString(),
  },
  { key: 'port', label: 'Port', group: 'Internet & Tech', generate: () => faker.internet.port().toString() },
  { key: 'jwt', label: 'JWT', group: 'Internet & Tech', generate: (refDate) => faker.internet.jwt({ refDate }) },

  // Location
  { key: 'streetAddress', label: 'Street Address', group: 'Location', generate: () => faker.location.streetAddress() },
  { key: 'city', label: 'City', group: 'Location', generate: () => faker.location.city() },
  { key: 'state', label: 'State', group: 'Location', generate: () => faker.location.state() },
  { key: 'country', label: 'Country', group: 'Location', generate: () => faker.location.country() },
  { key: 'countryCode', label: 'Country Code', group: 'Location', generate: () => faker.location.countryCode() },
  { key: 'zipCode', label: 'ZIP / Postal Code', group: 'Location', generate: () => faker.location.zipCode() },
  { key: 'timeZone', label: 'Time Zone', group: 'Location', generate: () => faker.location.timeZone() },
  { key: 'latitude', label: 'Latitude', group: 'Location', generate: () => faker.location.latitude().toString() },
  { key: 'longitude', label: 'Longitude', group: 'Location', generate: () => faker.location.longitude().toString() },

  // Company & commerce
  { key: 'companyName', label: 'Company Name', group: 'Company & Commerce', generate: () => faker.company.name() },
  { key: 'catchPhrase', label: 'Catch Phrase', group: 'Company & Commerce', generate: () => faker.company.catchPhrase() },
  { key: 'productName', label: 'Product Name', group: 'Company & Commerce', generate: () => faker.commerce.productName() },
  {
    key: 'productDescription',
    label: 'Product Description',
    group: 'Company & Commerce',
    generate: () => faker.commerce.productDescription(),
  },
  { key: 'price', label: 'Price', group: 'Company & Commerce', generate: () => faker.commerce.price() },
  { key: 'department', label: 'Department', group: 'Company & Commerce', generate: () => faker.commerce.department() },
  { key: 'isbn', label: 'ISBN', group: 'Company & Commerce', generate: () => faker.commerce.isbn() },

  // Finance
  { key: 'accountNumber', label: 'Account Number', group: 'Finance', generate: () => faker.finance.accountNumber() },
  { key: 'iban', label: 'IBAN', group: 'Finance', generate: () => faker.finance.iban() },
  { key: 'bic', label: 'BIC / SWIFT', group: 'Finance', generate: () => faker.finance.bic() },
  { key: 'creditCardNumber', label: 'Credit Card Number', group: 'Finance', generate: () => faker.finance.creditCardNumber() },
  { key: 'currencyCode', label: 'Currency Code', group: 'Finance', generate: () => faker.finance.currencyCode() },
  { key: 'amount', label: 'Amount', group: 'Finance', generate: () => faker.finance.amount() },
  { key: 'bitcoinAddress', label: 'Bitcoin Address', group: 'Finance', generate: () => faker.finance.bitcoinAddress() },

  // Date & time
  { key: 'pastDate', label: 'Past Date', group: 'Date & Time', generate: (refDate) => faker.date.past({ refDate }).toISOString() },
  { key: 'recentDate', label: 'Recent Date', group: 'Date & Time', generate: (refDate) => faker.date.recent({ refDate }).toISOString() },
  { key: 'futureDate', label: 'Future Date', group: 'Date & Time', generate: (refDate) => faker.date.future({ refDate }).toISOString() },
  { key: 'weekday', label: 'Weekday', group: 'Date & Time', generate: () => faker.date.weekday() },
  { key: 'month', label: 'Month', group: 'Date & Time', generate: () => faker.date.month() },

  // Text & lorem
  { key: 'word', label: 'Word', group: 'Text & Lorem', generate: () => faker.lorem.word() },
  { key: 'sentence', label: 'Sentence', group: 'Text & Lorem', generate: () => faker.lorem.sentence() },
  { key: 'paragraph', label: 'Paragraph', group: 'Text & Lorem', generate: () => faker.lorem.paragraph() },
  { key: 'slug', label: 'Slug', group: 'Text & Lorem', generate: () => faker.lorem.slug() },

  // Identifiers & misc data types
  { key: 'uuid', label: 'UUID', group: 'Identifiers', generate: () => faker.string.uuid() },
  { key: 'nanoid', label: 'Nano ID', group: 'Identifiers', generate: () => faker.string.nanoid() },
  { key: 'boolean', label: 'Boolean', group: 'Identifiers', generate: () => faker.datatype.boolean().toString() },
  {
    key: 'integer',
    label: 'Integer (0-10000)',
    group: 'Identifiers',
    generate: () => faker.number.int({ max: 10_000 }).toString(),
  },
  {
    key: 'float',
    label: 'Float (0-1000)',
    group: 'Identifiers',
    generate: () => faker.number.float({ min: 0, max: 1000, fractionDigits: 2 }).toString(),
  },
  { key: 'hexColor', label: 'Hex Color', group: 'Identifiers', generate: () => faker.color.rgb() },

  // Vehicle
  { key: 'vehicleManufacturer', label: 'Manufacturer', group: 'Vehicle', generate: () => faker.vehicle.manufacturer() },
  { key: 'vehicleModel', label: 'Model', group: 'Vehicle', generate: () => faker.vehicle.model() },
  { key: 'vehicleType', label: 'Type', group: 'Vehicle', generate: () => faker.vehicle.type() },
  { key: 'vin', label: 'VIN', group: 'Vehicle', generate: () => faker.vehicle.vin() },

  // Animal
  { key: 'animalType', label: 'Animal Type', group: 'Animal', generate: () => faker.animal.type() },
  { key: 'petName', label: 'Pet Name', group: 'Animal', generate: () => faker.animal.petName() },
  { key: 'dogBreed', label: 'Dog Breed', group: 'Animal', generate: () => faker.animal.dog() },

  // Food & science
  { key: 'dish', label: 'Dish', group: 'Food & Science', generate: () => faker.food.dish() },
  { key: 'fruit', label: 'Fruit', group: 'Food & Science', generate: () => faker.food.fruit() },
  {
    key: 'chemicalElement',
    label: 'Chemical Element',
    group: 'Food & Science',
    generate: () => {
      const element = faker.science.chemicalElement();
      return `${element.name} (${element.symbol})`;
    },
  },

  // Misc
  { key: 'gitCommitMessage', label: 'Git Commit Message', group: 'Misc', generate: () => faker.git.commitMessage() },
  { key: 'systemFileName', label: 'File Name', group: 'Misc', generate: () => faker.system.fileName() },
  { key: 'mimeType', label: 'MIME Type', group: 'Misc', generate: () => faker.system.mimeType() },
  { key: 'hackerPhrase', label: 'Hacker Phrase', group: 'Misc', generate: () => faker.hacker.phrase() },
  { key: 'musicGenre', label: 'Music Genre', group: 'Misc', generate: () => faker.music.genre() },
  { key: 'bookTitle', label: 'Book Title', group: 'Misc', generate: () => faker.book.title() },
];

export const RANDOM_DATA_GROUPS: readonly string[] = Array.from(new Set(RANDOM_DATA_FIELDS.map((f) => f.group)));

export function findField(key: string): RandomDataField | undefined {
  return RANDOM_DATA_FIELDS.find((field) => field.key === key);
}

export interface GenerateOptions {
  readonly fieldKeys: readonly string[];
  readonly rowCount: number;
  readonly seed?: number;
}

export type GenerateResult =
  | { readonly ok: true; readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly ok: false; readonly error: string };

const MAX_ROWS = 1000;

export function generateRows(options: GenerateOptions): GenerateResult {
  if (options.fieldKeys.length === 0) {
    return { ok: false, error: 'Select at least one field.' };
  }
  if (options.rowCount < 1 || options.rowCount > MAX_ROWS) {
    return { ok: false, error: `Row count must be between 1 and ${MAX_ROWS}.` };
  }

  const fields = options.fieldKeys.map(findField);
  const missing = options.fieldKeys.filter((_, i) => fields[i] === undefined);
  if (missing.length > 0) {
    return { ok: false, error: `Unknown field(s): ${missing.join(', ')}` };
  }

  if (options.seed !== undefined) faker.seed(options.seed);

  // Faker's date and JWT generators also read the wall clock, which would
  // make identical seeds produce different output over time.
  const refDate = options.seed === undefined ? undefined : new Date('2020-01-01T00:00:00.000Z');

  const resolvedFields = fields as RandomDataField[];
  const rows: string[][] = [];
  for (let i = 0; i < options.rowCount; i++) {
    rows.push(resolvedFields.map((field) => field.generate(refDate)));
  }

  return { ok: true, columns: resolvedFields.map((field) => field.label), rows };
}
