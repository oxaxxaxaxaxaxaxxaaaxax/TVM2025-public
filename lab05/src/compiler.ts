import { c as C, Op, I32 } from "../../wasm";
import { Expr } from "../../lab04";
import { buildOneFunctionModule, Fn } from "./emitHelper";
const { i32, get_local} = C;
    
export function getVariables(e: Expr): string[] {
    const uniqueVariables = new Set<string>()
    const stack: string[] = []
    addToList(e, uniqueVariables, stack)
    return stack
}

function addToList(e: Expr, variables : Set<string>, stack:string[]){
    switch(e.type){
        case "number": break
        case "mul":
        case "sum":
        case "sub":
        case "div": {
            addToList(e.arg0,variables,stack)
            addToList(e.arg1,variables,stack)
            break
        }
        case "var":{
            if(!variables.has(e.name)){
                variables.add(e.name)
                stack.push(e.name)
            }
        }
    }
}

export async function buildFunction(e: Expr, variables: string[]): Promise<Fn<number>>
{
    let expr = wasm(e, variables)
    return await buildOneFunctionModule("test", variables.length, [expr]);
}

function wasm(e: Expr, args: string[]): Op<I32> {
    switch(e.type){
        case 'number': return i32.const(e.value)
        case 'sum':{
            const a = wasm(e.arg0,args)
            const b = wasm(e.arg1,args)
            return i32.add(a,b)
        }
        case 'sub':{
            const a = wasm(e.arg0,args)
            const b = wasm(e.arg1,args)
            return i32.sub(a,b)
        }
        case 'mul':{
            const a = wasm(e.arg0,args)
            const b = wasm(e.arg1,args)
            return i32.mul(a,b)
        }
        case 'div':{
            const a = wasm(e.arg0,args)
            const b = wasm(e.arg1,args)
            return i32.div_s(a,b)
        }
        case 'var':{
            const idx = args.indexOf(e.name)
            return get_local(i32, idx)
        }
    }
}
