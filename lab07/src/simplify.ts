import { Expr } from "../../lab04";
import { cost } from "./cost";

const MAX_ATTEMPTS = 5000;
const COST_LIMIT = 10;

function exprEquals(a: Expr, b: Expr): boolean {
    if (a.type !== b.type) return false;
    switch (a.type) {
        case "number": return (b as any).value === a.value;
        case "var": return (b as any).name === a.name;
        case "sum":
        case "sub":
        case "mul":
        case "div":
            return exprEquals(a.arg0, (b as any).arg0) && exprEquals(a.arg1, (b as any).arg1);
    }
}

function getHash(e: Expr): string {
    switch (e.type) {
        case "number": return `#${e.value}`;
        case "var":    return `$${e.name}`;
        case "sum":    return `(+ ${getHash(e.arg0)} ${getHash(e.arg1)})`;
        case "sub":    return `(- ${getHash(e.arg0)} ${getHash(e.arg1)})`;
        case "mul":    return `(* ${getHash(e.arg0)} ${getHash(e.arg1)})`;
        case "div":    return `(/ ${getHash(e.arg0)} ${getHash(e.arg1)})`;
  }
}

function clone(e: Expr): Expr {
    switch (e.type) {
        case "number": return { type: "number", value: e.value };
        case "var": return { type: "var", name: e.name };
        case "sum":
        case "sub":
        case "mul":
        case "div":
            return { type: e.type, arg0: clone(e.arg0), arg1: clone(e.arg1) } ;
    }
}

function simplifyConst(e: Expr): Expr | null {
    switch (e.type) {
        case "number": return e;
        case "var": return null;

        case "sum":
        case "sub":
        case "mul":
        case "div": {
            const a = simplifyConst(e.arg0);
            const b = simplifyConst(e.arg1);
            if (!a || !b || a.type !== "number" || b.type !== "number") return null;
            switch (e.type) {
                case "sum": return { type: "number", value: a.value + b.value };
                case "sub": return { type: "number", value: a.value - b.value };
                case "mul": return { type: "number", value: a.value * b.value };
                case "div":
                    if (b.value === 0) return null;
                    return { type: "number", value: a.value / b.value };
            }
        }
    }
}


type MapExpressions = Map<string, Expr>;

function matchPattern(pattern: Expr, target: Expr, env?: MapExpressions): MapExpressions | null {
    if (!env) env = new Map<string, Expr>();
    if (pattern.type === "number") {
        return (target.type === "number" && target.value === pattern.value) ? env : null;
    }
    if (pattern.type === "var") {
        const bound = env.get(pattern.name);
        if (!bound) { 
            env.set(pattern.name, target); 
            return env; 
        }
        return exprEquals(bound, target) ? env : null;
    }
    if (pattern.type !== target.type) return null;

    const envL = matchPattern(pattern.arg0, target.arg0, env);
    if (!envL){
        return null;
    } 
    const envR =  matchPattern(pattern.arg1, target.arg1, envL);
    if (!envR){
        return null
    }
    return envR
}

function replaceExpr(template: Expr, env: MapExpressions): Expr {
    switch (template.type) {
        case "number": return clone(template);
        case "var":
            let name = env.get(template.name)
            if (!name){
                return clone(template)
            }
            return clone(name)
        case "sum":
        case "sub":
        case "mul":
        case "div":
            return {
                type: template.type,
                arg0: replaceExpr(template.arg0, env),
                arg1: replaceExpr(template.arg1, env)
            };
    }
}

type Path =string[];

function collectNodes(e: Expr, path: Path = []): Array<{ path: Path; node: Expr }> {
    const out = [{ path: path, node: e }];
    switch (e.type) {
        case "number":
        case "var":
            return out;
        case "sum":
        case "sub":
        case "mul":
        case "div":
            const left = collectNodes(e.arg0, path.concat("arg0"));
            for (const item of left) {
                out.push(item);
            }
            const right = collectNodes(e.arg1, path.concat("arg1"));
            for (const item of right) {
                out.push(item);
            }
            return out;
    }
}

function replaceAtPath(root: Expr, path: Path, replaceExpr: Expr): Expr {
    if (path.length === 0) {
        return replaceExpr;
    }

    const head = path[0];
    const tail = path.slice(1, path.length);

    switch (root.type) {
        case "sum":
        case "sub":
        case "mul":
        case "div": {
            const child = (head === "arg0") ? root.arg0 : root.arg1;
            const replacedSubtree = replaceAtPath(child, tail, replaceExpr);
            return (head === "arg0") ? { type: root.type, arg0: replacedSubtree, arg1: root.arg1 } : { type: root.type, arg0: root.arg0, arg1: replacedSubtree };
        }
        default:
            return root;
    }
}

function prepareIdentities(identities: [Expr, Expr][]): [Expr, Expr][] {
    return identities.map(([lhs, rhs]) => {
        const cL = cost(lhs);
        const cR = cost(rhs);
        return (cR > cL) ? [rhs, lhs] : [lhs, rhs];
    });
}

function generateCandidates(e: Expr, identities: [Expr, Expr][]): Expr[] {
    const res: Expr[] = [];

    let nodes = collectNodes(e)
    for (const { path, node } of nodes) {
        const simplified = simplifyConst(node);
        if (simplified && !exprEquals(simplified, node)) {
            const newExpr = replaceAtPath(e, path, simplified);
            if (!exprEquals(newExpr, e)) {
                res.push(newExpr);
            }
        }
    }

    for (const [lhs, rhs] of identities) {
        for (const { path, node } of nodes) {
            const mappList = matchPattern(lhs, node, undefined);
            if (!mappList) {
                continue;
            }
            const replacedE = replaceExpr(rhs, mappList);
            if (exprEquals(replacedE, node)){
                continue;
            } 
            const cand = replaceAtPath(e, path, replacedE);
            if (!exprEquals(cand, e)){
                res.push(cand);
            } 
        }
        for (const { path, node } of nodes) {
            const mappList = matchPattern(rhs, node, undefined);
            if (!mappList) continue;

            const replacedExpr = replaceExpr(lhs, mappList);
            if (exprEquals(replacedExpr, node)) continue;

            const cand = replaceAtPath(e, path, replacedExpr);
            if (!exprEquals(cand, e)) res.push(cand);
        }
    }

    return res;
}

function trimQueueByCost(q: Expr[], beam = 64) {
  if (q.length <= beam) return;
  q.sort((a, b) => cost(a) - cost(b));
  q.length = beam;
}

export function simplify(e: Expr, identities: [Expr, Expr][]): Expr {
    const ids = prepareIdentities(identities);

    let bestExpr = e;
    let bestCost = cost(e);

    const seen = new Set<string>();

    const queue: Expr[] = [];
    queue.push(e)
    seen.add(getHash(e));

    let steps = 0;
    while (queue.length && steps < MAX_ATTEMPTS) {
        steps++;

        let idx = 0;
        let costExpr = cost(queue[0]);
        for (let i = 1; i < queue.length; i++) {
            const c = cost(queue[i]);
            if (c < costExpr) {
                idx = i;
                costExpr = c;
            }
        }
        const cur = queue.splice(idx, 1)[0];

        if (costExpr < bestCost) {
            bestExpr = cur;
            bestCost = costExpr;
        }

        for (const n of generateCandidates(cur, ids)) {
            if (cost(n) > bestCost + COST_LIMIT) {
                continue;
            }

            const key = getHash(n);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            queue.push(n);
        }
    }
    trimQueueByCost(queue, 64);
    return bestExpr;
}
