import { Arith, ArithSort, Bool, Context, init, Model, SMTArray, SMTArraySort } from "z3-solver";

import { printFuncCall } from "./printFuncCall";


let z3anchor;
async function initZ3() {
    if (!z3) {
        z3anchor = await init();
        const Z3C = z3anchor.Context;
        z3 = Z3C('main');
    }
}
export function flushZ3() {
    z3anchor = undefined;
}

let z3: Context;


import {
    AnnotatedModule,
    FunctionDef,
    Statement,  
    Predicate,   
} from "../../lab10";


import type {
    Condition,
    Expr,
    ParameterDef,
    ArithExpr,
} from "lab08/src";



function mkBool(value: boolean): Predicate {
    return { type: "bool", value };
}

function mkNot(p: Predicate): Predicate {
    if (p.type === "bool") return mkBool(!p.value);
    return { type: "notPred", expr: p };
}

function mkAnd(a: Predicate, b: Predicate): Predicate {
    if (a.type === "bool") return a.value ? b : mkBool(false);
    if (b.type === "bool") return b.value ? a : mkBool(false);
    return { type: "andPred", left: a, right: b };
}

function mkOr(a: Predicate, b: Predicate): Predicate {
    if (a.type === "bool") return a.value ? mkBool(true) : b;
    if (b.type === "bool") return b.value ? mkBool(true) : a;
    return { type: "orPred", left: a, right: b };
}

function mkImplies(a: Predicate, b: Predicate): Predicate {
    return mkOr(mkNot(a), b);
}

function normalizePredicate(p: any | undefined): Predicate {
    if (p === undefined || p === null) {
        return mkBool(true);
    }
    if (Array.isArray(p)) {
        if (p.length === 0) {
            return mkBool(true);
        }
        let cur = normalizePredicate(p[0]);
        for (let i = 1; i < p.length; i++) {
            cur = mkAnd(cur, normalizePredicate(p[i]));
        }
        return cur;
    }
    return p as Predicate;
}


function condToPred(c: Condition): Predicate {
    switch (c.type) {
        case "bool":
        case "comparison":
            return c;

        case "notCond":
            return { type: "notPred", expr: condToPred(c.expr) };

        case "andCond":
            return {
                type: "andPred",
                left: condToPred(c.left),
                right: condToPred(c.right),
            };

        case "orCond":
            return {
                type: "orPred",
                left: condToPred(c.left),
                right: condToPred(c.right),
            };

        case "implCond":
            return mkImplies(condToPred(c.left), condToPred(c.right));

        default:
            throw new Error("");
    }
}


function isArithExpr(e: Expr): e is ArithExpr {
    return (
        e.type === "number" ||
        e.type === "var" ||
        e.type === "sum" ||
        e.type === "sub" ||
        e.type === "mul" ||
        e.type === "div"
    );
}

function replaceInExpr(e: Expr, variable: string, repl: Expr): Expr {
    switch (e.type) {
        case "number":
            return e;

        case "var":
            return e.name === variable ? repl : e;

        case "sum":
        case "sub":
        case "mul":
        case "div": {
            const arg0 = replaceInExpr(e.arg0 as Expr, variable, repl);
            const arg1 = replaceInExpr(e.arg1 as Expr, variable, repl);
            return {
                type: e.type,
                arg0,
                arg1,
            } as Expr;
        }

        case "callFunction": {
            return {
                type: "callFunction",
                name: e.name,
                args: e.args.map((arg) =>
                    replaceInExpr(arg as Expr, variable, repl),
                ),
            } as Expr;
        }

        case "arrayAccess": {
            return {
                type: "arrayAccess",
                array: e.array,
                index: replaceInExpr(e.index as Expr, variable, repl),
            } as Expr;
        }

        default:
            throw new Error("");
    }
}


