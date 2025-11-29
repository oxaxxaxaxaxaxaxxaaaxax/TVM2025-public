import { getExprAst } from '../../lab04';
import * as ast from './funny';

import grammar, { FunnyActionDict } from './funny.ohm-bundle';

import { MatchResult, Semantics } from 'ohm-js';


import { FunnyError } from "./index";


export function checkUniqueNames(items: ast.ParameterDef[] | ast.ParameterDef | undefined | null, what: string) {
  if (!items) return;
  const arr = Array.isArray(items) ? items : [items];
  const seen = new Set<string>();
  for (const item of arr) {
    if (seen.has(item.name)) {
      throw new FunnyError("Redeclaration of name", " ");
    }
    seen.add(item.name);
  }
}

export function getDeclaredNames(func: ast.FunctionDef): Set<string> {
  const s = new Set<string>();
  for (const p of func.parameters) s.add(p.name);
  for (const r of func.returns) s.add(r.name);
  for (const l of func.locals) s.add(l.name);
  return s;
}

function addNames(node: any, out: Set<string>) {
  if (Array.isArray(node)) {
    for (const el of node) {
      addNames(el, out);
    }
    return;
  }
  if (node.type === "callFunction") {
    if (Array.isArray(node.args)) {
      for (const arg of node.args) {
        addNames(arg, out);
      }
    }
    return;
  }
  if (node.type === "arrayAccess") {
    out.add(node.array);
    addNames(node.index, out);
    return;
  }
  if (node.type === "var") {
    out.add(node.name);
    return;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      addNames(value, out);
    }
  }
}

function addNamesStat(stmt: ast.Statement, out: Set<string>) {
  if (stmt.type == "assign"){
    out.add(stmt.lvalue);
    addNames(stmt.expr, out);
    return;
  }
  if (stmt.type == "arrayAssign"){
    out.add(stmt.array);
    addNames(stmt.index, out);
    addNames(stmt.expr, out);
    return;
  }
  if (stmt.type == "tupleAssign"){
    if (Array.isArray(stmt.lvalues)) {
      for (const name of stmt.lvalues) {
        out.add(name);
      }
    }
    addNames(stmt.function, out);
    return;
  }
  if (stmt.type == "if"){
    addNames(stmt.condition, out);
    addNamesStat(stmt.thenBranch, out);
    if (stmt.elseBranch){
      addNamesStat(stmt.elseBranch, out);
    } 
    return;
  }
  if (stmt.type == "while"){
    addNames(stmt.condition, out);
    addNamesStat(stmt.body, out);
    return;
  }
  if (stmt.type == "block"){
    if (Array.isArray(stmt.statements)) {
      for (const s of stmt.statements) {
        addNamesStat(s, out);
      }
    }
    return;
  }
}

function checkNamesDeclared(module: ast.Module) {
  for (const func of module.functions) {
    const declared = getDeclaredNames(func);
    const used = new Set<string>();
    addNamesStat(func.body, used);
    for (const name of used) {
      if (!declared.has(name)) {
        throw new FunnyError("Name not declared", " ");
      }
    }
  }
}

function checkExpr(expr: ast.Expr, funTable :Map<string, { params: number; returns: number }>,expectedReturns?: number ) {
  if (!expr) return;

  if (expr.type === "callFunction") {
    const name = expr.name;
    const args = funTable.get(name);
    if (!args) {
      throw new FunnyError("Undeclared function call"," ");
    }
    if (expr.args.length !== args.params) {
      throw new FunnyError("Argument mismatch"," ");
    }
    if (expectedReturns !== undefined && args.returns !== expectedReturns) {
      throw new FunnyError("Return mismatch"," ");
    }
    for (const arg of expr.args) {
      checkExpr(arg, funTable,1);
    }
    return;
  }

  if (expr.type === "arrayAccess") {
    checkExpr(expr.index, funTable,1);
    return;
  }
}

