import { writeFileSync } from "fs";
import { Op, I32, Void, c, BufferedEmitter, LocalEntry} from "../../wasm";
import { Module, FunnyError, FunctionDef, Condition, ComparisonCond } from "../../lab08";

const { i32, 
    varuint32,
    get_local, local_entry, set_local, call, if_, void_block, void_loop, br_if, str_ascii, export_entry,
    func_type_m, function_body, type_section, function_section, export_section, code_section } = c;
  

type LocalEnv = Map<string, number>;


function buildLocalEnv(func: FunctionDef): LocalEnv {
  const env = new Map<string, number>();
  let idx = 0;
  for (const p of func.parameters) {
    env.set(p.name, idx);
    idx++;
  }
  for (const r of func.returns) {
    env.set(r.name, idx);
    idx++;
  }
  for (const l of func.locals) {
    env.set(l.name, idx);
    idx++;
  }
  return env;
}

function countNonParamLocals(func: FunctionDef): number {
  return func.returns.length + func.locals.length;
}

function compileExpr(expr: any,env: LocalEnv,funIndex: Map<string, number>): Op<I32> {
  if (expr.type === "callFunction") {
    const idx = funIndex.get(expr.name);
    if (idx === undefined) {
      throw new FunnyError("Unknown function", "");
    }

    const argsOps = expr.args.map((a: any) =>
      compileExpr(a, env, funIndex),
    );
    return call(i32, varuint32(idx), argsOps);
  }
  switch (expr.type) {
    case "number": {
      return i32.const(expr.value);
    }

    case "var": {
      const name = expr.name;
      const idx = env.get(name);
      if (idx === undefined) {
        throw new FunnyError(`Use of undeclared variable '${name}'`, "");
      }
      return get_local(i32, idx);
    }

    case "sum": {
      const a0 = compileExpr(expr.arg0, env, funIndex);
      const a1 = compileExpr(expr.arg1, env, funIndex);
      return i32.add(a0, a1);
    }

    case "sub": {
      const a0 = compileExpr(expr.arg0, env, funIndex);
      const a1 = compileExpr(expr.arg1, env, funIndex);
      return i32.sub(a0, a1);
    }

    case "mul": {
      const a0 = compileExpr(expr.arg0, env, funIndex);
      const a1 = compileExpr(expr.arg1, env, funIndex);
      return i32.mul(a0, a1);
    }

    case "div": {
      const a0 = compileExpr(expr.arg0, env, funIndex);
      const a1 = compileExpr(expr.arg1, env, funIndex);
      return i32.div_s(a0, a1);
    }

    default:
      throw new FunnyError(`Unsupported arithmetic expression type '${expr.type}'`, "");
  }
}

type i32bin = (a: Op<I32>, b: Op<I32>) => Op<I32>;

const compOps: Record<ComparisonCond["op"], i32bin> = {
  "==": i32.eq,
  "!=": i32.ne,
  ">=": i32.ge_s,
  "<=": i32.le_s,
  ">": i32.gt_s,
  "<": i32.lt_s,
};

function compileCondition(cond: Condition, env: LocalEnv, funIndex: Map<string, number>): any {
  switch (cond.type) {
    case "bool":
      return i32.const(cond.value ? 1 : 0);

    case "comparison": {
      const l = compileExpr(cond.left, env, funIndex);
      const r = compileExpr(cond.right, env, funIndex);
      return compOps[cond.op](l, r);
      // switch (cond.op) {
      //   case "==":
      //     return i32.eq(l, r);
      //   case "!=":
      //     return i32.ne(l, r);
      //   case ">":
      //     return i32.gt_s(l, r);
      //   case "<":
      //     return i32.lt_s(l, r);
      //   case ">=":
      //     return i32.ge_s(l, r);
      //   case "<=":
      //     return i32.le_s(l, r);
      // }
      throw new FunnyError("Unknown comparison operator", "");
    }

    case "notCond": {
      const v = compileCondition(cond.expr, env, funIndex);
      return i32.eqz(v);
    }

    case "andCond": {
      const a = compileCondition(cond.left, env, funIndex);
      const b = compileCondition(cond.right, env, funIndex);
      return i32.and(a, b);
    }

    case "orCond": {
      const a = compileCondition(cond.left, env, funIndex);
      const b = compileCondition(cond.right, env, funIndex);
      return i32.or(a, b);
    }

    case "implCond": {
      const a = compileCondition(cond.left, env, funIndex);
      const notA = i32.eqz(a);
      const b = compileCondition(cond.right, env, funIndex);
      return i32.or(notA, b);
    }

    default:
      throw new FunnyError("Unknown condition node type", "");
  }
}

