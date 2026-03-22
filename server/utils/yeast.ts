/**
 * Yeast: A unique ID generator for cache busting.
 * Replicates the logic used in Socket.io/Engine.io.
 */

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'.split('');
const length = alphabet.length;
const map: Record<string, number> = {};

let seed = 0;
let prev: string = '';

alphabet.forEach((char, index) => {
  map[char] = index;
});

/**
 * Encode the given number into a yeast ID.
 *
 * @param {Number} num The number to encode.
 * @returns {String} The encoded yeast ID.
 */
export function encode(num: number): string {
  let encoded = '';

  do {
    encoded = alphabet[num % length] + encoded;
    num = Math.floor(num / length);
  } while (num > 0);

  return encoded;
}

/**
 * Return a unique ID.
 *
 * @returns {String} The unique ID.
 */
export function yeast(): string {
  const now = encode(Date.now());

  if (now !== prev) {
    seed = 0;
    prev = now;
    return now;
  }

  return now + '.' + encode(seed++);
}
