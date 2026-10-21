const NON_STEMMABLE = new Set([
  'news', 'bus', 'this', 'yes', 'gas', 'glass', 'boss', 'less', 'miss', 'press',
  'pass', 'cross', 'class', 'grass', 'dress', 'chess', 'address', 'process', 'access',
  'success', 'express', 'possess', 'discuss', 'guess', 'bless', 'mess', 'loss', 'moss',
  'gloss', 'floss', 'toss', 'across', 'canvas', 'bias', 'alias', 'atlas',
  'compass', 'embarrass', 'harass', 'virus', 'status', 'focus', 'radius', 'bonus',
  'circus', 'genus', 'minus', 'plus', 'thus', 'us', 'as', 'his', 'its', 'these',
  'those', 'is', 'was', 'has', 'does', 'series', 'species', 'chaos', 'lens', 'corps',
  'means', 'ethics', 'physics', 'maths', 'politics', 'economics', 'better', 'best',
  'worse', 'worst', 'more', 'most', 'least', 'bigger', 'biggest', 'smaller', 'smallest',
  'faster', 'fastest', 'older', 'oldest', 'younger', 'youngest', 'longer', 'longest',
  'shorter', 'shortest', 'higher', 'highest', 'lower', 'lowest', 'greater', 'greatest'
]);

const IRREGULAR_MAP: Record<string, string> = {
  children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth',
  mice: 'mouse', geese: 'goose', people: 'person', oxen: 'ox', lives: 'life',
  knives: 'knife', wives: 'wife', halves: 'half', wolves: 'wolf',
  thieves: 'thief', calves: 'calf', elves: 'elf', shelves: 'shelf',
  went: 'go', gone: 'go', going: 'go', goes: 'go',
  was: 'be', were: 'be', been: 'be', being: 'be', am: 'be', are: 'be',
  did: 'do', done: 'do', doing: 'do', does: 'do',
  had: 'have', has: 'have', having: 'have',
  said: 'say', says: 'say', saying: 'say',
  made: 'make', makes: 'make', making: 'make',
  took: 'take', taken: 'take', takes: 'take', taking: 'take',
  came: 'come', comes: 'come', coming: 'come',
  saw: 'see', seen: 'see', sees: 'see', seeing: 'see',
  knew: 'know', known: 'know', knows: 'know', knowing: 'know',
  got: 'get', gotten: 'get', gets: 'get', getting: 'get',
  gave: 'give', given: 'give', gives: 'give', giving: 'give',
  found: 'find', finds: 'find', finding: 'find',
  thought: 'think', thinks: 'think', thinking: 'think',
  told: 'tell', tells: 'tell', telling: 'tell',
  became: 'become', becomes: 'become', becoming: 'become',
  left: 'leave', leaves: 'leave', leaving: 'leave',
  felt: 'feel', feels: 'feel', feeling: 'feel',
  brought: 'bring', brings: 'bring', bringing: 'bring',
  began: 'begin', begun: 'begin', begins: 'begin', beginning: 'begin',
  kept: 'keep', keeps: 'keep', keeping: 'keep',
  held: 'hold', holds: 'hold', holding: 'hold',
  wrote: 'write', written: 'write', writes: 'write', writing: 'write',
  stood: 'stand', stands: 'stand', standing: 'stand',
  heard: 'hear', hears: 'hear', hearing: 'hear',
  meant: 'mean', means: 'mean', meaning: 'mean',
  met: 'meet', meets: 'meet', meeting: 'meet',
  ran: 'run', runs: 'run', running: 'run',
  paid: 'pay', pays: 'pay', paying: 'pay',
  sat: 'sit', sits: 'sit', sitting: 'sit',
  spoke: 'speak', spoken: 'speak', speaks: 'speak', speaking: 'speak',
  lay: 'lie', lain: 'lie', lies: 'lie', lying: 'lie',
  led: 'lead', leads: 'lead', leading: 'lead',
  grew: 'grow', grown: 'grow', grows: 'grow', growing: 'grow',
  lost: 'lose', loses: 'lose', losing: 'lose',
  fell: 'fall', fallen: 'fall', falls: 'fall', falling: 'fall',
  sent: 'send', sends: 'send', sending: 'send',
  built: 'build', builds: 'build', building: 'build',
  understood: 'understand', understands: 'understand', understanding: 'understand',
  drew: 'draw', drawn: 'draw', draws: 'draw', drawing: 'draw',
  spent: 'spend', spends: 'spend', spending: 'spend',
  rose: 'rise', risen: 'rise', rises: 'rise', rising: 'rise',
  drove: 'drive', driven: 'drive', drives: 'drive', driving: 'drive',
  bought: 'buy', buys: 'buy', buying: 'buy',
  wore: 'wear', worn: 'wear', wears: 'wear', wearing: 'wear',
  chose: 'choose', chosen: 'choose', chooses: 'choose', choosing: 'choose',
  sought: 'seek', seeks: 'seek', seeking: 'seek',
  caught: 'catch', catches: 'catch', catching: 'catch',
  dealt: 'deal', deals: 'deal', dealing: 'deal',
  won: 'win', wins: 'win', winning: 'win',
  forgot: 'forget', forgotten: 'forget', forgets: 'forget', forgetting: 'forget',
  laid: 'lay', lays: 'lay', laying: 'lay',
  fled: 'flee', flees: 'flee', fleeing: 'flee',
  swam: 'swim', swims: 'swim', swimming: 'swim',
  shone: 'shine', shines: 'shine', shining: 'shine',
  sang: 'sing', sung: 'sing', sings: 'sing', singing: 'sing',
  blew: 'blow', blown: 'blow', blows: 'blow', blowing: 'blow',
  flew: 'fly', flown: 'fly', flies: 'fly', flying: 'fly',
  drank: 'drink', drunk: 'drink', drinks: 'drink', drinking: 'drink',
  threw: 'throw', thrown: 'throw', throws: 'throw', throwing: 'throw',
  rode: 'ride', ridden: 'ride', rides: 'ride', riding: 'ride',
  ate: 'eat', eaten: 'eat', eats: 'eat', eating: 'eat',
  beat: 'beat', beaten: 'beat', beats: 'beat', beating: 'beat',
  bit: 'bite', bitten: 'bite', bites: 'bite', biting: 'bite',
  hid: 'hide', hidden: 'hide', hides: 'hide', hiding: 'hide',
  rang: 'ring', rung: 'ring', rings: 'ring', ringing: 'ring',
  sank: 'sink', sunk: 'sink', sinks: 'sink', sinking: 'sink',
  slept: 'sleep', sleeps: 'sleep', sleeping: 'sleep',
  woke: 'wake', woken: 'wake', wakes: 'wake', waking: 'wake',
  stole: 'steal', stolen: 'steal', steals: 'steal', stealing: 'steal',
  broke: 'break', broken: 'break', breaks: 'break', breaking: 'break',
  sold: 'sell', sells: 'sell', selling: 'sell',
  shot: 'shoot', shoots: 'shoot', shooting: 'shoot',
  hung: 'hang', hangs: 'hang', hanging: 'hang',
  taught: 'teach', teaches: 'teach', teaching: 'teach',
  fought: 'fight', fights: 'fight', fighting: 'fight'
};

