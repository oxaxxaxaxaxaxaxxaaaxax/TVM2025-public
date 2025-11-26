import { Module as FunnyModule, FunctionDef as FunnyFunctionDef, ParameterDef, Statement as FunnyStatement, Expr, Condition, Predicate as FunnyPredicate } from 'lab08/src';


export interface AnnotatedModule extends Module {}

export interface Module extends FunnyModule {
    type: 'module';
    functions: FunctionDef[];
    formulas: FormulaDef[];
}

export interface FormulaDef {
    type: 'formula';
    name: string;
    parameters: ParameterDef[];
    body: Predicate;
}

export interface FunctionDef extends FunnyFunctionDef {
    type: 'function';
    name: string;
    parameters: ParameterDef[];
    returns: ParameterDef[];
    locals: ParameterDef[];  
    requires?: Predicate;    
    ensures?: Predicate;     
    body: Statement;
}

export type Statement =
    | FunnyStatement
    | LoopStmtWithInvariant;

export interface LoopStmtWithInvariant {
    type: 'while';
    condition: Condition;
    invariant?: Predicate;
    body: Statement;
}

export type Predicate = FunnyPredicate | FormulaRef;

export interface FormulaRef {
    type: 'formulaRef';
    name: string;
    args: Expr[];
}


