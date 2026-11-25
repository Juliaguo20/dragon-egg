// All story text, clues and card codes. Teachers can edit the clues here.
export const DRAGONS = {
  fire:  {name:'Fire Dragon',  icon:'🔥', gem:'Ember Gem', gemColor:0xff8a1f, body:'#c2432c', wing:'#ffb03a', edge:'#7a1f18', eye:'#fff07a'},
  water: {name:'Water Dragon', icon:'💧', gem:'Tide Gem',  gemColor:0x2f8cff, body:'#2f68c4', wing:'#8ad8ff', edge:'#17366f', eye:'#eaffff'},
  wind:  {name:'Wind Dragon',  icon:'🌪️', gem:'Gale Gem',  gemColor:0x35d46a, body:'#b8c9d8', wing:'#8cf1c4', edge:'#2f9a8a', eye:'#ffd35a'}
};

export const STORY = 'The Storm Dragon has taken the Power Stone. Without it, young dragons cannot grow strong. Find three eggs, power up your dragons and win it back!';

// Hunt order. "code" is printed under each QR card and can be typed if scanning fails.
export const CARDS = [
  {id:'fire-egg', code:'EMBER', type:'egg', dragon:'fire', title:'Fire Egg', place:'Ember Cave',
   whisper:'The Fire Egg whispers…', clue:'I show many words, but I never speak.', hint:'The teacher writes on me.', answer:'Look near the whiteboard.'},
  {id:'fire-gem', code:'SPARK', type:'gem', dragon:'fire', title:'Ember Gem', place:'Ember Cave',
   whisper:'Your Fire Dragon sniffs the air…', clue:'I open and close, but I never walk away.', hint:'You pass through me to enter the room.', answer:'Look near the door.'},
  {id:'water-egg', code:'RIVER', type:'egg', dragon:'water', title:'Water Egg', place:'Frozen Lake',
   whisper:'The Water Egg whispers…', clue:'I let the sunshine in, but keep the rain out.', hint:'You can see outside through me.', answer:'Look near a window.'},
  {id:'water-gem', code:'PEARL', type:'gem', dragon:'water', title:'Tide Gem', place:'Frozen Lake',
   whisper:'Your Water Dragon splashes its tail…', clue:'I have four legs, but I cannot run.', hint:'You sit on me.', answer:'Look under or behind a chair.'},
  {id:'wind-egg', code:'CLOUD', type:'egg', dragon:'wind', title:'Wind Egg', place:'Wind Cliff',
   whisper:'The Wind Egg whispers…', clue:'I have hands, but I cannot clap.', hint:'I tell you when class is over.', answer:'Look near the clock.'},
  {id:'wind-gem', code:'BREEZE', type:'gem', dragon:'wind', title:'Gale Gem', place:'Wind Cliff',
   whisper:'Your Wind Dragon flaps toward…', clue:'Feed me paper. I never say thank you.', hint:'You throw things into me.', answer:'Look beside the trash bin or recycling bin.'}
];

export const EGG = {
  fire:  {find:'Turn around! Tap the rock that glows red.', stuck:'Look for the cracks that light up.',
          hatch:'Rub the screen quickly to warm the egg!', baby:'Achoo! Only black smoke comes out. Your baby dragon has no power yet.'},
  water: {find:'Turn around! Tap rocks until one knocks back.', stuck:'Listen for two knocks and watch for ripples.',
          hatch:'Press and hold the screen to melt the ice.', baby:'Blub… only tiny bubbles. Your baby dragon has no power yet.'},
  wind:  {find:'Turn around! Tap the rock that wobbles in the wind.', stuck:'Watch the grass, then the rocks.',
          hatch:'Draw circles around the egg to make a whirlwind!', baby:'It flaps and flips itself over! Your baby dragon has no power yet.'}
};

export const POWER = {
  fire:  {try:'Find the torch around you and tap it!', done:'WHOOSH! Fire melts ice and lights the dark.'},
  water: {try:'Find the campfire around you and tap it!', done:'SPLASH! Water cools anything hot.'},
  wind:  {try:'Find the dark cloud around you and tap it!', done:'FWOOSH! Wind sweeps clouds away.'}
};

export const ATTACKS = [
  {beats:'fire',  text:'The Storm Dragon puts on ICE ARMOR!', win:'The fire melts the ice armor!', miss:'The ice does not budge. What melts ice?'},
  {beats:'water', text:'The Storm Dragon spits hot LAVA!', win:'The water cools the lava into stone!', miss:'The lava is still burning. What cools it?'},
  {beats:'wind',  text:'The Storm Dragon hides in a DARK CLOUD!', win:'The wind blows the cloud away!', miss:'You still cannot see it. What moves clouds?'}
];
