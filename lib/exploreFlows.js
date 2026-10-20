// Explore's swipe deck: six tiles, each a fixed run of cards.
// A card is one question ('q': right = yes, left = no, up = either's fine),
// or one card per option in a list ('pick': right picks it, left drops it,
// up keeps it as a maybe). The engine below walks the cards and turns the
// answers into Search filters. Photos: Unsplash, free licence, until custom art.

const u = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=720&h=900&q=70`;

/* ---------- Cards shared by several tiles ---------- */

const budget = (lo, hi, t = {}) => [
  {
    id: `${t.prefix || ''}budget`, kind: 'q', eyebrow: 'BUDGET',
    title: t.loTitle || 'Keep it pocket-friendly?', line: `Around ₹${lo.toLocaleString('en-IN')} for two.`,
    photo: u(t.loPhoto || 'photo-1760263051323-fcd7da7040b0'),
    yes: { chip: `₹${lo.toLocaleString('en-IN')} for 2`, set: { budget: lo }, label: `around ₹${lo} for two` },
    no: { chip: null, label: 'spend more' }, // shows the next budget card
    either: { chip: 'Any budget', label: 'any budget' },
    when: t.when,
  },
  {
    id: `${t.prefix || ''}budget2`, kind: 'q', eyebrow: 'BUDGET', sub: true,
    title: t.hiTitle || 'Treat yourselves?', line: `Around ₹${hi.toLocaleString('en-IN')} for two.`,
    photo: u(t.hiPhoto || 'photo-1688437307687-fe226bddfab1'),
    yes: { chip: `₹${hi.toLocaleString('en-IN')} for 2`, set: { budget: hi }, label: `around ₹${hi} for two` },
    no: { chip: 'Any budget', label: 'no budget limit' },
    either: { chip: 'Any budget', label: 'any budget' },
    when: (a) => a[`${t.prefix || ''}budget`] === 'no' && (!t.when || t.when(a)),
  },
];

const vibe = (photo, when) => ({
  id: 'vibe', kind: 'q', eyebrow: 'VIBE',
  title: 'Up for a buzzing place?', line: 'Music, crowd, good energy.',
  photo: u(photo),
  yes: { chip: 'Lively', set: { vibe: 'lively' }, label: 'lively' },
  no: { chip: 'Calm', set: { vibe: 'calm' }, label: 'calm and quiet' },
  either: { chip: 'Any vibe', label: 'any vibe' },
  when,
});

const distance = (line = 'Within 3 km, quick to get to.', photo = 'photo-1708685889314-013b9afd452f', title = 'Somewhere close by?') => ({
  id: 'distance', kind: 'q', eyebrow: 'DISTANCE', title, line, photo: u(photo),
  yes: { chip: '3 km', set: { nearKm: 3 }, label: 'within 3 km' },
  no: { chip: '8 km', set: { nearKm: 8 }, label: 'up to 8 km' },
  either: { chip: 'Any distance', set: { nearKm: 8 }, label: 'any distance' },
});

/* ---------- The six tiles ---------- */

export const TILES = [
  {
    id: 'food', label: 'Food', photo: u('photo-1728910156510-77488f19b152'),
    cats: ['restaurant', 'fastfood', 'cafe'], end: 'Food',
    steps: [
      {
        id: 'veg', kind: 'q', eyebrow: 'VEG',
        title: 'Keeping it veg today?', line: "We'll only show veg-friendly spots.",
        photo: u('photo-1742281257687-092746ad6021'),
        yes: { chip: 'Veg', set: { veg: true }, label: 'veg only' },
        no: { chip: 'Non-veg OK', label: 'anything goes' },
        either: { chip: 'Any diet', label: 'either is fine' },
      },
      {
        id: 'meal', kind: 'q', eyebrow: 'MEAL',
        title: 'Proper sit-down meal?', line: 'The full plate, no rush.',
        photo: u('photo-1631452180539-96aca7d48617'),
        yes: { chip: 'Full meal', label: 'a proper meal' },
        no: { chip: 'Light bites', label: 'light bites' },
        either: { chip: 'Any meal', label: 'either is fine' },
        clears: ['cuisine', 'bites'],
      },
      {
        id: 'cuisine', kind: 'pick', eyebrow: 'CUISINE', anyChip: 'Any cuisine',
        when: (a) => a.meal === 'yes',
        options: [
          { id: 'desi', title: 'Naan, curries and biryani?', line: 'The classic desi feast.', photo: u('photo-1631515243349-e0cb75fb8d3a'), photoVeg: u('photo-1631452180519-c014fe946bc7'), chip: 'Desi', end: 'Biryani', endVeg: 'Naan and curries', cats: ['restaurant'], cuisine: ['indian', 'north_indian', 'biryani', 'mughlai', 'punjabi', 'hyderabadi'] },
          { id: 'chinese', title: 'Noodles, momos, chilli everything?', line: 'Indo-Chinese and a bit of Asia.', photo: u('photo-1694923450868-b432a8ee52aa'), chip: 'Chinese', end: 'Momos and noodles', cats: ['restaurant', 'fastfood'], cuisine: ['chinese', 'asian', 'thai', 'japanese', 'korean', 'momo', 'tibetan'] },
          { id: 'italian', title: 'Pizza or pasta kind of mood?', line: 'Cheesy, saucy, Italian-ish.', photo: u('photo-1513104890138-7c749659a591'), chip: 'Italian', end: 'Pizza', cats: ['restaurant', 'fastfood'], cuisine: ['pizza', 'italian'] },
          { id: 'south', title: 'Dosa, idli or a full meals plate?', line: 'Tiffin, meals, pure comfort.', photo: u('photo-1668236543090-82eba5ee5976'), chip: 'South Indian', end: 'Dosa', cats: ['restaurant', 'fastfood'], cuisine: ['south_indian', 'andhra', 'chettinad', 'kerala', 'udupi', 'dosa', 'tiffin'] },
          { id: 'arabian', title: 'Shawarma, kebabs or a big mandi?', line: 'Grills and Arabian vibes.', photo: u('photo-1760888548893-bc2f7e09e972'), chip: 'Arabian', end: 'Mandi', endVeg: 'Falafel', cats: ['restaurant', 'fastfood'], cuisine: ['kebab', 'arab', 'arabian', 'lebanese', 'turkish', 'middle_eastern', 'barbecue', 'shawarma', 'mandi'] },
          { id: 'healthy', title: 'Something fresh and healthy?', line: 'Bowls, salads, grills.', photo: u('photo-1512621776951-a57141f2eefd'), chip: 'Healthy', end: 'Bowls', cats: ['restaurant', 'cafe'], cuisine: ['salad', 'healthy', 'vegan', 'juice'] },
        ],
        fallback: { title: 'Light bites instead?', line: 'Chaat, burgers, desserts, coffee.', photo: u('photo-1781243680771-1fea4521e196'), patch: { meal: 'no' } },
      },
      {
        id: 'bites', kind: 'pick', eyebrow: 'BITES', anyChip: 'Any bites',
        when: (a) => a.meal === 'no',
        options: [
          { id: 'chaat', title: 'Chaat and street food?', line: 'Pani puri, pav bhaji, the works.', photo: u('photo-1781243680771-1fea4521e196'), chip: 'Chaat', end: 'Chaat', cats: ['fastfood', 'restaurant'], cuisine: ['chaat', 'street_food', 'indian', 'pav_bhaji'] },
          { id: 'burger', title: 'Burger and fries?', line: 'Rolls and fried chicken count too.', photo: u('photo-1561758033-d89a9ad46330'), chip: 'Burgers', end: 'Burgers', cats: ['fastfood'], cuisine: ['burger', 'chicken', 'fried_chicken', 'sandwich', 'roll'] },
          { id: 'coffee', title: 'Coffee and a bite?', line: 'Sandwiches, pastries, chill.', photo: u('photo-1515823662972-da6a2e4d3002'), chip: 'Café bites', end: 'Coffee and a bite', cats: ['cafe'], cuisine: [] },
          { id: 'sweet', title: 'Something sweet?', line: 'Ice cream, waffles, desserts.', photo: u('photo-1562513872-634b8fae6dbe'), chip: 'Desserts', end: 'Dessert', cats: ['cafe'], cuisine: ['ice_cream', 'dessert', 'cake', 'waffle', 'frozen_yogurt'] },
        ],
        fallback: { title: 'Fancy a proper meal?', line: 'Curries, noodles, pizza and more.', photo: u('photo-1631452180539-96aca7d48617'), patch: { meal: 'yes' } },
      },
      ...budget(500, 1500, { when: (a) => a.meal !== 'no' }),
      ...budget(300, 800, { prefix: 'l', when: (a) => a.meal === 'no', loPhoto: 'photo-1788618992689-63521b2b47ba', hiPhoto: 'photo-1555396273-367ea4eb4db5' }),
      vibe('photo-1760783320455-f7092d00fade'),
      distance(),
    ],
  },
  {
    id: 'chai', label: 'Chai & coffee', photo: u('photo-1550731358-491ded4af838'),
    cats: ['cafe'], end: 'Café',
    steps: [
      {
        id: 'chai', kind: 'q', eyebrow: 'CHAI',
        title: 'Chai kind of day?', line: 'Irani chai, Osmania biscuits, a corner table.',
        photo: u('photo-1619581073186-5b4ae1b0caad'),
        yes: { chip: 'Chai', end: 'Chai', cuisine: ['tea', 'chai', 'irani'], label: 'chai' },
        no: { chip: 'Coffee', end: 'Coffee', cuisine: ['coffee_shop', 'coffee'], label: 'coffee' },
        either: { chip: 'Chai or coffee', label: 'either is fine' },
      },
      {
        id: 'purpose', kind: 'q', eyebrow: 'PURPOSE',
        title: 'Bringing the laptop?', line: 'Wifi, plugs, nobody rushing you.',
        photo: u('photo-1545184180-25d471fe75eb'),
        yes: { chip: 'Work mode', end: 'Laptop café', set: { vibe: 'calm' }, label: 'work-friendly' },
        no: { chip: 'Hangout', label: 'just hanging out' },
        either: { chip: 'Work or chill', label: 'either is fine' },
      },
      {
        id: 'food', kind: 'q', eyebrow: 'FOOD',
        title: 'Eating too?', line: 'Sandwiches, pasta, a proper bite.',
        photo: u('photo-1528735602780-2552fd46c7af'),
        yes: { chip: 'With food', label: 'serves food' },
        no: { chip: 'Just drinks', label: 'drinks and snacks' },
        either: { chip: 'Food or not', label: 'either is fine' },
      },
      ...budget(300, 800, { loTitle: 'Easy on the wallet?', hiTitle: 'Fancy café?', loPhoto: 'photo-1577968897966-3d4325b36b61', hiPhoto: 'photo-1789979927470-562ea493bc27' }),
      vibe('photo-1542181961-9590d0c79dab', (a) => a.purpose !== 'yes'),
      distance(),
    ],
  },
  {
    id: 'drinks', label: 'Drinks', note: '21+', photo: u('photo-1640766322140-ab90a7bc71e5'),
    cats: ['bar'], end: 'Drinks',
    steps: [
      {
        id: 'scene', kind: 'q', eyebrow: 'SCENE',
        title: 'Hitting the dance floor?', line: 'Loud music, late night.',
        photo: u('photo-1545128485-c400e7702796'),
        yes: { chip: 'Club', end: 'Dancing', label: 'a club' },
        no: { chip: 'Bar', end: 'Drinks', label: 'a bar or pub' },
        either: { chip: 'Bar or club', label: 'either is fine' },
        clears: ['style'],
      },
      {
        id: 'style', kind: 'q', eyebrow: 'STYLE',
        title: 'Beers and the match on?', line: 'Pubs, sports bars, big screens.',
        photo: u('photo-1638366172707-aca097c47149'),
        yes: { chip: 'Pub', end: 'Pub night', cuisine: ['pub'], label: 'a pub' },
        no: { chip: 'Cocktails', end: 'Cocktails', cuisine: ['cocktail', 'lounge'], label: 'cocktails' },
        either: { chip: 'Pub or lounge', label: 'either is fine' },
        when: (a) => a.scene !== 'yes',
      },
      {
        id: 'seating', kind: 'q', eyebrow: 'SEATING',
        title: 'Rooftop or open-air?', line: 'Breeze, skyline, the works.',
        photo: u('photo-1684285746670-3d2eeed72192'),
        yes: { chip: 'Open-air', label: 'outdoor seating' },
        no: { chip: 'Indoors', label: 'indoors' },
        either: { chip: 'In or out', label: 'either is fine' },
      },
      ...budget(1500, 3000, { loTitle: 'Keep it to a round or two?', hiTitle: 'Going all out?', loPhoto: 'photo-1598994671512-395d7a6147e0', hiPhoto: 'photo-1566417713940-fe7c737a9ef2' }),
      vibe('photo-1558210598-89ba75b1724e', (a) => a.scene !== 'yes'),
      distance('Within 3 km. Cheaper cab home too.', 'photo-1624921245402-47943def41ab'),
    ],
  },
  {
    id: 'fun', label: 'Movies & games', photo: u('photo-1485095329183-d0797cdc5676'),
    cats: ['culture', 'games'], end: 'Fun night',
    steps: [
      {
        id: 'plan', kind: 'q', eyebrow: 'PLAN',
        title: 'Movie night?', line: 'Big screen, bigger popcorn.',
        photo: u('photo-1620177088258-c84147ee601f'),
        yes: { chip: 'Movie', end: 'Movie night', cats: ['culture'], cuisine: ['cinema'], label: 'a movie' },
        no: { chip: 'Games', end: 'Games', cats: ['games'], label: 'games' },
        either: { chip: 'Movie or games', label: 'either is fine' },
        clears: ['screen', 'game', 'budget', 'budget2', 'gbudget', 'gbudget2'],
      },
      {
        id: 'screen', kind: 'q', eyebrow: 'SCREEN',
        title: 'Full multiplex?', line: 'Recliners, Dolby, food court after.',
        photo: u('photo-1559570278-eb8d71d06403'),
        yes: { chip: 'Multiplex', label: 'a multiplex' },
        no: { chip: 'Classic', label: 'a single screen' },
        either: { chip: 'Any screen', label: 'either is fine' },
        when: (a) => a.plan === 'yes',
      },
      {
        id: 'game', kind: 'pick', eyebrow: 'GAME', anyChip: 'Any game',
        when: (a) => a.plan === 'no',
        options: [
          { id: 'bowling', title: 'Bowling or the arcade?', line: 'Strikes, high scores, bragging rights.', photo: u('photo-1743527957211-b9da11f2af67'), chip: 'Bowling', end: 'Bowling', cats: ['games'], cuisine: ['bowling', 'arcade'] },
          { id: 'escape', title: 'Escape room or board games?', line: 'Puzzles, dice, teamwork.', photo: u('photo-1629760946220-5693ee4c46ac'), chip: 'Escape room', end: 'Escape room', cats: ['games'], cuisine: ['escape', 'board'] },
          { id: 'gaming', title: 'Gaming café?', line: 'Consoles, PCs, snacks on the side.', photo: u('photo-1758410473735-c76baff30a79'), chip: 'Gaming café', end: 'Gaming café', cats: ['games'], cuisine: ['gaming', 'game'] },
        ],
        fallback: { title: 'Movie instead?', line: 'Big screen, zero effort.', photo: u('photo-1620177088258-c84147ee601f'), patch: { plan: 'yes' } },
      },
      ...budget(600, 1500, { when: (a) => a.plan === 'yes', loTitle: 'Easy on the wallet?', hiTitle: 'Premium seats?', loPhoto: 'photo-1593940256067-fb4acd831804', hiPhoto: 'photo-1489599849927-2ee91cede3ba' }),
      ...budget(800, 2000, { prefix: 'g', when: (a) => a.plan !== 'yes', loTitle: 'Easy on the wallet?', hiTitle: 'Going all out?', loPhoto: 'photo-1511512578047-dfb367046420', hiPhoto: 'photo-1758410473735-c76baff30a79' }),
      distance('Within 3 km of you.', 'photo-1708685889314-013b9afd452f', 'Somewhere close by?'),
    ],
  },
  {
    id: 'parks', label: 'Parks', photo: u('photo-1663052722838-4dcc3f1730fa'),
    cats: ['park'], end: 'Park time',
    steps: [
      {
        id: 'view', kind: 'q', eyebrow: 'VIEW',
        title: 'Somewhere with a view?', line: 'Lakes, sunsets, a good spot to sit.',
        photo: u('photo-1614877105424-a72d57d5e05c'),
        yes: { chip: 'Lake & view', end: 'Lake walk', cuisine: ['lake', 'view', 'tank'], label: 'a lake or viewpoint' },
        no: { chip: 'Park', end: 'Park time', label: 'a regular park' },
        either: { chip: 'Any park', label: 'either is fine' },
      },
      {
        id: 'pace', kind: 'q', eyebrow: 'PACE',
        title: 'Going for a proper walk?', line: 'Walking track, a few laps.',
        photo: u('photo-1758629277120-1d0b2b9c0749'),
        yes: { chip: 'Walk', label: 'a proper walk' },
        no: { chip: 'Sit & chill', label: 'sit and chill' },
        either: { chip: 'Walk or sit', label: 'either is fine' },
      },
      {
        id: 'kids', kind: 'q', eyebrow: 'KIDS',
        title: 'Bringing the little ones?', line: 'Swings, slides, open lawns.',
        photo: u('photo-1460788150444-d9dc07fa9dba'),
        yes: { chip: 'Kid-friendly', label: 'kid-friendly' },
        no: { chip: 'Grown-ups', label: 'just grown-ups' },
        either: { chip: 'Kids or not', label: 'either is fine' },
      },
      {
        id: 'entry', kind: 'q', eyebrow: 'ENTRY',
        title: 'Free entry only?', line: 'No tickets, just walk in.',
        photo: u('photo-1708924908152-aa8df3576b86'),
        yes: { chip: 'Free', label: 'free entry' },
        no: { chip: 'Ticketed OK', label: 'tickets are fine' },
        either: { chip: 'Any entry', label: 'either is fine' },
      },
      distance(),
    ],
  },
  {
    id: 'move', label: 'Gym & sports', photo: u('photo-1517836357463-d25dfeac3438'),
    cats: ['sport'], end: 'Game on',
    steps: [
      {
        id: 'plan', kind: 'q', eyebrow: 'PLAN',
        title: 'Gym session?', line: 'Weights, cardio, done.',
        photo: u('photo-1576678927484-cc907957088c'),
        yes: { chip: 'Gym', end: 'Gym', cuisine: ['fitness', 'gym'], label: 'the gym' },
        no: { chip: 'Sport', end: 'Game on', label: 'a sport' },
        either: { chip: 'Gym or sport', label: 'either is fine' },
        clears: ['style', 'sport', 'shade'],
      },
      {
        id: 'style', kind: 'q', eyebrow: 'STYLE',
        title: 'Prefer a class?', line: 'Yoga, Zumba, CrossFit. Someone else counts.',
        photo: u('photo-1552196563-55cd4e45efb3'),
        yes: { chip: 'Class', end: 'Class', cuisine: ['yoga', 'dance', 'crossfit', 'studio'], label: 'a class' },
        no: { chip: 'Open gym', label: 'an open gym' },
        either: { chip: 'Class or not', label: 'either is fine' },
        when: (a) => a.plan === 'yes',
      },
      {
        id: 'sport', kind: 'pick', eyebrow: 'SPORT', anyChip: 'Any sport',
        when: (a) => a.plan === 'no',
        options: [
          { id: 'courts', title: 'Book a court or turf?', line: 'Badminton, box cricket, football.', photo: u('photo-1626224583764-f87db24ac4ea'), chip: 'Court/turf', end: 'Game on', cats: ['sport'], cuisine: ['badminton', 'tennis', 'soccer', 'football', 'cricket', 'turf', 'pitch'] },
          { id: 'swim', title: 'Go for a swim?', line: 'Laps or just floating.', photo: u('photo-1787237876710-286560d4ff2f'), chip: 'Swim', end: 'Swim', cats: ['sport'], cuisine: ['swimming', 'pool'] },
          { id: 'climb', title: 'Climbing or adventure?', line: 'Walls, ropes, a bit of a rush.', photo: u('photo-1517599652-86163851f0de'), chip: 'Adventure', end: 'Climbing', cats: ['sport'], cuisine: ['climbing', 'adventure'] },
        ],
        fallback: { title: 'Just a walk instead?', line: 'Parks and fresh air.', photo: u('photo-1590750456182-4e35e99ca8ae'), switchTo: 'parks' },
      },
      {
        id: 'shade', kind: 'q', eyebrow: 'SHADE',
        title: 'Out of the sun?', line: 'Indoor, AC, no sunburn.',
        photo: u('photo-1775993167284-8e6a6e56ab69'),
        yes: { chip: 'Indoor', label: 'indoor' },
        no: { chip: 'Outdoor', label: 'outdoor is fine' },
        either: { chip: 'In or out', label: 'either is fine' },
        when: (a, picks) => picks?.sport?.pick === 'courts',
      },
      ...budget(500, 1500, { loPhoto: 'photo-1708312604109-16c0be9326cd', hiPhoto: 'photo-1517836357463-d25dfeac3438' }),
      distance(),
    ],
  },
];

export const TILE_BY_ID = Object.fromEntries(TILES.map((t) => [t.id, t]));

/* ---------- Surprise me: the likeliest tile for this moment ---------- */

const SLOT_ODDS = {
  morning: { chai: 0.35, move: 0.25, parks: 0.2, food: 0.15, fun: 0.05, drinks: 0 },
  midday: { food: 0.5, chai: 0.2, fun: 0.15, parks: 0.05, move: 0.05, drinks: 0.05 },
  afternoon: { chai: 0.3, fun: 0.25, food: 0.2, parks: 0.15, move: 0.05, drinks: 0.05 },
  evening: { food: 0.35, fun: 0.25, drinks: 0.2, chai: 0.1, parks: 0.05, move: 0.05 },
  late: { drinks: 0.45, food: 0.4, fun: 0.1, chai: 0.05, parks: 0, move: 0 },
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function slotFor(h) {
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 15) return 'midday';
  if (h >= 15 && h < 18) return 'afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'late';
}

/** A weighted pick, so pressing it twice can land somewhere new. */
export function surpriseTile(now = new Date(), rand = Math.random) {
  const slot = slotFor(now.getHours());
  const odds = { ...SLOT_ODDS[slot] };
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  if (weekend && slot !== 'late') {
    odds.parks += 0.08;
    odds.fun += 0.08;
  }
  const total = Object.values(odds).reduce((s, v) => s + v, 0);
  let r = rand() * total;
  for (const [id, w] of Object.entries(odds)) {
    if ((r -= w) <= 0) return { id, note: `Picked for your ${DAYS[now.getDay()]} ${slot === 'late' ? 'night' : slot}.` };
  }
  return { id: 'food', note: '' };
}

/* ---------- The engine ---------- */

export const LEFTS_TO_GRID = 3;

export function initial(seenCoach) {
  return { phase: seenCoach ? 'tiles' : 'coach', tile: null, note: null, answers: {}, picks: {}, fallbacks: {}, cursor: null, streak: 0, past: [] };
}

export function startTile(s, tileId, note = null) {
  return { ...s, phase: 'cards', tile: tileId, note, answers: {}, picks: {}, fallbacks: {}, cursor: null, streak: 0, past: [...s.past, strip(s)] };
}

const strip = ({ past, ...rest }) => rest;

/** The cards this tile shows, given the answers so far. */
export function flowOf(s) {
  const tile = TILE_BY_ID[s.tile];
  if (!tile) return [];
  return tile.steps.filter((st) => !st.when || st.when(s.answers, s.picks));
}

const pickState = (s, id) => s.picks[id] || { rejected: [], maybes: [], pick: null };
const isDone = (s, st) => (st.kind === 'q' ? s.answers[st.id] != null : pickState(s, st.id).pick != null);

/** What's on screen: a question, one option of a list, a fallback card, or null when finished. */
export function currentCard(s) {
  const flow = flowOf(s);
  const step = (s.cursor && flow.find((st) => st.id === s.cursor)) || flow.find((st) => !isDone(s, st));
  if (!step) return null;
  if (step.kind === 'q') return { type: 'q', step };
  const ps = pickState(s, step.id);
  const seen = [...ps.rejected, ...ps.maybes];
  const option = step.options.find((o) => !seen.includes(o.id));
  if (option) return { type: 'option', step, option, next: step.options.find((o) => o !== option && !seen.includes(o.id)) };
  if (!ps.maybes.length && step.fallback && !s.fallbacks[step.id]) return { type: 'fallback', step };
  return { type: 'exhausted', step };
}

/** Step position for the "3/6" counter: follow-up budget cards share their step. */
export function progress(s) {
  // Count the whole path, assuming the longer branch for questions not
  // answered yet, so the total doesn't jump when follow-up cards appear.
  const tile = TILE_BY_ID[s.tile];
  const answers = { ...s.answers };
  const len = (a) => flowOf({ ...s, answers: a }).filter((st) => !st.sub).length;
  for (const st of tile?.steps || []) {
    if (st.kind !== 'q' || answers[st.id] != null || st.sub || (st.when && !st.when(answers, s.picks))) continue;
    answers[st.id] = len({ ...answers, [st.id]: 'no' }) > len({ ...answers, [st.id]: 'yes' }) ? 'no' : 'yes';
  }
  const flow = flowOf({ ...s, answers }).filter((st) => !st.sub);
  const card = currentCard(s);
  const id = card?.step?.sub ? card.step.id.replace(/2$/, '') : card?.step?.id;
  const i = flow.findIndex((st) => st.id === id);
  return { index: i < 0 ? flow.length : i + 1, total: flow.length };
}

function settle(s) {
  // Drop answers for cards that left the flow, then see where we are.
  const ids = new Set(flowOf(s).map((st) => st.id));
  const answers = Object.fromEntries(Object.entries(s.answers).filter(([k]) => ids.has(k)));
  const picks = Object.fromEntries(Object.entries(s.picks).filter(([k]) => ids.has(k)));
  let n = { ...s, answers, picks };
  if (JSON.stringify(answers) !== JSON.stringify(s.answers) || Object.keys(picks).length !== Object.keys(s.picks).length) n = settle(n);
  const card = currentCard(n);
  if (!card) return { ...n, phase: 'done', cursor: null };
  if (card.type === 'exhausted') {
    const ps = pickState(n, card.step.id);
    // Only maybes left: they're the pick.
    if (ps.maybes.length) return settle({ ...n, cursor: null, streak: 0, picks: { ...n.picks, [card.step.id]: { ...ps, pick: { maybes: ps.maybes } } } });
    return { ...n, phase: 'grid' };
  }
  return { ...n, phase: n.phase === 'grid' ? 'grid' : 'cards' };
}

const ANSWER_KEY = { right: 'yes', left: 'no', up: 'either' };

/** Right / left / up on the card that's showing. */
export function answer(s, dir) {
  const card = currentCard(s);
  if (!card) return s;
  const prev = [...s.past, strip(s)];
  const { step } = card;
  if (card.type === 'q') {
    const key = ANSWER_KEY[dir];
    const answers = { ...s.answers, [step.id]: key };
    const picks = { ...s.picks };
    const changed = s.answers[step.id] !== key;
    if (changed) for (const id of step.clears || []) {
      delete answers[id];
      delete picks[id];
    }
    // A changed budget answer re-asks the follow-up card.
    if (changed && /budget$/.test(step.id)) delete answers[`${step.id}2`];
    return settle({ ...s, answers, picks, cursor: null, streak: 0, phase: 'cards', past: prev });
  }
  if (card.type === 'option') {
    const ps = pickState(s, step.id);
    const o = card.option;
    let next;
    let streak = s.streak;
    if (dir === 'right') next = { ...ps, pick: o.id };
    else if (dir === 'left') {
      next = { ...ps, rejected: [...ps.rejected, o.id] };
      streak += 1;
    } else {
      next = { ...ps, maybes: [...ps.maybes, o.id] };
      streak = 0;
    }
    const n = { ...s, picks: { ...s.picks, [step.id]: next }, streak, past: prev, phase: 'cards' };
    if (next.pick == null && streak >= LEFTS_TO_GRID && currentCard(n)?.type === 'option') return { ...n, phase: 'grid', cursor: step.id };
    return settle({ ...n, cursor: next.pick != null ? null : step.id, streak: next.pick != null ? 0 : streak });
  }
  if (card.type === 'fallback') {
    const fb = step.fallback;
    if (dir === 'left') return { ...s, fallbacks: { ...s.fallbacks, [step.id]: 'no' }, phase: 'grid', cursor: step.id, past: prev };
    if (fb.switchTo) return { ...startTile({ ...s, past: [] }, fb.switchTo, null), past: prev };
    return settle({
      ...s,
      answers: { ...s.answers, ...fb.patch },
      fallbacks: { ...s.fallbacks, [step.id]: 'yes' },
      cursor: null,
      streak: 0,
      phase: 'cards',
      past: prev,
    });
  }
  return s;
}

/** From the "Not feeling any of these?" grid: an option id, 'any', or { text }. */
export function choose(s, stepId, value) {
  const ps = pickState(s, stepId);
  return settle({ ...s, picks: { ...s.picks, [stepId]: { ...ps, pick: value } }, cursor: null, streak: 0, phase: 'cards', past: [...s.past, strip(s)] });
}

export function keepSwiping(s) {
  return { ...s, phase: 'cards', streak: 0, past: [...s.past, strip(s)] };
}

/** Tap a chip: that card comes back. Lists start over; questions show again. */
export function jump(s, stepId) {
  const flow = flowOf(s);
  const step = flow.find((st) => st.id === stepId);
  if (!step) return s;
  const picks = { ...s.picks };
  if (step.kind === 'pick') delete picks[stepId];
  return { ...s, picks, cursor: stepId, streak: 0, phase: 'cards', past: [...s.past, strip(s)] };
}

export function undo(s) {
  if (!s.past.length) return s;
  return { ...s.past[s.past.length - 1], past: s.past.slice(0, -1) };
}

/** Chips for the selections bar, in flow order. */
export function chipsOf(s) {
  const out = [];
  for (const st of flowOf(s)) {
    if (st.kind === 'q') {
      const a = s.answers[st.id];
      if (!a) continue;
      const chip = st[a].chip;
      if (chip) out.push({ step: st.sub ? st.id.replace(/2$/, '') : st.id, jumpTo: st.sub ? st.id.replace(/2$/, '') : st.id, label: chip, any: a === 'either' || /^Any /.test(chip) });
    } else {
      const p = pickState(s, st.id).pick;
      if (p == null) continue;
      const label =
        p === 'any' ? st.anyChip
          : p.text ? capitalise(p.text)
            : p.maybes ? p.maybes.map((id) => st.options.find((o) => o.id === id)?.chip).join(' / ')
              : st.options.find((o) => o.id === p)?.chip;
      out.push({ step: st.id, jumpTo: st.id, label, any: p === 'any' });
    }
  }
  // A budget follow-up replaces the first budget chip.
  return out.filter((c, i) => !out.slice(i + 1).some((d) => d.step === c.step));
}

/** What the answers mean for Search, plus the end card's words. */
export function resultOf(s) {
  const tile = TILE_BY_ID[s.tile];
  let cats = tile.cats;
  let cuisine = [];
  let end = tile.end;
  const set = {};
  for (const st of flowOf(s)) {
    if (st.kind === 'q') {
      const a = s.answers[st.id];
      if (!a) continue;
      const v = st[a];
      Object.assign(set, v.set);
      if (v.cats) cats = v.cats;
      if (v.cuisine) cuisine = v.cuisine;
      if (v.end) end = v.end;
    } else {
      const p = pickState(s, st.id).pick;
      if (p == null || p === 'any') continue;
      const opts = p.maybes ? p.maybes.map((id) => st.options.find((o) => o.id === id)) : p.text ? [] : [st.options.find((o) => o.id === p)];
      if (p.text) {
        cuisine = [p.text.toLowerCase()];
        end = capitalise(p.text);
      } else {
        cats = [...new Set(opts.flatMap((o) => o.cats))];
        cuisine = opts.flatMap((o) => o.cuisine);
        const o = opts[0];
        end = opts.length > 1 ? tile.end : set.veg && o.endVeg ? o.endVeg : o.end;
      }
    }
  }
  return { cats, cuisine, nearKm: set.nearKm || 3, veg: !!set.veg, budget: set.budget || null, vibe: set.vibe || null, end, label: end };
}

const capitalise = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** The photo for a card, with veg versions when veg is on. */
export function photoFor(s, card) {
  if (!card) return null;
  if (card.type === 'option') return s.answers.veg === 'yes' && card.option.photoVeg ? card.option.photoVeg : card.option.photo;
  if (card.type === 'fallback') return card.step.fallback.photo;
  return card.step.photo;
}

/** Every photo a tile can show, to warm the cache. */
export function photosOf(tileId) {
  const t = TILE_BY_ID[tileId];
  if (!t) return [];
  return t.steps.flatMap((st) => (st.kind === 'q' ? [st.photo] : [...st.options.map((o) => o.photo), st.fallback?.photo]));
}
