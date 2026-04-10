#!/usr/bin/env node
// Generate pre-computed Contexto puzzle data using Datamuse API for semantic similarity
// Run: node scripts/generate-contexto.js
//
// Strategy: Fetch ML-related words per puzzle, build a SHARED vocabulary across all puzzles,
// then for each puzzle rank ALL shared vocab words (ML-scored words first, then remaining
// distributed at higher ranks) so players rarely see "word not recognized."

const https = require('https');
const fs = require('fs');
const path = require('path');

// Secret words — concrete nouns/concepts that produce interesting similarity clusters
const SECRET_WORDS = [
  'ocean', 'mountain', 'guitar', 'hospital', 'diamond', 'rocket', 'library', 'volcano',
  'castle', 'piano', 'elephant', 'bridge', 'camera', 'forest', 'lightning', 'garden',
  'airport', 'painting', 'dragon', 'island', 'mirror', 'sandwich', 'telescope', 'pyramid',
  'dolphin', 'stadium', 'chocolate', 'newspaper', 'dinosaur', 'compass', 'umbrella', 'submarine',
  'festival', 'keyboard', 'butterfly', 'treasure', 'cathedral', 'satellite', 'penguin', 'highway',
  'lantern', 'passport', 'orchestra', 'skeleton', 'avalanche', 'detective', 'rainbow', 'museum',
  'tornado', 'blanket', 'candle', 'helmet', 'monster', 'planet', 'shadow', 'temple',
  'anchor', 'basket', 'circus', 'desert', 'engine', 'hammer', 'jungle', 'knight',
  'marble', 'needle', 'parrot', 'ribbon', 'silver', 'throne', 'tunnel', 'window',
  'barrel', 'cherry', 'fossil', 'harbor', 'jersey', 'ladder', 'meadow', 'palace',
  'rabbit', 'shield', 'trophy', 'violin', 'wizard', 'branch', 'feather', 'glacier',
  'market', 'sunset', 'thunder', 'village', 'whistle', 'crystal',
  'battery', 'curtain', 'missile', 'popcorn'
];