function checkStatement(stmt: ast.Statement, funTable :Map<string, { params: number; returns: number }>) {
  if (stmt.type == "assign") {
    checkExpr(stmt.expr, funTable,1);
    return;
  }
  if (stmt.type == "arrayAssign") {
    checkExpr(stmt.index, funTable,1);
    checkExpr(stmt.expr, funTable,1);
    return;
  }
  if (stmt.type == "tupleAssign") {
    const need = stmt.lvalues.length;
    checkExpr(stmt.function, funTable,need);
    return;
  }
  if (stmt.type == "if") {
    checkStatement(stmt.thenBranch, funTable);
    if (stmt.elseBranch) checkStatement(stmt.elseBranch, funTable);
    return;
  }
  if (stmt.type == "while") {
    checkStatement(stmt.body, funTable);
    return;
  }
  if (stmt.type == "block") {
    for (const s of stmt.statements) {
      checkStatement(s, funTable);
    }
    return;
  }
}


export function checkFunctionCalls(mod: ast.Module) {
  const funTable = new Map<string, { params: number; returns: number }>();
  for (const f of mod.functions) {
    funTable.set(f.name, {
      params: f.parameters.length,
      returns: f.returns.length,
    });
  }
  funTable.set("length", {
    params: 1,
    returns: 1,
  });

  for (const f of mod.functions) {
    checkStatement(f.body, funTable);
  }
}

function checkModule(module: ast.Module) {
  console.log("=== DEBUG: module functions ===");
  for (const func of module.functions) {
    console.log("function:", func.name);
    console.log("params:", func.parameters?.map(p => p.name));
    console.log("returns:", func.returns?.map(p => p.name));
    console.log("locals:", func.locals?.map((p) => p.name));
  }
  for (const func of module.functions) {
    const defs =[];

    if (func.parameters) {
      for (const p of func.parameters) {
        defs.push(p);
      }
    }
    if (func.returns) {
      for (const r of func.returns) {
        defs.push(r);
      }
    }
    if (func.locals) {
      for (const l of func.locals) {
        defs.push(l);
      }
    }
    checkUniqueNames(defs, "redeclaration");
  }
  checkNamesDeclared(module);
  checkFunctionCalls(module);
}

