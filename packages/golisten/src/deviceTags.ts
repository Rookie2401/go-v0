/** Strict device-language policy, kept free of audio and network imports for host capability reporting. */
export const ALBANIAN_DEVICE_TAGS = ['sq-AL', 'sq'] as const;
export const SPANISH_DEVICE_TAGS = ['es-HN', 'es-419', 'es-MX', 'es-ES'] as const;
export const GERMAN_DEVICE_TAGS = ['de-DE', 'de-AT', 'de-CH', 'de'] as const;
export const HINDI_DEVICE_TAGS = ['hi-IN', 'hi'] as const;
export const THAI_DEVICE_TAGS = ['th-TH', 'th'] as const;
export const BOKMAL_DEVICE_TAGS = ['nb-NO', 'nb', 'no-NO', 'no'] as const;
export const NYNORSK_DEVICE_TAGS = ['nn-NO', 'nn'] as const;
export const HEBREW_DEVICE_TAGS = ['he-IL', 'he', 'iw'] as const;
export const GREEK_DEVICE_TAGS = ['el-GR', 'el'] as const;
// No device ships a Latin voice (checked 2026-10-17). An Italian voice is the REGISTERED stand-in for the Ecclesiastical (Church) reading of the
// Vulgate texts the course bundles; the registry's gaps and the card say it is a stand-in. A genuine Latin voice (la, la-VA) is preferred when present.
export const LATIN_DEVICE_TAGS = ['la', 'la-VA', 'it-IT', 'it'] as const;
