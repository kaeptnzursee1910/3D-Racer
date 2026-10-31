// Streckendefinitionen. Punkte: [x, z, höhe] in Metern. Die Strecke wird als
// geschlossene Catmull-Rom-Kurve durch diese Punkte gelegt.

export const TRACKS = [
  {
    id: 'coast',
    scale: 1.3,
    name: 'Sonnenküste',
    desc: 'Schnelle, fließende Kurven entlang der Steilküste bei Sonnenuntergang.',
    theme: 'coast',
    width: 15,
    runoff: 4.5,
    laps: 3,
    music: { root: 57, bpm: 116 },
    points: [
      [0, 0, 2], [120, -10, 3], [230, -40, 6], [300, -110, 10], [295, -205, 13],
      [225, -255, 11], [135, -245, 8], [75, -190, 6], [0, -195, 5], [-80, -255, 7],
      [-180, -265, 10], [-255, -195, 11], [-265, -95, 7], [-225, -15, 4], [-130, 20, 2],
    ],
  },
  {
    id: 'canyon',
    scale: 1.35,
    name: 'Canyon-Pass',
    desc: 'Steile Anstiege, blinde Kuppen und enge Kehren im roten Fels.',
    theme: 'canyon',
    width: 14,
    runoff: 4,
    laps: 3,
    music: { root: 52, bpm: 124 },
    points: [
      [0, 0, 0], [150, 0, 5], [260, 30, 13], [330, 110, 23], [320, 220, 31],
      [240, 285, 35], [140, 265, 30], [80, 190, 22], [-10, 165, 17], [-95, 225, 20],
      [-195, 250, 25], [-275, 190, 21], [-305, 90, 12], [-250, 10, 6], [-140, -20, 2],
    ],
  },
  {
    id: 'city',
    scale: 1.2,
    name: 'Neon-City',
    desc: 'Nächtlicher Stadtkurs mit harten Bremszonen zwischen leuchtenden Türmen.',
    theme: 'city',
    width: 13,
    runoff: 3.5,
    laps: 3,
    music: { root: 54, bpm: 128 },
    points: [
      [-200, 0, 0], [0, 0, 0], [150, 0, 0], [195, -35, 0], [200, -145, 0],
      [230, -190, 0], [300, -205, 0], [335, -245, 0], [325, -325, 0], [280, -360, 0],
      [110, -360, 0], [65, -330, 0], [45, -265, 0], [0, -235, 0], [-120, -235, 0],
      [-170, -265, 0], [-215, -330, 0], [-280, -345, 0], [-325, -300, 0], [-325, -70, 0],
      [-290, -15, 0],
    ],
  },
  {
    id: 'alps',
    scale: 1.35,
    name: 'Alpen-Ring',
    desc: 'Verschneiter Bergkurs mit langen Bergauf-Passagen und rutschigen Kehren.',
    theme: 'alps',
    width: 14,
    runoff: 4,
    laps: 3,
    music: { root: 50, bpm: 112 },
    points: [
      [0, 0, 0], [140, 20, 6], [250, 0, 14], [320, -80, 20], [300, -180, 25],
      [210, -225, 27], [150, -160, 23], [60, -150, 18], [-30, -210, 20], [-130, -235, 23],
      [-220, -170, 18], [-245, -70, 10], [-180, 10, 4], [-90, 22, 1],
    ],
  },
];

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
