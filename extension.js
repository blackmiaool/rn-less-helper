// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

const vscode = require('vscode');
const {
    Uri,
    TextDocument,
    Position,
    CancellationToken,
    Range,
    Location,
    Definition,
    MarkedString
} = vscode;
const Path = require('path');
const fs = require('fs');
const postcss = require('postcss');
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    const rootPath = vscode.workspace.rootPath;
    const provider = new RnLessDefinitionProvider();
    vscode.languages.registerHoverProvider(['javascriptreact'], provider);
    vscode.languages.registerDefinitionProvider(['javascriptreact'], provider);

}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;


class RnLessDefinitionProvider {
    constructor() {
        // this.generateDefinitionMap();
    }
    async provideHover(document, position, token) {
        const currWordRange = document.getWordRangeAtPosition(position);
        const currWord = document.getText(currWordRange);
        if (!currWordRange) {
            return;
        }
        const definition = await this.provideDefinition(document, position, token);
        // const space = definition.raw.split('\n')[1].match(/\s+/)[0].slice(4);
        // return new vscode.Hover([{ language: 'less', value: definition.raw.split("\n" + space).join('\n') }]);
        let hover=('\n'+definition.hover)
            .replace(/\n$/,'')
            .replace(/\n/g,"\n    ")
            .replace(/\n\s*\n/,'\n')
            .replace(/^\n/,'');
        hover=`.${currWord} {
${hover}
}`;
        return new vscode.Hover([{ language: 'css', value: hover }]);
    }
    provideDefinition(document, position, token) {
        const currWordRange = document.getWordRangeAtPosition(position);
        // Ensure the current word is valid
        if (!currWordRange) {
            return;
        }
        try {
            let lineText = document.lineAt(position.line).text;
            const currWord = document.getText(currWordRange);
            const currWordBig = document.getText(new Range(currWordRange.start.translate(0, -1), currWordRange.end.translate(0, 1)));
            if (currWordBig !== `"${currWord}"` && currWordBig !== `'${currWord}'`) {
                return; //not a string
            }
            const codeBeforeWord = document.getText(new Range(new Position(0, 0), position));
            let currentClass = codeBeforeWord.match(/([$\w]+)\)\s*\nclass\s+([$\w]+)/g);

            if (!currentClass) {
                return;
            } else {
                currentClass = currentClass[currentClass.length - 1].match(/^([$\w]+)/)[1];
            }
            let lessFiles = codeBeforeWord.match(/(["'])[^\1\n={}]+\.less\1/g);
            if (!lessFiles) {
                return;
            }
            const _definitionMap = new Map();
            const folderPath = Path.dirname(document.uri.fsPath);
            return new Promise(function (resolve, reject) {
                let notFound = 0;
                lessFiles.forEach((path) => {
                    path = path.slice(1, path.length - 1);
                    path = Path.resolve(folderPath, path);
                    fs.readFile(path, function (err, data) {
                        if (err) {
                            reject(e);
                            return;
                        }
                        const code = data.toString();

                        postcss().process(code).then(result => {
                            let found = false;
                            result.root.nodes.forEach((node) => {
                                if (node.selector == currentClass) {
                                    node.walkRules(rule => {
                                        const {
                                            selectors,
                                            source
                                        } = rule;
                                        if (selectors) {
                                            selectors.forEach(selector => {
                                                if (selector.slice(1) === currWord) {
                                                    const definition = getDefinition(Uri.file(path), source);
                                                    let hover = '';
                                                    rule.nodes.forEach((node)=>{
                                                        if(node.type==='decl'){
                                                            hover += node.toString();
                                                            hover+=';\n';
                                                        }
                                                    });

                                                    definition.hover = hover;
                                                    resolve(definition);
                                                    found = true;
                                                }
                                            });
                                        }

                                    })
                                }
                            });
                            if (!found) {
                                notFound++;
                                if (notFound === lessFiles.length) {
                                    reject();
                                }
                            }
                        }).catch(function (e) {
                            reject(e);
                        });

                    });
                    return path;
                });

                function getDefinition(path, source) {
                    const start = new Position(source.start.line - 1, source.start.column);
                    const end = new Position(source.end.line - 1, source.end.column);

                    return new Location(path, new Range(start, end));
                }
            });

            // const folder=document.uri.fsPath.split('\\\/');
            // folder.pop();
        } catch (e) {
            console.log(e);
        }

        //   const classAtPosition = '.' + this.getClassAtPosition(document, position, currWordRange, currWord);
        //   if (this._definitionMap.has(classAtPosition)) {
        //     return this._definitionMap.get(classAtPosition);
        //   }
    }

    // private isClassSelector(selector: string) {
    //   return selector[0] === '.';
    // }

    // private getClassAtPosition(document: TextDocument, position: Position, currWordRange: Range, currWord: string): string {
    //   const classes = _.trim(currWord, `"'`).split(' ');
    //   const positionOffset = position.character - currWordRange.start.character;
    //   let startOffset = 0;
    //   return classes.find(c => {
    //     startOffset += 1 + c.length;
    //     return positionOffset <= startOffset;
    //   });
    // }
}
