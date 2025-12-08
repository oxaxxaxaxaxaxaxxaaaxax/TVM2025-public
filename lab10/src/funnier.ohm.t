
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

   

    PredAtom
        := ... |  FormulaRef   --formulaCall

    FormulaRef = variable 
    "(" ArgList? ")"

}
