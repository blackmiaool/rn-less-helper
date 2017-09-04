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
const { getInfo } = require("./parse-jsx");
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    const rootPath = vscode.workspace.rootPath;
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
        if (node.selector == styleName) {
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
        // this.generateDefinitionMap();
    }
    async provideHover(document, position, token) {
        const currWordRange = document.getWordRangeAtPosition(position, RnLessDefinitionProvider.wordReg);
        if (!currWordRange) {
            return;
        }
        const currWord = document.getText(currWordRange);
        
        // vscode.window.showQuickPick(["a", "b", "c"])
        let definition;
        try{
            definition=await this.provideDefinition(document, position, token);
        }catch(e){
            if(!e){
                return ;
            }        
            try{
                const styleStack=e.styleStack;
                const styleName=e.styleName;
                const post=e.postcss;
                styleStack.shift();
                let selectorArr=[];
                styleStack.forEach((v)=>{
                    if(Array.isArray(v)){
                        selectorArr=selectorArr.concat(v);
                    }else{
                        selectorArr.push(v);
                    }
                });
                selectorArr=selectorArr.filter((selector)=>{
                    return lessGetPosition(post,styleName,selector);
                });
                selectorArr=selectorArr.map((v)=>{
                    return `.${v}`;
                });
                console.log('selectorArr',selectorArr);
                selectorArr.push(styleName);
                selectorArr=selectorArr.map((v)=>{
                    return `${v} > .${currWord}`;
                });
                vscode.window.showQuickPick(selectorArr,{
                    placeHolder:`Select a position to insert your style: ${currWord}`
                }).then((select)=>{
                    console.log(select)
                });
                // const pick=selectorArr.map((selector)=>{
                //     
                // });
            }   catch(e) {
                console.log(e)
            }
            
        }
        if(!definition){
            return ;
        }
        console.log('definition',definition)
        // const space = definition.raw.split('\n')[1].match(/\s+/)[0].slice(4);
        // return new vscode.Hover([{ language: 'less', value: definition.raw.split("\n" + space).join('\n') }]);
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
            // console.log('codeBeforeWord', codeBeforeWord.length)
            const date = Date.now();
            const codeInfo = getInfo(document.getText(new Range(new Position(0, 0), new Position(1e6, 1e6))), codeBeforeWord.length);
            // console.log(Date.now() - date);
            if (!codeInfo) {
                return;
            }
            let styleName = codeInfo.styleName;
            let lessFiles = codeBeforeWord.match(/(["'])[^\1\n={}]+\.less(\.js)?\1/g);
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
                    fs.readFile(path, function (err, data) {
                        if (err) {
                            console.log(err);
                            reject();
                            return;
                        }
                        const code = data.toString();

                        postcss().process(code).then(result => {
                            const rule = lessGetPosition(result,styleName,className);
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
                                    codeInfo.postcss=result;
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