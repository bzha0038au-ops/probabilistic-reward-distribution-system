export interface StoryStep {
  title: string;
  body: string;
}

export interface CharacterNote {
  name: string;
  role: string;
  line: string;
}

export const INTRO_COPY = {
  topLine: "You have $20 left.",
  kicker: "The bartender hands you a card:",
  quote: '"You are not here to drink."',
};

export const CONTINUE_LINES = [
  '"I must keep going... for my family."',
  '"One more scratch. Then I stop. Really."',
  '"If I turn back now, what do I tell the kids?"',
];

export const CASH_OUT_LINE = '"Enough, the kids can have a good meal..."';

export const BUST_COPY = {
  title: "YOU BUSTED",
  body: "You could have walked away.",
};

export const JACKPOT_COPY = {
  title: "MAYBE YOU CAN TURN IT AROUND",
  body: "The room goes quiet. Even the cat looks impressed.",
};

export const WALK_AWAY_COPY = {
  title: "YOU WALKED",
  body: "The money is not enough to fix your life. It is enough to go home tonight.",
};

export const REX_BUBBLES = [
  '"This one is mine!!"',
  '"I am hot tonight. You can feel it."',
  '"One more card and I bury everybody here."',
];

export const REX_ENDING = {
  title: "REX BUSTED",
  body: "You were never playing cards. You were waiting for somebody else to break first.",
};

export const STORY_STEPS: StoryStep[] = [
  {
    title: "Fired at noon",
    body: "The company calls you slow. The city calls you late. The phone balance says $20.",
  },
  {
    title: "Two hungry piglets",
    body: "They do not ask for much. Just dinner. Just one parent who still has an answer.",
  },
  {
    title: "Last Chance",
    body: "The bar does not promise luck. It promises another decision after the one you should have stopped at.",
  },
];

export const CHARACTER_NOTES: CharacterNote[] = [
  {
    name: "Yoyo",
    role: "The father",
    line: '"This time really is different."',
  },
  {
    name: "Rex",
    role: "The loud dog",
    line: '"This hand is free money."',
  },
  {
    name: "Mara",
    role: "The turtle",
    line: '"You lose yourself before you lose the cash."',
  },
  {
    name: "The cat",
    role: "The bartender",
    line: '"Nobody learns where the exit is until it is too late."',
  },
];

export const WALLET_ITEMS = [
  {
    label: "Cash on hand",
    value: "$20",
    detail: "Everything left after getting fired.",
  },
  {
    label: "Dinner for the kids",
    value: "$18",
    detail: "Soup, buns, and something sweet if you get lucky.",
  },
  {
    label: "Rent due",
    value: "$65",
    detail: "Tomorrow morning. No grace this time.",
  },
];

export const PROFILE_FACTS = [
  "Species: pig",
  "Build: a little too round for bad luck",
  "Occupation: unemployed",
  "Vice: believing the next click will save everything",
];