export function normallestirKelime(girdi: string | null | undefined): string {
  if (!girdi) return '';
  let metin = girdi.normalize('NFC').trim();
  if (!metin) return '';

  metin = metin.replace(/^[\s\p{P}\p{S}]+/u, '').replace(/[\s\p{P}\p{S}]+$/u, '');
  if (!metin) return '';

  metin = metin.replace(/\s+/g, ' ');
  if (metin.toUpperCase() === 'I') return 'I';
  return metin.toLowerCase();
}

export function kokBul(girdi: string | null | undefined): string | null {
  const w = normallestirKelime(girdi);
  if (!w || w.length < 3) return null;
  if (NON_STEMMABLE.has(w)) return null;
  if (IRREGULAR_MAP[w]) {
    return IRREGULAR_MAP[w] === w ? null : IRREGULAR_MAP[w];
  }

  let kok: string | null = null;
  if (w.endsWith('ies') && w.length > 4) {
    kok = w.slice(0, -3) + 'y';
  } else if (w.endsWith('ied') && w.length > 4) {
    kok = w.slice(0, -3) + 'y';
  } else if (w.endsWith('es') && w.length > 4 && (w.endsWith('shes') || w.endsWith('ches') || w.endsWith('xes') || w.endsWith('zes') || w.endsWith('sses'))) {
    kok = w.slice(0, -2);
  } else if (w.endsWith('ed') && w.length > 4) {
    if (ciftUnsuzMu(w, w.length - 3)) {
      kok = w.slice(0, -3);
    } else if (sessizEGerektirir(w.slice(0, -2))) {
      kok = w.slice(0, -1);
    } else {
      kok = w.slice(0, -2);
    }
  } else if (w.endsWith('ing') && w.length > 4) {
    if (ciftUnsuzMu(w, w.length - 4)) {
      kok = w.slice(0, -4);
    } else if (sessizEGerektirir(w.slice(0, -3))) {
      kok = w.slice(0, -3) + 'e';
    } else {
      kok = w.slice(0, -3);
    }
  } else if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') && !w.endsWith('as')) {
    kok = w.slice(0, -1);
  }

  if (!kok || kok === w || kok.length < 2) return null;
  return kok;
}

function ciftUnsuzMu(str: string, index: number): boolean {
  if (index < 1 || index >= str.length) return false;
  const c1 = str[index - 1];
  const c2 = str[index];
  return c1 === c2 && 'bdfgklmnprstz'.includes(c1);
}

function sessizEGerektirir(stem: string): boolean {
  if (!stem || stem.length < 2) return false;
  return (
    /[bcdfghklmnprstvwz][a-z]?$/i.test(stem) &&
    !/(e|o|a|u|i){2}/i.test(stem) &&
    !/(ck|ng|th|sh|ch|rt|rn|rk|lp|l|r)$/i.test(stem)
  );
}
