// The words of every push alert / alert email, with no database: the notify
// route looks things up and passes plain values in; the dev preview at
// /dev/notifications-preview passes sample values. Keep it pure.

// "@krishna" → "krishna": names read as a person, and the sender line
// ("krishna (via Halfway)") already says who it's from.
export const plain = (n) => String(n).replace(/^@/, '');

export const TEST_ALERT = {
  title: 'Halfway test alert',
  preview: 'If you can read this on your lock screen, alerts will reach you.',
};

// n is the sender's name as stored (may start with "@").
export function friendText(type, n) {
  switch (type) {
    case 'friend_request':
      return { title: `🤝 ${plain(n)} wants to be friends`, preview: 'Tap to accept on Halfway', button: 'Accept request' };
    case 'friend_accepted':
      return { title: `🤝 ${plain(n)} accepted your friend request`, preview: 'You can meet up now', button: 'Meet up' };
    default:
      return {};
  }
}

// One message per meetup event, in three levels: who (the sender name), what
// (title: emoji + action + place) and one short detail line (preview). The
// same words go in the phone notification and the email subject / preview.
//   n       sender name, already plain()
//   place   { name, lat, lng } or null (the proposal for place_proposed)
//   status  the meetup's status
//   away    { mine, theirs }: "1.2 km"-style distances from the place, or null
//   apart   distance between the two people, or null
//   eta     "~5 min" for the sender, or null
// Returns {} for an unknown type (the caller falls back to its own text).
export function meetupText(type, { n, place = null, status, away = {}, apart = null, eta = null }) {
  const join = (...parts) => parts.filter(Boolean).join(' · ');
  const mine = away.mine ?? null;
  const theirs = away.theirs ?? null;

  switch (type) {
    case 'meet_request':
      return { title: `👋 ${n} wants to meet up`, preview: 'Tap to share your location and pick a place', button: 'Share my location' };
    case 'meet_cancelled':
      return { title: `🚫 ${n} cancelled the meetup`, preview: 'You can start a new one any time' };
    case 'meet_accepted':
      return { title: `🎉 ${n} is in`, preview: join(apart && `${apart} apart`, 'pick a place to meet'), button: 'Pick a place' };
    case 'meet_declined':
      return { title: `${n} can't meet right now`, preview: 'Your meetup request was declined' };
    case 'place_proposed':
      return {
        title: `📍 ${n} suggested ${place.name}`,
        preview: join(mine && `${mine} from you`, 'tap to accept'),
        details: [['Place', place.name], ['From you', mine], [`From ${n}`, theirs]],
        map: place,
        button: 'Accept or suggest another',
      };
    case 'place_rejected':
      return { title: `↩️ ${n} passed on that place`, preview: 'Suggest somewhere else' };
    case 'place_agreed':
      return {
        title: `✅ Meeting ${n} at ${place?.name || 'the place'}`,
        preview: join(mine && `${mine} from you`, eta && `${n} is ${eta} away`),
        details: [['Place', place?.name], ['From you', mine], [`${n} arrives in`, eta]],
        map: place,
        button: 'Start navigation',
      };
    case 'almost_there':
      return { title: `🛵 ${n} is almost there`, preview: place ? `A few minutes from ${place.name}` : 'A few minutes away' };
    case 'arrived':
      return { title: `📍 ${n} has arrived`, preview: place ? `At ${place.name}` : 'At the meeting place' };
    case 'meet_ended':
      return { title: `🏁 ${n} ended the meetup`, preview: 'Location sharing has stopped' };
    case 'member_invited':
      return {
        title: `👥 ${n} added you to a meetup`,
        preview: status === 'live' && place ? `Heading to ${place.name}` : 'Tap to join and pick a place together',
        button: 'Join the meetup',
      };
    case 'member_joined':
      return { title: `🎉 ${n} joined the meetup`, preview: 'You can all see each other now' };
    case 'member_left':
      return { title: `👋 ${n} left the meetup`, preview: 'Their location is no longer shared' };
    default:
      return {};
  }
}
