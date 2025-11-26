import { Expr } from "../../lab04";

function isZero(e: Expr): boolean {
    return e.type === "number" && e.value === 0;
}

function isOne(e: Expr): boolean {
    return e.type === "number" && e.value === 1;
}


function simplify(e: Expr): Expr {
    if (e.type === "number" || e.type === "var") return e;

    switch (e.type) {
        case "sum": {
            const a = simplify(e.arg0);
            const b = simplify(e.arg1);

            if ((a.type === "number") && (b.type === "number")) {
                return { type: "number", value: a.value + b.value };
            }
            if (isZero(a)) return b;
            if (isZero(b)) return a;

            return { type: "sum", arg0: a, arg1: b };
        }

        case "sub": {
            const a = simplify(e.arg0);
            const b = simplify(e.arg1);

            if (a.type === "number" && b.type === "number") {
                return { type: "number", value: a.value - b.value };
            }
            if (isZero(b)) return a;

            if (isZero(a) && (b.type === "number")) {
                return { type: "number", value: -b.value };
            }

            if (isZero(a) && b.type === "div" && (b.arg0.type === "number")) {
                return simplify({
                    type: "div",
                    arg0: { type: "number", value: -b.arg0.value },
                    arg1: b.arg1,
                });
            }

            return { type: "sub", arg0: a, arg1: b };
        }

        case "mul": {
            const a = simplify(e.arg0);
            const b = simplify(e.arg1);

            if (a.type === "number" && b.type === "number") {
                return { type: "number", value: a.value * b.value };
            }
            if (isZero(a) || isZero(b)) return { type: "number", value: 0 };
            if (isOne(a)) return b;
            if (isOne(b)) return a;

            return { type: "mul", arg0: a, arg1: b };
        }

        case "div": {
            const a = simplify(e.arg0);
            const b = simplify(e.arg1);

            if (a.type === "number" && b.type === "number" && b.value !== 0) {
                return { type: "number", value: a.value / b.value };
            }
            if (isOne(b)) return a;
            if (isZero(a)) return { type: "number", value: 0 };

            return { type: "div", arg0: a, arg1: b };
        }
    }
}

export function derive(e: Expr, varName: string): Expr {
    switch (e.type) {
        case "number": {
            return { type: "number", value: 0 };
        }

        case "var": {
            return { type: "number", value: e.name === varName ? 1 : 0 };
        }

        case "sum": {
            const du = derive(e.arg0, varName);
            const dv = derive(e.arg1, varName);
            return simplify({ type: "sum", arg0: du, arg1: dv });
        }

        case "sub": {
            const du = derive(e.arg0, varName);
            const dv = derive(e.arg1, varName);
            return simplify({ type: "sub", arg0: du, arg1: dv });
        }

        case "mul": {
            const u = e.arg0;
            const v = e.arg1;
            const du = derive(u, varName);
            const dv = derive(v, varName);
            return simplify({
                type: "sum",
                arg0: { type: "mul", arg0: du, arg1: v },
                arg1: { type: "mul", arg0: u, arg1: dv },
            });
        }

        case "div": {
            const u = e.arg0;
            const v = e.arg1;
            const du = derive(u, varName);
            const dv = derive(v, varName);
            return simplify({
                type: "div",
                arg0: {
                    type: "sub",
                    arg0: { type: "mul", arg0: du, arg1: v },
                    arg1: { type: "mul", arg0: u, arg1: dv },
                },
                arg1: { type: "mul", arg0: v, arg1: v },
            });
        }
    }
}

