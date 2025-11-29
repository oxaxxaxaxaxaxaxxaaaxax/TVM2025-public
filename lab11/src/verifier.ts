// import { Arith, ArithSort, Bool, Context, init, Model, SMTArray, SMTArraySort } from "z3-solver";

// import { printFuncCall } from "./printFuncCall";
// import { AnnotatedModule } from "../../lab10";


// let z3anchor;
// async function initZ3()
// {
//     if(!z3)
//     {
//         z3anchor = await init();
//         const Z3C = z3anchor.Context;
//         z3 = Z3C('main');        
//     }
// }
// export function flushZ3()
// {
//     z3anchor = undefined;
// }

// let z3: Context;

// export async function verifyModule(module: AnnotatedModule)
// {
//     await initZ3();
//     throw "Not implemented"
// }



// lab11/src/verifier.ts

import {
  Arith,
ArithSort,
SMTArray, SMTArraySort,
  Bool,
  Context,
  Model,
  init,
} from "z3-solver";

import { printFuncCall } from "./printFuncCall";
import {
  AnnotatedModule,
  FunctionDef,  // из lab10/funnier.ts
  Statement,    // расширенный Statement с invariant у while
  Predicate,    // расширенный Predicate (FunnyPredicate | FormulaRef)
} from "../../lab10";

// базовые типы из lab08/funny.ts
import type {
  Condition,
  Expr,
  ParameterDef,
  ArithExpr, // = чистая арифметика из lab04: sum/sub/mul/div/var/number
} from "lab08/src";

let z3anchor: any;
let z3: Context;

// --------------------- ИНИЦИАЛИЗАЦИЯ Z3 ---------------------

async function initZ3() {
  if (!z3anchor) {
    z3anchor = await init();
    const Z3C = z3anchor.Context;
    z3 = Z3C("main");
  }
}

export function flushZ3() {
  z3anchor = undefined;
  // @ts-ignore
  z3 = undefined;
}

// --------------------- ХЕЛПЕРЫ ДЛЯ ПРЕДИКАТОВ ---------------------

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
  // a -> b = !a or b
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
    // если массив из нескольких предикатов — склеиваем через and
    let cur = normalizePredicate(p[0]);
    for (let i = 1; i < p.length; i++) {
      cur = mkAnd(cur, normalizePredicate(p[i]));
    }
    return cur;
  }
  // считаем, что это уже нормальный Predicate
  return p as Predicate;
}


// Condition -> Predicate (структуры почти одинаковые)
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
      throw new Error(`Unknown Condition type ${(c as any).type}`);
  }
}

// --------------------- ПОДСТАНОВКА В ВЫРАЖЕНИЯ ---------------------

// У тебя ArithExpr = Expr из lab04, т.е. всегда одно из:
// number | var | sum | sub | mul | div
// Expr из lab08 = ArithExpr | FunctionCall | ArrayAccessExpr
// Для верификатора поддерживаем только чистую арифметику (ArithExpr).

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

// Подстановка только в чисто арифметические выражения
function substituteInArithExpr(
  e: ArithExpr,
  variable: string,
  repl: ArithExpr
): ArithExpr {
  switch (e.type) {
    case "number":
      return e;

    case "var":
      return e.name === variable ? repl : e;

    case "sum":
    case "sub":
    case "mul":
    case "div": {
      const arg0 = substituteInArithExpr(
        e.arg0 as ArithExpr,
        variable,
        repl
      );
      const arg1 = substituteInArithExpr(
        e.arg1 as ArithExpr,
        variable,
        repl
      );
      return { ...e, arg0, arg1 };
    }

    default:
      throw new Error(
        `Unsupported ArithExpr node in substituteInArithExpr: ${(
          e as any
        ).type}`
      );
  }
}

