import * as Speech from 'expo-speech';

/**
 * Build the announcement text for a blocker point.
 * Pass distanceMetres to prefix with "In X feet" when announcing from a distance.
 */
export function generateAnnouncement(point, distanceMetres = null) {
  const n = point.blockersNeeded;
  const word = n === 1 ? 'blocker' : 'blockers';
  const position = point.positionDescription && point.positionDescription.trim();
  const custom = point.customAnnouncement && point.customAnnouncement.trim();

  let text = '';

  // Only prefix with distance if the rider is far enough out to matter (~100ft+)
  if (distanceMetres != null && distanceMetres > 30) {
    // Round to nearest 50ft so it sounds natural
    const feet = Math.round((distanceMetres * 3.28084) / 50) * 50;
    text = `In ${feet} feet, `;
  }

  text += `approaching ${point.name}. ${n} ${word} needed`;
  if (position) {
    text += ` at ${position}`;
  }
  text += '.';

  if (custom) {
    text += ` ${custom}`;
  }

  return text;
}

// Cached voice identifier — picked once at first use
let _voiceId = null;

/**
 * Pick the best available English voice on this device.
 * Priority: premium > enhanced > any en-US > default.
 */
async function getBestVoice() {
  if (_voiceId !== undefined && _voiceId !== null) return _voiceId;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const en = voices.filter((v) => v.language && v.language.startsWith('en'));

    const premium = en.find((v) => v.quality === 'Enhanced' || v.identifier?.includes('premium') || v.identifier?.includes('enhanced'));
    const usVoice = en.find((v) => v.language === 'en-US');
    const picked = premium || usVoice || en[0] || null;
    _voiceId = picked ? picked.identifier : null;
  } catch {
    _voiceId = null;
  }
  return _voiceId;
}

/** Speak the given text, interrupting any current speech.
 *  Returns a Promise that resolves when speech finishes (or errors). */
export async function announce(text) {
  try {
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      Speech.stop();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } catch {
    // isSpeakingAsync failed — just proceed to speak
  }

  const voiceId = await getBestVoice().catch(() => null);

  return new Promise((resolve) => {
    Speech.speak(text, {
      language: 'en-US',
      ...(voiceId ? { voice: voiceId } : {}),
      rate: 0.9,
      pitch: 1.0,
      onDone: resolve,
      onError: resolve, // resolve on error so callers don't hang
      onStopped: resolve,
    });
  });
}

export function stopSpeech() {
  Speech.stop();
}
