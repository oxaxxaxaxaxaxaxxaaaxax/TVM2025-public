
import { IterationNode, MatchResult, NonterminalNode } from "ohm-js";
import grammar, {
  ArithmeticActionDict,
  ArithmeticSemantics,
} from "./arith.ohm-bundle";

export const arithSemantics: ArithSemantics =
  grammar.createSemantics() as ArithSemantics;



const arithCalc = {
  AddExp(first: NonterminalNode, operations: IterationNode, tail: IterationNode) {
    const params = this.args.params 

    return tail.children.map(c => c.calculate(params)).reduce(
      (acc, v, i) => acc + (operations.children[i].sourceString === '-' ? -v : v),
      first.calculate(params)
    );
  },

  MulExp(first: NonterminalNode, operations: IterationNode, tail: IterationNode) {
    const params = this.args.params 
    return tail.children.map(c => c.calculate(params)).reduce(
      (acc, v, i) => {
        if(operations.children[i].sourceString === '*')
          return acc*v;
        if(v === 0) 
          throw Error("Division by zero");
        return acc/v;  
      },
      first.calculate(params)
    );
  },

  PriExp_neg(this: any, _minus: any, expr: any) {
    const params = this.args.params 
    return -expr.calculate(params)
  },

  PriExp_paren(this: any, leftP: any, expr: any, rightP: any) {
    const params = this.args.params 
    return expr.calculate(params)
  },

  PriExp_variable(this: any, v: any) {
    const variable = v.sourceString
    const params = this.args.params 
    if( Object.prototype.hasOwnProperty.call(params, variable) ){
      return params[variable]
    }  
    return NaN
  },

  PriExp_number(this: any, numb: any) {
    return parseInt(numb.sourceString, 10)
  },
} satisfies ArithmeticActionDict<number>


arithSemantics.addOperation<number>("calculate(params)", arithCalc);

export interface ArithActions {
  calculate(params: { [name: string]: number }): number;
}

export interface ArithSemantics extends ArithmeticSemantics {
  (match: MatchResult): ArithActions;
}
