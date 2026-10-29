/**
 * Speech on an iPhone. Safari (and the WKWebView of the installed app) lets speech synthesis start only inside a tap; GoReview
 * prepares the voice first (the audio dependencies, the voice list, a short wait for it), so the real `speak()` comes after
 * the tap has ended and can be silently refused. One silent utterance spoken synchronously in the tap unlocks the page's
 * speech for the later, asynchronous one. It also asks for the voice list, which Safari fills in only once asked. Done on
 * every such tap: iOS can lock speech again after an interruption (a call, another app's audio).
 */
interface SpeechWindow {
  speechSynthesis?: { speak(u: unknown): void; getVoices(): unknown[] };
  SpeechSynthesisUtterance?: new (text: string) => { volume: number };
}

/** Call first thing in a tap handler that leads to speech; does nothing where there is no speech synthesis. */
export function unlockSpeech(win: SpeechWindow = globalThis as SpeechWindow): void {
  const synth = win.speechSynthesis;
  const Utterance = win.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return;
  try {
    synth.getVoices();
    const u = new Utterance(' ');
    u.volume = 0;
    synth.speak(u);
  } catch { /* no speech here: the later attempt reports it */ }
}
