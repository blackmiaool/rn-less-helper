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
    MarkedString,
    QuickPickItem,
    window,
    TextEditorRevealType,
    Selection,
    WorkspaceEdit,
    workspace,
} = vscode;
const Path = require('path');
const fs = require('fs');
const postcss = require('postcss');
const { getInfo } = require("./parse-jsx");
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    const rootPath = workspace.rootPath;
    const provider = new RnLessDefinitionProvider();
    vscode.languages.registerHoverProvider(['javascriptreact'], provider);
    vscode.languages.registerDefinitionProvider(['javascriptreact'], provider);


    const disposable = vscode.commands.registerCommand('rnLess.rnLessExpand', function () {
        const editor = vscode.window.activeTextEditor;

        // check if there is no selection
        if (editor.selection.isEmpty) {
            // the Position object gives you the line and character where the cursor is
            const position = editor.selection.active;
            let lineText = editor.document.lineAt(position.line).text;
            try {
                const result = lineText.replace(/[^\s\t]+$/, function (result) {
                    const [tag, ...styles] = result.split(".");

                    let styleText = ""
                    if (styles.length === 1) {
                        styleText = ` style="${styles}"`;
                    } else if (styles.length > 1) {
                        styleText = ` style={${JSON.stringify(styles)}}`;
                    }
                    styleText = styleText.replace(/,"/g, ", \"");
                    const ret = `<${tag}${styleText}></${tag}>`;
                    return ret;
                });
                editor.edit(function (edit) {
                    edit.replace(editor.document.lineAt(position.line).range, result);
                }).then(() => {
                    vscode.commands.executeCommand("cursorEnd")
                });
            } catch (e) {
                console.log(e)
            };

        }
    });

    context.subscriptions.push(disposable);

}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;

function lessGetPosition(result, styleName, selectorName) {
    let target;
    result.root.nodes.some((node) => {
        if (node.selector === styleName) {
            if (!selectorName) {
                target = node;
                return true;
            }
            node.walkRules(rule => {
                const {
                    selectors,
                    source
                } = rule;
                if (selectors) {
                    const found = selectors.some(selector => {
                        if (selector.slice(1) === selectorName) {
                            return true;
                        }
                    });
                    if (found) {
                        target = rule;
                    }
                }

            });
            if (target) {
                return true;
            }
        }
    });
    return target;
}


class RnLessDefinitionProvider {
    constructor() {
    }
    async provideHover(document, position, token) {
        const currWordRange = document.getWordRangeAtPosition(position, RnLessDefinitionProvider.wordReg);
        if (!currWordRange) {
            return;
        }
        const currWord = document.getText(currWordRange);

        let definition;
        try {
            definition = await this.provideDefinition(document, position, token);
        } catch (e) {
            if (!e) {
                return;
            }
            try {
                const styleStack = e.styleStack;
                const styleName = e.styleName;
                const post = e.postcss;
                const postPath = e.postcssPath;
                styleStack.shift();
                let selectorArr = [];
                styleStack.forEach((v) => {
                    if (Array.isArray(v)) {
                        selectorArr = selectorArr.concat(v);
                    } else {
                        selectorArr.push(v);
                    }
                });
                selectorArr = selectorArr.filter((selector) => {
                    return lessGetPosition(post, styleName, selector);
                });
                selectorArr = selectorArr.map((v) => {
                    return `.${v}`;
                });
                selectorArr.push(styleName);
                selectorArr = selectorArr.map((v) => {
                    return { label: `${v} > .${currWord}`, parent: v };
                });
                vscode.window.showQuickPick(selectorArr, {
                    placeHolder: `Select a position to insert your style: ${currWord}`
                }).then((select) => {
                    if (!select) {
                        return;
                    }
                    workspace.openTextDocument(postPath).then((document) => {
                        const code=document.getText(new Range(new Position(0, 0), new Position(1e8, 1e8)));
                        postcss().process(code).then(result => {
                            const parent=lessGetPosition(result, styleName, select.parent !== styleName && select.parent.slice(1));
                            let indent = parent.source.start.column - 1;
                            indent = " ".repeat(indent + 4);
                            const four = "    ";
                            window.showTextDocument(Uri.file(postPath), {

                            }).then((editor) => {
                                editor.edit(function (edit) {
                                    edit.insert(new Position(parent.source.end.line - 2, 100000)
                                        , `\n${indent}.${currWord}{\n${indent}${four}\n${indent}}`);
                                }).then(() => {
                                    editor.selection = new Selection(new Position(parent.source.end.line, 10000), new Position(parent.source.end.line, 10000));
                                });
                            });

                        });
                    });
                });
            } catch (e) {
                console.log(e)
            }

        }
        if (!definition) {
            return;
        }
        let hover = ('\n' + definition.hover)
            .replace(/\n$/, '')
            .replace(/\n/g, "\n    ")
            .replace(/\n\s*\n/, '\n')
            .replace(/^\n/, '');
        hover = `.${currWord} {
${hover}
}`;
        return new vscode.Hover([{ language: 'css', value: hover }]);
    }
    provideDefinition(document, position, token) {
        const currWordRange = document.getWordRangeAtPosition(position, RnLessDefinitionProvider.wordReg);
        // Ensure the current word is valid
        if (!currWordRange) {
            return;
        }
        try {
            let lineText = document.lineAt(position.line).text;
            const className = document.getText(currWordRange);
            const currWordBig = document.getText(new Range(currWordRange.start.translate(0, -1), currWordRange.end.translate(0, 1)));
            if (currWordBig !== `"${className}"` && currWordBig !== `'${className}'`) {
                return; //not a string
            }
            const codeBeforeWord = document.getText(new Range(new Position(0, 0), position));
            const date = Date.now();
            const codeInfo = getInfo(document.getText(new Range(new Position(0, 0), new Position(1e6, 1e6))), codeBeforeWord.length);
            if (!codeInfo) {
                return;
            }
            let styleName = codeInfo.styleName;
            let lessFiles = codeBeforeWord.match(/(["'])[^\1\n={}]+\.lessx?(\.js)?\1/g);
            if (!lessFiles) {
                return;
            }
            const _definitionMap = new Map();
            const folderPath = Path.dirname(document.uri.fsPath);
            return new Promise(function (resolve, reject) {
                let notFound = 0;
                lessFiles.forEach((path) => {
                    path = path.slice(1, path.length - 1);
                    path = path.replace(/\.js/, '');
                    path = Path.resolve(folderPath, path);
                    workspace.openTextDocument(path).then((document) => {
                        const code=document.getText(new Range(new Position(0, 0), new Position(1e8, 1e8)));
                        
                        postcss().process(code).then(result => {
                            const rule = lessGetPosition(result, styleName, className);
                            if (rule) {
                                const definition = getDefinition(Uri.file(path), rule.source);
                                let hover = '';
                                rule.nodes.forEach((node) => {
                                    if (node.type === 'decl') {
                                        hover += node.toString();
                                        hover += ';\n';
                                    }
                                });

                                definition.hover = hover;
                                resolve(definition);
                            } else {
                                notFound++;
                                if (notFound === lessFiles.length) {
                                    codeInfo.postcss = result;
                                    codeInfo.postcssPath = path;
                                    reject(codeInfo);
                                }
                            }
                        }).catch(function (e) {
                            console.log(e);
                            reject();
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
        } catch (e) {
            console.log(e);
        }
    }
}
RnLessDefinitionProvider.wordReg = /[\w$-]+/;