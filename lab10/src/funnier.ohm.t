
Funnier <: Funny {
    Module := (FormulaDef | FunctionDef)+

    FormulaDef = variable
    "(" ParamList? ")"
    "=>" Predicate
    ";"

    FunctionDef
        := variable 
        "(" ParamList? ")"
        ("requires" Predicate)?       
        "returns" ReturnList
        ("ensures" Predicate)?         
        ("uses" LocalParamDefList)?     
        Statement

    // ReturnList := "void" --void
    // | ReturnParamDef ("," ReturnParamDef)* --params


    Loop := "while" "(" Condition ")"
        ("invariant" Predicate)?  
        Statement

   

    // предикаты теперь могут вызывать формулы
    PredAtom
        := Quantifier                --quantifier
        | "true"                    --true
        | "false"                   --false
        | Comparison                --comp
        | "(" Predicate ")"         --paren
        |  FormulaRef   --formulaCall

    FormulaRef = variable 
    "(" ArgList? ")"

}
