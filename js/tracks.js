// Streckendefinitionen. Punkte: [x, z, höhe] in Metern. Die Strecke wird als
// geschlossene Catmull-Rom-Kurve durch diese Punkte gelegt.

export const TRACKS = [
  {
    id: 'coast',
    scale: 1,
    name: 'Sonnenküste',
    desc: 'Fast 4 km entlang der Steilküste: lange Vollgaspassagen, ein Felstunnel und der Hafen im Abendlicht.',
    theme: 'coast',
    width: 15,
    runoff: 4.5,
    laps: 3,
    music: { root: 57, bpm: 116 },
    points: [
      [0, 0, 2], [260, -6, 2], [494, -39, 4], [676, -117, 8], [780, -247, 12],
      [767, -390, 16], [676, -494, 18], [546, -520, 17], [429, -455, 14], [351, -364, 12],
      [234, -338, 11], [130, -416, 13], [52, -546, 17], [-78, -611, 20], [-234, -598, 19],
      [-364, -520, 16], [-429, -390, 13], [-390, -273, 10], [-494, -182, 8], [-624, -156, 7],
      [-728, -78, 5], [-728, 39, 3], [-624, 104, 2], [-442, 91, 2], [-234, 39, 2],
    ],
  },
  {
    id: 'canyon',
    scale: 1,
    name: 'Canyon-Pass',
    desc: 'Steile Anstiege, blinde Kuppen und Kehren unter gewaltigen Felsbögen im roten Gestein.',
    theme: 'canyon',
    width: 14,
    runoff: 4,
    laps: 3,
    music: { root: 52, bpm: 124 },
    points: [
      [0, 0, 0], [270, 15, 6.8], [510, 90, 20.4], [675, 225, 37.4], [720, 405, 51],
      [630, 570, 61.2], [450, 645, 68], [270, 600, 71.4], [165, 480, 64.6], [30, 420, 54.4],
      [-120, 495, 51], [-240, 630, 57.8], [-420, 675, 64.6], [-600, 600, 61.2], [-690, 435, 47.6],
      [-630, 270, 34], [-495, 180, 23.8], [-540, 45, 15.3], [-450, -75, 8.5], [-255, -60, 3.4],
    ],
  },
  {
    id: 'city',
    scale: 1,
    name: 'Neon-City',
    desc: 'Nächtlicher Stadtkurs mit 90-Grad-Ecken, Unterführung und Hochstraße zwischen Neon-Türmen.',
    theme: 'city',
    tires: false,
    width: 13,
    runoff: 3.5,
    laps: 3,
    music: { root: 54, bpm: 128 },
    points: [
      [0, 0, 0], [260, 0, 0], [325, -52, 0], [325, -260, 0], [377, -312, 0],
      [546, -312, 0], [598, -364, 0], [598, -572, 0], [546, -624, 0], [260, -624, 0],
      [195, -572, 0], [195, -468, 0], [143, -416, 0], [-78, -416, 0], [-130, -468, 0],
      [-130, -650, 0], [-182, -702, 0], [-494, -702, 0], [-546, -650, 0], [-546, -390, 0],
      [-494, -338, 0], [-390, -312, 0], [-338, -260, 0], [-338, -156, 0], [-429, -91, 0],
      [-468, -39, 0], [-390, 0, 0],
    ],
  },
  {
    id: 'alps',
    scale: 1,
    name: 'Alpen-Ring',
    desc: 'Verschneiter Hochgebirgskurs mit Lawinengalerie, Skiliften und rutschigen Kehren.',
    theme: 'alps',
    width: 14,
    runoff: 4,
    laps: 3,
    music: { root: 50, bpm: 112 },
    points: [
      [0, 0, 0], [272, 34, 10.2], [510, 0, 23.8], [680, -136, 37.4], [714, -340, 47.6],
      [578, -493, 54.4], [374, -510, 57.8], [255, -391, 51], [102, -340, 44.2], [-34, -442, 47.6],
      [-102, -612, 54.4], [-272, -714, 61.2], [-476, -680, 57.8], [-612, -544, 47.6], [-646, -357, 37.4],
      [-510, -238, 30.6], [-578, -102, 20.4], [-442, 34, 10.2], [-221, 51, 3.4],
    ],
  },
];

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
