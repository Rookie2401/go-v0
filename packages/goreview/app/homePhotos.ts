/** Original photographs shipped with GoReview. See THIRD-PARTY-NOTICES.md for the source files and adaptations. */
interface HomePhoto {
  id: string;
  image: string;
  place: string;
  author: string;
  source: string;
  license: string;
  licenseUrl: string;
  mobilePosition: string;
  desktopPosition: string;
}

const ccBySa4 = { license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
const ccBy4 = { license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' };
const cc0 = { license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };

const oslo: HomePhoto = {
  id: 'oslo',
  image: new URL('./photos/oslo.webp', import.meta.url).href,
  place: 'Norwegian Folk Museum, Oslo',
  author: 'P. Hughes',
  source: 'https://commons.wikimedia.org/wiki/File:Norway_Folk_Museum_-_Street_scene.jpg',
  ...ccBy4,
  mobilePosition: 'center 54%',
  desktopPosition: 'center 54%',
};

const jerusalem: HomePhoto = {
  id: 'jerusalem',
  image: new URL('./photos/jerusalem.webp', import.meta.url).href,
  place: 'Jerusalem',
  author: 'Zairon',
  source: 'https://commons.wikimedia.org/wiki/File:Jerusalem_Tempelberg_1.JPG',
  ...ccBySa4,
  mobilePosition: '0 24%',
  desktopPosition: 'center 21%',
};

const photos: Readonly<Record<string, HomePhoto>> = {
  sq: {
    id: 'berat',
    image: new URL('./photos/berat.webp', import.meta.url).href,
    place: 'Mangalem, Berat',
    author: 'Wolfgang Sauber',
    source: 'https://commons.wikimedia.org/wiki/File:Berat_-_Mangalem_4b_H%C3%A4user.jpg',
    ...ccBySa4,
    mobilePosition: 'center 45%',
    desktopPosition: 'center 45%',
  },
  es: {
    id: 'valle-de-angeles',
    image: new URL('./photos/valle-de-angeles.webp', import.meta.url).href,
    place: 'Valle de Ángeles, Honduras',
    author: 'Luis Alfredo Romero',
    source: 'https://commons.wikimedia.org/wiki/File:Valle_de_Angeles_street.jpg',
    ...ccBy4,
    mobilePosition: 'center 48%',
    desktopPosition: 'center 51%',
  },
  de: {
    id: 'rothenburg',
    image: new URL('./photos/rothenburg.webp', import.meta.url).href,
    place: 'Rothenburg ob der Tauber',
    author: 'Roman Kraft',
    source: 'https://commons.wikimedia.org/wiki/File:Rothenburg_ob_der_Tauber,_Germany.jpg',
    ...cc0,
    mobilePosition: 'center 49%',
    desktopPosition: 'center 48%',
  },
  hi: {
    id: 'varanasi',
    image: new URL('./photos/varanasi.webp', import.meta.url).href,
    place: 'Scindia Ghat, Varanasi',
    author: 'travelwayoflife',
    source: 'https://commons.wikimedia.org/wiki/File:Scindia_Ghat_in_morning,_Varanasi,_Uttar_Pradesh,_India_(2012).jpg',
    license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    mobilePosition: 'center 44%',
    desktopPosition: 'center 36%',
  },
  th: {
    id: 'bangkok',
    image: new URL('./photos/bangkok.webp', import.meta.url).href,
    place: 'Wat Phra Kaew, Bangkok',
    author: 'Nawit science',
    source: 'https://commons.wikimedia.org/wiki/File:Temple_of_the_Emerald_Buddha.jpg',
    ...ccBySa4,
    mobilePosition: 'center 48%',
    desktopPosition: 'center 43%',
  },
  nb: oslo,
  nn: oslo,
  la: {
    id: 'roman-forum',
    image: new URL('./photos/roman-forum.webp', import.meta.url).href,
    place: 'Roman Forum, Rome',
    author: 'Joseolgon',
    source: 'https://commons.wikimedia.org/wiki/File:Forum_Romanum_Rome.jpg',
    ...ccBy4,
    mobilePosition: 'center 43%',
    desktopPosition: 'center 40%',
  },
  he: jerusalem,
  // Biblical Aramaic (Ezra's letters concern the Temple in Jerusalem): the same credited photograph until one of its own is chosen.
  arc: jerusalem,
  el: {
    id: 'athens',
    image: new URL('./photos/athens.webp', import.meta.url).href,
    place: 'Acropolis, Athens',
    author: 'Stymphal',
    source: 'https://commons.wikimedia.org/wiki/File:Acropolis_of_Athens_at_dusk.jpg',
    ...ccBySa4,
    mobilePosition: 'center 39%',
    desktopPosition: 'center 35%',
  },
};

export function homePhoto(languageId: string): HomePhoto | undefined {
  const language = languageId.split('-')[0].toLowerCase();
  return Object.hasOwn(photos, language) ? photos[language] : undefined;
}