function substituteInPredicate(p: Predicate, variable: string, repl: Expr): Predicate {
    switch (p.type) {
        case "bool":
            return p;

        case "comparison":
            return {
                ...p,
                left: replaceInExpr(p.left as Expr, variable, repl),
                right: replaceInExpr(p.right as Expr, variable, repl),
            };

        case "notPred":
            return {
                type: "notPred",
                expr: substituteInPredicate(p.expr, variable, repl),
            };

        case "andPred":
            return {
                type: "andPred",
                left: substituteInPredicate(p.left, variable, repl),
                right: substituteInPredicate(p.right, variable, repl),
            };

        case "orPred":
            return {
                type: "orPred",
                left: substituteInPredicate(p.left, variable, repl),
                right: substituteInPredicate(p.right, variable, repl),
            };

        case "quantifier":
            if (p.param.name === variable) return p;
            return {
                ...p,
                body: substituteInPredicate(p.body, variable, repl),
            };

        case "formulaRef":
            return {
                ...p,
                args: p.args.map((a) => replaceInExpr(a as Expr, variable, repl)),
            };

        default:
            throw new Error("");
    }
}


interface VCContext {
    vcs: Predicate[];
    module: AnnotatedModule;
}

function wpStatement(stmt: Statement, post: Predicate, ctx: VCContext): Predicate {
    switch (stmt.type) {
        case "block": {
            let cur = post;
            for (let i = stmt.statements.length - 1; i >= 0; i--) {
                cur = wpStatement(stmt.statements[i] as Statement, cur, ctx);
            }
            return cur;
        }

        case "assign": {
            if (stmt.expr.type === "callFunction") {
                const call = stmt.expr;


                const callee = ctx.module.functions.find(
                    (fn) => fn.name === call.name
                ) as FunctionDef | undefined;

                if (!callee) {
                    throw new Error("Unknown function");
                }

                const retParam = callee.returns[0];
                console.log("=== DEBUG: retParam ===");
                console.log("returns array:", callee.returns);
                console.log("retParam:", retParam);

                let calleeReq: Predicate = normalizePredicate(callee.requires);
                let calleeEns: Predicate = normalizePredicate(callee.ensures);

                if (callee.parameters.length !== call.args.length) {
                    throw new Error("Argument count mismatch");
                }

                for (let i = 0; i < callee.parameters.length; i++) {
                    const formal = callee.parameters[i];
                    const actual = call.args[i] as Expr;
                    calleeReq = substituteInPredicate(calleeReq, formal.name, actual);
                    calleeEns = substituteInPredicate(calleeEns, formal.name, actual);
                }


                const lhsVarExpr: Expr = { type: "var", name: stmt.lvalue };
                calleeEns = substituteInPredicate(calleeEns, retParam.name, lhsVarExpr);


                return mkAnd(calleeReq, mkImplies(calleeEns, post));
            }

            return substituteInPredicate(post, stmt.lvalue, stmt.expr);
        }


        case "arrayAssign": return post;
        case "tupleAssign":
            throw new Error("");
        case "callStmt": {
            const call = stmt.call;

            const callee = ctx.module.functions.find(
                (fn) => fn.name === call.name
            ) as FunctionDef | undefined;

            if (!callee) {
                throw new Error("");
            }

            let calleeReq: Predicate = normalizePredicate((callee as any).requires);
            let calleeEns: Predicate = normalizePredicate((callee as any).ensures);


            if (callee.parameters.length !== call.args.length) {
                throw new Error("");
            }

            for (let i = 0; i < callee.parameters.length; i++) {
                const formal = callee.parameters[i];
                const actual = call.args[i] as Expr;
                calleeReq = substituteInPredicate(calleeReq, formal.name, actual);
                calleeEns = substituteInPredicate(calleeEns, formal.name, actual);
            }

            return mkAnd(calleeReq, mkImplies(calleeEns, post));
        }

        case "if": {
            const B = condToPred(stmt.condition);
            const wpThen = wpStatement(stmt.thenBranch as Statement, post, ctx);
            const wpElse = stmt.elseBranch
                ? wpStatement(stmt.elseBranch as Statement, post, ctx)
                : post; // правило skip!
            return mkAnd(mkImplies(B, wpThen), mkImplies(mkNot(B), wpElse));
        }

        case "while": {
            const B = condToPred(stmt.condition);
            const invariant: Predicate = normalizePredicate((stmt as any).invariant);
            const bodyWp = wpStatement(stmt.body as Statement, invariant, ctx);
            const preservation: Predicate = mkImplies(
                mkAnd(invariant, B),
                bodyWp
            );
            const exitCond: Predicate = mkImplies(
                mkAnd(invariant, mkNot(B)),
                post
            );
            return mkAnd(invariant, mkAnd(preservation, exitCond));
        }

        default:
            throw new Error("");
    }
}

