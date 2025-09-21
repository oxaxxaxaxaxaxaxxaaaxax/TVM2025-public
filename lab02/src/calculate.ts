import { ReversePolishNotationActionDict} from "./rpn.ohm-bundle";
import { Dict, MatchResult, Semantics } from "ohm-js";
import grammar from "./rpn.ohm-bundle";

export const rpnCalc = {
    Exp_plus(arg0: any,arg1: any, _plus: any) {
        return arg0.calculate() + arg1.calculate();
    },
    Exp_times(arg0: any,arg1: any, _times: any) {
        return arg0.calculate() * arg1.calculate();
    },
    number(arg0: any){
        return arg0.calculate();
    },
    number_whole(arg0: any) {
        return parseInt(this.sourceString, 10);
    }
} satisfies ReversePolishNotationActionDict<number>;

