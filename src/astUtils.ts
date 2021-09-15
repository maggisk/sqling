import ts from "typescript";

const visitAllNodes = (root: ts.Node, visitor: (n: ts.Node) => void): void => {
  const visit = (node: ts.Node): void => {
    visitor(node);
    node.forEachChild(visit);
  };
  visit(root);
};

export const extractQueriesFromAst = (
  ast: ts.SourceFile
): Array<[string, ts.VariableStatement]> => {
  const r: Array<[string, ts.VariableStatement]> = [];
  ast.forEachChild(node => {
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations[0];
      if (
        declaration?.initializer &&
        ts.isIdentifier(declaration.name) &&
        ts.isTaggedTemplateExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.tag) &&
        declaration.initializer.tag.escapedText === "sql"
      ) {
        const name = declaration.name.escapedText.toString();
        r.push([name, node]);
      }
    }
  });
  return r;
};

export const extractQueryString = (
  statement: ts.VariableStatement
): { sql: string; keys: string[] } => {
  const segments: string[] = [];
  const keys: string[] = [];

  visitAllNodes(statement, node => {
    // constant string of the template tag outside the ${...}
    if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      segments.push(node.text);
    }

    // variable part of the template tag inside the ${...}
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.escapedText === "f" &&
      ts.isIdentifier(node.name)
    ) {
      keys.push(node.name.escapedText.toString());
    }
  });

  const sql = segments
    .flatMap((s, i) => (i ? ["$" + i, s] : [s]))
    .join("")
    .trim();

  return { sql, keys };
};
