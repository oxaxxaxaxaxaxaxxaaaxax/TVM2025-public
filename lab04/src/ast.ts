export type Expr = Mul | Sum | Sub | Div | Var | Numb;

interface Mul{
    type: 'mul'
    arg0: Expr
    arg1: Expr
}

interface Sum{
    type: 'sum'
    arg0: Expr
    arg1: Expr
}

interface Sub{
    type: 'sub'
    arg0: Expr
    arg1: Expr
}

interface Div{
    type: 'div'
    arg0: Expr
    arg1: Expr
}

interface Numb{
    type: 'number'
    value: number
}

interface Var{
    type: 'var'
    name: string
}