function compileAssignment(stmt: any, env: LocalEnv, funIndex: Map<string, number>): any[] {
  if (stmt.type === "assign") {
    const idx = env.get(stmt.lvalue);
    if (idx === undefined) {
      throw new FunnyError("Assignment to undeclared variable", "");
    }
    const v = compileExpr(stmt.expr, env, funIndex);
    return [set_local(idx, v)];
  }

  throw new FunnyError("Unknown assignment kind", "");
}

function compileStatement(stmt: any, env: LocalEnv, funIndex: Map<string, number>): any[] {
  switch (stmt.type) {
    case "assign":
    case "arrayAssign":
    case "tupleAssign":
      return compileAssignment(stmt, env, funIndex);

    case "if": {
      const condOp = compileCondition(stmt.condition, env, funIndex);
      const thenOps = compileStatement(stmt.thenBranch, env, funIndex);
      const elseOps = stmt.elseBranch ? compileStatement(stmt.elseBranch, env, funIndex) : undefined;
      const ifOp = if_(c.void, condOp, thenOps, elseOps);
      return [ifOp];
    }

    case "while": {
      const loopBody: any[] = [];
      const cond = compileCondition(stmt.condition, env, funIndex);
      const notCond = i32.eqz(cond);
      loopBody.push(br_if(1, notCond)); 
      loopBody.push(...compileStatement(stmt.body, env, funIndex));
      loopBody.push(c.br(0));

      const loopOp = void_loop(loopBody);
      const blockOp = void_block([loopOp]);
      return [blockOp];
    }

    case "block": {
      const res: any[] = [];
      for (const s of stmt.statements) {
        res.push(...compileStatement(s, env, funIndex));
      }
      return res;
    }

    default:
      throw new FunnyError("Unknown statement type ", "");
  }
}


function compileFunctionBody(func: FunctionDef, funIndex: Map<string, number>) {
  const env = buildLocalEnv(func);
  const nonParamCount = countNonParamLocals(func);

  const locals: LocalEntry[] = [];
  if (nonParamCount > 0) {
    locals.push(local_entry(varuint32(nonParamCount), i32));
  }

  const code: any[] = [];

  code.push(...compileStatement(func.body, env, funIndex));

  for (const r of func.returns) {
    const idx = env.get(r.name);
    if (idx === undefined) {
      throw new FunnyError("Return variable not found", "");
    }
    code.push(get_local(i32, idx));
  }

  return { locals, code };
}


export async function compileModule<M extends Module>(m: M,
  name?: string,
): Promise<WebAssembly.Exports> {
  const funcs = m.functions;

  const funIndex = new Map<string, number>();
  funcs.forEach((f, i) => funIndex.set(f.name, i));

  const types = funcs.map((f) => {
    const paramTypes = f.parameters.map(() => i32);
    const returnTypes = f.returns.map(() => i32);
    return func_type_m(paramTypes, returnTypes);
  });
  const typeSec = type_section(types);

  const funcSec = function_section(funcs.map((_f, i) => varuint32(i)));

  const bodies = funcs.map((f) => {
    const { locals, code } = compileFunctionBody(f, funIndex);
    return function_body(locals, code);
  });
  const codeSec = code_section(bodies);

  const exports = funcs.map((f, i) =>
    export_entry(
      str_ascii(f.name),
      c.external_kind.function,
      varuint32(i),
    ),
  );
  const exportSec = export_section(exports);

  const mod = c.module([typeSec, funcSec, exportSec, codeSec]);

  const emitter = new BufferedEmitter(new ArrayBuffer(mod.z));
  mod.emit(emitter);

  const bytes = new Uint8Array(emitter.buffer, 0, emitter.length);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance.exports;
}

export { FunnyError };