export const getFunnyAst = {
  ...getExprAst,
  Module(funcs) {
      const functions = funcs.children.map(c => c.parse() as ast.FunctionDef);
      const m: ast.Module = {
      type: "module",
      functions: functions,
      };
      return m;
  },
  FunctionDef(name, lp, paramsOpt, rp, returnsKw, returnList, usesOpt1, usesOpt2, body) {
      const funName = name.sourceString;
  
      const parameters: ast.ParameterDef[] =
        paramsOpt.children.length === 0 ? [] : paramsOpt.parse();
  
      const returns: ast.ParameterDef[] = returnList.parse();
  
      const locals: ast.ParameterDef[] =
        usesOpt2.children.length === 0 ? [] : usesOpt2.parse();
  
      const bodyStmt = body.parse() as ast.Statement;
  
      const f: ast.FunctionDef = {
        type: "function",
        name: funName,
        parameters:parameters,
        returns:returns,
        locals:locals,
        body: bodyStmt
      };
      return f;
  },
  ParamList(first, _seps, restParams) {
    const head = first.parse() as ast.ParameterDef;
    const tailRaw = restParams.parse() as ast.ParameterDef | ast.ParameterDef[] | [];
    let tail: any[];
    if (Array.isArray(tailRaw)){
      tail = tailRaw;
    } else if(tailRaw){
      tail = [tailRaw];
    }else{
      tail = [];
    }
    return [head, ...tail];
  },

  ReturnList_params(first, _seps, restParams) {
    const head = first.parse() as ast.ParameterDef;
    const tailRaw = restParams.parse() as ast.ParameterDef | ast.ParameterDef[] | [];
    let tail: any[];
    if (Array.isArray(tailRaw)){
      tail = tailRaw;
    } else if(tailRaw){
      tail = [tailRaw];
    }else{
      tail = [];
    }
    return [head, ...tail];
  },


   ReturnList_void(voidTok) {
    return [];
  },

  LocalParamDefList(first, _seps, restParams) {
    const head = first.parse() as ast.ParameterDef;
    const tailRaw = restParams.parse() as ast.ParameterDef | ast.ParameterDef[] | [];
    let tail: any[];
    if (Array.isArray(tailRaw)){
      tail = tailRaw;
    } else if(tailRaw){
      tail = [tailRaw];
    }else{
      tail = [];
    }
    return [head, ...tail];
  },
  ParameterDef(name, colon, paramNode) {
      const paramType = paramNode.parse() as ast.ParamType;
      return {
        type: "param",
        name: name.sourceString,
        paramType: paramType,
      };
  },
  LocalParamDef(name, colon, int) {
      return{
        type: "param",
        name: name.sourceString,
        paramType: "int",
      };
  },
  ReturnParamDef(name, colon, paramNode) {
      const paramType = paramNode.parse() as ast.ParamType;
      return {
        type: "param",
        name: name.sourceString,
        paramType:paramType,
      };
  },
  ParamType_array(tok){
      return "int[]";
  },
  ParamType_int(tok){
      return "int";
  },
  ParamName(nameTok) {
      return nameTok.sourceString;
  },
  Statement(stmt) {
      return stmt.parse();
  },

  CallStatement(callNode,_semi,) {
    return {
      type: "callStmt",
      call: callNode.parse(),
    };
  },
  Assignment_basic(paramName, eq, exprNode, semicolon) {
      const lvalue = paramName.parse();
      const expr = exprNode.parse();
      return {
          type: 'assign',
          lvalue:lvalue,
          expr:expr,
      };
  },
  Assignment_array(arrayAccessNode, eq, exprNode, semicolon): ast.ArrayAssignStmt {
      const arr = arrayAccessNode.parse() as ast.ArrayAccessExpr;
      const expr = exprNode.parse() as ast.Expr;
      return { 
          type: 'arrayAssign',
          array: arr.array, 
          index: arr.index, 
          expr: expr };
  },
  ArrayAccess(paramName, lsquare, exprNode, rsquare): ast.ArrayAccessExpr {
      const arrayName = paramName.parse() as string;
      const indexExpr = exprNode.parse() as ast.Expr;
      return {
          type: "arrayAccess",
          array: arrayName,
          index: indexExpr,
      };
  },
  Assignment_tuple(firstName, names,names2, eq, callNode, semicolon): ast.TupleAssignStmt {
      const first = firstName.parse();
      const rest = names.children.map(c => c.children[1].parse() as string);
      const lvalues = [first, ...rest];
      const call = callNode.parse() as ast.FunctionCall;
      return { 
          type: 'tupleAssign', 
          lvalues: lvalues, 
          function: call 
      };
  },
  Conditional(ifTok, lp, condNode, rp, thenNode, elseNode, elseStmtOpt){
    
  

      if (elseNode.children.length > 0) {
        const c0 = elseNode.children[0] as any;
        
      }
      
      if (elseStmtOpt.children.length > 0) {
        const c0 = elseStmtOpt.children[0] as any;
        
      }
      

      const condition = condNode.parse() as ast.Condition;
      const thenBranch = thenNode.parse() as ast.Statement;
      let elseBranch: ast.Statement | undefined;
      if (elseStmtOpt.children.length === 0) {
        elseBranch = undefined;
      } else {
        const elseStmtNode = elseStmtOpt.children[0] ;
        elseBranch = elseStmtNode.parse() as ast.Statement;
      }

      return {
          type: "if",
          condition:condition,
          thenBranch:thenBranch,
          elseBranch:elseBranch,
      };
  },
  Loop(whileTok, lp, condNode, rp, body): ast.LoopStmt {
      return {
          type: "while",
          condition: condNode.parse() as ast.Condition,
          body: body.parse() as ast.Statement,
      };
  },
  Block(lcb, stmtsNode, rcb): ast.BlockStmt {
  const statements = stmtsNode.children.map(c => c.parse() as ast.Statement);
      return {
          type: "block",
          statements,
      };
  },
  Expr(addExp): ast.Expr {
      return addExp.parse() as ast.Expr;
  },
  PriExp_array(arrayNode): ast.ArrayAccessExpr {
      return arrayNode.parse() as ast.ArrayAccessExpr;
  },
  PriExp_call(callNode): ast.FunctionCall {
      return callNode.parse() as ast.FunctionCall;
  },
  FunctionCall(name, lp, argsOpt, rp): ast.FunctionCall {
      const nameFunc = name.sourceString;
      const args =
          argsOpt.children.length === 0 ? []: (argsOpt.children[0].parse());
      return {
          type: "callFunction",
          name: nameFunc,
          args: args,
      };
  },
  ArgList(first, rest,rest2): ast.Expr[] {
      const head = first.parse() as ast.Expr;
      const tail = rest2.children.map(c => c.parse());
      return [head, ...tail];
  },
  Condition(expr) {
      return expr.parse() as ast.Condition;
  },
  Implication_impl(leftNode, arrow, rightNode) {
      return{
        type: "implCond",
        left: leftNode.parse() as ast.Condition,
        right: rightNode.parse() as ast.Condition,
      };
  },
  Implication_or(orNode): ast.Condition {
      return orNode.parse() as ast.Condition;
  },
  OrCond_or(first, rest,rest2) {
      return rest2.children.map(c => c.parse()).reduce(
          (acc, rhs, i) => ({
              type: "orCond",
              left: acc,
              right: rhs,
          }),
          first.parse(),
      );
  },
  AndCond_and(first, rest,rest2) {
      return rest2.children.map(c => c.parse()).reduce(
          (acc, rhs) => ({
              type: "andCond",
              left: acc,
              right: rhs,
          }),
          first.parse(),
      );
  },
  NotCond_not(not, node) {
      return {
        type: "notCond",
        expr: node.parse() as ast.Condition,
      };
  },
  NotCond_atom(atom) {
      return atom.parse()
  },
  CondAtom_true(node) {
      return {
        type: "bool",
        value: true,
      };
  },
  CondAtom_false(node) {
      return {
        type: "bool",
        value: false,
      };
  },
  CondAtom_cmp(node) {
      return node.parse() as ast.ComparisonCond;
  },
  CondAtom_paren(lp, node, rp) {
      return node.parse() as ast.Condition;
  },
  Comparison(leftNode, op, rightNode) {
      return {
        type: "comparison",
        op: op.sourceString,
        left: leftNode.parse(),
        right: rightNode.parse(),
      };
  },
  Predicate(node) {
    return node.parse() as ast.Predicate;
  },

  ImplicationPred_impl(left, arrow, right) {
  const l = left.parse();   // Predicate
  const r = right.parse();  // Predicate

  // A -> B  ≡  (not A) or B
  return {
    type: "orPred",
    left: {
      type: "notPred",
      expr: l,
    },
    right: r,
  };
},

  ImplicationPred_or(expr) {
    return expr.parse();
  },

  OrPred_or(first, rest,rest2) {
  return rest2.children.map((pair) => pair.parse()).reduce(
          (acc, rhs) => ({
              type: "orPred",
              left: acc,
              right: rhs,
          }),
          first.parse() as ast.Predicate,
      );
  },
  AndPred_and(first, rest,rest2) {
  return rest2.children.map((pair) => pair.parse()).reduce(
          (acc, rhs) => ({
              type: "andPred",
              left: acc,
              right: rhs,
          }),
          first.parse(),
      );
  },
  NotPred_not(notTok, node) {
      return {
          type: "notPred",
          expr: node.parse(),
      };
  },
  NotPred_atom(atom) {
      return atom.parse();
  },
  PredAtom_quantifier(node) {
      return node.parse();
  },
  PredAtom_true(node) {
      return {
          type: "bool",
          value: true,
      };
  },
  PredAtom_false(node) {
      return {
          type: "bool",
          value: false,
      };
  },
  PredAtom_cmp(node) {
      return node.parse();
  },
  PredAtom_paren(lp, node, rp) {
      return node.parse();
  },
  Quantifier(quantTok, lp, paramNode, vbar, bodyNode, rp) {
      return {
          type: "quantifier",
          quantifier: quantTok.sourceString,
          param: paramNode.parse(),
          body: bodyNode.parse(),
      };
  },
  _iter(...children) {
      if (children.length === 0) return [];
      if (children.length === 1) return children[0].parse();
      return children.map(c => c.parse());
  },
  _terminal() {
    return this.sourceString;
  },

} satisfies FunnyActionDict<any>;

export const semantics: FunnySemanticsExt = grammar.Funny.createSemantics() as FunnySemanticsExt;
semantics.addOperation("parse()", getFunnyAst);
export interface FunnySemanticsExt extends Semantics
{
    (match: MatchResult): FunnyActionsExt
}
interface FunnyActionsExt 
{
    parse(): ast.Module;
}

export function parseFunny(source: string): ast.Module{
  const match = grammar.Funny.match(source, 'Module');
  if (!match.succeeded()) {
    throw new SyntaxError(match.message);
  }
  const mod = semantics(match).parse();
  checkModule(mod);
  return mod
}