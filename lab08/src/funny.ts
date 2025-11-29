import * as arith from "../../lab04";

export type ArithExpr = arith.Expr;

export type ParamType = "int" | "int[]";

export interface Module
{
    type: 'module';
    functions: FunctionDef[]
}

export interface FunctionDef
{
    type: 'function';
    name: string;
    parameters: ParameterDef[];
    returns: ParameterDef[];
    locals: ParameterDef[];
    body: Statement
}


export interface ParameterDef
{
    type: 'param';
    name: string;
    paramType: ParamType;
}

export type Statement =
  Assignment
  | ConditionalStmt
  | LoopStmt
  | BlockStmt
  | CallStatement


export interface CallStatement {
  type: "callStmt";
  call: FunctionCall;  
}

export type Assignment =
  AssignStmt
  | TupleAssignStmt
  | ArrayAssignStmt


export interface AssignStmt {
  type: 'assign';
  lvalue: string;   
  expr: Expr;
}

export interface ArrayAssignStmt {
  type: 'arrayAssign';
  array: string;   
  index: Expr;
  expr: Expr;
}

export interface TupleAssignStmt {
  type: 'tupleAssign';
  lvalues: string[];  
  function: FunctionCall; 
}

export interface ConditionalStmt {
  type: 'if';
  condition: Condition;
  thenBranch: Statement;
  elseBranch?: Statement;
}

export interface LoopStmt {
  type: 'while';
  condition: Condition;
  body: Statement;
}

export interface BlockStmt {
  type: 'block';
  statements: Statement[];
}


export type Expr =
  | ArithExpr
  | FunctionCall
  | ArrayAccessExpr;

export interface FunctionCall {
  type: 'callFunction';
  name: string;
  args: Expr[];
}

export interface ArrayAccessExpr {
  type: 'arrayAccess';
  array: string;
  index: Expr;
}

export type Condition =
  | BoolConst
  | ComparisonCond
  | NotCondNode
  | AndCondNode
  | OrCondNode
  | ImplCondNode;

export interface BoolConst {
  type: 'bool';
  value: boolean;
}

export interface ComparisonCond {
  type: 'comparison';
  op: "==" | "!=" | ">=" | "<=" | ">" | "<";
  left: Expr;
  right: Expr;
}

export interface NotCondNode {
  type: 'notCond';
  expr: Condition;
}

export interface AndCondNode {
  type: 'andCond';
  left: Condition;
  right: Condition;
}

export interface OrCondNode {
  type: 'orCond';
  left: Condition;
  right: Condition;
}

export interface ImplCondNode {
  type: 'implCond';
  left: Condition;
  right: Condition;
}

export type Predicate =
  | BoolConst
  | ComparisonCond
  | NotPredNode
  | AndPredNode
  | OrPredNode
  | QuantifierPred
  | FormulaRefPred;

export interface NotPredNode {
  type: 'notPred';
  expr: Predicate;
}

export interface AndPredNode {
  type: 'andPred';
  left: Predicate;
  right: Predicate;
}

export interface OrPredNode {
  type: 'orPred';
  left: Predicate;
  right: Predicate;
}

export interface QuantifierPred {
  type: 'quantifier';
  quantifier: "forall" | "exists";
  param: ParameterDef;  
  body: Predicate;
}

export interface FormulaRefPred {
  type: 'formulaRef';
  name: string;
  args: Expr[];
}
