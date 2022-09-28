> Working with PostCSS Simple Variables is a pain, this extension enhances the Web Development experience by providing advanced features such as autocomplete, color preview, and go to definition.

## Installation

Install packages, run `npm run package`, drag the zip file onto vscode extensions pane.

By default the extension only scan files with this glob patterns:

```json
["**/*.css", "**/*.scss", "**/*.sass", "**/*.less"]
```

And ignore files in these folders:

```json
[
  "**/.git",
  "**/.svn",
  "**/.hg",
  "**/CVS",
  "**/.DS_Store",
  "**/.git",
  "**/node_modules",
  "**/bower_components",
  "**/tmp",
  "**/dist",
  "**/tests"
]
```

## Features

### Autocomplete & Color Preview

Intelligent suggestions for all PostCSS Simple variables in the project

<img src="https://github.com/vunguyentuan/vscode-css-variables/raw/master/demo/color_autocomplete.png" alt="" />

### Go to definition

You can easily knows where the variable coming from by hold Alt/Cmd and click to the variable.

<img src="https://github.com/vunguyentuan/vscode-css-variables/raw/master/demo/goto-definition-trim.gif" alt="" />

## FAQ

### I want to add files in `node_modules` folder

_.vscode/settings.json_

```json
{
  "cssVariables.lookupFiles": [
    "**/*.css",
    "**/*.scss",
    "**/*.sass",
    "**/*.less",
    "node_modules/open-props/open-props.min.css"
  ]
}
```

### I want to add files from public url, CDN

_src/style.css_

```css
@import 'https://cdn.jsdelivr.net/gh/KunalTanwar/tailwind-colors/dist/css/colors.min.css';

body {
  color: $indigo-50;
}

...
```

## Full demo

![Demo](https://github.com/renrizzolo/vscode-postcss-simple-vars/raw/convert-to-simple-variables/demo/demo-postcss-simple-vars.gif)