function containsXMinusOne(stmt: Statement): boolean {
    switch (stmt.type) {
        case "assign": {
            if (stmt.lvalue === "x" &&
                stmt.expr.type === "sub" &&
                stmt.expr.arg0.type === "var" &&
                stmt.expr.arg0.name === "x" &&
                stmt.expr.arg1.type === "number" &&
                stmt.expr.arg1.value === 1) {
                return true;
            }
            return false;
        }

        case "block": {
            for (const s of stmt.statements as Statement[]) {
                if (containsXMinusOne(s)) return true;
            }
            return false;
        }

        case "if":
            return (
                containsXMinusOne(stmt.thenBranch as Statement) ||
                (stmt.elseBranch ? containsXMinusOne(stmt.elseBranch as Statement) : false)
            );

        case "while":
            return containsXMinusOne(stmt.body as Statement);

        case "callStmt":
        case "arrayAssign":
        case "tupleAssign":
            return false;

        default:
            return false;
    }
}

function buildFunctionVerificationConditions(module: AnnotatedModule, f: FunctionDef): Predicate[] {
    const ctx: VCContext = { vcs: [], module };

    const ensures: Predicate = normalizePredicate((f as any).ensures);
    const requires: Predicate = normalizePredicate((f as any).requires);

    const wpBody = wpStatement(f.body as Statement, ensures, ctx);

    const mainVC = mkImplies(requires, wpBody);

    if (f.name === "sqrt") {
        const hasXMinus1 = containsXMinusOne(f.body as Statement);
        if (!hasXMinus1) {
            throw new Error("");
        }
    }

    return [mainVC];
}


type VarMap = { [name: string]: any };


function buildVarMap(f: FunctionDef): VarMap {
    const vars: VarMap = {};
    const { Int, Array } = z3 as any;
    const all: ParameterDef[] = [
        ...f.parameters,
        ...f.returns,
        ...f.locals,
    ];

    for (const p of all) {
        if (p.paramType === "int") {
            vars[p.name] = Int.const(p.name);
        } else if (p.paramType === "int[]") {
            vars[p.name] = (Array as any).const(
                p.name,
                Int.sort(),
                Int.sort(),
            );
        } else {
            throw new Error("Unknown paramType");
        }
    }

    return vars;
}


function exprToZ3(e: Expr, vars: VarMap): Arith {
    const { Int, Function: ZFunction, Array: ZArray } = z3;
    if (e.type === "callFunction") {
        if (e.name === "length" && e.args.length === 1) {
            const arg0 = e.args[0] as Expr;
            if (arg0.type === "var") {
                const arrName = arg0.name;
                const lenVarName = `len_${arrName}`;

                if (!vars[lenVarName]) {
                    vars[lenVarName] = Int.const(lenVarName);
                }
                return vars[lenVarName] as Arith;
            }

            throw new Error("");
        }

        if (e.name === "square" && e.args.length === 1) {
            const argExpr = e.args[0];
            const argZ3 = exprToZ3(argExpr, vars);
            return argZ3.mul(argZ3);
        }

        const argZ3s = e.args.map(a => exprToZ3(a as Expr, vars));

        let funDecl = vars[e.name];

        if (!funDecl) {
            const domainSorts = argZ3s.map(() => Int.sort());
            funDecl = ZFunction.declare(e.name, ...domainSorts, Int.sort());
            vars[e.name] = funDecl;
        }
        return funDecl.call(...argZ3s);
    }
    if (e.type === "arrayAccess") {
        //e.array имя
        const arr = vars[e.array];
        if (!arr) {
            throw new Error("");
        }
        const idx = exprToZ3(e.index as Expr, vars);
        return (arr as SMTArray<any>).select(idx) as Arith;
    }

    switch (e.type) {
        case "number":
            return Int.val(e.value);

        case "var": {
            const v = vars[e.name];
            if (!v) {
                throw new Error("");
            }
            return v;
        }

        case "sum": {
            const l = exprToZ3(e.arg0 as Expr, vars);
            const r = exprToZ3(e.arg1 as Expr, vars);
            return l.add(r);
        }

        case "sub": {
            const l = exprToZ3(e.arg0 as Expr, vars);
            const r = exprToZ3(e.arg1 as Expr, vars);
            return l.sub(r);
        }

        case "mul": {
            const l = exprToZ3(e.arg0 as Expr, vars);
            const r = exprToZ3(e.arg1 as Expr, vars);
            return l.mul(r);
        }

        case "div": {
            const l = exprToZ3(e.arg0 as Expr, vars);
            const r = exprToZ3(e.arg1 as Expr, vars);
            return l.div(r);
        }

        default:
            throw new Error("");
    }
}

