import {  MatchResult } from "ohm-js";
import { addMulSemantics } from "./calculate";
import grammar from "./addmul.ohm-bundle";

export function evaluate(content: string): number
{
    return calculate(parse(content));
}
export class SyntaxError extends Error
{
}

function parse(content: string): MatchResult
{
    const m = grammar.match(content);
    if (m.succeeded()) {
        return m;
    }else{
        throw new SyntaxError();
    }
}

function calculate(expression: MatchResult):number
{
    return addMulSemantics(expression).calculate();
}