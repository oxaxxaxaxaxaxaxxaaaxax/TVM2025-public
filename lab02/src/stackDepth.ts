import { ReversePolishNotationActionDict } from "./rpn.ohm-bundle";

export const rpnStackDepth = {
    Exp_plus(arg0: any,arg1: any, _plus: any) {
        const l = arg0.stackDepth;
        const r = arg1.stackDepth
        return {max: Math.max(l.max, l.out + r.max), out: l.out + r.out -1}
    },
    Exp_times(arg0: any,arg1: any, _times: any) {
        const l = arg0.stackDepth;
        const r = arg1.stackDepth
        return {max: Math.max(l.max, l.out + r.max), out: l.out + r.out -1}
    },
    number(arg0: any){
        return arg0.stackDepth;
    },
    number_whole(arg0: any) {
        return {max:1, out:1};
    }

} satisfies ReversePolishNotationActionDict<StackDepth>;
export type StackDepth = {max: number, out: number};