// ~2000 common English words to ensure broad coverage for guesses
const COMMON_WORDS = [
  'time','year','people','way','day','man','woman','child','world','life','hand','part','place','case',
  'week','company','system','program','question','work','government','number','night','point','home',
  'water','room','mother','area','money','story','fact','month','lot','right','study','book','eye',
  'job','word','business','issue','side','kind','head','house','service','friend','father','power',
  'hour','game','line','end','member','law','car','city','community','name','president','team',
  'minute','idea','body','information','back','parent','face','others','level','office','door',
  'health','person','art','war','history','party','result','change','morning','reason','research',
  'girl','guy','moment','air','teacher','force','education','dog','cat','bird','fish','tree',
  'flower','sun','moon','star','sky','cloud','rain','snow','wind','fire','earth','stone','rock',
  'hill','river','lake','sea','beach','field','farm','road','street','town','building','church',
  'school','college','student','class','family','baby','boy','king','queen','prince','heart',
  'mind','dream','hope','fear','anger','love','price','wall','floor','table','chair','bed',
  'food','bread','milk','meat','fruit','apple','rice','sugar','salt','oil','coffee','tea',
  'wine','beer','glass','cup','plate','knife','fork','ring','ball','box','bag','hat','coat',
  'shirt','shoe','dress','color','red','blue','green','white','black','light','dark','sound',
  'music','song','dance','movie','picture','photo','paper','letter','map','sign','clock',
  'phone','computer','machine','tool','key','pen','iron','gold','metal','wood','plastic',
  'blood','bone','skin','hair','nose','mouth','lip','tooth','tongue','ear','arm','leg',
  'foot','finger','neck','shoulder','pain','doctor','nurse','drug','medicine','test','blood',
  'sport','football','baseball','basketball','soccer','tennis','golf','race','fight','soldier',
  'army','weapon','gun','bomb','ship','boat','train','bus','truck','plane','flight','space',
  'science','technology','energy','internet','summer','winter','spring','fall','weather','heat',
  'cold','ice','oil','gas','land','soil','dust','sand','grass','leaf','seed','root',
  'animal','horse','cow','pig','chicken','sheep','bear','wolf','fox','deer','lion','tiger',
  'monkey','snake','mouse','whale','shark','spider','insect','butterfly','egg','wing','tail',
  'horn','fur','milk','farm','garden','park','zoo','prison','hospital','restaurant','hotel',
  'store','shop','bank','library','office','factory','station','airport','bridge','tower',
  'wall','gate','fence','path','step','floor','roof','hall','kitchen','bedroom','bathroom',
  'window','door','chair','desk','bench','shelf','basket','bowl','pot','pan','bottle','can',
  'box','bag','rope','wire','chain','belt','wheel','engine','motor','fuel','steel','brick',
  'cement','paint','cloth','cotton','silk','leather','rubber','tape','string','thread','needle',
  'button','pocket','mirror','brush','comb','soap','towel','blanket','pillow','sheet','curtain',
  'flag','cross','circle','square','triangle','pattern','shape','edge','corner','surface',
  'hole','line','curve','angle','wave','spot','mark','point','tip','bar','block','board',
  'card','page','sheet','cover','frame','screen','stage','track','channel','network','link',
  'base','center','top','bottom','front','back','middle','beginning','end','north','south',
  'east','west','left','right','inside','outside','above','below','between','human','person',
  'leader','king','queen','soldier','captain','chief','judge','master','agent','hero','enemy',
  'guest','neighbor','stranger','crowd','spirit','soul','ghost','angel','devil','god','magic',
  'secret','mystery','puzzle','trick','joke','laugh','smile','cry','tear','voice','noise',
  'silence','peace','freedom','justice','truth','lie','danger','trouble','luck','chance',
  'accident','crime','attack','battle','victory','defeat','death','birth','wedding','gift',
  'prize','reward','penalty','tradition','culture','religion','church','temple','prayer',
  'holiday','celebration','performance','skill','talent','knowledge','wisdom','experience',
  'lesson','practice','effort','progress','success','failure','mistake','problem','solution',
  'method','rule','standard','measure','weight','speed','distance','height','depth','length',
  'amount','total','average','record','score','version','copy','model','sample','example',
  'nature','ocean','mountain','island','valley','cave','desert','jungle','forest','swamp',
  'coast','shore','harbor','port','market','village','castle','palace','tower','monument',
  'statue','painting','sculpture','museum','gallery','collection','treasure','diamond','crystal',
  'jewel','crown','throne','sword','shield','armor','helmet','arrow','bow','spear','blade',
  'flag','banner','drum','bell','trumpet','whistle','horn','flute','piano','guitar','violin',
  'orchestra','concert','theater','cinema','circus','carnival','festival','parade','champion',
  'trophy','medal','ribbon','badge','uniform','vehicle','bicycle','motorcycle','helicopter',
  'satellite','telescope','camera','compass','clock','calendar','newspaper','magazine','radio',
  'television','signal','message','code','password','address','stamp','ticket','passport',
  'license','certificate','contract','document','file','folder','data','software','hardware',
  'battery','switch','plug','cable','pipe','tube','tank','container','package','bundle',
  'pile','stack','row','column','list','chart','graph','figure','image','symbol','letter',
  'alphabet','language','speech','debate','argument','opinion','belief','theory','principle',
  'concept','theme','topic','subject','object','product','material','ingredient','recipe',
  'meal','breakfast','lunch','dinner','snack','dessert','cake','chocolate','candy','cookie',
  'ice','cream','butter','cheese','sauce','soup','salad','sandwich','pizza','burger','steak',
  'chicken','turkey','ham','bacon','sausage','bread','toast','flour','cereal','pasta','noodle',
  'potato','tomato','onion','pepper','garlic','mushroom','bean','corn','carrot','pea',
  'lettuce','spinach','cabbage','banana','orange','lemon','grape','cherry','berry','melon',
  'peach','pear','plum','coconut','nut','seed','honey','jam','syrup','vinegar',
  'planet','comet','asteroid','galaxy','universe','rocket','missile','torpedo','submarine',
  'anchor','ladder','staircase','elevator','escalator','corridor','tunnel','basement','attic',
  'garage','balcony','porch','deck','yard','lawn','hedge','fountain','pool','pond',
  'stream','waterfall','glacier','volcano','earthquake','tornado','hurricane','lightning',
  'thunder','rainbow','sunset','sunrise','dawn','dusk','shadow','fog','mist','frost',
  'hail','flood','drought','storm','breeze','gust','current','tide','surf','reef',
  'cliff','boulder','pebble','gravel','chalk','marble','granite','clay','mud','ash',
  'smoke','flame','spark','coal','charcoal','candle','lantern','lamp','torch','beacon',
  'lighthouse','monument','pyramid','dome','arch','pillar','column','steeple','cathedral',
  'monastery','cemetery','grave','tomb','coffin','skeleton','skull','fossil','dinosaur',
  'dragon','monster','giant','dwarf','wizard','witch','knight','prince','princess','pirate',
  'cowboy','detective','scientist','artist','musician','poet','writer','author','actor',
  'singer','dancer','clown','magician','pilot','sailor','explorer','hunter','farmer',
  'carpenter','blacksmith','mechanic','engineer','architect','surgeon','lawyer','merchant',
  'banker','trader','traveler','pilgrim','warrior','gladiator','samurai','viking','pharaoh',
  'emperor','general','admiral','sergeant','corporal','private','spy','assassin','thief',
  'prisoner','refugee','orphan','widow','bride','groom','infant','toddler','teenager','adult',
  'elder','ancestor','descendant','sibling','cousin','nephew','niece','uncle','aunt',
  'grandfather','grandmother','husband','wife','partner','companion','rival','opponent',
  'ally','volunteer','victim','witness','suspect','defendant','plaintiff','jury','verdict',
  'sentence','pardon','appeal','protest','revolution','invasion','siege','truce','surrender',
  'treaty','alliance','colony','empire','republic','kingdom','dynasty','throne','feather',
  'beak','claw','hoof','tusk','mane','stripe','scale','shell','coral','pearl','amber',
  'ivory','jade','sapphire','ruby','emerald','topaz','opal','quartz','fossil','lava',
  'crater','glacier','avalanche','blizzard','monsoon','cyclone','tsunami','eruption','tremor',
  'landslide','mudslide','wildfire','famine','plague','epidemic','virus','bacteria','cell',
  'organ','tissue','muscle','nerve','vein','artery','lung','liver','kidney','brain',
  'stomach','intestine','spine','rib','pelvis','skull','ankle','wrist','elbow','knee',
  'hip','jaw','forehead','cheek','chin','eyebrow','eyelash','pupil','iris','palm',
  'thumb','fist','grip','punch','kick','slap','push','pull','squeeze','stretch',
  'lift','drop','throw','catch','hit','cut','break','tear','bend','fold',
  'roll','spin','slide','bounce','float','sink','dive','swim','climb','crawl',
  'jump','run','walk','march','dance','skip','hop','stumble','fall','crash',
  'explosion','collision','impact','shatter','crack','split','burst','leak','spill','stain',
  'scratch','dent','chip','hole','gap','crack','rip','tear','patch','repair',
  'build','create','design','draw','paint','carve','sculpt','weave','sew','knit',
  'cook','bake','fry','boil','roast','grill','steam','chop','slice','peel',
  'mix','stir','pour','fill','empty','pack','wrap','tie','lock','open',
  'close','shut','seal','block','clear','clean','wash','wipe','scrub','polish',
  'dry','freeze','melt','heat','cool','warm','burn','glow','shine','flash',
  'flicker','sparkle','glitter','reflect','absorb','filter','strain','press','crush','grind',
  'harbor','barrel','meadow','popcorn','penguin','highway','passport','feather','needle',
  'anchor','trophy','rabbit','blanket','ribbon','branch','candle','parrot','marble',
  'basket','curtain','jersey','ladder','fossil','cherry','market','village','battery',
  'whistle','crystal','sunset','glacier','shield','throne','tunnel','knight','hammer',
  'desert','circus','temple','shadow','planet','helmet','monster','wizard','violin',
  'palace','meadow','silver','window','engine','jungle'
];

