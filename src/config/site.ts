export const site = {
  name: 'Хунмэнг',
  tagline: 'новеллы',
  latinName: 'Hunmeng Novels',
  description: 'Хунмэнг — новеллы на русском. Истории для неспешного чтения.',
  // Основной адрес сайта; используется при сборке, если SITE_URL не задан.
  url: 'https://hunmeng.net',
  // Пустая строка: кнопки сообщения об ошибке в главах не показываются.
  // Позже можно указать https://t.me/YourBot?start=report_{novel}_{chapter}
  reportUrl: '',
  // Reader accounts are disabled until data localization and availability are addressed.
  features: { accounts: false },
  // Локальные версии логотипа для светлой/сепии и тёмной темы.
  logo: {
    light: '/images/logo-light.png',
    dark: '/images/logo-dark.png',
  },
  colors: {
    background: '#faf8f3',
    surface: '#fffdf9',
    text: '#262c28',
    muted: '#626a63',
    accent: '#365b49',
    accentSoft: '#e7ede7',
    border: '#dddcd3',
    darkBackground: '#191e1b',
    darkSurface: '#222a25',
    darkText: '#e8e8df',
    darkMuted: '#b2bcb2',
    darkAccent: '#abcdb5',
    darkBorder: '#455148',
    sepiaBackground: '#efe3cd',
    sepiaSurface: '#f6ecd9',
    sepiaText: '#443a2c',
    sepiaMuted: '#6c5e4b',
    sepiaAccent: '#66502f',
    sepiaBorder: '#cdbfa6',
  },
} as const;
export const shelves = {
  reading: 'Читаю',
  later: 'Прочитать позже',
  completed: 'Прочитано',
  dropped: 'Брошено',
} as const;
export type Shelf = keyof typeof shelves;
