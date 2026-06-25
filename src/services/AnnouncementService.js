import * as Speech from 'expo-speech';

/**
 * Build the announcement text for a blocker point.
 * Uses customAnnouncement if set; otherwise auto-generates from the point fields.
 */
export function generateAnnouncement(point) {
  if (point.customAnnouncement && point.customAnnouncement.trim()) {
    return point.customAnnouncement.trim();
  }
  const n = point.blockersNeeded;
  const word = n === 1 ? 'blocker' : 'blockers';
  let text = `Approaching ${point.name}. ${n} ${word} needed`;
  if (point.positionDescription && point.positionDescription.trim()) {
    text += ` at ${point.positionDescription.trim()}`;
  }
  return `${text}.`;
}

/** Speak the given text, stopping any current speech first. */
export function announce(text) {
  Speech.stop();
  Speech.speak(text, {
    language: 'en-US',
    rate: 0.85,
    pitch: 1.0,
  });
}

export function stopSpeech() {
  Speech.stop();
}