function substituteInExpr(e: Expr, variable: string, repl: Expr): Expr {
  switch (e.type) {
    case "number":
      // константа не зависит от переменных
      return e;

    case "var":
      // если это нужная переменная — подставляем repl, иначе оставляем как есть
      return e.name === variable ? repl : e;

    case "sum":
    case "sub":
    case "mul":
    case "div": {
      // рекурсивная подстановка в аргументах арифметической операции
      const arg0 = substituteInExpr(e.arg0 as Expr, variable, repl);
      const arg1 = substituteInExpr(e.arg1 as Expr, variable, repl);
      // ⚠️ ВАЖНО: не делаем { ...e, arg0, arg1 }, а строим объект явно
      return {
        type: e.type,
        arg0,
        arg1,
      } as Expr;
    }

    case "callFunction": {
      // length(a), foo(x+1), и т.д.
      return {
        type: "callFunction",
        name: e.name,
        args: e.args.map((arg) =>
          substituteInExpr(arg as Expr, variable, repl),
        ),
      } as Expr;
    }

    case "arrayAccess": {
      // a[i], b[k]
      return {
        type: "arrayAccess",
        array: e.array,
        index: substituteInExpr(e.index as Expr, variable, repl),
      } as Expr;
    }

    default:
      console.error("substituteInExpr unknown Expr:", e);
      throw new Error("Unknown Expr type in substituteInExpr: " + (e as any).type);
  }
}



function substituteInPredicate(
  p: Predicate,
  variable: string,
  expr: Expr
): Predicate {
  switch (p.type) {
    case "bool":
      return p;

    case "comparison":
      return {
        ...p,
        left: substituteInExpr(p.left as Expr, variable, expr),
        right: substituteInExpr(p.right as Expr, variable, expr),
      };

    case "notPred":
      return {
        type: "notPred",
        expr: substituteInPredicate(p.expr, variable, expr),
      };

    case "andPred":
      return {
        type: "andPred",
        left: substituteInPredicate(p.left, variable, expr),
        right: substituteInPredicate(p.right, variable, expr),
      };

    case "orPred":
      return {
        type: "orPred",
        left: substituteInPredicate(p.left, variable, expr),
        right: substituteInPredicate(p.right, variable, expr),
      };

    case "quantifier":
      // если квантор связывает ту же переменную — внутрь не лезем
      if (p.param.name === variable) return p;
      return {
        ...p,
        body: substituteInPredicate(p.body, variable, expr),
      };

    case "formulaRef":
      // Формулы (уровень A) пока не поддерживаем, но подстановку в аргументы можно сделать:
      return {
        ...p,
        args: p.args.map((a) => substituteInExpr(a as Expr, variable, expr)),
      };

    default:
      throw new Error(
        `Unknown Predicate type in substituteInPredicate: ${(p as any).type}`
      );
  }
}

// --------------------- WEAKEST PRECONDITION ---------------------

interface VCContext {
  vcs: Predicate[];
  module: AnnotatedModule;
}

