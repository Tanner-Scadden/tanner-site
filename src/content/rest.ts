export const REST_FACTS = [
  'ALLEGIANCE',
  'SENTINELS',
  '2× NA CHAMPION',
  'MVP',
  'NA RUNNER-UP',
  '3 TRIPS TO WORLDS',
  '5TH–8TH AT WORLDS',
] as const

export interface Shot {
  readonly size: 'big' | 'mid' | 'full'
  readonly when: string
  readonly title: string
  readonly photo?: string
}

export const SHOTS: ReadonlyArray<Shot> = [
  {
    size: 'big',
    when: 'JUNE 2018 · E3, LOS ANGELES',
    title: 'VALOR SERIES NA CHAMPIONS · MVP',
    photo: 'worlds/valor-series-e3-mvp.jpg',
  },
  {
    size: 'mid',
    when: 'JULY 2018 · LOS ANGELES',
    title: 'AOV WORLD CUP · TOP 8',
    photo: 'worlds/awc-2018-rest.jpg',
  },
  {
    size: 'mid',
    when: 'JUNE 2022 · SINGAPORE',
    title: 'ON STAGE AT ICONS',
    photo: 'worlds/icons-2022-rest.jpg',
  },
  {
    size: 'full',
    when: 'JULY 2018 · LOS ANGELES',
    title: 'ALLEGIANCE AS TEAM NORTH AMERICA',
    photo: 'worlds/awc-2018-team-na.jpg',
  },
  {
    size: 'full',
    when: 'JUNE 2022 · SINGAPORE',
    title: 'WILD RIFT ICONS · SENTINELS',
    photo: 'worlds/wild-rift-icons-sentinels.jpg',
  },
  // Still looking for photos of these:
  { size: 'mid', when: 'NOV 2018', title: 'VALOR SERIES S2 · CHAMPIONS AGAIN' },
  { size: 'mid', when: 'NOV 2018 · HO CHI MINH CITY', title: 'AIC 2018' },
]
