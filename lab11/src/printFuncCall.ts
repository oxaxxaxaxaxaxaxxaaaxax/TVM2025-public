

import { FunctionDef } from "lab08/src";
import { Model } from "z3-solver";

export function printFuncCall(f: FunctionDef, model: Model): string {
  const getVarValue = (name: string) => {
    const decls = model.decls();
    const decl = decls.find(d => d.name() === name);
    if (!decl) {
      return "<undef>";
    }

    const val = model.get(decl);
    if (!val) {
      return "<undef>";
    }

    return val.toString();
  };

  const argExprs = f.parameters.map(p => p.name).map(getVarValue);
  const argsText = argExprs.join(", ");

  const resExprs = f.returns
    .map(r => r.name)
    .map(n => `${n} = ${getVarValue(n)}`);
  const resultsText = resExprs.join(", ");

  let text = `${f.name}(${argsText}) => [${resultsText}]`;

  for (const v of f.locals) {
    text += `\n${v.name} = ${getVarValue(v.name)}`;
  }

  return text;
}
