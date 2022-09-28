import { Range, Color, Location, Position } from 'vscode-languageserver/node';
import * as fs from 'fs';
import fastGlob from 'fast-glob';
import * as culori from 'culori';
import axios from 'axios';
import postcss, { Declaration } from 'postcss';
import { pathToFileURL } from 'url';
import path from 'path';
import postcssSCSS from 'postcss-scss';
import postcssLESS from 'postcss-less';
import CacheManager from './CacheManager';
import isColor from './utils/isColor';
import { culoriColorToVscodeColor } from './utils/culoriColorToVscodeColor';
import { VARIABLE_PREFIX } from './constants';

export type CSSSymbol = {
  name: string;
  value: string;
  referenceValue?: string;
  referenceColor?: string;
};

export type CSSVariable = {
  symbol: CSSSymbol;
  definition: Location;
  color?: Color;
  var?: string;
};

export interface CSSVariablesSettings {
  lookupFiles: string[];
  blacklistFolders: string[];
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
export const defaultSettings: CSSVariablesSettings = {
  lookupFiles: ['**/*.less', '**/*.scss', '**/*.sass', '**/*.css'],
  blacklistFolders: [
    '**/.next',
    '**/.cache',
    '**/.git',
    '**/.svn',
    '**/.hg',
    '**/CVS',
    '**/.DS_Store',
    '**/node_modules/',
    '**/bower_components',
    '**/tmp',
    '**/dist',
    '**/tests',
  ],
};

const getAST = (filePath: string, content: string) => {
  const fileExtension = path.extname(filePath);

  if (fileExtension === '.less') {
    return postcssLESS.parse(content);
  }

  if (fileExtension === '.scss') {
    return postcssSCSS.parse(content);
  }

  return postcss.parse(content);
};

export default class CSSVariableManager {
  private cacheManager = new CacheManager<CSSVariable>();

  public parseCSSVariablesFromText = async ({
    content,
    filePath,
  }: {
    content: string;
    filePath: string;
  }) => {
    try {
      // reset cache for this file
      this.cacheManager.clearFileCache(filePath);

      const ast = getAST(filePath, content);
      const fileURI = pathToFileURL(filePath).toString();

      const importUrls = [];
      ast.walkAtRules((atRule) => {
        if (atRule.name === 'import') {
          // only support absolute url for now
          const match = atRule.params.match(
            /['"](?<protocol>http|https):\/\/(?<url>.*?)['"]/
          );

          if (match) {
            const url = `${match.groups.protocol}://${match.groups.url}`;

            importUrls.push(url);
          }
        }
      });

      await Promise.all(
        importUrls.map(async (url) => {
          try {
            const response = await axios(url, {
              responseType: 'text',
            });

            const cssText = await response.data;

            return this.parseCSSVariablesFromText({
              content: cssText,
              filePath: url,
            });
          } catch (err) {
            console.log(err, `cannot fetch data from ${url}`);
          }
        })
      );

      ast.walkDecls((decl) => {
        if (decl.prop.startsWith(VARIABLE_PREFIX)) {
          const variable: CSSVariable = {
            symbol: {
              name: decl.prop,
              value: decl.value,
            },
            definition: {
              uri: fileURI,
              range: Range.create(
                Position.create(
                  decl.source.start.line - 1,
                  decl.source.start.column - 1
                ),
                Position.create(
                  decl.source.end.line - 1,
                  decl.source.end.column - 1
                )
              ),
            },
          };

          // if (decl.value.startsWith(VARIABLE_PREFIX)) {
          //   variable.var = decl.value;
          //   console.log('set var', decl.prop, decl.value);
          //   const def = this.cacheManager.get(decl.value);
          //   if (def.color) {
          //     console.log('got var', decl.prop, decl.value, def);
          //     // if (isColor(def.value)) {
          //     console.log('is color');
          //     variable.color = def.color; //this.getColor(def);
          //     // }
          //   }
          // }

          // variable.color = this.recursiveApplyColor(decl);

          if (isColor(decl.value)) {
            variable.color = this.getColor(decl);
          } else {
            // if a variable references another variable
            // attempt to add its color
            // referenceColor is used to apply the actual color to the completion item
            // referenceValue is the parent value (could be another variable, hence referenceColor)
            // This is order dependent!
            // i.e this won't show brown for $var2:
            // $var1: $var2;
            // $var2: brown;
            const { referenceValue, referenceColor, color } =
              this.recursiveApplyValues(variable);

            if (referenceValue) variable.symbol.referenceValue = referenceValue;
            if (color) variable.color = color;
            if (referenceColor) variable.symbol.referenceColor = referenceColor;
          }

          // add to cache
          this.cacheManager.set(filePath, decl.prop, variable);
        }
      });
    } catch (error) {
      console.log({ error });
      console.error(filePath);
    }
  };

  getColor = (decl: Declaration) => {
    const culoriColor = culori.parse(decl.value);
    if (culoriColor) {
      return culoriColorToVscodeColor(culoriColor);
    }
  };

  recursiveApplyValues = (dec: CSSVariable, level = 0) => {
    if (level > 5) return {};
    if (dec.symbol.value.startsWith(VARIABLE_PREFIX)) {
      const ref = this.cacheManager.get(dec.symbol.value);

      if (!ref) return {};
      if (ref.color) {
        let referenceColor = ref.symbol.value;
        if (!isColor(referenceColor)) {
          referenceColor = this.recursiveApplyValues(ref, level + 1)
            ?.referenceColor;
        }
        return {
          color: ref.color,
          referenceValue: ref.symbol.value,
          referenceColor,
        };
      }
      return this.recursiveApplyValues(ref, level + 1);
    } else if (level > 0) {
      return { referenceValue: dec.symbol.value };
    }
    return {};
  };

  public parseAndSyncVariables = async (
    workspaceFolders: string[],
    settings = defaultSettings
  ) => {
    for (const folderPath of workspaceFolders) {
      await fastGlob(settings.lookupFiles, {
        onlyFiles: true,
        cwd: folderPath,
        ignore: settings.blacklistFolders,
        absolute: true,
      }).then((files) => {
        return Promise.all(
          files.map((filePath) => {
            const content = fs.readFileSync(filePath, 'utf8');
            return this.parseCSSVariablesFromText({
              content,
              filePath,
            });
          })
        );
      });
    }
  };

  public getAll() {
    return this.cacheManager.getAll();
  }

  public clearFileCache(filePath: string) {
    this.cacheManager.clearFileCache(filePath);
  }

  public clearAllCache() {
    this.cacheManager.clearAllCache();
  }
}
