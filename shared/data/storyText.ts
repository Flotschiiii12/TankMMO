/**
 * The story of the Great Drought, as dialogue scenes tied to the story quests (cloud run 3).
 * Each chapter has six short scenes: they open when a quest is accepted or handed in. Choices only change flavour text, never rewards.
 * Format: lines are [speaker, English, German]; German uses the informal "du".
 */
export type Line = [who: string, en: string, de: string];
export type Choice = [en: string, de: string, replyEn: string, replyDe: string];
export interface SceneText { q: number; on: 'accept' | 'claim'; lines: Line[]; choices?: Choice[] }
export interface ChapterText { summary: [string, string]; scenes: SceneText[] }

export const SPEAKERS: Record<string, { name: string; icon: string }> = {
  varga: { name: 'Commander Varga', icon: 'quests' },
  mira: { name: 'Mira', icon: 'anvil' },
  dunmore: { name: 'Dunmore', icon: 'radar' },
  ael: { name: 'Sister Ael', icon: 'repair' },
  rook: { name: 'Rook', icon: 'gate_key' },
  you: { name: 'You', icon: 'garage' },
  narrator: { name: '', icon: 'daynight' },
};

export const STORY_TEXT: Record<number, ChapterText> = {
  1: {
    summary: ['The rivers have been dry for three years. Commander Varga sends you to guard the last pump at Lighthouse Cape and to find out who is stealing the water.', 'Seit drei Jahren sind die Flüsse trocken. Kommandantin Varga schickt dich zum Leuchtturmkap, um die letzte Pumpe zu bewachen und herauszufinden, wer das Wasser stiehlt.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['varga', 'Welcome to Gravel Bay, driver. Three dry years. The tide is all we have left, and it tastes of rust.', 'Willkommen in der Kiesbucht, Fahrer. Drei trockene Jahre. Die Flut ist alles, was uns bleibt, und sie schmeckt nach Rost.'],
        ['varga', 'Drive out to the Dune Path and show your face. The scavengers there must learn that someone is watching the coast.', 'Fahr hinaus zum Dünenpfad und zeig dich. Die Plünderer dort sollen merken, dass jemand die Küste im Auge hat.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['mira', 'Nice shooting. Those buggies were stripping the old pumping station for scrap.', 'Schön geschossen. Diese Buggys haben die alte Pumpstation für Schrott ausgeschlachtet.'],
        ['mira', 'I am Mira. I patch tanks, you bring me parts. Deal?', 'Ich bin Mira. Ich flicke Panzer, du bringst mir Teile. Abgemacht?'],
      ], choices: [
        ['Deal.', 'Abgemacht.', 'Good. The first patch is on the house.', 'Gut. Der erste Flicken geht aufs Haus.'],
        ['What are you fixing?', 'Was reparierst du?', 'The pumps. Every one of them died in the same week.', 'Die Pumpen. Alle sind in derselben Woche ausgefallen.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['dunmore', 'Tracks lead north, toward the Salt Marsh. Heavy treads, and a tank trailer.', 'Spuren führen nach Norden, zur Salzmarsch. Schwere Ketten und ein Tankanhänger.'],
        ['dunmore', 'Somebody hauls water out of this valley in the dark.', 'Jemand schafft im Dunkeln Wasser aus diesem Tal.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'That cannon is older than I am. Craft something better in the safe zone, then upgrade it.', 'Diese Kanone ist älter als ich. Bau in der Sicherheitszone etwas Besseres und rüste es auf.'],
        ['mira', 'Steel loves patience.', 'Stahl liebt Geduld.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['varga', 'You made it to the Cape. The lighthouse pump is the last one still turning.', 'Du hast es bis zum Kap geschafft. Die Leuchtturmpumpe ist die letzte, die sich noch dreht.'],
        ['varga', 'The Iron Warden sits on top of it. Take him down.', 'Der Eiserne Wächter hockt darauf. Schalte ihn aus.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['varga', 'The Warden is scrap. The pump runs again.', 'Der Wächter ist Schrott. Die Pumpe läuft wieder.'],
        ['dunmore', 'But look: a Crown seal on his armor. This was never a scavenger job.', 'Aber sieh mal: ein Kronensiegel auf seiner Panzerung. Das war nie ein Plünderer-Job.'],
        ['narrator', 'A thin trickle of clear water runs into the harbor. For the first time in years, people cheer.', 'Ein dünnes Rinnsal klaren Wassers fließt in den Hafen. Zum ersten Mal seit Jahren jubeln die Leute.'],
      ], choices: [
        ['Who is the Crown?', 'Wer ist die Krone?', 'Whoever pulls the strings. We follow the seal.', 'Wer auch immer die Fäden zieht. Wir folgen dem Siegel.'],
      ] },
    ],
  },
  2: {
    summary: ['The Crossing is a dry river bed full of armed trucks. Under the old depot lie the plans of the water network, and the Crown wants them.', 'Die Überquerung ist ein trockenes Flussbett voller bewaffneter Trucks. Im alten Depot liegen die Pläne des Wassernetzes, und die Krone will sie haben.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['varga', 'The Crossing used to be a river. Now it is a highway for convoys that answer to nobody.', 'Die Überquerung war einmal ein Fluss. Jetzt ist sie eine Straße für Konvois, die niemandem gehorchen.'],
        ['varga', 'Get to Green Crossing and see who is driving them.', 'Fahr zur Grünen Kreuzung und finde heraus, wer sie fährt.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['dunmore', 'Gunner trucks, welded armor, Crown paint under the dust. They are guarding something.', 'Kanonentrucks, geschweißte Panzerung, Kronenlack unter dem Staub. Die Trucks bewachen etwas.'],
        ['you', 'Then we find out what.', 'Dann finden wir heraus, was.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['mira', 'The old river delta is a graveyard of pumps. Salvage what you can, the pipes still hold copper.', 'Das alte Flussdelta ist ein Pumpenfriedhof. Berge, was du kannst, die Rohre enthalten noch Kupfer.'],
      ], choices: [
        ['Copper for what?', 'Kupfer wofür?', 'Wiring for the relay stations. No power, no pumps.', 'Leitungen für die Relaisstationen. Ohne Strom keine Pumpen.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'The trucks hit hard. Armor first, then guns. A dead hero pumps no water.', 'Die Trucks schlagen hart zu. Erst Panzerung, dann Waffen. Ein toter Held pumpt kein Wasser.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['rook', 'Hold your fire! I am no Crown dog. Not any more.', 'Nicht schießen! Ich bin kein Kronenhund. Nicht mehr.'],
        ['rook', 'I drew the depot plans. They are in the Rusted Depot, behind a locked door and a very angry warden.', 'Ich habe die Pläne des Depots gezeichnet. Die Blätter liegen im Rostigen Depot, hinter einer verschlossenen Tür und einem sehr wütenden Aufseher.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['rook', 'You got them! The whole network on one sheet. Every spring, every valve.', 'Du hast sie! Das ganze Netz auf einem Blatt. Jede Quelle, jedes Ventil.'],
        ['varga', 'And now the Crown knows we have them. Expect company.', 'Und jetzt weiß die Krone, dass wir sie haben. Rechne mit Besuch.'],
      ], choices: [
        ['Can we trust Rook?', 'Können wir Rook trauen?', 'Nobody asked me for trust. I am asking you for a chance.', 'Niemand hat mich um Vertrauen gebeten. Ich bitte dich um eine Chance.'],
      ] },
    ],
  },
  3: {
    summary: ['Red Canyon: artillery batteries shell the roads to the dry reservoir. Dunmore guides you through the shell craters to open the valve of the Quarry Hold.', 'Rote Schlucht: Artillerie beschießt die Straßen zum trockenen Stausee. Dunmore führt dich durch die Einschlagkrater zum Ventil der Steinbruchfeste.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['dunmore', 'Red Canyon. The reservoir lies behind it, dry as a bone, and the batteries up there shell every road.', 'Rote Schlucht. Dahinter liegt der Stausee, knochentrocken, und die Batterien da oben beschießen jede Straße.'],
        ['dunmore', 'Watch the ground. A red ring means: leave now.', 'Achte auf den Boden. Ein roter Ring heißt: sofort weg.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['dunmore', 'Not bad. You dodged like a goat on a cliff.', 'Nicht übel. Du bist ausgewichen wie eine Ziege am Abhang.'],
      ], choices: [
        ['Keep the compliments.', 'Spar dir die Komplimente.', 'Then keep the speed. Next ridge in five minutes.', 'Dann behalte das Tempo. Nächster Grat in fünf Minuten.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['mira', 'Your hull is full of dents. Bring me ore and I weld something cleverer than plates.', 'Dein Rumpf ist voller Beulen. Bring mir Erz, und ich schweiße etwas Klügeres als Platten.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'Reactive armor, sloped plates, cage armor against shaped charges. Pick your poison.', 'Reaktivpanzerung, Schrägplatten, Gitterpanzerung gegen Hohlladungen. Such dir dein Gift aus.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['rook', 'The valve of the Quarry Hold opens the whole reservoir. The hold is a fortress, mind you.', 'Das Ventil der Steinbruchfeste öffnet den ganzen Stausee. Die Feste ist übrigens eine Festung.'],
        ['varga', 'Take a party. Nobody takes a hold alone.', 'Nimm eine Gruppe mit. Niemand nimmt eine Feste allein.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['narrator', 'The valve groans. Brown water pours into the cracked basin, then clearer, then clear.', 'Das Ventil ächzt. Braunes Wasser strömt in das rissige Becken, dann klareres, dann klares.'],
        ['varga', 'One reservoir. One third of the coast saved. The Crown will answer in the north.', 'Ein Stausee. Ein Drittel der Küste gerettet. Die Krone wird im Norden antworten.'],
      ] },
    ],
  },
  4: {
    summary: ['The glaciers are the last great store of water, and the Crown guards them with frost-adapted machines. Sister Ael asks you to free the Frozen Foundry.', 'Die Gletscher sind der letzte große Wasserspeicher, und die Krone bewacht sie mit kälteangepassten Maschinen. Schwester Ael bittet dich, die Gefrorene Gießerei zu befreien.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['ael', 'I keep the springs of the north, or what is left of them. Welcome to the Frost Border, driver.', 'Ich hüte die Quellen des Nordens, oder was von ihnen übrig ist. Willkommen an der Frostgrenze, Fahrer.'],
        ['ael', 'The ice melts too slowly to feed anyone. Someone is holding it back.', 'Das Eis schmilzt zu langsam, um jemanden zu versorgen. Jemand hält es zurück.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['ael', 'Frost gliders. The Crown built them for the cold. Their treads sing on the ice, hear that?', 'Frostgleiter. Die Krone hat die Dinger für die Kälte gebaut. Die Ketten singen auf dem Eis, hörst du das?'],
      ], choices: [
        ['I hear it.', 'Ich höre es.', 'Then you will hear them before they hear you.', 'Dann hörst du sie, bevor sie dich hören.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['dunmore', 'Whiteout coming. Stay close to the markers I left or you will drive in circles.', 'Ein Schneesturm zieht auf. Bleib an den Markierungen, die ich gesetzt habe, sonst fährst du im Kreis.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'Cold makes steel brittle. Upgrade carefully, and do not trust the +10 chance when your fingers are blue.', 'Kälte macht Stahl spröde. Rüste vorsichtig auf und vertrau dem +10 nicht, wenn deine Finger blau sind.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['ael', 'The Frozen Foundry holds the heating coils that melt the ice. The Crown shut them off.', 'Die Gefrorene Gießerei hält die Heizspulen, die das Eis schmelzen. Die Krone hat sie abgeschaltet.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['ael', 'The coils glow again. Listen, the glacier is waking up.', 'Die Spulen glühen wieder. Hör, der Gletscher erwacht.'],
        ['varga', 'Meltwater down the north valleys by spring. Good work. The highway is next.', 'Schmelzwasser in den nördlichen Tälern bis zum Frühling. Gute Arbeit. Als Nächstes kommt die Fernstraße.'],
      ], choices: [
        ['Is the north safe now?', 'Ist der Norden jetzt sicher?', 'Safe is a word for people with more water than I have seen.', 'Sicher ist ein Wort für Leute mit mehr Wasser, als ich je gesehen habe.'],
      ] },
    ],
  },
  5: {
    summary: ['The Old Highway links all regions. A World Boss patrols it, and the glowworm swamp behind it hides the Crown\'s pump control. Rook shows you the way.', 'Die Alte Fernstraße verbindet alle Regionen. Ein Weltboss patrouilliert dort, und der Glühwurmsumpf dahinter verbirgt die Pumpensteuerung der Krone. Rook zeigt dir den Weg.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['varga', 'The Old Highway. Everything we need passes over it, and everything the Crown steals leaves over it.', 'Die Alte Fernstraße. Alles, was wir brauchen, rollt darüber, und alles, was die Krone stiehlt, verlässt uns darüber.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['rook', 'Muck crawlers. They live in the glowworm swamp and come out when the highway shakes.', 'Morastkriecher. Die leben im Glühwurmsumpf und kommen heraus, wenn die Fernstraße bebt.'],
        ['rook', 'The shaking is the Behemoth. You will meet him.', 'Das Beben ist der Moloch. Du wirst ihn treffen.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['narrator', 'The swamp glows green at night. Spores drift like slow snow between the wrecks.', 'Der Sumpf leuchtet nachts grün. Sporen treiben wie langsamer Schnee zwischen den Wracks.'],
      ], choices: [
        ['Beautiful.', 'Wunderschön.', 'And poisonous. Do not stay still for long.', 'Und giftig. Bleib nicht lange stehen.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'A legend is coming and you drive a toy. Come to the workshop, I will show you what titanium can do.', 'Eine Legende naht und du fährst ein Spielzeug. Komm in die Werkstatt, ich zeige dir, was Titan kann.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['dunmore', 'The Behemoth is on the move. Ground shakes, birds leave. This is the one.', 'Der Moloch ist unterwegs. Der Boden bebt, die Vögel fliehen. Das ist er.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['rook', 'Down! The Behemoth, the Crown\'s old guard dog. And it carried this: the control key for the swamp pumps.', 'Erledigt! Der Moloch, der alte Wachhund der Krone. Und er trug das hier: den Steuerschlüssel für die Sumpfpumpen.'],
        ['varga', 'The swamp wakes, the highway is ours. The borderlands will want a say now.', 'Der Sumpf erwacht, die Fernstraße gehört uns. Das Grenzland wird jetzt mitreden wollen.'],
      ] },
    ],
  },
  6: {
    summary: ['In the Borderlands the three unions fight each other over the last wells. You carry a truce proposal into the Glowworm Sump, where the wells meet.', 'Im Grenzland bekämpfen sich die drei Bünde um die letzten Brunnen. Du trägst einen Waffenstillstandsvorschlag in die Glühwurm-Senke, wo die Brunnen zusammenlaufen.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['varga', 'The Borderlands. Coastal, Highland, Steppe: all three sit on one aquifer and all three want it.', 'Das Grenzland. Küste, Hochland, Steppe: alle drei sitzen auf einem Grundwasserleiter und alle drei wollen ihn.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['dunmore', 'Our own people shoot at each other here. It is a mess you do not want to be in.', 'Hier schießen unsere eigenen Leute aufeinander. Ein Schlamassel, in dem du nicht sein willst.'],
      ], choices: [
        ['I will not take sides.', 'Ich ergreife keine Partei.', 'Good. Then both sides can talk to you.', 'Gut. Dann können beide Seiten mit dir reden.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['ael', 'The wells at the Customs Station are guarded by all three flags at once. Do not step on a flag.', 'Die Brunnen an der Zollstation werden von allen drei Fahnen gleichzeitig bewacht. Tritt auf keine Fahne.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'In the border zone drivers shoot drivers. Your armor must outlast their patience.', 'In der Grenzzone schießen Fahrer auf Fahrer. Deine Panzerung muss ihre Geduld überdauern.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['rook', 'All the wells connect in the Glowworm Sump, under the swamp. Whoever holds it holds the water.', 'Alle Brunnen laufen in der Glühwurm-Senke zusammen, unter dem Sumpf. Wer sie hält, hält das Wasser.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['varga', 'The Sump Matriarch is gone and the three flags hang on one pole. A truce. It will not last, but it will do for now.', 'Die Senken-Matriarchin ist weg und die drei Fahnen hängen an einem Mast. Ein Waffenstillstand. Er wird nicht halten, aber er reicht fürs Erste.'],
        ['ael', 'Water for everyone, for one season. Then we must find the source.', 'Wasser für alle, für eine Saison. Dann müssen wir die Quelle finden.'],
      ], choices: [
        ['Where is the source?', 'Wo ist die Quelle?', 'In the ruins of Vaelmar. The old city knew.', 'In den Ruinen von Vaelmar. Die alte Stadt wusste es.'],
      ] },
    ],
  },
  7: {
    summary: ['Ruins of Vaelmar: a fallen city whose archives describe the ancient spring network. Mechs guard the vault, a storm leviathan waits at the coast.', 'Ruinen von Vaelmar: eine gefallene Stadt, deren Archive das uralte Quellennetz beschreiben. Mechs bewachen den Tresor, an der Küste wartet ein Sturm-Leviathan.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['rook', 'Vaelmar. I worked here before the drought. I know where the archive sleeps.', 'Vaelmar. Ich habe hier vor der Dürre gearbeitet. Ich weiß, wo das Archiv schläft.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['rook', 'Flak wagons on the rooftops. The city used to fall silent at night. Now it is a gun nest.', 'Flak-Wagen auf den Dächern. Nachts war die Stadt früher still. Jetzt ist sie ein Geschützhorst.'],
      ], choices: [
        ['What happened here?', 'Was ist hier passiert?', 'The wells failed. People left. Machines stayed.', 'Die Brunnen versiegten. Die Menschen gingen. Die Maschinen blieben.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['dunmore', 'This tower has an intact antenna. Climb to the plaza, let me catch the old signals.', 'Dieser Turm hat noch eine intakte Antenne. Fahr zum Platz hinauf, ich fange die alten Signale ein.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'Elite machines ahead. Bring a railgun if you have one, and stop looking at me like that, it is not a toy either.', 'Elite-Maschinen voraus. Nimm eine Schienenkanone mit, falls du eine hast, und sieh mich nicht so an, sie ist auch kein Spielzeug.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['rook', 'The archive vault is open. The plans show it: every spring comes from one place, the Storm Coast, where the old mountain drains into the sea.', 'Der Archivtresor ist offen. Die Pläne zeigen es: Jede Quelle kommt von einem Ort, der Sturmküste, wo der alte Berg ins Meer abfließt.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['varga', 'The Storm Coast Leviathan guards the outflow. We go there next.', 'Der Sturmküsten-Leviathan bewacht den Abfluss. Dorthin gehen wir als Nächstes.'],
        ['ael', 'The mountain is not dead. It only sleeps under a cap of iron.', 'Der Berg ist nicht tot. Er schläft nur unter einer Kappe aus Eisen.'],
      ] },
    ],
  },
  8: {
    summary: ['The Obsidian Desert and the Storm Coast: glass dunes, silica storms and lightning cliffs. The Leviathan guards the outflow of the mountain.', 'Die Obsidianwüste und die Sturmküste: Glasdünen, Silikatstürme und Blitzklippen. Der Leviathan bewacht den Abfluss des Berges.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['dunmore', 'Obsidian Sands. The glass cuts tracks to shreds, so keep your speed up and your hull repaired.', 'Obsidiansande. Das Glas zerschneidet Ketten, halte also das Tempo hoch und den Rumpf in Schuss.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['dunmore', 'Sand raiders. They skim like hovercraft over the dunes. Fast, fragile, and rude.', 'Sandräuber. Die gleiten wie Luftkissenboote über die Dünen. Schnell, zerbrechlich und unhöflich.'],
      ], choices: [
        ['Rude?', 'Unhöflich?', 'They shoot first and say hello with the explosion.', 'Die schießen zuerst und sagen mit der Explosion Hallo.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['ael', 'Look at the horizon: glass towers. They are memorials of the first drought. The glass remembers.', 'Sieh zum Horizont: Glastürme. Es sind Mahnmale der ersten Dürre. Das Glas erinnert sich.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'The coast ahead has lightning. Insulate your engine and pray to whatever you pray to.', 'Die Küste voraus hat Blitze. Isoliere deinen Motor und bete zu wem auch immer du betest.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['rook', 'The Leviathan Dreadnought sits at the outflow, a floating fortress that breathes thunder.', 'Der Leviathan-Dreadnought sitzt am Abfluss, eine schwimmende Festung, die Donner atmet.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['narrator', 'The Leviathan sinks into the surf and the cliffs go quiet. Then, far below, you hear water.', 'Der Leviathan versinkt in der Brandung und die Klippen werden still. Dann hörst du tief unten Wasser.'],
        ['varga', 'The outflow runs free. The iron cap on the mountain is all that is left between us and a river.', 'Der Abfluss läuft frei. Die Eisenkappe auf dem Berg ist alles, was uns noch von einem Fluss trennt.'],
      ], choices: [
        ['Then we remove it.', 'Dann entfernen wir sie.', 'The Crown calls it the Iron Crown. We call it the last lid.', 'Die Krone nennt sie die Eiserne Krone. Wir nennen sie den letzten Deckel.'],
      ] },
    ],
  },
  9: {
    summary: ['The Iron Crown is a ring of foundries around the mountain that holds the water back. Inside waits the Vault, and its Sovereign.', 'Die Eiserne Krone ist ein Ring aus Gießereien um den Berg, der das Wasser zurückhält. Im Inneren warten der Tresor und sein Herrscher.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['varga', 'The Iron Crown. Ring foundries, bunker gates, and inside the mountain the Vault. This is where the water is held.', 'Die Eiserne Krone. Ringgießereien, Bunkertore und im Inneren des Berges der Tresor. Hier wird das Wasser festgehalten.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['rook', 'Lava trucks. The foundry fires never went out, they burn the last coal to keep the cap hot.', 'Lavatrucks. Die Gießereifeuer sind nie erloschen, sie verbrennen die letzte Kohle, um die Kappe heiß zu halten.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['dunmore', 'There: the main gate. One way in. One way out, if we are lucky.', 'Da: das Haupttor. Ein Weg hinein. Ein Weg hinaus, wenn wir Glück haben.'],
      ], choices: [
        ['I am ready.', 'Ich bin bereit.', 'Nobody is. Go anyway.', 'Niemand ist es. Fahr trotzdem.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'Final workshop visit. Everything you have: armor, engine, guns. After this I cannot help any more.', 'Letzter Werkstattbesuch. Alles, was du hast: Panzerung, Motor, Waffen. Danach kann ich nicht mehr helfen.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['ael', 'The mountain trembles. I can feel it in my feet. Hurry.', 'Der Berg bebt. Ich spüre es in den Füßen. Beeil dich.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['rook', 'The Vault Sovereign falls and the cap cracks. Hear that? That is a river.', 'Der Tresorherrscher fällt und die Kappe bricht. Hörst du das? Das ist ein Fluss.'],
        ['narrator', 'Steam and white water burst from the mountain. Beyond the smoke, a valley burns red: the caldera.', 'Dampf und Schaum brechen aus dem Berg. Hinter dem Rauch glüht ein Tal rot: die Caldera.'],
      ] },
    ],
  },
  10: {
    summary: ['The Burning Valley: the heart of the mountain, where the water meets fire. Whatever you do here decides who controls the springs.', 'Das Brennende Tal: das Herz des Berges, wo Wasser auf Feuer trifft. Was du hier tust, entscheidet, wer die Quellen kontrolliert.'],
    scenes: [
      { q: 1, on: 'accept', lines: [
        ['varga', 'The Burning Valley. The legends say the first spring rose here. The Crown never dared come this deep.', 'Das Brennende Tal. Der Legende nach entsprang hier die erste Quelle. So tief hat sich die Krone nie getraut.'],
      ] },
      { q: 2, on: 'claim', lines: [
        ['dunmore', 'Everything here is armored in lava crust. Your cannons need more than they ever did.', 'Hier ist alles in Lavakruste gepanzert. Deine Kanonen müssen mehr leisten als je zuvor.'],
      ] },
      { q: 4, on: 'claim', lines: [
        ['ael', 'Listen. The spring is singing. A song with no words, only water.', 'Hör zu. Die Quelle singt. Ein Lied ohne Worte, nur Wasser.'],
      ], choices: [
        ['What does it sing?', 'Was singt sie?', 'That it wants to flow. That is all springs ever want.', 'Dass sie fließen will. Das ist alles, was Quellen je wollen.'],
      ] },
      { q: 6, on: 'accept', lines: [
        ['mira', 'I made you something for the road. Not a weapon. A wrench. For the valves.', 'Ich habe dir etwas für den Weg gebaut. Keine Waffe. Einen Schraubenschlüssel. Für die Ventile.'],
      ] },
      { q: 8, on: 'claim', lines: [
        ['rook', 'I was a Crown engineer once. I opened the first valve. Let me close the last one.', 'Ich war einmal Kronen-Ingenieur. Ich habe das erste Ventil geöffnet. Lass mich das letzte schließen.'],
      ] },
      { q: 10, on: 'claim', lines: [
        ['narrator', 'The last valve turns. Water thunders through the valley, steaming, singing, free.', 'Das letzte Ventil dreht sich. Wasser donnert durch das Tal, dampfend, singend, frei.'],
        ['varga', 'Three dry years are over. Thanks, driver. The coast, the highlands and the steppe will drink tonight.', 'Drei trockene Jahre sind vorbei. Danke, Fahrer. Küste, Hochland und Steppe werden heute Nacht trinken.'],
        ['ael', 'And whoever tries to hold the water back again will meet you first.', 'Und wer das Wasser wieder zurückhalten will, trifft zuerst auf dich.'],
      ], choices: [
        ['The water belongs to everyone.', 'Das Wasser gehört allen.', 'Then we will keep it that way.', 'Dann sorgen wir dafür, dass es so bleibt.'],
        ['I want to see the sea again.', 'Ich will das Meer wiedersehen.', 'Then drive. The road is open.', 'Dann fahr. Die Straße ist frei.'],
      ] },
    ],
  },
};
