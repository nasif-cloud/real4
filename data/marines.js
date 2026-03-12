// simple marine rank dataset used for the Infinite Sail encounter
// ranks run from lowly choreboy up to captain. additional stats can be
// added later when more granularity is needed.

const marines = [
  { rank: 'Choreboy', hp: 1, atk: 1, speed: 1, attribute: 'STR' },
  { rank: 'Seaman Recruit', hp: 2, atk: 1, speed: 1, attribute: 'DEX' },
  { rank: 'Seaman Apprentice', hp: 5, atk: 2, speed: 2, attribute: 'QCK' },
  { rank: 'Seaman First Class', hp: 7, atk: 2, speed: 2, attribute: 'PSY' },
  { rank: 'Petty Officer', hp: 10, atk: 3, speed: 3, attribute: 'INT' },
  { rank: 'Chief Petty Officer', hp: 15, atk: 3, speed: 3, attribute: 'STR' },
  { rank: 'Master Chief Petty Officer', hp: 20, atk: 3, speed: 3, attribute: 'DEX' },
  { rank: 'Warrant Officer', hp: 25, atk: 4, speed: 4, attribute: 'QCK' },
  { rank: 'Ensign', hp: 30, atk: 4, speed: 4, attribute: 'PSY' },
  { rank: 'Lieutenant Junior Grade', hp: 35, atk: 4, speed: 5, attribute: 'INT' },
  { rank: 'Lieutenant', hp: 40, atk: 4, speed: 5, attribute: 'STR' },
  { rank: 'Lieutenant Commander', hp: 45, atk: 4, speed: 6, attribute: 'DEX' },
  { rank: 'Captain', hp: 50, atk: 5, speed: 6, attribute: 'QCK' }
];

module.exports = marines;
