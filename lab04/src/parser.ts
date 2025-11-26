import { MatchResult,NonterminalNode,IterationNode, TerminalNode } from 'ohm-js';
import { arithGrammar, ArithmeticActionDict, ArithmeticSemantics, SyntaxError } from '../../lab03';
import { Expr } from './ast';

export const getExprAst: ArithmeticActionDict<Expr> = {
    AddExp(first: NonterminalNode, operations: IterationNode, tail: IterationNode) {
        return tail.children.map(c => c.parse()).reduce(
          (acc, v, i) => ({
                type: (operations.children[i].sourceString === '-') ? 'sub' : 'sum', 
                arg0: acc, 
                arg1: v}),
          first.parse()
        );
    },
    MulExp(first: NonterminalNode, operations: IterationNode, tail: IterationNode) {
        return tail.children.map((c: NonterminalNode) => c.parse()).reduce(
          (acc, v, i) => {
            if(operations.children[i].sourceString === '/')
                return {type: 'div', arg0: acc, arg1: v}
            else
                return {type: 'mul', arg0: acc, arg1: v}        
            },
          first.parse()
        );
    },
    PriExp_neg( _minus: TerminalNode, expr: NonterminalNode) {
        return {type: 'sub', arg0: {type: 'number', value: 0}, arg1:expr.parse()}
    },

    PriExp_paren(leftP: TerminalNode, expr: NonterminalNode, rightP: TerminalNode) {
        return expr.parse()
    },

    PriExp_variable( v: NonterminalNode) {
        return {type: 'var', name: v.sourceString}
    },

    PriExp_number( numb: NonterminalNode) {
        return {type: 'number', value: parseInt(numb.sourceString, 10)}
    },

}

export const semantics = arithGrammar.createSemantics();
semantics.addOperation("parse()", getExprAst);

export interface ArithSemanticsExt extends ArithmeticSemantics
{
    (match: MatchResult): ArithActionsExt
}

export interface ArithActionsExt 
{
    parse(): Expr
}
export function parseExpr(source: string): Expr
{
    const m = arithGrammar.match(source);
    if (m.succeeded()) {
        return semantics(m).parse()
    }else{
        throw new SyntaxError();
    }
}


    