// Fetch JSON from a URL
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Endpoint configs: weight determines ranking importance
// rel_trg (trigger words) = human associations = MOST important for Contexto
const ENDPOINTS = [
  { param: 'rel_trg', max: 100, weight: 8000 },  // trigger/association words
  { param: 'rel_syn', max: 50,  weight: 7000 },  // synonyms
  { param: 'rel_gen', max: 50,  weight: 6000 },  // hyponyms (more specific types)
  { param: 'rel_par', max: 50,  weight: 5000 },  // part-of relationships
  { param: 'rel_com', max: 50,  weight: 5000 },  // comprises
  { param: 'rel_spc', max: 50,  weight: 4500 },  // hypernyms (broader categories)
  { param: 'rel_jjb', max: 50,  weight: 3500 },  // adjectives describing this word
  { param: 'rel_jja', max: 50,  weight: 3000 },  // nouns described by this word
];

// ML_WEIGHT is the max score a top-ranked ml word can receive.
// Uses Datamuse's actual similarity score (normalized) instead of position.
// Set equal to trigger weight so common words like "tree" for "jungle" rank properly.
const ML_WEIGHT = 8000;

async function getMultiEndpointScores(secretWord) {
  const scores = new Map(); // word → combined score
  const enc = encodeURIComponent(secretWord);

  // First, fetch ml endpoint — uses sqrt-compressed score + position bonus
  // sqrt compression lifts lower-tier words, position bonus breaks within-tier ties
  try {
    const mlResults = await fetchJSON(`https://api.datamuse.com/words?ml=${enc}&max=1000`);
    if (mlResults.length > 0) {
      const maxScore = mlResults[0].score || 1;
      const n = mlResults.length;
      mlResults.forEach((item, idx) => {
        if (!item.word || !item.score) return;
        const w = item.word.toLowerCase();
        if (!/^[a-z]+$/.test(w) || w === secretWord || w.length < 2 || w.length > 20) return;
        const tierScore = ML_WEIGHT * Math.sqrt(item.score / maxScore);
        const posBonus = 1000 * (1.0 - idx / (n + 1));
        scores.set(w, tierScore + posBonus);
      });
    }
  } catch (e) { /* skip */ }
  await delay(80);

  // Then fetch specific relationship endpoints — SUM with existing score
  for (const ep of ENDPOINTS) {
    try {
      const results = await fetchJSON(`https://api.datamuse.com/words?${ep.param}=${enc}&max=${ep.max}`);
      const n = results.length;
      results.forEach((item, idx) => {
        if (!item.word) return;
        const w = item.word.toLowerCase();
        if (!/^[a-z]+$/.test(w) || w === secretWord || w.length < 2 || w.length > 20) return;
        const posScore = ep.weight * (1.0 - idx / (n + 1));
        scores.set(w, (scores.get(w) || 0) + posScore);
      });
    } catch (e) { /* skip failed endpoint */ }
    await delay(80);
  }

  return scores;
}

