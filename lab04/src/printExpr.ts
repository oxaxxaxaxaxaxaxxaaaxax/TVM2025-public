import { Expr } from "./ast";

type Bin = 'sum'|'sub'|'mul'|'div';

export function printExpr(e: Expr):string
{
    if(e.type === 'sub' && e.arg0.type === 'number' && e.arg0.value === 0){
        const a = e.arg1
        if(a.type === 'number' || a.type === 'var' || (a.type === 'sub' && a.arg0.type === 'number' && a.arg0.value === 0)){
            return '-' + printExpr(a)
        }else{
            return '-' + '(' + printExpr(a) + ')'
        }
    }
    switch(e.type){
        case 'number': return String(e.value)
        case 'var': return e.name
        case 'sum': {
            const leftChild = needParensLeft(e.type, e.arg0) ? '(' + printExpr(e.arg0) + ')' : printExpr(e.arg0)
            const rightChild = needParensRight(e.type, e.arg1) ? '(' + printExpr(e.arg1) + ')' : printExpr(e.arg1)
            return leftChild + ' + ' + rightChild
        }
        case 'sub': {
            const leftChild =needParensLeft(e.type, e.arg0) ? '(' + printExpr(e.arg0) + ')' : printExpr(e.arg0)
            const rightChild =needParensRight(e.type, e.arg1) ? '(' + printExpr(e.arg1) + ')' : printExpr(e.arg1)
            return leftChild + ' - ' + rightChild
        }
        case 'mul': {
            const leftChild =needParensLeft(e.type, e.arg0) ? '(' + printExpr(e.arg0) + ')' : printExpr(e.arg0)
            const rightChild =needParensRight(e.type, e.arg1) ? '(' + printExpr(e.arg1) + ')' : printExpr(e.arg1)
            return leftChild + ' * ' + rightChild
        }
        case 'div': {
            const leftChild =needParensLeft(e.type, e.arg0) ? '(' + printExpr(e.arg0) + ')' : printExpr(e.arg0)
            const rightChild =needParensRight(e.type, e.arg1) ? '(' + printExpr(e.arg1) + ')' : printExpr(e.arg1)
            return leftChild + ' / ' + rightChild
        }
        default: return 'error'
    }
}

function getPriority(e: Expr){
    switch(e.type){
        case 'sum': return 1;
        case 'sub': return 1;
        case 'mul': return 2;
        case 'div': return 2;
        case 'number': return 3;
        case 'var': return 3;
        default: return 1
    }
}

function needParensLeft(op: Bin, leftChild: Expr){
    const opPriority = op === 'sum' || op == 'sub' ? 1 : 2
    return getPriority(leftChild) < opPriority
}

function needParensRight(op: Bin, rightChild: Expr){
    const opPriority = op === 'sum' || op == 'sub' ? 1 : 2
    const chPriority = getPriority(rightChild)

    if(rightChild.type === 'sub' && rightChild.arg0.type === 'number' && rightChild.arg0.value === 0){
        return false
    }
    if(chPriority < opPriority) return true
    if(chPriority > opPriority) return false
    switch(op){
        case 'sum': return false 
        case 'sub': return true
        case 'mul': return false
        case 'div': return true
    }
}
