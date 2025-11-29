
Funny <: Arithmetic {
    Module  = FunctionDef+

    FunctionDef = variable
        "(" ParamList? ")"
        "returns" ReturnList
        ("uses" LocalParamDefList)?
        Statement

    ParamList = ParameterDef ("," ParameterDef)*

    ReturnList = "void" --void
    | ReturnParamDef ("," ReturnParamDef)* --params

    LocalParamDefList = LocalParamDef ("," LocalParamDef)*


    ParameterDef = variable ":" ParamType

    ParamType = "int[]"  --array
        | "int"       --int

    LocalParamDef = variable ":" "int"

    ReturnParamDef = variable ":" ParamType

    Statement
        = Assignment
        | Conditional
        | Loop
        | Block
        | CallStatement

    CallStatement = FunctionCall 
    ";"

    Assignment = ParamName "=" Expr ";"    --basic           
        | ArrayAccess "=" Expr ";"          --array
        | ParamName ("," ParamName)* "=" FunctionCall ";" --tuple

    ParamName = variable

    Conditional = "if" "(" Condition ")" Statement ("else" Statement)?


    Loop = "while" "(" Condition ")"
       Statement


    Block = "{" Statement* "}"


    // чтобы дальше в грамматике писать Expr
    Expr = AddExp

    PriExp +=  ArrayAccess     --array
        | FunctionCall    --call

    FunctionCall = variable 
        "(" ArgList? ")"

    ArgList = Expr ("," Expr)*

    ArrayAccess = ParamName "[" Expr "]"


    Condition = Implication

    // импликация правоассоциативна!!!!!!!
    Implication = OrCond "->" Implication  --impl
        | OrCond --or

    OrCond = AndCond ("or" AndCond)*  --or

    AndCond = NotCond ("and" NotCond)*  --and

    NotCond = "not" NotCond  --not
        | CondAtom --atom


    CondAtom = "true" --true
        | "false" --false
        | Comparison  --cmp
        | "(" Condition ")" --paren

    Comparison = Expr "==" Expr 
        | Expr "!=" Expr 
        | Expr ">=" Expr
        | Expr "<=" Expr
        | Expr ">"  Expr
        | Expr "<"  Expr


    // Predicate = OrPred
    Predicate = ImplicationPred

    ImplicationPred
    = OrPred "->" ImplicationPred  --impl
    | OrPred                       --or

    OrPred = AndPred ("or" AndPred)* --or

    AndPred = NotPred ("and" NotPred)*  --and

    NotPred = "not" NotPred  --not
        | PredAtom --atom

    PredAtom = Quantifier --quantifier
        | "true" --true
        | "false" --false
        | Comparison --cmp
        | "(" Predicate ")" --paren


    Quantifier = ("forall" | "exists")
        "(" ParameterDef "|" Predicate ")"


    space += comment
    comment = "//" (~"\n" any)* "\n"
}

