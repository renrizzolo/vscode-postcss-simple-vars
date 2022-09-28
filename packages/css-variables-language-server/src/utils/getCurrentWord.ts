import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver/node';
import { indexToPosition } from './indexToPosition';

export function getCurrentWord(document: TextDocument, offset: number): string {
  let left = offset - 1;
  let right = offset + 1;
  const text = document.getText();
  while (
    left >= 0 &&
    ' \t\n\r":{[()]},*>+$'.indexOf(text.charAt(left)) === -1
  ) {
    left--;
  }
  while (
    right <= text.length &&
    ' \t\n\r":{[()]},*>+;'.indexOf(text.charAt(right)) === -1
  ) {
    right++;
  }
  return text.substring(left, right);
}

/**
 * get the range to replace in order to insert a css variable,
 * when inserting a completion item
 *
 * ```text
 * color: [$bl] <- this part
 * color: [something] <- this part
 * ```
 * @param document
 * @param offset
 * @returns {Range} range
 */
export function getWordRange(document: TextDocument, offset: number): Range {
  const text = document.getText();
  let left = offset - 1;
  let right = offset;

  while (
    left >= 0 &&
    ' \t\n\r":{[()]},*>+$'.indexOf(text.charAt(left)) === -1
  ) {
    left--;
  }

  while (
    right <= text.length &&
    ' \t\n\r":{[()]},*>+;'.indexOf(text.charAt(right)) === -1
  ) {
    right++;
  }
  // avoid consuming the space before the token when doing a suggestion without $
  if (text.charAt(left) === ' ') left++;
  const start = indexToPosition(text, left);
  const end = indexToPosition(text, right);
  const range = Range.create(start, end);

  return range;
}