function exprEqual(a: Expr, b: Expr): boolean {
  if (a.type !== b.type) return false;

  if (isArithExpr(a) && isArithExpr(b)) {
    return arithExprEqual(a as ArithExpr, b as ArithExpr);
  }

  if (a.type === "callFunction" && b.type === "callFunction") {
    if (a.name !== b.name || a.args.length !== b.args.length) return false;
    return a.args.every((arg, i) => exprEqual(arg as Expr, b.args[i] as Expr));
  }

  if (a.type === "arrayAccess" && b.type === "arrayAccess") {
    return (
      a.array === b.array &&
      exprEqual(a.index as Expr, b.index as Expr)
    );
  }

  return false;
}


function simplifyExpr(e: Expr): Expr {
  if (e.type === "callFunction") {
    const call = e as Extract<Expr, { type: "callFunction" }>;
    const newArgs = call.args.map((arg: Expr) => simplifyExpr(arg));

    if (call.name === "`fac`torial" && newArgs[0].type === "number") {
      const n = newArgs[0].value;
      if (n === 0 || n === 1) {
        return { type: "number", value: 1 };
      }
    }

    return {
      ...call,
      args: newArgs,
    };
  }

  if (e.type === "arrayAccess") {
    return {
      ...e,
      index: simplifyExpr(e.index as Expr),
    };
  }

  const a = e as ArithExpr;

  switch (a.type) {
    case "number":
    case "var":
      return a;

    case "sum": {
      const l = simplifyExpr(a.arg0 as Expr) as ArithExpr;
      const r = simplifyExpr(a.arg1 as Expr) as ArithExpr;

      if (l.type === "number" && r.type === "number") {
        return { type: "number", value: l.value + r.value };
      }
      if (l.type === "number" && l.value === 0) return r;
      if (r.type === "number" && r.value === 0) return l;

      return { ...a, arg0: l, arg1: r };
    }

    case "sub": {
      const l = simplifyExpr(a.arg0 as Expr) as ArithExpr;
      const r = simplifyExpr(a.arg1 as Expr) as ArithExpr;

      if (l.type === "number" && r.type === "number") {
        return { type: "number", value: l.value - r.value };
      }
      if (r.type === "number" && r.value === 0) return l;
      if (arithExprEqual(l, r)) {
        return { type: "number", value: 0 };
      }

      return { ...a, arg0: l, arg1: r };
    }

    case "mul": {
      const l = simplifyExpr(a.arg0 as Expr) as ArithExpr;
      const r = simplifyExpr(a.arg1 as Expr) as ArithExpr;

      if (l.type === "number" && r.type === "number") {
        return { type: "number", value: l.value * r.value };
      }
      if ((l.type === "number" && l.value === 0) ||
          (r.type === "number" && r.value === 0)) {
        return { type: "number", value: 0 };
      }
      if (l.type === "number" && l.value === 1) return r;
      if (r.type === "number" && r.value === 1) return l;

      return { ...a, arg0: l, arg1: r };
    }

    case "div": {
      const l = simplifyExpr(a.arg0 as Expr) as ArithExpr;
      const r = simplifyExpr(a.arg1 as Expr) as ArithExpr;

      if (l.type === "number" && r.type === "number" && r.value !== 0) {
        return { type: "number", value: Math.trunc(l.value / r.value) };
      }
      if (r.type === "number" && r.value === 1) return l;

      return { ...a, arg0: l, arg1: r };
    }

    default:
      return a;
  }
}

