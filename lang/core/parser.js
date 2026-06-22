/**
 * @module lang/core/parser
 * parser.js — 構文解析。
 *
 * プログラムは2つの「形」を取る（自動判別）:
 *   - 場(field): 式1本（Tier0）。`f(x,y,t) =` ヘッダは任意。
 *   - 描画(draw): `draw { 文… }`（Tier1）。文は改行/`;` 区切り。
 *
 * 式 AST:  {t:'num'|'var'|'call'|'unary'|'bin', …}
 * 文 AST:  {t:'assign', name, expr} / {t:'repeat', count, idx, body} / {t:'cmd', name, args}
 */

import { tokenize, LangError } from "./lexer.js";

const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };

/** 装飾ヘッダ `name(args) =` を検出し直後の index を返す（無ければ 0）。 */
function skipOptionalHeader(toks) {
  if (toks[0].type !== "ID" || !toks[1] || toks[1].type !== "LP") return 0;
  let j = 2;
  if (toks[j] && toks[j].type === "RP") {
    return toks[j + 1] && toks[j + 1].type === "EQ" ? j + 2 : 0;
  }
  while (true) {
    if (!toks[j] || toks[j].type !== "ID") return 0;
    j++;
    if (toks[j] && toks[j].type === "COMMA") {
      j++;
      continue;
    }
    break;
  }
  return toks[j] &&
    toks[j].type === "RP" &&
    toks[j + 1] &&
    toks[j + 1].type === "EQ"
    ? j + 2
    : 0;
}

/** トークン配列上で動くパーサ本体（式・文を共有）。 */
function makeParser(toks, start = 0) {
  let p = start;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (type, what) => {
    if (peek().type !== type)
      throw new LangError(`${what ?? type} が必要です`, peek().pos);
    return next();
  };

  // ── 式 ──
  function parseExpr(minPrec) {
    let lhs = parseUnary();
    while (true) {
      const tk = peek();
      if (tk.type !== "OP") break;
      const prec = PREC[tk.value];
      if (prec < minPrec) break;
      next();
      const rightAssoc = tk.value === "^";
      const rhs = parseExpr(rightAssoc ? prec : prec + 1);
      lhs = { t: "bin", op: tk.value, a: lhs, b: rhs };
    }
    return lhs;
  }
  function parseUnary() {
    const tk = peek();
    if (tk.type === "OP" && (tk.value === "-" || tk.value === "+")) {
      next();
      const a = parseExpr(PREC["^"]); // 単項は ^ より緩い
      return tk.value === "-" ? { t: "unary", op: "-", a } : a;
    }
    return parsePrimary();
  }
  function parseArgs() {
    const args = [];
    if (peek().type !== "RP") {
      args.push(parseExpr(0));
      while (peek().type === "COMMA") {
        next();
        args.push(parseExpr(0));
      }
    }
    return args;
  }
  function parsePrimary() {
    const tk = peek();
    if (tk.type === "NUM") {
      next();
      return { t: "num", v: tk.value };
    }
    if (tk.type === "LP") {
      next();
      const e = parseExpr(0);
      expect("RP", "')'");
      return e;
    }
    if (tk.type === "ID") {
      next();
      if (peek().type === "LP") {
        next();
        const args = parseArgs();
        expect("RP", "')'");
        return { t: "call", name: tk.value, args, pos: tk.pos };
      }
      return { t: "var", name: tk.value, pos: tk.pos };
    }
    throw new LangError(`式が必要です`, tk.pos);
  }

  // ── 文（描画モード） ──
  function skipSeps() {
    while (peek().type === "SEP") next();
  }
  function parseStmtList() {
    const stmts = [];
    while (true) {
      skipSeps();
      const tk = peek();
      if (tk.type === "RBRACE" || tk.type === "EOF") break;
      stmts.push(parseStmt());
      const after = peek().type;
      if (after !== "SEP" && after !== "RBRACE" && after !== "EOF")
        throw new LangError(`文の区切り（改行か ;）が必要です`, peek().pos);
    }
    return stmts;
  }
  function parseStmt() {
    const tk = peek();
    if (tk.type !== "ID") throw new LangError(`文が必要です`, tk.pos);
    if (tk.value === "repeat") return parseRepeat();
    if (toks[p + 1] && toks[p + 1].type === "EQ") {
      next(); // name
      next(); // =
      return { t: "assign", name: tk.value, expr: parseExpr(0), pos: tk.pos };
    }
    next(); // command name
    if (peek().type === "LP") {
      next();
      const args = parseArgs();
      expect("RP", "')'");
      return { t: "cmd", name: tk.value, args, pos: tk.pos };
    }
    return { t: "cmd", name: tk.value, args: [], pos: tk.pos };
  }
  function parseRepeat() {
    const tk = next(); // 'repeat'
    const count = parseExpr(0);
    let idx = null;
    if (peek().type === "ID" && peek().value === "as") {
      next();
      idx = expect("ID", "ループ変数名").value;
    }
    expect("LBRACE", "'{'");
    const body = parseStmtList();
    expect("RBRACE", "'}'");
    return { t: "repeat", count, idx, body, pos: tk.pos };
  }

  return { peek, next, expect, parseExpr, parseStmtList, posRef: () => p };
}

/** 描画プログラム `draw { … }` を解析。 */
function parseDraw(toks) {
  const ps = makeParser(toks);
  while (ps.peek().type === "SEP") ps.next();
  const tk = ps.expect("ID");
  if (tk.value !== "draw") throw new LangError(`draw が必要です`, tk.pos);
  ps.expect("LBRACE", "'{'");
  const body = ps.parseStmtList();
  ps.expect("RBRACE", "'}'");
  while (ps.peek().type === "SEP") ps.next();
  if (ps.peek().type !== "EOF")
    throw new LangError(`余分なトークン`, ps.peek().pos);
  return body;
}

/** 場の式1本を解析（SEP は無視）。`f(x,y,t)=` ヘッダは読み飛ばす。 */
export function parse(src) {
  const toks = tokenize(src).filter((t) => t.type !== "SEP");
  const ps = makeParser(toks, skipOptionalHeader(toks));
  const ast = ps.parseExpr(0);
  if (ps.peek().type !== "EOF")
    throw new LangError(`余分なトークン`, ps.peek().pos);
  return ast;
}

/** プログラム全体を解析し形を判別して返す。 */
export function parseProgram(src) {
  const toks = tokenize(src);
  const isDraw = toks.some(
    (t, i) =>
      t.type === "ID" &&
      t.value === "draw" &&
      toks[i + 1] &&
      toks[i + 1].type === "LBRACE",
  );
  if (isDraw) return { kind: "draw", body: parseDraw(toks) };
  return { kind: "field", expr: parse(src) };
}