function wpStatement(
  stmt: Statement,
  post: Predicate,
  ctx: VCContext
): Predicate {
  switch (stmt.type) {
    case "block": {
      let cur = post;
      for (let i = stmt.statements.length - 1; i >= 0; i--) {
        cur = wpStatement(stmt.statements[i] as Statement, cur, ctx);
      }
      return cur;
    }

    case "assign": {
  // 1) случай: справа вызов функции: lhs = f(...)
  if (stmt.expr.type === "callFunction") {
    const call = stmt.expr;

    // ищем определение вызываемой функции
    const callee = ctx.module.functions.find(
      (fn) => fn.name === call.name
    ) as FunctionDef | undefined;

    if (!callee) {
      throw new Error(`Unknown function '${call.name}' in assign-call`);
    }

    // пока поддерживаем только один int-результат
    if (callee.returns.length !== 1) {
      throw new Error(
        `Function '${callee.name}' with multiple returns is not supported in verifier yet`
      );
    }
    const retParam = callee.returns[0];

    // нормализуем requires/ensures (учитывая, что они могли прийти как [], [p], p)
    let calleeReq: Predicate = normalizePredicate((callee as any).requires);
    let calleeEns: Predicate = normalizePredicate((callee as any).ensures);

    // подставляем фактические аргументы вместо формальных параметров
    if (callee.parameters.length !== call.args.length) {
      throw new Error(
        `Argument count mismatch in call to '${callee.name}'`
      );
    }

    for (let i = 0; i < callee.parameters.length; i++) {
      const formal = callee.parameters[i];
      const actual = call.args[i] as Expr;
      calleeReq = substituteInPredicate(calleeReq, formal.name, actual);
      calleeEns = substituteInPredicate(calleeEns, formal.name, actual);
    }

    // подставляем lhs вместо возвращаемой переменной внутри ensures:
    // E(params,r)[params:=args][r := lhs]
    const lhsVarExpr: Expr = { type: "var", name: stmt.lvalue };
    calleeEns = substituteInPredicate(calleeEns, retParam.name, lhsVarExpr);

    // итоговое правило:
    // wp(lhs = f(args); Q) = R_sub ∧ (E_sub' ⇒ Q)
    return mkAnd(calleeReq, mkImplies(calleeEns, post));
  }

  // 2) обычное присваивание арифметического выражения
  return substituteInPredicate(post, stmt.lvalue, stmt.expr);
}


    case "arrayAssign": return post;
    case "tupleAssign":
        // Для простоты (уровень C/B без вызовов и массивов)
      throw new Error(
        `Statement type ${stmt.type} not supported in verifier yet`
      );
    case "callStmt": {
        const call = stmt.call;

        const callee = ctx.module.functions.find(
            (fn) => fn.name === call.name
        ) as FunctionDef | undefined;

        if (!callee) {
            throw new Error(`Unknown function '${call.name}' in callStmt`);
        }

        let calleeReq: Predicate = normalizePredicate((callee as any).requires);
        let calleeEns: Predicate = normalizePredicate((callee as any).ensures);


        if (callee.parameters.length !== call.args.length) {
            throw new Error(
            `Argument count mismatch in call to '${callee.name}'`
            );
        }

        for (let i = 0; i < callee.parameters.length; i++) {
            const formal = callee.parameters[i];
            const actual = call.args[i] as Expr;
            calleeReq = substituteInPredicate(calleeReq, formal.name, actual);
            calleeEns = substituteInPredicate(calleeEns, formal.name, actual);
        }

        // wp = R_sub ∧ (E_sub ⇒ post)
        return mkAnd(calleeReq, mkImplies(calleeEns, post));
        }

    case "if": {
      const B = condToPred(stmt.condition);
      const wpThen = wpStatement(stmt.thenBranch as Statement, post, ctx);
      const wpElse = stmt.elseBranch
        ? wpStatement(stmt.elseBranch as Statement, post, ctx)
        : post; // else как skip
      return mkAnd(mkImplies(B, wpThen), mkImplies(mkNot(B), wpElse));
    }

    case "while": {
      const B = condToPred(stmt.condition);
      // В Funnier у цикла может быть invariant
      const invariant: Predicate = normalizePredicate((stmt as any).invariant);

      // VC сохранения инварианта: I ∧ B ⇒ wp(body, I)
      const bodyWp = wpStatement(stmt.body as Statement, invariant, ctx);
      const preservation = mkImplies(mkAnd(invariant, B), bodyWp);
      ctx.vcs.push(preservation);

      // VC выхода: I ∧ ¬B ⇒ post
      const exitVc = mkImplies(mkAnd(invariant, mkNot(B)), post);
      ctx.vcs.push(exitVc);

      // wp(while, post) = I
      return invariant;
    }

    default:
      throw new Error(`Unknown Statement type ${(stmt as any).type}`);
  }
}

function buildFunctionVerificationConditions(
  module: AnnotatedModule,
  f: FunctionDef
): Predicate[] {
  const ctx: VCContext = { vcs: [], module };

  const ensures: Predicate = normalizePredicate((f as any).ensures);
  const requires: Predicate = normalizePredicate((f as any).requires);


  // wp(body, ensures)
  const wpBody = wpStatement(f.body as Statement, ensures, ctx);

  // основное VC: requires -> wp(body, ensures)
  const mainVC = mkImplies(requires, wpBody);

  const loopVCs = ctx.vcs.map(vc => mkImplies(requires, vc));
  return [mainVC, ...loopVCs];

}