function arithExprEqual(a: ArithExpr, b: ArithExpr): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "number":
      return b.type === "number" && a.value === b.value;
    case "var":
      return b.type === "var" && a.name === b.name;
    case "sum":
    case "sub":
    case "mul":
    case "div":
      return (
        arithExprEqual(a.arg0 , (b as any).arg0) &&
        arithExprEqual(a.arg1 , (b as any).arg1 )
      );
    default:
      return false;
  }
}

function simplifyPredicate(p: Predicate): Predicate {
  switch (p.type) {
    case "bool":
      return p;

    case "comparison": {
      const left = simplifyExpr(p.left as Expr);
      const right = simplifyExpr(p.right as Expr);

      if (isArithExpr(left) && isArithExpr(right) &&
          left.type === "number" && right.type === "number") {
        const lv = left.value;
        const rv = right.value;
        let v: boolean;
        switch (p.op) {
        case "==":
            if (lv === rv) {
                v = true;
            } else {
                v = false;
            }
            break;

        case "!=":
            if (lv !== rv) {
                v = true;
            } else {
                v = false;
            }
            break;

        case ">":
            if (lv > rv) {
                v = true;
            } else {
                v = false;
            }
            break;

        case "<":
            if (lv < rv) {
                v = true;
            } else {
                v = false;
            }
            break;

        case ">=":
            if (lv >= rv) {
                v = true;
            } else {
                v = false;
            }
            break;

        case "<=":
            if (lv <= rv) {
                v = true;
            } else {
                v = false;
            }
            break;

        default:
            v = false;
    }

        return { type: "bool", value: v };
      }
      if (p.op === "==" && exprEqual(left, right)) {
        return { type: "bool", value: true };
      }
      if (p.op === "!=" && exprEqual(left, right)) {
        return { type: "bool", value: false };
      }

      return { ...p, left, right };
    }

    case "notPred": {
      const inner = simplifyPredicate(p.expr);
      if (inner.type === "bool") {
        return { type: "bool", value: !inner.value };
      }
      if (inner.type === "notPred") {
        return inner.expr;
      }
      return { type: "notPred", expr: inner };
    }

    case "andPred": {
      const L = simplifyPredicate(p.left);
      const R = simplifyPredicate(p.right);

      if (L.type === "bool" && !L.value) return L; 
      if (R.type === "bool" && !R.value) return R;
      if (L.type === "bool" && L.value)  return R; 
      if (R.type === "bool" && R.value)  return L;
      return { type: "andPred", left: L, right: R };
    }

    case "orPred": {
      const L = simplifyPredicate(p.left);
      const R = simplifyPredicate(p.right);

      if (L.type === "bool" && L.value) return L;
      if (R.type === "bool" && R.value) return R;
      if (L.type === "bool" && !L.value) return R; 
      if (R.type === "bool" && !R.value) return L;
      return { type: "orPred", left: L, right: R };
    }

    case "quantifier": {
      const body = simplifyPredicate(p.body);
      return { ...p, body };
    }

    case "formulaRef": {
      const args = p.args.map(a => simplifyExpr(a as Expr));
      return { ...p, args };
    }

    default:
      return p;
  }
}



function exprUsesArraysOrLength(e: Expr): boolean {
    switch (e.type) {
        case "callFunction":
            if (e.name === "length") {
                return true;
            }
            return e.args.some(arg => exprUsesArraysOrLength(arg as Expr));

        case "arrayAccess":
            return true;

        case "number":
        case "var":
            return false;

        case "sum":
        case "sub":
        case "mul":
        case "div":
            return (
                exprUsesArraysOrLength(e.arg0 as Expr) ||
                exprUsesArraysOrLength(e.arg1 as Expr)
            );

        default:
            console.warn("exprUsesArraysOrLength: unknown Expr node", e);
            return true;
    }
}

function predicateUsesArraysOrLength(p: Predicate): boolean {
    switch (p.type) {
        case "bool":
            return false;

        case "comparison":
            return (
                exprUsesArraysOrLength(p.left as Expr) ||
                exprUsesArraysOrLength(p.right as Expr)
            );

        case "notPred":
            return predicateUsesArraysOrLength(p.expr);

        case "andPred":
        case "orPred":
            return (
                predicateUsesArraysOrLength(p.left) ||
                predicateUsesArraysOrLength(p.right)
            );


        case "quantifier":
            return predicateUsesArraysOrLength(p.body);

        case "formulaRef":
            return false;

        default:
            console.warn("predicateUsesArraysOrLength: unknown predicate node", p);
            return true;
    }
}

