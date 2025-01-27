import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  ColorInformation,
  FileChangeType,
  Hover,
  InsertReplaceEdit,
  MarkupKind,
} from 'vscode-languageserver/node';
import * as fs from 'fs';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import isColor from './utils/isColor';
import { uriToPath } from './utils/protocol';
import { findAll } from './utils/findAll';
import { indexToPosition } from './utils/indexToPosition';
import { getCurrentWord, getWordRange } from './utils/getCurrentWord';
import CSSVariableManager, {
  CSSVariable,
  CSSVariablesSettings,
  defaultSettings,
} from './CSSVariableManager';
import { VARIABLE_PREFIX } from './constants';
import { vscodeColorToHex } from './utils/culoriColorToVscodeColor';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

const cssVariableManager = new CSSVariableManager();

connection.onInitialize(async (params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
      definitionProvider: true,
      hoverProvider: true,
      colorProvider: true,
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(async () => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log('Workspace folder change event received.');
    });
  }

  const workspaceFolders = await connection.workspace.getWorkspaceFolders();
  const validFolders = workspaceFolders
    ?.map((folder) => uriToPath(folder.uri) || '')
    .filter((path) => !!path);

  const settings = await getDocumentSettings();

  // parse and sync variables
  cssVariableManager.parseAndSyncVariables(validFolders || [], settings);
});

let globalSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<CSSVariablesSettings>> = new Map();

connection.onDidChangeConfiguration(async (change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
    cssVariableManager.clearAllCache();

    const validFolders = await connection.workspace
      .getWorkspaceFolders()
      .then(
        (folders) =>
          folders
            ?.map((folder) => uriToPath(folder.uri) || '')
            .filter((path) => !!path)
      );

    const settings = await getDocumentSettings();

    // parse and sync variables
    cssVariableManager.parseAndSyncVariables(validFolders || [], settings);
  } else {
    globalSettings = <CSSVariablesSettings>(
      (change.settings?.cssVariables || defaultSettings)
    );
  }
});

function getDocumentSettings(): Thenable<CSSVariablesSettings> {
  const resource = 'all';
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration('cssVariables');
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  connection.console.log('Closed: ' + e.document.uri);
  documentSettings.delete(e.document.uri);
});

connection.onDidChangeWatchedFiles((_change) => {
  // update cached variables
  _change.changes.forEach((change) => {
    const filePath = uriToPath(change.uri);
    if (filePath) {
      // remove variables from cache
      if (change.type === FileChangeType.Deleted) {
        cssVariableManager.clearFileCache(filePath);
      } else {
        const content = fs.readFileSync(filePath, 'utf8');
        cssVariableManager.parseCSSVariablesFromText({
          content,
          filePath,
        });
      }
    }
  });
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const doc = documents.get(_textDocumentPosition.textDocument.uri);
    if (!doc) {
      return [];
    }

    const offset = doc.offsetAt(_textDocumentPosition.position);

    const range = getWordRange(doc, offset);
    connection.console.log(JSON.stringify(range));
    const items: CompletionItem[] = [];
    cssVariableManager.getAll().forEach((variable) => {
      const varSymbol = variable.symbol;
      const insertText = varSymbol.name;
      const completion: CompletionItem = {
        label: varSymbol.name,
        detail: varSymbol.value + displayReferenceValue(varSymbol),
        documentation: isColor(varSymbol.referenceColor)
          ? varSymbol.referenceColor
          : varSymbol.value,
        // insertText: currentWord.trim().startsWith(VARIABLE_PREFIX)
        //   ? insertText.slice(1)
        //   : insertText,
        textEdit: {
          newText: insertText,
          range,
        },
        kind:
          isColor(varSymbol.value) || isColor(varSymbol.referenceColor)
            ? CompletionItemKind.Color
            : CompletionItemKind.Variable,
        sortText: 'z',
      };

      items.push(completion);
    });

    return items;
  }
);
const displayReferenceValue = (varSymbol: CSSVariable['symbol']) =>
  `${varSymbol.referenceValue ? ` (${varSymbol.referenceValue})` : ''}`;

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

connection.onDocumentColor((params): ColorInformation[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const colors: ColorInformation[] = [];

  const text = document.getText();
  const matches = findAll(/\$(?<varName>[a-z-0-9]+)/g, text);

  const globalStart: Position = { line: 0, character: 0 };

  matches.map((match) => {
    const start = indexToPosition(text, match.index + 1);
    const end = indexToPosition(text, match.index + match[0].length);

    const cssVariable = cssVariableManager.getAll().get(match.groups.varName);

    if (cssVariable?.color) {
      const range = {
        start: {
          line: globalStart.line + start.line,
          character:
            (end.line === 0 ? globalStart.character : 0) + start.character,
        },
        end: {
          line: globalStart.line + end.line,
          character:
            (end.line === 0 ? globalStart.character : 0) + end.character,
        },
      };

      colors.push({
        color: cssVariable.color,
        range,
      });
    }
  });

  return colors;
});

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);

  if (!doc) {
    return null;
  }

  const offset = doc.offsetAt(params.position);
  const currentWord = VARIABLE_PREFIX + getCurrentWord(doc, offset);

  if (!currentWord) return null;

  const nornalizedWord = currentWord.slice(1);

  const cssVariable = cssVariableManager.getAll().get(nornalizedWord);

  if (cssVariable) {
    const content = {
      kind: MarkupKind.Markdown,
      value: [
        // add color swatch to hover if it exists
        `${
          cssVariable.color
            ? `<span style="background-color:${vscodeColorToHex(
                cssVariable.color
                // setting width is not allowed by vscode
              )};">\xA0\xA0\xA0\xA0</span>`
            : ''
        } ${cssVariable.symbol.value} ${displayReferenceValue(
          cssVariable.symbol
        )}  `,
      ]
        .filter(Boolean)
        .join('\n'),
    };

    return {
      contents: content,
      range: cssVariable.definition.range,
    } as Hover;
  }

  return null;
});

connection.onColorPresentation((params) => {
  const document = documents.get(params.textDocument.uri);

  const className = document.getText(params.range);
  if (!className) {
    return [];
  }

  return [];
});

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);

  if (!doc) {
    return null;
  }

  const offset = doc.offsetAt(params.position);
  const currentWord = VARIABLE_PREFIX + getCurrentWord(doc, offset);

  if (!currentWord) return null;

  const nornalizedWord = currentWord.slice(1);
  const cssVariable = cssVariableManager.getAll().get(nornalizedWord);

  if (cssVariable) {
    return cssVariable.definition;
  }

  return null;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