async function generateAll() {
  const uniqueSecrets = [...new Set(SECRET_WORDS.map(w => w.toLowerCase()))];
  const commonSet = new Set(COMMON_WORDS.map(w => w.toLowerCase()));

  console.log(`Generating ${uniqueSecrets.length} puzzles using multi-endpoint scoring...\n`);

  const puzzles = [];

  for (let i = 0; i < uniqueSecrets.length; i++) {
    const secret = uniqueSecrets[i];
    process.stdout.write(`[${i + 1}/${uniqueSecrets.length}] "${secret}"...`);

    try {
      const scores = await getMultiEndpointScores(secret);

      if (scores.size < 30) {
        console.log(` SKIP (only ${scores.size} words)`);
        continue;
      }

      // Sort by combined score descending → rank list
      const ranked = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(e => e[0]);

      // Hints: only recognizable common words
      const hints = ranked.filter(w => commonSet.has(w) && w.length >= 3 && w.length <= 12);

      puzzles.push({ secret, ranked, hints });

      const top5 = ranked.slice(0, 5).join(', ');
      console.log(` ${ranked.length} words, ${hints.length} hints (top 5: ${top5})`);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
    }
  }

  const output = { puzzles, generated: new Date().toISOString() };
  const outPath = path.join(__dirname, '..', 'data', 'contexto-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output));

  const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(2);
  console.log(`\nDone! ${puzzles.length} puzzles, ${sizeMB} MB`);
}

generateAll().catch(err => { console.error(err); process.exit(1); });
