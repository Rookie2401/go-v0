/**
 * What GoLearn can and cannot read, as a small constant the reader-integration screen displays. It states what has
 * been exercised, not what is hoped for (charter principle 14): no reader is listed as supported until the extension
 * has been run against that reader's real pages, and DRM is never bypassed (principle 10).
 */
export type SurfaceStatus = 'works' | 'works-limited' | 'not-supported';

export interface SurfaceInfo {
  id: string;
  name: string;
  status: SurfaceStatus;
  summary: string;
}

export const SURFACES: readonly SurfaceInfo[] = [
  {
    id: 'web-generic',
    name: 'Ordinary web pages',
    status: 'works',
    summary: 'Select a word or a short phrase; GoLearn reads the selection and its sentence from the page you are looking at, only after your gesture.',
  },
  {
    id: 'web-frames',
    name: 'Cross-origin frames',
    status: 'works-limited',
    summary: 'The browser does not let GoLearn read the sentence inside another site’s frame; from the context menu it can look up the selected word alone.',
  },
  {
    id: 'controlled-reader',
    name: 'The controlled reader (DRM-free EPUB and text files you own)',
    status: 'works',
    summary: 'A reader that opens DRM-free files from your own device. It refuses protected files and is never a way to read protected purchases.',
  },
  {
    id: 'kindle',
    name: 'Kindle',
    status: 'not-supported',
    summary: 'Not supported. Kindle shows pages as images, so there is nothing to select. You can copy a word or a sentence and paste it into GoLearn, under Kindle’s own copy limits.',
  },
  {
    id: 'other-ebook',
    name: 'Other ebook readers (Kobo, Play Books, …)',
    status: 'not-supported',
    summary: 'Not supported yet. Each needs its own terms review and a check against its real pages first; GoLearn does not claim compatibility before that.',
  },
];

export const STATUS_LABEL: Record<SurfaceStatus, string> = {
  works: 'works',
  'works-limited': 'works, with limits',
  'not-supported': 'not supported',
};

/** The permissions the extension asks for, each with the reason, as the manifest declares them. */
export const PERMISSIONS: ReadonlyArray<{ name: string; why: string }> = [
  { name: 'activeTab', why: 'lets GoLearn read the page you are on only after you press its toolbar button, the keyboard shortcut or the right-click item; it expires when you leave the page.' },
  { name: 'scripting', why: 'puts the lookup card on that page after your gesture. Nothing is declared to run on pages by itself.' },
  { name: 'storage', why: 'keeps your settings, your sign-in on this device and the local record of what you looked up.' },
  { name: 'contextMenus', why: 'adds “Look up with GoLearn” to the right-click menu for a selection.' },
  { name: 'alarms', why: 'wakes the extension every few minutes to send what you looked up to your own account, when you are signed in; nothing else is scheduled.' },
];

export const SHORTCUT = 'Alt+Shift+G';
