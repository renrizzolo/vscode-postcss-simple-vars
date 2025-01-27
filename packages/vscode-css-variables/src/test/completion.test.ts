/* --------------------------------------------------------------------------------------------
 * Copyright (c) Vu Nguyen. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, positionOf, sleep } from './helper';
import { resolve } from 'path';

suite('Should do completion', () => {
  const docUri = getDocUri('test.css');

  test('Completes in css file', async () => {
    await testCompletion(docUri, 'color: $cha^', {
      items: [
        {
          label: '$chakra-ring-offset-width',
          kind: vscode.CompletionItemKind.Variable,
        },
        {
          label: '$chakra-ring-color',
          kind: vscode.CompletionItemKind.Color,
        },
      ],
    });
  });
});

async function testCompletion(
  docUri: vscode.Uri,
  searchText: string,
  expectedCompletionList: vscode.CompletionList
) {
  await activate(docUri);

  const position = positionOf(searchText);
  const toPosition = position.with(position.line, position.character);

  // Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
  const actualCompletionList =
    await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      docUri,
      toPosition
    );

  expectedCompletionList.items.forEach((expectedItem) => {
    const actualItem = actualCompletionList.items.find((item) => {
      if (typeof item.label === 'string') {
        console.log('returning item', item);

        return item.label === expectedItem.label;
      }

      return false;
    });

    assert.ok(actualItem);
    assert.strictEqual(actualItem.label, expectedItem.label);
    assert.strictEqual(actualItem.kind, expectedItem.kind);
  });

  // this triggers the suggestion and selects the first item
  // although not sure how to assert the result

  await vscode.commands.executeCommand('cursorMove', {
    to: 'down',
    by: 'line',
    value: position.line,
  });

  await vscode.commands.executeCommand('cursorMove', {
    to: 'right',
    by: 'charatcter',
    value: position.character,
  });

  await vscode.commands.executeCommand('editor.action.triggerSuggest');

  console.log('after triggerSuggest');
  await sleep(400);

  await vscode.commands.executeCommand('acceptSelectedSuggestion');
  console.log(actualCompletionList);
  await sleep(400);
}
