const babylon = require("babylon");
const postcss = require('postcss');
const {
    default: traverse
} = require("babel-traverse");



const fs = require('fs');
const astCache = [];
// const csscode = fs.readFileSync('./test/a.less', 'utf8').toString();
// const code = fs.readFileSync('./test/a.jsx', 'utf8').toString();
// getInfo(code, 4603);
// postcss().process(csscode).then(result => {
//     const info = getInfo(code, 4603);
//     const styleStack=info.styleStack;
//     styleStack.shift();
//     let styleArr=[];
//     styleStack.forEach((v)=>{
//         if(Array.isArray(v)){
//             styleArr=styleArr.concat(v);
//         }else{
//             styleArr.push(v);
//         }        
//     });
//     console.log(styleArr);
//     styleArr.forEach((className)=>{
//         const pos=lessGetPosition(result,info.selectorName,className);
//         console.log(pos);
//     });
// });

// console.log(code)
function getCodeofNode(code, node) {
    return code.slice(node.start, node.end);
}

function getAst(code) {
    let ast = astCache.find(v => v.code === code);
    if (ast) {
        return ast.ast;
    }
    ast = babylon.parse(code, {
        sourceType: 'module',
        plugins: [
            // enable jsx and flow syntax
            "jsx",
            "flow",
            "decorators",
            "typescript",
            "doExpressions",
            "objectRestSpread",
            "classProperties",
            "classPrivateProperties",
            "asyncGenerators",
            "functionBind",
            'functionSent',
            'dynamicImport',
            'numericSeparator',
            'optionalChaining',
            'importMeta',
            'bigInt',
            'optionalCatchBinding'
        ]
    });
    astCache.push({ code, ast });
    if (astCache.length > 10) {
        astCache.shift();
    }
    return ast;
}
function getInfo(code, position) {
    // console.log(code.slice(position, position + 40))
    const ast = getAst(code);
    const stack = [];
    traverse(ast, {
        enter(path) {
            if (path.node.start <= position && path.node.end >= position) {
                stack.push(path);
                // console.log(path.node.type);
            }
        }
    });
    let styleName;
    let styleStack = [];
    for (let i = stack.length - 1; i >= 0; i--) {
        const path = stack[i];

        const node = path.node;
        if (!node) {
            continue;
        }
        if (node.type === 'JSXElement') {
            // console.log(node.openingElement.attributes);
            // console.log(getCodeofNode(code,node))
            node.openingElement.attributes.forEach((attr) => {
                // console.log(node.openingElement);
                if (attr.name && attr.name.name === 'style') {
                    let value = attr.value;
                    if (value.type === 'JSXExpressionContainer') {
                        value = value.expression;

                    }
                    if (value.type === 'StringLiteral') {
                        // console.log(value.value);
                        styleStack.push(value.value);
                    } else if (value.type === 'ArrayExpression') {
                        styleStack.push(value.elements.filter((prop) => {
                            return prop.type === 'StringLiteral'
                        }).map((prop) => {
                            return prop.value
                        }));
                    }

                }
            });
        }
        if (node.type === 'JSXAttribute') {
            const attrName = node.name.name;
            if (attrName !== 'style') {
                return false;
            }
        }
        if (node.type === 'ClassDeclaration') {
            const decorators = node.decorators;
            // console.log(decorators);
            decorators.forEach((node) => {
                // console.log(node.expression);
                if (!node.expression || !node.expression.callee) {
                    return;
                }
                if (node.expression.callee.name === 'rnLess') {
                    const args = node.expression.arguments;
                    if (!args.length) {
                        return;
                    }
                    const expression = getCodeofNode(code, args[0]);
                    // console.log('args',expression);
                    styleName = expression.match(/[\w$-]+/g);
                    if (styleName) {
                        styleName = styleName.pop();
                    }
                }
            });
        }
    }
    // console.log('jsxStack',styleStack);
    if (!styleName) {
        return false;
    }
    return { styleName, styleStack };
}

module.exports = {
    getInfo: function (code, position) {
        try {
            return getInfo(code, position);
        } catch (e) {
            console.log(e);
            return false;
        }

    }
}
// console.log(ast);