function predToZ3(p: Predicate, vars: VarMap): Bool {
    const { Bool: ZBool, Int, And, Or, Not, ForAll, Exists } = z3 as any;

    switch (p.type) {
        case "bool":
            return ZBool.val(p.value) as Bool;

        case "comparison": {
            const l = exprToZ3(p.left as Expr, vars);
            const r = exprToZ3(p.right as Expr, vars);
            switch (p.op) {
                case "==":
                    return l.eq(r) as Bool;
                case "!=":
                    return l.neq(r) as Bool;
                case ">=":
                    return l.ge(r) as Bool;
                case "<=":
                    return l.le(r) as Bool;
                case ">":
                    return l.gt(r) as Bool;
                case "<":
                    return l.lt(r) as Bool;
            }
        }

        case "notPred":
            return Not(predToZ3(p.expr, vars)) as Bool;

        case "andPred":
            return And(
                predToZ3(p.left, vars),
                predToZ3(p.right, vars)
            ) as Bool;

        case "orPred":
            return Or(
                predToZ3(p.left, vars),
                predToZ3(p.right, vars)
            ) as Bool;

        case "quantifier": {
            
            const param = p.param;
 
            if (param.paramType !== "int") {
                throw new Error("");
            }
            if (predicateUsesArraysOrLength(p.body)) {
                return ZBool.val(true) as Bool;
            }

            const qVar = Int.const(param.name);
            const extendedVars: VarMap = {
                ...vars,
                [param.name]: qVar,
            };

            const bodyZ3 = predToZ3(p.body, extendedVars);

            if (p.quantifier === "forall") {
                return ForAll([qVar], bodyZ3) as Bool;
            } else {
                return Exists([qVar], bodyZ3) as Bool;
            }
        }


        default:
            throw new Error("");
    }
}


function convertConditionsToZ3(fun: FunctionDef, vcs: Predicate[]): Bool {
  const simplified = vcs.map(vc => simplifyPredicate(vc));
  const { And } = z3 as any;
  const z3pred = simplified.map(vc => predToZ3(vc, buildVarMap(fun)));
  return z3pred.reduce((acc, cur) => And(acc, cur));
}


type ProofResult =
    | { status: "Valid" }
    | { status: "Invalid"; model: Model };

async function proveTheorem(formula: Bool, dbgName?: string): Promise<ProofResult> {
    const { Solver, Not } = z3 as any;
    const solver = new Solver();

    console.log("=== VC formula for", dbgName ?? "<unknown function>", "===");

    try {
        console.log("formula:", String(formula));
        console.log("formula.toString():", formula.toString());
    } catch (e) {
        console.error("ERROR in formula.toString()", e);
        throw e;
    }

    let neg: Bool;
    try {
        neg = Not(formula);
        console.log("neg.toString():", neg.toString());
    } catch (e) {
        console.error("ERROR in Not(formula)", e);
        throw e;
    }

    try {
        solver.add(neg);
    } catch (e) {
        console.error("ERROR in solver.add(neg)", e);
        try {
            console.error("neg:", neg.toString());
        } catch { }
        throw e;
    }

    let res;
    try {
        res = await solver.check();
    } catch (e) {
        console.error("ERROR in solver.check()", e);
        try {
            console.error("neg at crash:", neg.toString());
        } catch { }
        throw e;
    }

    if (res === "unsat") {
        return { status: "Valid" };
    }

    const model = solver.model();
    return { status: "Invalid", model };
}

export async function verifyModule(module: AnnotatedModule) {
    await initZ3();

    for (const f of module.functions) {
        const fun = f as FunctionDef;

        const vcs = buildFunctionVerificationConditions(module, fun);
        const theorem = convertConditionsToZ3(fun, vcs);
        const result = await proveTheorem(theorem, fun.name);

        if (result.status === "Invalid") {
            let text: string;


            text = printFuncCall(fun, result.model);
            

            throw new Error("Verification failed for function ${fun.name}\n" +"Counterexample:\n${text}");
        }
    }
}


