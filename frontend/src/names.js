// Hard-coded name lists for the "Generate name" button on the cart page.
// No network calls or dependencies, so the demo works offline. 16 female + 16 male first
// names and 32 last names, drawn from a range of backgrounds. Any first name can pair with
// any last name, which is how people's names combine in practice.

const FEMALE_FIRST_NAMES = [
  'Olivia', 'Maria', 'Priya', 'Mei', 'Yuki',
  'Amara', 'Fatima', 'Agnieszka', 'Sofia', 'Min-ji',
  'Chiara', 'Aylin', 'Linh', 'Siobhan', 'Ingrid',
  'Sakura',
];

const MALE_FIRST_NAMES = [
  'James', 'Mateo', 'Arjun', 'Wei', 'Haruto',
  'Chidi', 'Omar', 'Jakub', 'Rafael', 'Joon-ho',
  'Luca', 'Emre', 'Minh', 'Seamus', 'Lars',
  'Kenji',
];

const LAST_NAMES = [
  'Smith', 'Garcia', 'Patel', 'Chen', 'Tanaka',
  'Okafor', 'Haddad', 'Kowalski', 'Silva', 'Kim',
  'Rossi', 'Yilmaz', 'Nguyen', "O'Brien", 'Lindqvist',
  'Johnson', 'Martinez', 'Sharma', 'Wang', 'Sato',
  'Adeyemi', 'Khalil', 'Nowak', 'Santos', 'Park',
  'Ferrari', 'Demir', 'Tran', 'Murphy', 'Andersen',
  'Suzuki', 'Yamamoto',
];

export const FIRST_NAMES = [...FEMALE_FIRST_NAMES, ...MALE_FIRST_NAMES];
export { LAST_NAMES };

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const randomName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
