import { Expr } from "../../lab04";

export function cost(e: Expr): number {
  switch (e.type) {
    case "number": return 0;
    case "var":    return 1;
    case "sum":
    case "sub":
    case "mul":
    case "div":
      return 1 + cost(e.arg0) + cost(e.arg1);
  }
}
