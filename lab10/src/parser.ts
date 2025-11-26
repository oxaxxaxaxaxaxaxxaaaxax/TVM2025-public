// lab10/src/parser.ts

import { MatchResult, Semantics } from 'ohm-js';

import grammar from './funnier.ohm-bundle';

import {
  AnnotatedModule,
  Module as FunnierModule,
  FunctionDef as FunnierFunctionDef,
  FormulaDef as FunnierFormulaDef,
  Statement as FunnierStatement,
  Predicate as FunnierPredicate,
  FormulaRef as FunnierFormulaRef,
  LoopStmtWithInvariant,
} from './funnier';

// из ЛР8 — у тебя в lab08/src/parser.ts есть `export const getFunnyAst = { ... }`
import { getFunnyAst } from 'lab08/src';

// ----------------- Семантика Funnier -----------------

// НЕ типизируем FunnierActionDict, чтобы TS не ругался на имена ключей.
// Делаем просто `any`.
const getFunnierAst: any = {
  // всё старое из Funny
  ...getFunnyAst,

  // Модуль: теперь функции + формулы
  Module(defs: any) {
    const functions: FunnierFunctionDef[] = [];
    const formulas: FunnierFormulaDef[] = [];

    for (const d of defs.children) {
      const node = d.parse() as any;
      if (node.type === 'function') {
        functions.push(node as FunnierFunctionDef);
      } else if (node.type === 'formula') {
        formulas.push(node as FunnierFormulaDef);
      } else {
        throw new Error(`Unexpected top-level node type: ${node.type}`);
      }
    }

    const m: FunnierModule = {
      type: 'module',
      functions,
      formulas,
    };
    return m;
  },

  // FormulaDef =
  //   variable "(" ParamList? ")" "=>" Predicate ";"
  FormulaDef(name: any, _lp: any, paramsOpt: any, _rp: any, _arrow: any, bodyNode: any, _semi: any) {
    const funName = name.sourceString;

    const parameters =
      paramsOpt.children.length === 0
        ? []
        : (paramsOpt.parse() as FunnierFormulaDef['parameters']);

    const body = bodyNode.parse() as FunnierPredicate;

    const f: FunnierFormulaDef = {
      type: 'formula',
      name: funName,
      parameters,
      body,
    };
    return f;
  },

  // FunctionDef :=
  //   variable "(" ParamList? ")"
  //   ("requires" Predicate)?
  //   "returns" ReturnList
  //   ("ensures" Predicate)?
  //   ("uses" LocalParamDefList)?
  //   Statement
  FunctionDef(
    name: any,
    _lp: any,
    paramsOpt: any,
    _rp: any,
    reqOpt: any,
    _returnsKw: any,
    returnList: any,
    ensOpt: any,
    usesOpt: any,
    bodyNode: any,
  ) {
    const funName = name.sourceString;

    const parameters =
      paramsOpt.children.length === 0
        ? []
        : (paramsOpt.parse() as FunnierFunctionDef['parameters']);

    const returns =
      returnList.parse() as FunnierFunctionDef['returns'];

    const locals =
      usesOpt.children.length === 0
        ? []
        : (usesOpt.parse() as FunnierFunctionDef['locals']);

    // По спецификации Funny:
    //   requires отсутствует → true
    //   ensures  отсутствует → false

    let requires: FunnierPredicate;
    if (reqOpt.children.length === 0) {
      requires = { type: 'bool', value: true };
    } else {
      const seq = reqOpt.children[0];
      const predNode = seq.children[1];
      requires = predNode.parse() as FunnierPredicate;
    }

    let ensures: FunnierPredicate;
    if (ensOpt.children.length === 0) {
      ensures = { type: 'bool', value: false };
    } else {
      const seq = ensOpt.children[0];
      const predNode = seq.children[1];
      ensures = predNode.parse() as FunnierPredicate;
    }

    const body = bodyNode.parse() as FunnierStatement;

    const f: FunnierFunctionDef = {
      type: 'function',
      name: funName,
      parameters,
      returns,
      locals,
      requires,
      ensures,
      body,
    };

    return f;
  },

  // Loop :=
  //   "while" "(" Condition ")"
  //   ("invariant" Predicate)?
  //   Statement
  Loop(_whileTok: any, _lp: any, condNode: any, _rp: any, invOpt: any, bodyNode: any) {
    const condition = condNode.parse();

    let invariant: FunnierPredicate;
    if (invOpt.children.length === 0) {
      // по спецификации: если invariant опущен, считаем true
      invariant = { type: 'bool', value: true };
    } else {
      const seq = invOpt.children[0];
      const predNode = seq.children[1];
      invariant = predNode.parse() as FunnierPredicate;
    }

    const body = bodyNode.parse() as FunnierStatement;

    const loop: LoopStmtWithInvariant = {
      type: 'while',
      condition,
      invariant,
      body,
    };
    return loop;
  },

  // PredAtom :=
  //   ...
  //   | FormulaRef   --formulaCall
  PredAtom_formulaCall(node: any) {
    return node.parse(); // FormulaRef
  },

  // FormulaRef =
  //   variable "(" ArgList? ")"
  FormulaRef(name: any, _lp: any, argsOpt: any, _rp: any) {
    const fname = name.sourceString;
    const args =
      argsOpt.children.length === 0
        ? []
        : (argsOpt.children[0].parse() as FunnierFormulaRef['args']);

    const ref: FunnierFormulaRef = {
      type: 'formulaRef',
      name: fname,
      args,
    };
    return ref;
  },
};

// --------- semantics + внешний API ---------

export const semantics: FunnySemanticsExt =
  grammar.Funnier.createSemantics() as FunnySemanticsExt;

semantics.addOperation('parse()', getFunnierAst as any);

export interface FunnySemanticsExt extends Semantics {
  (match: MatchResult): FunnyActionsExt;
}

interface FunnyActionsExt {
  parse(): AnnotatedModule;
}

export function parseFunnier(source: string, origin?: string): AnnotatedModule {
  const match = grammar.Funnier.match(source, 'Module');
  if (!match.succeeded()) {
    throw new SyntaxError(match.message);
  }

  const mod = semantics(match).parse() as AnnotatedModule;
  return mod;
}