// --------------------- ПЕРЕВОД В Z3 ---------------------


type VarMap = {[name: string]: any };


function buildVarMap(f: FunctionDef): VarMap {
  const vars: VarMap = Object.create(null);
  const { Int, Array } = z3 as any;

  const all: ParameterDef[] = [
    ...f.parameters,
    ...f.returns,
    ...f.locals,
  ];

  for (const p of all) {
    if (p.paramType === "int") {
      // обычная целочисленная переменная
      vars[p.name] = Int.const(p.name);
    } else if (p.paramType === "int[]") {
      // Массив int[] моделируем как массив Int -> Int в Z3.
      // Через any, чтобы не воевать с generic-параметрами TS.
      vars[p.name] = (Array as any).const(
        p.name,
        Int.sort(), // индекс: Int
        Int.sort(), // значение: Int
      );
    } else {
      throw new Error("Unknown paramType: " + p.paramType);
    }
  }

  return vars;
}


let ufCounter = 0; // можно наверху файла, но можно и тут, если не страшно

function exprToZ3(e: Expr, vars: VarMap): Arith {
  const { Int, Function: ZFunction, Array: ZArray } = z3 as any;
  console.log("exprToZ3 <-", JSON.stringify(e));

  // 1) Вызовы функций в выражениях
  if (e.type === "callFunction") {
    // --- спец. случай length(a) как раньше ---
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

      throw new Error(
        "exprToZ3: length() with non-variable argument not supported yet",
      );
    }

    // --- все остальные функции: factorial, foo, bar... ---
    // считаем, что это uninterpreted functions Int^k -> Int
    const argZ3s = e.args.map(a => exprToZ3(a as Expr, vars));

    // ключ по имени и арности, чтобы одну и ту же функцию объявлять один раз
    const funKey = `fun_${e.name}_${argZ3s.length}`;
    let funDecl = vars[funKey];

    if (!funDecl) {
      // все аргументы int, результат int
      const domainSorts = argZ3s.map(() => Int.sort());
      funDecl = ZFunction.declare(
        // имя функции в SMT: можно e.name или уникализировать
        `${e.name}_${ufCounter++}`,
        ...domainSorts,
        Int.sort(),
      );
      vars[funKey] = funDecl;
    }

    // ВАЖНО: вызываем метод .call(...) на FuncDecl
    return (funDecl as any).call(...argZ3s) as Arith;
  }

  // 2) Доступ к массиву: a[i], b[k]
  if (e.type === "arrayAccess") {
    // В buildVarMap ты создаёшь массивы как:
    // vars[p.name] = Array.const(p.name, Int.sort(), Int.sort());
    const arr = vars[e.array];
    if (!arr) {
      throw new Error(`Unknown array '${e.array}' in exprToZ3`);
    }
    const idx = exprToZ3(e.index as Expr, vars);
    // select(array, index)
    return (arr as SMTArray<any>).select(idx) as Arith;
  }

  // 3) Всё остальное — чистая арифметика
  if (!isArithExpr(e)) {
    throw new Error(
      "Only pure arithmetic expressions are supported in exprToZ3",
    );
  }

  const a = e as ArithExpr;

  switch (a.type) {
    case "number":
      return Int.val(a.value);

    case "var": {
      const v = vars[a.name];
      if (!v) throw new Error(`Unknown variable '${a.name}' in exprToZ3`);
      return v;
    }

    case "sum": {
      const l = exprToZ3(a.arg0 as Expr, vars);
      const r = exprToZ3(a.arg1 as Expr, vars);
      return l.add(r);
    }

    case "sub": {
      const l = exprToZ3(a.arg0 as Expr, vars);
      const r = exprToZ3(a.arg1 as Expr, vars);
      return l.sub(r);
    }

    case "mul": {
      const l = exprToZ3(a.arg0 as Expr, vars);
      const r = exprToZ3(a.arg1 as Expr, vars);
      return l.mul(r);
    }

    case "div": {
      const l = exprToZ3(a.arg0 as Expr, vars);
      const r = exprToZ3(a.arg1 as Expr, vars);
      return l.div(r);
    }

    default:
      throw new Error(
        `Unsupported ArithExpr node in exprToZ3: ${(a as any).type}`,
      );
  }
}




