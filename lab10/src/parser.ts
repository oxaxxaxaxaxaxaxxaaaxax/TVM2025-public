import {
  MatchResult,
  Semantics,
  NonterminalNode,
  TerminalNode,
  IterationNode,
} from 'ohm-js';

import grammar, {FunnierActionDict} from './funnier.ohm-bundle';

import {
  AnnotatedModule,
  Module as FunnierModule,
  FunctionDef as FunnierFunctionDef,
  FormulaDef as FunnierFormulaDef,
  FormulaRef as FunnierFormulaRef,
  LoopStmtWithInvariant,
} from './funnier';

import { getFunnyAst } from '../../lab08/src/parser';

const getFunnierAst : FunnierActionDict <any>= {
  ...getFunnyAst,

  Module(defs: IterationNode) {
    const functions: FunnierFunctionDef[] = [];
    const formulas: FunnierFormulaDef[] = [];

    for (const child of defs.children) {
      const node = child.parse();
      if (node.type === 'function') {
        functions.push(node);
      } else {
        formulas.push(node);
      }
    }

    const m: FunnierModule = {
      type: 'module',
      functions,
      formulas,
    };
    return m;
  },

  FormulaDef(name: NonterminalNode,lp: TerminalNode,paramsIter: IterationNode,rp: TerminalNode,arrow: TerminalNode,bodyNode: NonterminalNode,semi: TerminalNode,) {
    const parameters = paramsIter.children.length === 0 ? [] : paramsIter.parse();
    const f: FunnierFormulaDef = {
      type: 'formula',
      name: name.sourceString,
      parameters: parameters,
      body: bodyNode.parse(),
    };
    return f;
  },

  FunctionDef(name: NonterminalNode, lp: TerminalNode, paramsIter: IterationNode, rp: TerminalNode, reqTokIter: IterationNode, reqPredIter: IterationNode, returnsKw: TerminalNode,
    returnListNode: NonterminalNode, ensTokIter: IterationNode, ensPredIter: IterationNode, usesTokIter: IterationNode, usesListIter: IterationNode,bodyNode: NonterminalNode) {
    const parameters = paramsIter.children.length === 0 ? [] : paramsIter.parse();
    const returns = returnListNode.parse();
    const locals = usesListIter.children.length === 0 ? [] : usesListIter.parse();
    const f: FunnierFunctionDef = {
      type: 'function',
      name: name.sourceString,
      parameters: parameters,
      returns: returns,
      locals: locals,
      requires: reqPredIter.parse(),
      ensures: ensPredIter.parse(),
      body: bodyNode.parse(),
    };

    return f;
  },

  Loop(whileTok: TerminalNode,lp: TerminalNode,condNode: NonterminalNode,rp: TerminalNode,invTokIter: IterationNode,   invPredIter: IterationNode, bodyNode: NonterminalNode) {
    const invParsed = invPredIter.parse();
    let invariant;
    if (invParsed === undefined) {
      invariant = { type: 'bool', value: true };
    } else {
      invariant = invParsed;
    }

    const loop: LoopStmtWithInvariant = {
      type: 'while',
      condition: condNode.parse(),
      invariant,
      body: bodyNode.parse(),
    };
    return loop;
  },

  PredAtom_formulaCall(node: NonterminalNode) {
    return node.parse(); 
  },

  FormulaRef(name: NonterminalNode,lp: TerminalNode,argsIter: IterationNode,rp: TerminalNode,) {
    const args = argsIter.children.length === 0 ? [] : argsIter.parse();
    const ref: FunnierFormulaRef = {
      type: 'formulaRef',
      name: name.sourceString,
      args : args,
    };
    return ref;
  },
} satisfies FunnierActionDict<any>;

export const semantics: FunnySemanticsExt = grammar.Funnier.createSemantics() as FunnySemanticsExt;

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

  const mod = semantics(match).parse();
  return mod;
}