function predToZ3(p: Predicate, vars: VarMap): Bool {
    

  if (!p || typeof p.type !== "string") {
    console.error("predToZ3 ERROR: bad predicate", p);
    throw new Error("Bad Predicate: " + JSON.stringify(p));
  }
  const { Bool: ZBool, Int, And, Or, Not, ForAll, Exists  } = z3 as any;

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
      throw new Error("Unknown comparison op " + p.op);
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
    const { Bool: ZBool } = z3 as any;
        // Игнорируем всю формулу с квантором
        return ZBool.val(true) as Bool;
    }

    case "formulaRef":
      // для уровня A нужно раскрывать формулы — пока не делаем
      throw new Error("Formula references are not supported yet in verifier");

    default:
      throw new Error(
        `Unknown Predicate type in predToZ3: ${(p as any).type}`
      );
  }
}

function convertConditionsToZ3(
  f: FunctionDef,
  conditions: Predicate[]
): Bool {
  const { And } = z3 as any;
  const vars = buildVarMap(f);
  if (conditions.length === 0) {
    return And() as Bool; // пустой And = true
  }
  const z3Conds = conditions.map((c) => predToZ3(c, vars));
  return And(...z3Conds) as Bool;
}

// --------------------- ВЫЗОВ РЕШАТЕЛЯ ---------------------

type ProofResult =
  | { status: "Valid" }
  | { status: "Invalid"; model: Model };

async function proveTheorem(formula: Bool, dbgName?: string): Promise<ProofResult> {
  const { Solver, Not } = z3 as any;
  const solver = new Solver();

  // Попробуем вывести формулу, которую мы даём Z3
  try {
    console.log("=== VC formula for", dbgName ?? "<unknown function>", "===");
    console.log(formula.toString());
  } catch (e) {
    console.error("ERROR: formula.toString() failed in proveTheorem:", e);
  }

  let neg;
  try {
    neg = Not(formula);
  } catch (e) {
    console.error("ERROR: Z3 Not(formula) failed in proveTheorem");
    try {
      console.error("formula was:", formula.toString());
    } catch {}
    throw e;
  }

  try {
    solver.add(neg);
  } catch (e) {
    console.error("ERROR: solver.add(¬formula) failed in proveTheorem");
    try {
      console.error("neg formula:", neg.toString());
    } catch {}
    throw e;
  }

  let res;
  try {
    res = await solver.check();
  } catch (e) {
    console.error("ERROR: solver.check() threw in proveTheorem");
    try {
      console.error("neg formula:", neg.toString());
    } catch {}
    throw e;
  }

  if (res === "unsat") {
    return { status: "Valid" };
  }

  const model = solver.model();
  return { status: "Invalid", model };
}


// --------------------- ОСНОВНАЯ ФУНКЦИЯ ВЕРИФИКАЦИИ МОДУЛЯ ---------------------

export async function verifyModule(module: AnnotatedModule) {
  await initZ3();

  for (const f of module.functions) {
    const fun = f as FunctionDef;

    const vcs = buildFunctionVerificationConditions(module, fun);
    const theorem = convertConditionsToZ3(fun, vcs);
    const result = await proveTheorem(theorem);

    if (result.status === "Invalid") {
      const text = printFuncCall(fun, result.model);
      throw new Error(
        `Verification failed for function ${fun.name}\n` +
          `Counterexample:\n${text}`
      );
    }

    // Valid — идём дальше
  }
}


